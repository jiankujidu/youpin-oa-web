/**
 * 本地 mock OA 后端（仅用于端到端验证代理链路，不接触真实数据）。
 *
 * 与 workers/oa-proxy.js 的路径约定一致：完整路径透传，例如
 *   GET  /oa/approve/index      （注意 /oa 前缀是真实路径的一部分，不是 mock 加的）
 *   POST /home/login/login_submit
 * 响应字段形状与 src/core/types.ts 对齐，使前端零适配即可验证。
 *
 * 管理端点（供自动化测试读取，不参与业务）：
 *   GET /__state  → 当前会话、验证码答案、写操作调用日志
 *   POST /__reset → 清空会话与日志
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

const sessions = new Map(); // sid -> { captcha, loggedIn, user }
const writes = []; // 所有 POST 写操作的调用日志（验证提交真实到达后端）
let seq = 0;
const nid = (p) => `${p}-${++seq}`;

const d = (dayAgo = 0) => {
  const t = new Date(Date.now() - dayAgo * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
};

/* ============================ 数据（形状对齐 types.ts） ============================ */

const APPROVES = [
  { id: 'ap-1', title: '采购审批-Q4抗体备货', type_name: '采购', status: 1, admin_name: 'Mock李慧敏', create_time: d(0), content: '申请人：Mock李慧敏\n申请事由：Q4 抗体原料备货\n请尽快审批。', remark: '', flow: [
    { name: '发起申请', state: 'ok', admin_name: 'Mock李慧敏', time: d(0) },
    { name: '部门主管审批', state: 'wait', admin_name: '', time: '' },
  ] },
  { id: 'ap-2', title: '校展用车申请-武汉理工大学', type_name: '用车', status: 1, admin_name: 'Mock张海涛', create_time: d(1), content: '申请人：Mock张海涛\n申请事由：武汉理工大学校展用车', remark: '', flow: [
    { name: '发起申请', state: 'ok', admin_name: 'Mock张海涛', time: d(1) },
    { name: '部门主管审批', state: 'wait', admin_name: '', time: '' },
  ] },
  { id: 'ap-3', title: '客户拜访出差申请-南京', type_name: '出差', status: 2, admin_name: 'Mock陈思远', create_time: d(2), content: '申请人：Mock陈思远\n申请事由：南京客户拜访', remark: '同意', flow: [
    { name: '发起申请', state: 'ok', admin_name: 'Mock陈思远', time: d(2) },
    { name: '部门主管审批', state: 'ok', admin_name: 'Mock吴部长', time: d(2), remark: '同意' },
  ] },
  { id: 'ap-4', title: '周末加班申请-订单复核', type_name: '加班', status: 3, admin_name: 'Mock赵磊', create_time: d(3), content: '申请人：Mock赵磊\n申请事由：订单复核', remark: '已通过其他方式安排', flow: [
    { name: '发起申请', state: 'ok', admin_name: 'Mock赵磊', time: d(3) },
    { name: '部门主管审批', state: 'no', admin_name: 'Mock吴部长', time: d(3), remark: '已通过其他方式安排' },
  ] },
];

const CUSTOMERS = [
  { id: 'cu-1', name: 'Mock 武汉大学生命科学学院', grade: 'deal', grade_text: '成交客户', contact: '周教授', tel: '13800000001', source: '展会', intent: 4, status: 2, has_wechat: true, admin_name: 'Mock李慧敏', create_time: d(3), last_time: d(0), address: '湖北省武汉市武昌区八一路299号', remark: '长期合作客户，季度复购稳定。' },
  { id: 'cu-2', name: 'Mock 华中科技大学同济医学院', grade: 'lead', grade_text: '重点线索', contact: '李主任', tel: '13800000002', source: '转介绍', intent: 3, status: 1, has_wechat: false, admin_name: 'Mock张海涛', create_time: d(5), last_time: d(1), address: '湖北省武汉市硚口区航空路13号', remark: '有明确采购意向。' },
  { id: 'cu-3', name: 'Mock 山东农业大学', grade: 'sleep', grade_text: '沉睡客户', contact: '孙老师', tel: '13800000003', source: '官网', intent: 1, status: 0, has_wechat: false, admin_name: 'Mock陈思远', create_time: d(9), last_time: d(6), address: '山东省泰安市岱宗大街61号', remark: '近半年无互动。' },
];

const PRODUCTS = [
  { id: 'pr-1', title: 'Mock FGF-19 Rabbit pAb', goods_no: 'YP-MOCK-001', cate_title: '一抗', price_desc: '¥ 2,380.00', specs: '100μL', unit: '支', species: 'Rabbit', application: 'WB', brand: '优品生物', stock: '现货', create_time: d(2), content: '<p>Mock 产品说明</p>', goods_no_list: [{ goods_no: 'YP-MOCK-001', goods_no_url: 'data/manual/YP-MOCK-001.pdf', pc_goods_no_url: 'data/manual/YP-MOCK-001.pdf' }] },
  { id: 'pr-2', title: 'Mock 山羊抗兔 IgG(H+L)-HRP', goods_no: 'YP-MOCK-002', cate_title: '二抗', price_desc: '¥ 860.00', specs: '1mL', unit: '支', species: 'Goat', application: 'IHC', brand: '优品生物', stock: '预定（3 个工作日）', create_time: d(4), content: '<p>Mock 产品说明</p>', goods_no_list: [{ goods_no: 'YP-MOCK-002', goods_no_url: 'data/manual/YP-MOCK-002.pdf', pc_goods_no_url: 'data/manual/YP-MOCK-002.pdf' }] },
];

const NOTES = [
  { id: 'nt-1', title: 'Mock Q4 备货通知', cate_title: '公司通知', admin_name: 'Mock行政部', create_time: d(0), content: '<p>请各相关部门按通知执行。</p>' },
  { id: 'nt-2', title: 'Mock 新版销售协议模板上线', cate_title: '业务公告', admin_name: 'Mock销售部', create_time: d(3), content: '<p>新版模板已上线。</p>' },
];

const ARTICLES = [
  { id: 'ar-1', title: 'Mock 抗体保存常见误区', cate_title: '技术问答', create_time: d(1), content: '<h3>Mock 抗体保存常见误区</h3><p>标准处理流程。</p>' },
  { id: 'ar-2', title: 'Mock 二抗选择指南', cate_title: '产品指南', create_time: d(4), content: '<h3>Mock 二抗选择指南</h3><p>HRP / Cy3 / Cy5 怎么选。</p>' },
];

const MESSAGES = [
  { id: 'ms-1', title: '【审批提醒】您有 2 条待审批', from_name: '系统消息', create_time: d(0), is_read: false, content: '<p>请及时处理。</p>' },
  { id: 'ms-2', title: 'Mock 周会纪要', from_name: 'Mock李慧敏', create_time: d(2), is_read: true, content: '<p>重点跟进高校客户。</p>' },
];

const MAILS = [
  { id: 'ml-1', name: 'Mock李慧敏', department: '销售部', position: '大区经理', tel: '13800000001', mobile: '13800000001', email: 'lihm@mock.cn' },
  { id: 'ml-2', name: 'Mock郑会计', department: '财务部', position: '会计', tel: '13800000002', mobile: '13800000002', email: 'zheng@mock.cn' },
];

const ATTACHMENTS = [
  { id: 'at-1', name: 'Mock 说明书.pdf', url: 'data/manual/YP-MOCK-001.pdf', filesize: 179619, fileext: 'pdf', create_time: d(1), admin_name: 'Mock李慧敏', group_title: '销售部' },
  { id: 'at-2', name: 'Mock 报价表.xlsx', url: 'data/manual/YP-MOCK-002.pdf', filesize: 10017, fileext: 'xlsx', create_time: d(4), admin_name: 'Mock王雅琴', group_title: '商务部' },
];

const HOME_STATS = { pendingApprove: 2, myCustomer: 3, monthOrder: 27, monthAmount: '386,420.00', unreadMsg: 1, approve_pending: 2, customer_new: 3, product_total: 128, message_unread: 1 };

/** 子页面（财务 / 客户子类 / 订单）统一返回，字段供 mapRemoteRow 组装 */
function bizList(kind) {
  const base = {
    '/finance/advancedepositlog/index': [['Mock 预存款充值', '银行转账 · 已到账', '¥ 50,000.00', '已到账', 'ok'], ['Mock 预存款充值', '支付宝 · 审核中', '¥ 18,600.00', '待财务确认', 'wait']],
    '/finance/income/index': [['Mock 到账登记', '订单 SO-20261020-001', '¥ 26,400.00', '已核销', 'ok'], ['Mock 到账登记', '订单 SO-20261020-002', '¥ 8,600.00', '待核销', 'wait']],
    '/finance/orderapply/index': [['Mock 订单到账申请', 'SO-20261020-001 · 待审核', '¥ 31,200.00', '待审核', 'wait']],
    '/finance/orderapply/list': [['Mock 待处理到账申请', 'SO-20261020-001', '¥ 31,200.00', '待我处理', 'wait']],
    '/finance/deductionlog/index': [['Mock 抵扣券申请', '满 20000 减 1000', '¥ 1,000.00', '已生效', 'ok']],
    '/finance/deductionlog/checkedlist': [['Mock 待审核抵扣券', '申请人：Mock张海涛', '¥ 1,500.00', '待我审核', 'wait']],
    '/finance/margindepositlog/index': [['Mock 保证金收取', '投标保证金 · 已收', '¥ 20,000.00', '已收', 'ok']],
    '/finance/invoice/index': [['Mock 发票申请', '增值税专用发票 · 已开具', '¥ 26,400.00', '已开具', 'ok']],
    '/finance/invoice/list': [['Mock 待处理发票申请', '普通发票 · 待开具', '¥ 12,800.00', '待我处理', 'wait']],
    '/customer/contact/index': [['Mock 周教授', '武汉大学生命科学学院', '027-6877****', '主要联系人', 'ok']],
    '/customer/chance/index': [['Mock 销售机会', 'Q4 抗体系列采购', '¥ 120,000.00', '推进中', 'wait']],
    '/customer/trace/index': [['Mock 电话回访', '周教授 · 确认备货清单', '15 分钟', '已完成', 'ok']],
    '/customer/order/index': [['Mock SO-20261020-003', 'FGF-19 抗体 × 6 支', '¥ 14,280.00', '待发货', 'wait']],
    '/customer/order/list': [['Mock 待处理订单', 'SO-20261020-003', '¥ 14,280.00', '待我处理', 'wait']],
    '/customer/sample/index': [['Mock 样本寄送', 'YP-MOCK-001 试用装', '1 支', '已签收', 'ok']],
    '/customer/schoolexhibition/index': [['Mock 武汉理工大学校展', '2026-10-22', '2 人', '已确认', 'ok']],
    '/customer/aftersalesservice/index': [['Mock 售后工单', '抗体效价偏低，申请复检', '—', '处理中', 'wait']],
  }[kind] || [['Mock 记录', '来自本地 mock 后端', '—', '正常', 'info']];
  return base.map(([title, sub, amount, status], i) => ({
    id: `${kind}-${i + 1}`,
    title,
    name: title,
    customer_name: sub,
    amount,
    status,
    status_text: status,
    create_time: d(i),
    remark: '由本地 mock 后端返回，用于验证代理链路',
  }));
}

/* ============================ 服务 ============================ */

const cors = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Requested-With,x-oa-session',
  'Access-Control-Expose-Headers': 'x-oa-session',
});

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

export function startMock(port = 8787) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // 当前请求的 OA 会话（基于 Cookie）；send() 统一补 Set-Cookie 与 CORS
    let sid = null;
    let needSetCookie = false;
    function send(status, body, extra = {}) {
      const headers = { ...cors(), ...extra };
      if (needSetCookie) headers['Set-Cookie'] = `PHPSESSID=${sid}; Path=/; HttpOnly`;
      if (typeof body !== 'string' && !Buffer.isBuffer(body)) body = JSON.stringify(body);
      if (typeof body === 'string') headers['Content-Type'] = 'application/json; charset=utf-8';
      res.writeHead(status, headers);
      res.end(body);
    }
    const ok = (data, s) => send(200, { code: 0, msg: '', data }, { 'x-oa-session': s });
    const err = (msg, s) => send(200, { code: 1, msg, data: [] }, { 'x-oa-session': s });

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors());
      return res.end();
    }

    /* ===== 管理端点 ===== */
    if (url.pathname === '/__state') {
      return send(200, {
        sessions: [...sessions.entries()].map(([k, v]) => ({ sid: k, loggedIn: v.loggedIn, captcha: v.captcha, user: v.user })),
        writes,
      });
    }
    if (url.pathname === '/__reset' && req.method === 'POST') {
      sessions.clear();
      writes.length = 0;
      return send(200, { code: 0 });
    }

    /* ===== 会话：像真实 OA 一样基于 Cookie（PHPSESSID） ===== */
    function readCookie(name) {
      for (const part of (req.headers.cookie || '').split(';')) {
        const eq = part.trim().indexOf('=');
        if (eq > 0 && part.trim().slice(0, eq) === name) return part.trim().slice(eq + 1);
      }
      return null;
    }
    sid = readCookie('PHPSESSID');
    if (!sid || !sessions.has(sid)) {
      sid = randomUUID();
      needSetCookie = true;
      sessions.set(sid, { captcha: null, loggedIn: false, user: null });
    }
    const sess = sessions.get(sid);
    const testMode = req.headers['x-test-mode'] === '1';

    /* ===== 验证码（必须走登录会话） ===== */
    if (req.method === 'GET' && url.pathname === '/captcha.html') {
      sess.captcha = testMode ? '1234' : String(1000 + Math.floor(Math.random() * 9000));
      return send(200, PNG_1x1, { 'Content-Type': 'image/png', 'x-oa-session': sid });
    }

    /* ===== 登录 ===== */
    if (req.method === 'POST' && url.pathname === '/home/login/login_submit') {
      const b = Object.fromEntries(new URLSearchParams(await readBody(req)));
      if (b.username !== 'demo' || b.password !== 'demo1234') return err('用户名或密码错误', sid);
      if (b.captcha !== sess.captcha) return err('验证码错误', sid);
      sess.loggedIn = true;
      sess.user = { nickname: 'Mock测试员', admin_name: 'Mock管理员' };
      writes.push({ path: '/home/login/login_submit', body: { username: b.username }, at: Date.now() });
      return ok(sess.user, sid);
    }

    if (req.method === 'GET' && url.pathname === '/__logged') {
      return ok({ loggedIn: sess.loggedIn }, sid);
    }

    /* ===== 写操作：必须登录，且全部记账 ===== */
    if (req.method === 'POST') {
      const b = Object.fromEntries(new URLSearchParams(await readBody(req)));
      if (!sess.loggedIn) return err('未登录', sid);
      writes.push({ path: url.pathname, body: b, at: Date.now() });

      if (url.pathname === '/oa/approve/check') {
        const it = APPROVES.find((a) => a.id === b.id);
        if (!it) return err('审批不存在', sid);
        it.status = b.status === '1' ? 2 : 3;
        it.remark = b.remark || it.remark;
        return ok({ updated: it.id }, sid);
      }
      if (url.pathname === '/oa/approve/add') {
        const item = { id: nid('ap'), title: b.title, type_name: b.type_name, status: 1, admin_name: sess.user?.nickname || 'Mock测试员', create_time: d(0), content: b.content || '', remark: '', flow: [{ name: '发起申请', state: 'ok', admin_name: sess.user?.nickname || 'Mock测试员', time: d(0) }] };
        APPROVES.unshift(item);
        return ok({ id: item.id }, sid);
      }
      if (url.pathname === '/customer/index/add') {
        const item = { id: nid('cu'), name: b.name, grade: 'lead', grade_text: '重点线索', contact: b.contact || '', tel: b.tel || '', source: b.source || '', intent: 3, status: 1, has_wechat: false, admin_name: sess.user?.nickname || 'Mock测试员', create_time: d(0), last_time: d(0), address: b.address || '', remark: b.remark || '' };
        CUSTOMERS.unshift(item);
        return ok({ id: item.id }, sid);
      }
      if (url.pathname === '/customer/index/to_sea') {
        const c = CUSTOMERS.find((x) => x.id === b.id);
        if (c) {
          c.grade = 'sleep';
          c.grade_text = '沉睡客户';
        }
        return ok({ updated: b.id }, sid);
      }
      if (url.pathname === '/home/index/edit_password' || url.pathname === '/home/index/edit_personal') {
        return ok({ updated: true }, sid);
      }
      return err('mock 未实现的写接口：' + url.pathname, sid);
    }

    /* ===== GET 列表 ===== */
    if (!sess.loggedIn) return err('未登录', sid);

    const list = (rows, params) => {
      let out = rows;
      const kw = String(params.keywords || '').toLowerCase();
      if (kw) out = out.filter((r) => JSON.stringify(r).toLowerCase().includes(kw));
      return out;
    };

    const q = Object.fromEntries(url.searchParams);

    if (url.pathname === '/oa/approve/index') {
      const st = Number(q.status || 0);
      return ok(st ? APPROVES.filter((a) => a.status === st) : APPROVES, sid);
    }
    if (url.pathname === '/customer/index/index') return ok(list(CUSTOMERS.filter((c) => c.grade !== 'sleep'), q), sid);
    if (url.pathname === '/customer/index/sea') return ok(list(CUSTOMERS.filter((c) => c.grade === 'sleep'), q), sid);
    if (url.pathname === '/customer/index/trash') return ok([], sid);
    if (url.pathname === '/product/index/list') return ok(list(PRODUCTS, q), sid);
    if (url.pathname === '/note/index/index') return ok(NOTES, sid);
    if (url.pathname === '/article/index/index') return ok(ARTICLES, sid);
    if (url.pathname === '/message/index/inbox') return ok(MESSAGES, sid);
    if (url.pathname === '/home/index/mail_list') return ok(MAILS, sid);
    if (url.pathname === '/home/files/index') return ok(ATTACHMENTS, sid);
    if (url.pathname === '/home/index/index') return ok(HOME_STATS, sid);

    // 子页面（财务 / 客户子类 / 订单）：/finance/xxx、/customer/xxx 一律返回统一业务行
    if (/^\/(finance|customer)\//.test(url.pathname) && url.pathname !== '/customer/index/view') {
      return ok(bizList(url.pathname), sid);
    }

    return err('mock 未实现：' + url.pathname, sid);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// 直接运行时启动（Windows 下 import.meta.url 与 argv[1] 形式不同，需转路径比较）
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startMock(Number(process.env.MOCK_PORT) || 8787).then((s) => {
    console.log('mock OA backend listening on', s.address());
  });
}
