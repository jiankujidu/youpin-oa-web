/** 本地验证用：静态托管 dist + 把 /oa-proxy/* 转发到线上同源代理 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = process.cwd() + '/dist';
const UP = process.env.UPSTREAM || 'https://youpin-oa.pages.dev';
const PORT = Number(process.env.PORT || 5199);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/oa-proxy/')) {
    const target = UP + url.pathname + url.search;
    try {
      const r = await fetch(target, { method: req.method, headers: { cookie: req.headers.cookie || '' } });
      const body = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json', 'access-control-allow-origin': '*' });
      res.end(body);
    } catch (e) {
      res.writeHead(502); res.end('proxy error');
    }
    return;
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  p = normalize(p).replace(/^(\.\.[/\\])+/, '');
  try {
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    const buf = await readFile(join(ROOT, 'index.html'));
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(buf);
  }
}).listen(PORT, () => console.log('http://127.0.0.1:' + PORT));
