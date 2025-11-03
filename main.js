import { Command } from 'commander';
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import superagent from 'superagent';

const program = new Command();

program
  .requiredOption('-h, --host <host>', 'host to bind')
  .requiredOption('-p, --port <port>', 'port to bind', parseInt)
  .requiredOption('-c, --cache <path>', 'path to cache dir');

program.parse(process.argv);

const opts = program.opts();
const CACHE_DIR = path.resolve(opts.cache);
const CAT_URL = 'https://http.cat/';

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    console.log('Cache dir:', CACHE_DIR);
  } catch (err) {
    console.error('Cannot create cache directory', err);
    process.exit(1);
  }
}

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found\n');
}

function send405(res) {
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed\n');
}

function sendImageBuffer(res, buf) {
  res.writeHead(200, { 'Content-Type': 'image/jpeg' });
  res.end(buf);
}

function sendPlain(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(text + '\n');
}

async function getCat(code) {
  const url = `${CAT_URL}${code}.jpg`;
  const resp = await superagent
    .get(url)
    .responseType('blob')
    .ok(res => res.status < 500);
  
  if (resp.status === 404) {
    const err = new Error('Not Found at http.cat');
    err.code = 'HTTP_CAT_404';
    throw err;
  }
  
  return Buffer.from(resp.body);
}

const server = http.createServer(async (req, res) => {
  const code = (req.url || '/').replace(/^\//, '').split('/')[0];
  if (!/^\d{3}$/.test(code)) {
    send404(res);
    return;
  }

  const filename = path.join(CACHE_DIR, `${code}.jpg`);

  if (req.method === 'GET') {
    try {
      const data = await fs.readFile(filename);
      sendImageBuffer(res, data);
      return;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Cache read error', err);
        return sendPlain(res, 500, 'Internal Server Error');
      }
      
      try {
        console.log(`Cache miss for ${code}, fetching from ${CAT_URL}`);
        const imgBuf = await getCat(code);
        
        try {
          await fs.writeFile(filename, imgBuf);
          console.log(`Saved ${filename}`);
        } catch (werr) {
          console.error('Failed to write cache file', werr);
        }
        
        sendImageBuffer(res, imgBuf);
        return;
      } catch (fetchErr) {
        if (fetchErr.code === 'HTTP_CAT_404' || fetchErr.status === 404) {
          return send404(res);
        }
        console.error('Fetch error', fetchErr);
        return sendPlain(res, 500, 'Internal Server Error');
      }
    }
  }

  if (req.method === 'PUT') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      
      if (body.length === 0) {
        return sendPlain(res, 400, 'Bad Request - Empty body');
      }
      
      await fs.writeFile(filename, body);
      sendPlain(res, 201, 'Created');
    } catch (err) {
      console.error('PUT error', err);
      sendPlain(res, 500, 'Internal Server Error');
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      await fs.unlink(filename);
      sendPlain(res, 200, 'OK');
    } catch (err) {
      if (err.code === 'ENOENT') {
        send404(res);
      } else {
        console.error('DELETE error', err);
        sendPlain(res, 500, 'Internal Server Error');
      }
    }
    return;
  }

  send405(res);
});

(async () => {
  await ensureCacheDir();
  server.listen(opts.port, opts.host, () => {
    console.log(`Server listening on http://${opts.host}:${opts.port}`);
  });
})();
