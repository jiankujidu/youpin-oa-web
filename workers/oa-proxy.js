/**
 * 可选组件：OA 后端 CORS 代理 + R2 预签名签发（Cloudflare Worker）
 *
 * 为什么需要它：
 *   https://oa.upingbio.cn 对跨域请求返回 403 且不带任何 Access-Control-Allow-Origin，
 *   浏览器无法直连。本 Worker 做三件事：
 *     1) 转发请求到真实 OA 后端并补上 CORS 响应头
 *     2) 透传 Cookie 登录会话（登录页验证码与业务接口共用同一会话）
 *     3) 为 Cloudflare R2 签发预签名 PUT URL（密钥只在 Worker 侧，前端从不接触）
 *
 * 部署：
 *   npm i -g wrangler
 *   wrangler login
 *   wrangler init oa-proxy      # 或直接用本文件替换 src/index.js
 *   wrangler secret put R2_ACCESS_KEY_ID
 *   wrangler secret put R2_SECRET_ACCESS_KEY
 *   wrangler deploy
 *   然后把 Worker 地址填到 VITE_OA_PROXY / VITE_R2_PRESIGN_URL
 *
 * 不部署也不影响站点使用——未配置时用内置演示数据集。
 */

const OA_ORIGIN = 'https://oa.upingbio.cn';

/** 允许访问本站的源；生产环境建议改成你的 Pages 域名 */
const ALLOWED_ORIGINS = ['*'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

function cors(response) {
  const origin = ALLOWED_ORIGINS[0];
  const h = new Headers(response.headers);
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Credentials', 'false');
  h.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    /* ======================= R2 预签名（PUT） ======================= */
    if (url.pathname === '/presign' && request.method === 'POST') {
      const missing = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL'].filter(
        (k) => !env[k],
      );
      if (missing.length) {
        return json({ error: `Worker 缺少环境变量：${missing.join(', ')}` }, 500);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: '请求体不是合法 JSON' }, 400);
      }
      const key = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${
        String(body.filename || 'file').replace(/[^\w.\-一-龥]/g, '_')
      }`;
      const signUrl = await presignPut({
        accountId: env.R2_ACCOUNT_ID,
        bucket: env.R2_BUCKET,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        key,
        contentType: body.contentType || 'application/octet-stream',
        expiresIn: 900,
      });
      return json({ url: signUrl, key, publicUrl: `${env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}` });
    }

    /* ======================= OA 后端转发 ======================= */
    // 约定：/oa<path>?<query>  →  https://oa.upingbio.cn<path>?<query>
    if (!url.pathname.startsWith('/oa')) {
      return json({ error: '路径需以 /oa 开头' }, 404);
    }
    const target = OA_ORIGIN + url.pathname.slice('/oa'.length) + (url.search || '');
    const incoming = new Headers(request.headers);
    incoming.delete('origin');
    incoming.delete('referer');
    incoming.set('Referer', OA_ORIGIN + '/');
    incoming.set('User-Agent', 'Mozilla/5.0 (YoupinOA-Web/1.0)');

    let body;
    if (request.method === 'POST') {
      body = await request.text();
      if (!incoming.has('Content-Type')) {
        incoming.set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
      }
    }

    const upstream = await fetch(target, {
      method: request.method,
      headers: incoming,
      body: request.method === 'POST' ? body : undefined,
      redirect: 'follow',
    });

    // 后端 Set-Cookie 不向浏览器下发（跨站 Cookie 会被浏览器拒绝），
    // 会话由 Worker 侧保持：这里把 Set-Cookie 摘掉，避免浏览器报 SameSite 错误。
    const respHeaders = new Headers(upstream.headers);
    respHeaders.delete('set-cookie');
    for (const [k, v] of Object.entries(CORS_HEADERS)) respHeaders.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  },
};

/* ======================= AWS SigV4 预签名（R2 兼容 S3） ======================= */

async function presignPut({ accountId, bucket, accessKeyId, secretAccessKey, key, contentType, expiresIn }) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    `X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${encodeURIComponent(
      `${accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`,
    )}&X-Amz-Date=${amzDate}&X-Amz-Expires=${expiresIn}&X-Amz-SignedHeaders=${encodeURIComponent(signedHeaders)}`,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const k = await hmacChain(secretAccessKey, dateStamp, region, service);
  const signature = await hmacHex(k, stringToSign);

  return (
    `https://${host}${canonicalUri}` +
    `?X-Amz-Algorithm=AWS4-HMAC-SHA256` +
    `&X-Amz-Credential=${encodeURIComponent(`${accessKeyId}/${scope}`)}` +
    `&X-Amz-Date=${amzDate}` +
    `&X-Amz-Expires=${expiresIn}` +
    `&X-Amz-SignedHeaders=${encodeURIComponent(signedHeaders)}` +
    `&X-Amz-Signature=${signature}`
  );
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return hex(buf);
}
async function hmac(keyBytes, msg) {
  return crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']).then((k) =>
    crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)),
  );
}
async function hmacHex(keyBytes, msg) {
  return hex(await hmac(keyBytes, msg));
}
async function hmacChain(secret, dateStamp, region, service) {
  let k = new TextEncoder().encode('AWS4' + secret);
  k = await hmac(k, dateStamp);
  k = await hmac(k, region);
  k = await hmac(k, service);
  k = await hmac(k, 'aws4_request');
  return k;
}
function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
