import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

export function createAppServer(root = projectRoot) {
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
      const resource = pathname === '/' ? '/index.html' : pathname;
      // Only public application assets belong on this server.
      if (!/^\/(?:index\.html|style\.css|dist\/[A-Za-z_][A-Za-z_0-9-]*\.js)$/.test(resource)) {
        res.writeHead(404).end('Not found');
        return;
      }
      const path = resolve(await realpath(root), `.${resource}`);
      // A symlink must not turn an allowed asset name into a private file.
      if (await realpath(path) !== path) {
        res.writeHead(404).end('Not found');
        return;
      }
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': `${types[extname(path)]}; charset=utf-8` })
        .end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  createAppServer().listen(5173, '127.0.0.1', () => console.log('Open http://localhost:5173'));
}
