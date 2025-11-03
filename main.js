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

const server = http.createServer(async (req, res) => {
  const code = (req.url || '/').replace(/^\//, '').split('/')[0];
  if (!/^\d{3}$/.test(code)) {
    sendPlain(res, 404, 'Not Found');
    return;
  }

  const filename = path.join(CACHE_DIR, `${code}.jpg`);

  if (req.method === 'GET') {
    try {
      const data = await fs.readFile(filename);
      sendImageBuffer(res, data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        sendPlain(res, 404, 'Not Found');
      } else {
        sendPlain(res, 500, 'Internal Server Error');
      }
    }
    return;
  }

  if (req.method === 'PUT') {
    // читає реквест у тіло
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      await fs.writeFile(filename, body);
      // Return 201 Created
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
        sendPlain(res, 404, 'Not Found');
      } else {
        sendPlain(res, 500, 'Internal Server Error');
      }
    }
    return;
  }

  //якщо невизначений метод
  sendPlain(res, 405, 'Method Not Allowed');
});

(async () => {
  await ensureCacheDir();
  server.listen(opts.port, opts.host, () => {
    console.log(`Server listening on http://${opts.host}:${opts.port}`);
  });
})();
