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
 * 路径约定（★ 与 src/core/api.ts 严格一致）：
 *   完整路径透传，不做任何前缀改写。前端 oaFetch(path) 直接以真实 OA 相对路径请求：
 *     /oa/approve/check        → https://oa.upingbio.cn/oa/approve/check
 *     /home/login/login_submit → https://oa.upingbio.cn/home/login/login_submit
 *     /captcha.html            → https://oa.upingbio.cn/captcha.html
 *
 * 部署：见 README「接实时真实数据（代理 + 你的 OA 账号）」一节。
 * 本地等价实现（无 Cloudflare 账号时可用）：scripts/oa-proxy-local.mjs
 */

const DEFAULT_ORIGIN = 'https://oa.upingbio.com';

/**
 * 免登录固定会话：env.OA_FIXED_SID = 已登录的 PHPSESSID。
 * 浏览器没有自带会话（或 KV 中查不到）时一律改用该会话转发，
 * 于是「打开站点就是已登录的后台」，用户无需输入账号密码。
 * 部署：npx wrangler deploy --var OA_FIXED_SID:xxxxxxxx
 */
function resolveSid(env, request, kvCookie) {
  if (kvCookie !== null && kvCookie !== undefined) return kvCookie;
  const fixed = (env && env.OA_FIXED_SID ? String(env.OA_FIXED_SID) : '').trim();
  return fixed ? `PHPSESSID=${fixed}` : '';
}

/** 允许访问本 Worker 的源；'*' 表示任意（部署后建议收紧为你的 Pages 域名，如 ['https://web.jk93.qzz.io']） */
const ALLOWED_ORIGINS = ['*'];

/** OA 会话在 KV 里的过期时间（秒），与 OA 服务端会话时长保持一致即可 */
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
    'Access-Control-Allow-Headers': 'Content-Type,X-Requested-With,x-oa-session',
    'Access-Control-Expose-Headers': 'x-oa-session',
    'Access-Control-Max-Age': '86400',
  };
}

function corsPreflight(origin) {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

function json(obj, status = 200, origin = null) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
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
    const origin = request.headers.get('origin');

    if (request.method === 'OPTIONS') return corsPreflight(origin);

    /* ===== R2 预签名（PUT） ===== */
    if (url.pathname === '/presign' && request.method === 'POST') {
      const missing = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL'].filter(
        (k) => !env[k],
      );
      if (missing.length) return json({ error: `Worker 缺少环境变量：${missing.join(', ')}` }, 500, origin);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: '请求体不是合法 JSON' }, 400, origin);
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
      return json({ url: signUrl, key, publicUrl: `${env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}` }, 200, origin);
    }

    /* ===== OA 后端转发（带会话） =====
     * ★ 完整路径透传：pathname 原样拼到 OA_ORIGIN 之后，绝不增删前缀。
     *   这保证与前端 oaFetch() 的约定零偏差（/oa/... 与 /home/... 都能正确到达）。
     */
    const OA_ORIGIN = (env && env.OA_BASE ? String(env.OA_BASE) : DEFAULT_ORIGIN).replace(/\/+$/, '');

    if (url.pathname === '/__health') {
      return json(
        { ok: true, oaBase: OA_ORIGIN, fixedSid: !!(env && env.OA_FIXED_SID) },
        200,
        origin,
      );
    }

    let sid = request.headers.get('x-oa-session');
    let storedCookie = sid ? await env.OA_SESSIONS.get(sid) : null;
    // 免登录：无自带会话时改用固定会话（不要再建空会话，否则线上全部页面取不到数据）
    const cookie = resolveSid(env, request, storedCookie);
    if (!sid) {
      sid = 'fixed';
      storedCookie = cookie;
      if (cookie) await env.OA_SESSIONS.put(sid, cookie, { expirationTtl: SESSION_TTL });
    }

    // 组装转发请求
    const target = OA_ORIGIN + url.pathname + (url.search || '');
    const headers = new Headers(request.headers);
    headers.delete('origin');
    headers.delete('x-oa-session'); // 不下发到 OA
    headers.set('Referer', OA_ORIGIN + '/');
    headers.set('User-Agent', 'Mozilla/5.0 (YoupinOA-Web/1.0)');
    // 后端以此判定 ajax：缺失会回整页 HTML 而不是 JSON 列表
    if (!headers.has('X-Requested-With')) headers.set('X-Requested-With', 'XMLHttpRequest');
    headers.set('Accept-Encoding', 'identity');
    if (cookie) headers.set('Cookie', cookie);

    let body;
    if (request.method === 'POST') {
      body = await request.text();
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
      }
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === 'POST' ? body : undefined,
        redirect: 'follow',
      });
    } catch (e) {
      return json({ error: `OA 后端不可达：${e instanceof Error ? e.message : String(e)}` }, 502, origin);
    }

    // 抓取 OA 下发的 Set-Cookie，存进 KV（覆盖同名）
    const setCookies =
      typeof upstream.headers.getSetCookie === 'function'
        ? upstream.headers.getSetCookie()
        : [upstream.headers.get('set-cookie')].filter(Boolean);
    // 免登录固定会话不写回 KV（否则一次后端换 session 就会把整站打回未登录态）
    if (setCookies.length && sid !== 'fixed') {
      const merged = mergeCookies(storedCookie || '', setCookies);
      await env.OA_SESSIONS.put(sid, merged, { expirationTtl: SESSION_TTL });
    }

    // 回传给浏览器：剥离 Set-Cookie / hop-by-hop 头 / 上游自带的 CORS 头，
    // 再补本代理的 CORS（同名头叠加会产生 "*, *" 这类非法值，浏览器会直接拒收）
    const SKIP_HEADERS = new Set([
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
      // Cloudflare fetch 已自动解压；回传上游的 content-encoding 会让浏览器二次解压失败
      'content-encoding',
    ]);
    const out = new Headers();
    upstream.headers.forEach((v, k) => {
      if (!SKIP_HEADERS.has(k.toLowerCase())) out.set(k, v);
    });
    for (const [k, v] of Object.entries(corsHeaders(origin))) out.set(k, v);
    out.set('x-oa-session', sid);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out,
    });
  },

  /**
   * 定时保活：每 30 分钟用固定会话请求一次后台首页，
   * 让 OA 服务端的会话不会因为长时间空闲被回收（见 wrangler.toml 的 crons 配置）。
   */
  async scheduled(controller, env) {
    const fixed = (env && env.OA_FIXED_SID ? String(env.OA_FIXED_SID) : '').trim();
    if (!fixed) return;
    const OA_ORIGIN = (env && env.OA_BASE ? String(env.OA_BASE) : DEFAULT_ORIGIN).replace(/\/+$/, '');
    try {
      await fetch(OA_ORIGIN + '/home/index/index', {
        headers: {
          Cookie: `PHPSESSID=${fixed}`,
          Referer: OA_ORIGIN + '/',
          'User-Agent': 'Mozilla/5.0 (YoupinOA-Web/1.0)',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept-Encoding': 'identity',
        },
      });
    } catch {
      /* 保活失败不影响请求链路 */
    }
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
