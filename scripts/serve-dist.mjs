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
      // 必须原样转发多账号会话头，否则本地验证走的还是线上固定会话，测不出账号隔离
      const fwd = {};
      for (const k of ['cookie', 'x-oa-sid', 'x-oa-session', 'x-requested-with', 'content-type']) {
        if (req.headers[k]) fwd[k] = req.headers[k];
      }
      const init = { method: req.method, headers: fwd };
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        init.body = Buffer.concat(chunks);
      }
      const r = await fetch(target, init);
      const body = Buffer.from(await r.arrayBuffer());
      const respHeaders = {
        'content-type': r.headers.get('content-type') || 'application/json',
        'access-control-allow-origin': '*',
      };
      // 代理层回传的登录 sid / 会话 sid 要透传给页面
      for (const k of ['x-oa-login-sid', 'x-oa-session']) {
        const v = r.headers.get(k);
        if (v) respHeaders[k] = v;
      }
      res.writeHead(r.status, respHeaders);
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
