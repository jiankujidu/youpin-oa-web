/**
 * 本地 mock：同时模拟「有状态会话 Worker」+「最小 OA 后端」。
 * 用于在部署 Cloudflare Worker 之前，端到端验证真实数据链路
 * （取验证码图片 → 登录 → 带会话拉取真实列表数据）。
 *
 * 协议与 workers/oa-proxy.js 完全一致：
 *   - 浏览器只持 x-oa-session，会话状态（含验证码答案、登录态）全部在 Worker 侧
 *   - 响应回显 x-oa-session、带 CORS 头、剥离 Set-Cookie
 *
 * 测试模式（请求带 x-test-mode: 1）：验证码固定为 1234，便于自动化。
 * 真实账号：demo / demo1234，验证码 = 服务端下发值。
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const OA_ORIGIN = 'https://oa.upingbio.cn';
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

const sessions = new Map(); // sid -> { captcha, loggedIn, user }

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Requested-With,x-oa-session',
    'Access-Control-Expose-Headers': 'x-oa-session',
    'Access-Control-Max-Age': '86400',
  };
}

function send(res, status, body, extra = {}) {
  const headers = { ...corsHeaders(), ...extra };
  if (typeof body !== 'string' && !Buffer.isBuffer(body)) body = JSON.stringify(body);
  if (typeof body === 'string') headers['Content-Type'] = 'application/json; charset=utf-8';
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

function parseForm(s) {
  const o = {};
  new URLSearchParams(s).forEach((v, k) => (o[k] = v));
  return o;
}

export function startMock(port = 8787) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      return res.end();
    }
    if (!url.pathname.startsWith('/oa')) {
      return send(res, 404, { error: 'path must start with /oa' });
    }

    // 1) 会话
    let sid = req.headers['x-oa-session'];
    if (!sid || !sessions.has(sid)) {
      sid = randomUUID();
      sessions.set(sid, { captcha: null, loggedIn: false, user: null });
    }
    const sess = sessions.get(sid);
    const testMode = req.headers['x-test-mode'] === '1';

    // 2) 路由
    const path = url.pathname.replace(/^\/oa/, '');
    console.log('[mock]', req.method, url.pathname, '->', path, '| sid=', sid, 'loggedIn=', sess.loggedIn, 'captcha=', sess.captcha);

    if (req.method === 'GET' && path === '/captcha.html') {
      sess.captcha = testMode ? '1234' : String(1000 + Math.floor(Math.random() * 9000));
      return send(res, 200, PNG_1x1, { 'x-oa-session': sid, 'Content-Type': 'image/png' });
    }

    if (req.method === 'POST' && path === '/home/login/login_submit') {
      const b = parseForm(await readBody(req));
      if (b.username !== 'demo' || b.password !== 'demo1234') {
        return send(res, 200, { code: 1, msg: '用户名或密码错误', data: [] }, { 'x-oa-session': sid });
      }
      if (b.captcha !== sess.captcha) {
        return send(res, 200, { code: 1, msg: '验证码错误', data: [] }, { 'x-oa-session': sid });
      }
      sess.loggedIn = true;
      sess.user = { nickname: 'Mock测试员', admin_name: 'Mock管理员' };
      return send(
        res,
        200,
        { code: 0, msg: '', data: { nickname: 'Mock测试员', admin_name: 'Mock管理员' } },
        { 'x-oa-session': sid },
      );
    }

    // 以下接口需登录
    if (!sess.loggedIn) {
      return send(res, 200, { code: 1, msg: '未登录', data: [] }, { 'x-oa-session': sid });
    }

    if (req.method === 'GET' && path === '/approve/index') {
      return send(
        res,
        200,
        {
          code: 0,
          data: [
            {
              id: 'real-1',
              title: '【真实数据】采购审批-来自Mock后端',
              status: 1,
              create_time: '2026-10-20',
              applicant: 'Mock申请人',
              amount: '￥12,800',
              type: '采购',
              remark: '由本地 mock 验证链路返回',
            },
          ],
        },
        { 'x-oa-session': sid },
      );
    }

    if (req.method === 'GET' && path === '/customer/index/index') {
      return send(
        res,
        200,
        {
          code: 0,
          data: [
            {
              id: 'c-real',
              name: '【真实数据】上海优品生物 Mock 客户',
              contact: '王经理',
              tel: '13800000000',
              grade: 'a',
              source: '展会',
              intent: '高',
              status: '跟进中',
              address: '上海市浦东新区',
            },
          ],
        },
        { 'x-oa-session': sid },
      );
    }

    if (req.method === 'GET' && path === '/product/index/list') {
      return send(
        res,
        200,
        {
          code: 0,
          data: [
            { id: 'p-real', goods_no: 'YP-MOCK-001', title: '【真实数据】Mock 产品 A', price: '￥199', standard: '10mg', category: '抗体' },
          ],
        },
        { 'x-oa-session': sid },
      );
    }

    if (req.method === 'GET' && path === '/home/index/index') {
      return send(
        res,
        200,
        { code: 0, data: { approve_pending: 7, customer_new: 3, product_total: 128, message_unread: 2 } },
        { 'x-oa-session': sid },
      );
    }

    return send(res, 404, { code: 1, msg: 'not found', data: [] }, { 'x-oa-session': sid });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// 直接运行时启动
if (import.meta.url === `file://${process.argv[1]}`) {
  startMock(Number(process.env.MOCK_PORT) || 8787).then((s) => {
    console.log('mock listening', s.address());
  });
}
