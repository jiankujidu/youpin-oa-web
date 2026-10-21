/**
 * Cloudflare Pages Functions：OA 后端同源代理（免登录固定会话）
 *
 * 部署位置：dist-pages/functions/oa-proxy/[[path]].js
 *   → 线上地址 https://<pages 域名>/oa-proxy/customer/index/index
 *
 * 与 workers/oa-proxy.js（给 GitHub Pages 用的独立 Worker）逻辑一致，
 * 区别在于： Pages Functions 与站点**同源**，不再有跨域与第三方域名可达性问题。
 *
 * 免登录：没有自带会话时，一律使用构建期注入的固定 PHPSESSID（OA_FIXED_SID）。
 */
const OA_ORIGIN = 'https://oa.upingbio.com';
/** 构建时由 scripts/prepare-pages.mjs 注入 */
const FIXED_SID = '__FIXED_SID__';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestGet(ctx) {
  return handle(ctx);
}
export async function onRequestPost(ctx) {
  return handle(ctx);
}

/** 跨域预检：GitHub Pages 等其它源也会调这个同源代理（前端会带 X-Requested-With / x-oa-session） */
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Requested-With,x-oa-session',
      'Access-Control-Max-Age': '86400',
    },
  });
}

async function handle({ request, params }) {
  const url = new URL(request.url);

  if (url.pathname === '/oa-proxy/__health') {
    return json({ ok: true, oaBase: OA_ORIGIN, fixedSid: !!FIXED_SID });
  }

  // 1) 会话：自带 x-oa-session 时用它（登录流），否则用固定会话（免登录）
  const sid = request.headers.get('x-oa-session');
  const cookie = sid ? `PHPSESSID=${sid}` : FIXED_SID ? `PHPSESSID=${FIXED_SID}` : '';

  // 2) 组装转发（完整路径透传：/oa-proxy/<真实 OA 路径>）
  const seg = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  const target = `${OA_ORIGIN}/${seg}${url.search || ''}`;
  const headers = new Headers();
  headers.set('Referer', OA_ORIGIN + '/');
  headers.set('User-Agent', 'Mozilla/5.0 (YoupinOA-Web/1.0)');
  headers.set('X-Requested-With', 'XMLHttpRequest'); // 缺了会回整页 HTML 而非 JSON
  headers.set('Accept-Encoding', 'identity');
  if (cookie) headers.set('Cookie', cookie);
  const ct = request.headers.get('content-type');
  if (request.method === 'POST') {
    headers.set('Content-Type', ct || 'application/x-www-form-urlencoded; charset=UTF-8');
  }
  const accept = request.headers.get('accept');
  if (accept) headers.set('Accept', accept);

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.text() : undefined,
      redirect: 'follow',
    });
  } catch (e) {
    return json({ error: `OA 后端不可达：${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  // 3) 回传：剥掉 Set-Cookie / hop-by-hop / content-encoding（Cloudflare 已解压）
  const SKIP = new Set([
    'set-cookie',
    'transfer-encoding',
    'connection',
    'keep-alive',
    'content-length',
    'content-encoding',
  ]);
  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!SKIP.has(k.toLowerCase())) out.set(k, v);
  });
  out.set('Access-Control-Allow-Origin', '*');
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
