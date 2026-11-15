import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createAppServer } from '../server.mjs';

test('serves only public assets, including protection against symlink leaks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dl-tab-server-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'dist'));
  await mkdir(join(root, '.git'));
  for (const [name, body] of Object.entries({
    'index.html': '<h1>DL-TAB</h1>', 'app.html': '<main>DL-TAB</main>',
    'style.css': 'body {}', 'dist/main.js': 'export {};',
    '.git/config': 'private git metadata', '.env': 'private configuration',
    'package.json': '{}', 'server.mjs': 'private source',
  })) await writeFile(join(root, name), body);
  await symlink(join(root, '.env'), join(root, 'dist', 'linked.js'));
  const server = createAppServer(root);
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, type] of [['/', 'text/html'], ['/index.html', 'text/html'], ['/app.html', 'text/html'],
    ['/style.css', 'text/css'], ['/dist/main.js?v=1', 'text/javascript']]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), new RegExp(type));
    assert.ok((await response.text()).length > 0);
  }
  for (const path of ['/.git/config', '/%2egit/config', '/.env', '/package.json',
    '/server.mjs', '/src/main.ts', '/dist/linked.js', '/dist/missing.js',
    '/dist/%2e%2e/.env', '/dist/..%2f.env', '/%ZZ']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), 'Not found', path);
  }
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const post = await fetch(base, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});
