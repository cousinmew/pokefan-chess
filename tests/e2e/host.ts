// SPDX-License-Identifier: AGPL-3.0-only
// The built site (dist/) on a host of its own that can deploy (N2, N4, 14 Oct): a deploy is the same files with a new
// build id in sw.js, and its update check can be slow, as on a phone network. A route cannot stand in for it: the
// browser's update check of a service worker does not go through page or context routes.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
};

export interface DeployHost {
  /** http://127.0.0.1:<port>/ */
  url: string;
  /** The build sw.js names from now on ('' for the one built). */
  build: string;
  /** How long sw.js takes to arrive, in ms. */
  delay: number;
  close(): Promise<void>;
}

export async function deployHost(dir = 'dist'): Promise<DeployHost> {
  const host = { build: '', delay: 0 } as DeployHost;
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://host').pathname);
    const file = join(dir, normalize(path.endsWith('/') ? `${path}index.html` : path));
    const sw = path.endsWith('/sw.js');
    setTimeout(
      () =>
        void readFile(file).then(
          (body) => {
            const out = sw && host.build ? Buffer.from(body.toString('utf8').replace(/const BUILD = '\w+'/, `const BUILD = '${host.build}'`)) : body;
            res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
            res.end(out);
          },
          () => (res.writeHead(404), res.end()),
        ),
      sw ? host.delay : 0,
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  host.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  host.close = () => new Promise<void>((done) => (server.closeAllConnections(), server.close(() => done())));
  return host;
}
