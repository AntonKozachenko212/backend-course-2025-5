import { Command } from 'commander';
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

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Proxy server skeleton running\n');
});

server.listen(opts.port, opts.host, () => {
  console.log(`Server listening on http://${opts.host}:${opts.port}`);
  console.log(`Cache dir: ${opts.cache}`);
});
