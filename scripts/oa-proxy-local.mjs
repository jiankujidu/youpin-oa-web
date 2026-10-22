/**
 * 本地等价代理（与 workers/oa-proxy.js 逻辑一致，Node 运行时）。
 *
 * 用途：
 *   1) 没有 Cloudflare 账号时，用它顶替 Worker 跑真实数据链路（可部署到自己的服务器）
 *   2) 端到端自检：指向本地 mock（scripts/oa-mock.mjs）
 *
 * 路径约定与 Worker / 前端 api.ts 完全一致：完整路径透传，绝不增删前缀。
 *   /oa/approve/index      → <OA_BASE>/oa/approve/index
 *   /home/login/login_submit → <OA_BASE>/home/login/login_submit
 *
 * 用法：
 *   OA_BASE=http://127.0.0.1:8787 node scripts/oa-proxy-local.mjs 8788
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const OA_BASE = (process.env.OA_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const PORT = Number(process.argv[2] || process.env.PORT || 8788);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
/**
 * 免登录模式：OA_FIXED_SID=已登录的 PHPSESSID。
 * 前端不传 x-oa-session（或传的会话在 KV 中不存在）时，一律改用该固定后端会话。
 * 用于「不需要账号、打开即用」的部署形态。
 */
const FIXED_SID = (process.env.OA_FIXED_SID || '').trim();

/** 内存 KV（等价于 Cloudflare KV） */
const kv = new Map();
const SESSION_TTL = 60 * 60 * 8;

function corsHeaders(origin) {
  const allow =
    ALLOWED_ORIGINS.includes('*') || !origin
      ? '*'
      : ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Requested-With,x-oa-session,x-oa-sid,x-oa-no-xhr,x-test-mode',
    'Access-Control-Expose-Headers': 'x-oa-session,x-oa-login-sid',
    'Access-Control-Max-Age': '86400',
  };
}

function parseCookiePair(c) {
  const eq = c.indexOf('=');
  if (eq < 0) return null;
  const name = c.slice(0, eq).trim();
  let rest = c.slice(eq + 1);
  const semi = rest.indexOf(';');
  const value = (semi > -1 ? rest.slice(0, semi) : rest).trim();
  return name ? [name, value] : null;
}

function mergeCookies(existing, setCookies) {
  const map = new Map();
  if (existing) {
    existing.split(';').forEach((p) => {
      const kvp = parseCookiePair(p);
      if (kvp) map.set(kvp[0], kvp[1]);
    });
  }
  setCookies.forEach((c) => {
    const kvp = parseCookiePair(c);
    if (kvp) map.set(kvp[0], kvp[1]);
  });
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || null;
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    return res.end(JSON.stringify({ ok: true, oaBase: OA_BASE, sessions: kv.size }));
  }

  // 1) 会话优先级（多账号体系）：
  //    x-oa-sid 头 / ?__sid= 查询参数 = 原始 PHPSESSID（账号自带会话，最高优先级）
  //      > x-oa-session（KV 会话 id，验证码→登录链用）
  //      > OA_FIXED_SID 固定会话（旧部署免登录形态）
  //      > 新建空会话
  const rawSid = (req.headers['x-oa-sid'] || url.searchParams.get('__sid') || '').toString().trim();
  let sid = req.headers['x-oa-session'];
  let storedCookie = sid ? kv.get(sid) : undefined;
  if (rawSid) {
    sid = 'raw';
    storedCookie = `PHPSESSID=${rawSid}`;
  } else if (!sid || storedCookie === undefined) {
    if (FIXED_SID) {
      sid = 'fixed';
      storedCookie = `PHPSESSID=${FIXED_SID}`;
    } else {
      sid = randomUUID();
      storedCookie = '';
      kv.set(sid, storedCookie);
    }
  }
  /** 登录提交路径（成功后回传 x-oa-login-sid，供前端沉淀为账号会话） */
  const isLoginSubmit = url.pathname.replace(/\/+$/, '').endsWith('/home/login/login_submit');

  // 2) 组装转发（完整路径透传）
  const headers = { ...req.headers };
  delete headers.origin;
  delete headers.referer;
  delete headers.host;
  delete headers['x-oa-session'];
  delete headers['x-oa-sid']; // 账号会话标记绝不下发到 OA
  delete headers['x-oa-no-xhr']; // 页面型标记绝不下发到 OA
  headers.referer = OA_BASE + '/';
  // 完整浏览器 UA：原站 nginx 对 UA 做校验，非浏览器 UA 请求 /home/api/* 会被 403
  headers['user-agent'] =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
  // 后端以此判定 ajax 请求：缺失会直接回整页 HTML（而非 JSON 列表）。
  // 页面型端点（/home/index/edit_personal、/home/index/main.html）带 XHR 头会被原站 nginx 403，
  // 客户端用 x-oa-no-xhr 头（或 ?__noxhr=1）标记后这里改为删除该头。
  const noXhr = req.headers['x-oa-no-xhr'] === '1' || url.searchParams.get('__noxhr') === '1';
  if (noXhr) delete headers['x-requested-with'];
  else if (!headers['x-requested-with']) headers['x-requested-with'] = 'XMLHttpRequest';
  // 显式要求不压缩，彻底避免 content-encoding 与已解压 body 不一致
  headers['accept-encoding'] = 'identity';
  if (storedCookie) headers.cookie = storedCookie;

  let body;
  if (req.method === 'POST') {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => resolve(data));
    });
    if (!headers['content-type']) headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
  }

  let upstream;
  try {
    upstream = await fetch(OA_BASE + url.pathname + (url.search || ''), {
      method: req.method,
      headers,
      body: req.method === 'POST' ? body : undefined,
      redirect: 'follow',
    });
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json', ...cors });
    return res.end(JSON.stringify({ error: `OA 后端不可达（${OA_BASE}）：${e.message}` }));
  }

  // 3) 摘 Set-Cookie 存 KV
  const setCookies = upstream.headers.getSetCookie ? upstream.headers.getSetCookie() : [];
  if (setCookies.length) {
    kv.set(sid, mergeCookies(storedCookie, setCookies));
  }

  // 4) 回传：剥 Set-Cookie + CORS + 回显 sid。
  //    必须跳过 hop-by-hop 头与上游自带的 CORS 头，否则同名头叠加成非法值（Chrome 直接拒收）。
  const SKIP = new Set([
    'set-cookie',
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-expose-headers',
    'access-control-max-age',
    'transfer-encoding',
    'connection',
    'keep-alive',
    'content-length',
    // Node 的 fetch 已自动解压；若把上游的 content-encoding 原样回传，
    // 浏览器会对「已解压的 body」二次解压 → blob() 抛 "Failed to fetch"
    'content-encoding',
  ]);
  const out = {};
  upstream.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (SKIP.has(lk)) return;
    out[lk] = v;
  });
  for (const [k, v] of Object.entries(cors)) out[k] = v;
  out['x-oa-session'] = sid;

  const buf = Buffer.from(await upstream.arrayBuffer());

  // 登录成功：回传本次登录会话的 PHPSESSID（前端沉淀为账号会话，实现多账号切换）
  if (isLoginSubmit && upstream.status === 200) {
    try {
      const j = JSON.parse(buf.toString('utf8'));
      if (j && j.code === 0) {
        // OA 可能在登录时重写会话 id（Set-Cookie 新 PHPSESSID，已合入 KV）；
        // 取最新 cookie 里的 PHPSESSID 回传，客户端以此作为账号会话
        const cookieNow = kv.get(sid) || storedCookie || '';
        const m = /PHPSESSID=([^;]+)/i.exec(cookieNow);
        if (m && m[1]) out['x-oa-login-sid'] = m[1];
      }
    } catch {
      /* 非 JSON 响应，忽略 */
    }
  }

  res.writeHead(upstream.status, out);
  res.end(buf);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`local oa proxy listening on http://127.0.0.1:${PORT} -> ${OA_BASE}`);
});
