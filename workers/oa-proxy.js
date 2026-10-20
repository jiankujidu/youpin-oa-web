/**
 * 可选组件：OA 后端 CORS 代理 + 有状态会话 + R2 预签名（Cloudflare Worker）
 *
 * 为什么需要它：
 *   https://oa.upingbio.cn 对跨域请求返回 403 且不带任何 Access-Control-Allow-Origin，
 *   浏览器无法直连；同时它要求「登录会话」，纯静态站点无法替用户持有。
 *
 * 本 Worker 做三件事：
 *   1) 转发请求到真实 OA 后端并补上 CORS 响应头（解决跨域）
 *   2) 用 KV 维护 OA 会话：浏览器只持有一个随机 sessionId（放在 x-oa-session 头里），
 *      浏览器请求 → Worker 取出 KV 里保存的 OA Cookie 透传给后端；
 *      OA 下发的 Set-Cookie 被 Worker 摘下存入 KV（绝不下发到浏览器，避免跨站 Cookie 报错）。
 *      这样「取验证码图片 → 登录 → 拉数据」三步共用同一个 OA 会话。
 *   3) 为 Cloudflare R2 签发预签名 PUT URL（密钥只在 Worker 侧）
 *
 * 部署：见 README「接真实数据（代理 + 你的 OA 账号）」一节。
 */

const OA_ORIGIN = 'https://oa.upingbio.cn';

/** 允许访问本 Worker 的源；生产环境务必改成你的 Pages 域名，例如 ['https://jiankujidu.github.io'] */
const ALLOWED_ORIGINS = ['*'];

/** OA 会话在 KV 里的过期时间（秒），与 OA 服务端会话时长保持一致即可 */
const SESSION_TTL = 60 * 60 * 8;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Requested-With,x-oa-session',
  'Access-Control-Expose-Headers': 'x-oa-session',
  'Access-Control-Max-Age': '86400',
};

function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

/* ======================= Cookie 工具 ======================= */

/** 从一段 "name=value; path=/; ..." 中提取 name 与 value */
function parseCookiePair(c) {
  const eq = c.indexOf('=');
  if (eq < 0) return null;
  const name = c.slice(0, eq).trim();
  let rest = c.slice(eq + 1);
  const semi = rest.indexOf(';');
  const value = (semi > -1 ? rest.slice(0, semi) : rest).trim();
  return name ? [name, value] : null;
}

/** 合并已有 Cookie 串与一批 Set-Cookie，按 name 覆盖，返回可直接用于请求头的值 */
function mergeCookies(existing, setCookies) {
  const map = new Map();
  if (existing) {
    existing.split(';').forEach((p) => {
      const kv = parseCookiePair(p);
      if (kv) map.set(kv[0], kv[1]);
    });
  }
  setCookies.forEach((c) => {
    const kv = parseCookiePair(c);
    if (kv) map.set(kv[0], kv[1]);
  });
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/* ======================= 主入口 ======================= */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return corsPreflight();

    /* ===== R2 预签名（PUT） ===== */
    if (url.pathname === '/presign' && request.method === 'POST') {
      const missing = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL'].filter(
        (k) => !env[k],
      );
      if (missing.length) return json({ error: `Worker 缺少环境变量：${missing.join(', ')}` }, 500);
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

    /* ===== OA 后端转发（带会话） =====
     * 约定：/oa<path>?<query> → https://oa.upingbio.cn<path>?<query>
     */
    if (!url.pathname.startsWith('/oa')) {
      return json({ error: '路径需以 /oa 开头' }, 404);
    }

    // 1) 解析 / 创建会话 id
    let sid = request.headers.get('x-oa-session');
    let storedCookie = sid ? await env.OA_SESSIONS.get(sid) : null;
    if (!sid || storedCookie === null) {
      sid = crypto.randomUUID();
      storedCookie = '';
      await env.OA_SESSIONS.put(sid, '', { expirationTtl: SESSION_TTL });
    }

    // 2) 组装转发请求
    const target = OA_ORIGIN + url.pathname.slice('/oa'.length) + (url.search || '');
    const headers = new Headers(request.headers);
    headers.delete('origin');
    headers.delete('referer');
    headers.delete('x-oa-session'); // 不下发到 OA
    headers.set('Referer', OA_ORIGIN + '/');
    headers.set('User-Agent', 'Mozilla/5.0 (YoupinOA-Web/1.0)');
    if (storedCookie) headers.set('Cookie', storedCookie);

    let body;
    if (request.method === 'POST') {
      body = await request.text();
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
      }
    }

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? body : undefined,
      redirect: 'follow',
    });

    // 3) 抓取 OA 下发的 Set-Cookie，存进 KV（覆盖同名）
    const setCookies = typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : [upstream.headers.get('set-cookie')].filter(Boolean);
    if (setCookies.length) {
      const merged = mergeCookies(storedCookie, setCookies);
      await env.OA_SESSIONS.put(sid, merged, { expirationTtl: SESSION_TTL });
    }

    // 4) 回传给浏览器：剥离 Set-Cookie，补 CORS，并回显 sessionId
    const out = new Headers(upstream.headers);
    out.delete('set-cookie');
    for (const [k, v] of Object.entries(CORS_HEADERS)) out.set(k, v);
    out.set('x-oa-session', sid);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out,
    });
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
