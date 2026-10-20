/**
 * 真实 OA 数据抓取脚本。
 *
 * 用法（会话 ID 通过参数传入，绝不写入本文件）：
 *   node scripts/fetch-realdata.mjs <PHPSESSID> [--mask]
 *
 * - 抓取 oa.upingbio.cn 的审批/客户/产品/公告/文章/消息/通讯录/附件
 * - 字段映射为 src/core/types.ts 的形状（视图层零改动）
 * - 通讯录剔除 pwd/salt/reg_pwd 等敏感字段
 * - --mask：对手机号中间四位打码（可选）
 * - 输出 public/data/realdata.json（运行时按需 fetch，不进 JS bundle）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://oa.upingbio.cn';
const SID = process.argv[2] || process.env.OA_SESSION || '';
const MASK = process.argv.includes('--mask');

if (!SID) {
  console.error('缺少 PHPSESSID。用法: node scripts/fetch-realdata.mjs <PHPSESSID> [--mask]');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (youpin-oa-web realdata fetch)';

async function apiGet(path, params = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${BASE}/${path}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    headers: {
      Cookie: `PHPSESSID=${SID}`,
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${BASE}/`,
    },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} 返回非 JSON（HTTP ${res.status}）: ${text.slice(0, 120)}`);
  }
}

const list = async (path, params) => {
  const r = await apiGet(path, params);
  if (r.code !== 0) throw new Error(`${path} code=${r.code} msg=${r.msg}`);
  return Array.isArray(r.data) ? r.data : (r.data && Array.isArray(r.data.list) ? r.data.list : []);
};

const maskMobile = (m) => {
  const s = String(m || '');
  return s.length === 11 ? s.slice(0, 3) + '****' + s.slice(7) : s;
};

const fmtTime = (t) => {
  if (!t) return '';
  if (typeof t === 'string' && /[^\d]/.test(t)) return t;
  const n = Number(t);
  if (!n) return '';
  const d = new Date(n < 1e12 ? n * 1000 : n);
  const p = (x) => (x < 10 ? '0' + x : '' + x);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ---------- 字典（源自 app-source app.js） ---------- */

const APPROVE_TYPES = {
  1: '请假', 2: '出差', 3: '外出', 4: '加班', 15: '采购', 7: '维修', 9: '用章', 10: '用车',
};

const GRADE_TEXT = {
  1: 'AA类经销商', 2: 'A类客户', 7: '休眠（仑）', 8: '休眠（睿）', 9: '休眠（优）',
  10: '休眠（博）', 11: '无归属', 12: '成交关联', 13: '引流资源', 14: 'AA类终端',
  15: '成交代理', 16: '成交大客户', 17: '其它客户',
};
const gradeGroup = (gid) => {
  const id = Number(gid);
  if ([7, 8, 9, 10].includes(id)) return 'sleep';
  if (id === 13 || id === 11) return 'lead';
  if ([1, 12, 14, 15, 16].includes(id)) return 'deal';
  return 'normal';
};

/* ---------- 主流程 ---------- */

const rawMails = await list('home/index/mail_list', { page: 1, limit: 300 });
// 白名单字段：绝不携带 pwd/salt/reg_pwd 等凭据材料
const uidName = new Map();
const mails = rawMails.map((m) => {
  uidName.set(Number(m.id), m.name || m.nickname || '');
  return {
    id: String(m.id),
    name: m.name || m.nickname || '',
    department: m.department_title || m.dname || '',
    position: m.position || '',
    tel: m.tel || '',
    mobile: MASK ? maskMobile(m.mobile) : String(m.mobile || ''),
    email: m.email || '',
  };
});
const nameOf = (uid) => uidName.get(Number(uid)) || '';

const rawApproves = await list('oa/approve/index', { page: 1, limit: 50 });
const approves = rawApproves.map((r) => {
  const cs = Number(r.check_status);
  const status = cs === 2 ? 2 : cs === 3 || cs === 4 ? 3 : 1;
  return {
    id: String(r.id),
    title: r.content || APPROVE_TYPES[r.type] || '审批',
    type_name: APPROVE_TYPES[r.type] || '审批',
    status,
    admin_name: r.admin_name || nameOf(r.admin_id),
    create_time: fmtTime(r.start_time || r.detail_time || r.create_time),
    content: r.content || '',
    remark: r.remark || '',
  };
});

const rawCustomers = await list('customer/index/index', { page: 1, limit: 500 });
const customers = rawCustomers.map((r) => ({
  id: String(r.id),
  name: r.name || '',
  grade: gradeGroup(r.grade_id),
  grade_text: GRADE_TEXT[Number(r.grade_id)] || r.grade_text || '',
  contact: r.contact || '',
  tel: r.tel || '',
  source: r.source_text || '',
  intent: Number(r.intent_status) || 0,
  status: Number(r.status) || 0,
  has_wechat: !!r.is_wechat,
  admin_name: r.admin_name || nameOf(r.belong_uid),
  create_time: fmtTime(r.belong_time || r.create_time),
  last_time: fmtTime(r.last_follow_time || r.belong_time),
  address: r.address || '',
  remark: r.remark || '',
}));

const rawProducts = await list('product/index/list', { page: 1, limit: 80 });
const products = rawProducts.map((r) => ({
  id: String(r.id),
  title: r.title || '',
  goods_no: r.goods_no || '',
  cate_title: r.cate_title || '',
  price_desc: r.price_desc || '',
  specs: r.specs || '',
  unit: r.unit || '',
  species: r.species || '',
  application: r.application || '',
  brand: r.brand || '',
  create_time: fmtTime(r.create_time),
}));

const rawNotes = await list('note/index/index', { page: 1, limit: 50 });
const notes = rawNotes.map((r) => ({
  id: String(r.id),
  title: r.title || '',
  cate_title: r.cate_title || '公告',
  admin_name: r.admin_name || nameOf(r.admin_id),
  create_time: fmtTime(r.create_time),
  content: r.content || '',
}));

const rawArticles = await list('article/index/index', { page: 1, limit: 60 });
const articles = rawArticles.map((r) => ({
  id: String(r.id),
  title: r.title || '',
  cate_title: r.cate_title || '问答',
  create_time: fmtTime(r.create_time),
  content: r.content || r.answer || '',
}));

const rawMessages = await list('message/index/inbox', { page: 1, limit: 150 });
const messages = rawMessages.map((r) => ({
  id: String(r.id),
  title: r.title || '',
  from_name: r.from_name || nameOf(r.from_uid) || '系统',
  to_name: r.to_name || nameOf(r.to_uid) || '',
  create_time: fmtTime(r.send_time || r.create_time),
  is_read: !!r.read_time,
  content: r.content || '',
}));

const rawFiles = await list('home/files/index', { page: 1, limit: 60 });
const attachments = rawFiles.map((r) => {
  let url = r.filepath || '';
  if (url.startsWith('//')) url = 'https:' + url;
  return {
    id: String(r.id),
    name: r.name || '',
    url,
    filepath: url,
    filesize: Number(r.filesize) || 0,
    fileext: r.fileext || '',
    create_time: fmtTime(r.create_time),
    admin_name: r.admin_name || nameOf(r.admin_id),
    group_title: r.group_title || 'OA 附件',
  };
});

const snapshot = {
  fetchedAt: new Date().toISOString(),
  source: 'oa.upingbio.cn 真实数据快照',
  masked: MASK,
  home: { msg_num: 0 },
  approves, customers, products, notes, articles, messages, mails, attachments,
};

const out = join(ROOT, 'public', 'data', 'realdata.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snapshot, null, 1), 'utf8');

const kb = (Buffer.byteLength(JSON.stringify(snapshot)) / 1024).toFixed(0);
console.log(`✅ realdata.json 已生成（${kb} KB，抓取于 ${snapshot.fetchedAt}）`);
console.log(`   审批 ${approves.length} | 客户 ${customers.length} | 产品 ${products.length} | 公告 ${notes.length} | 问答 ${articles.length} | 消息 ${messages.length} | 通讯录 ${mails.length} | 附件 ${attachments.length}${MASK ? '（手机号已脱敏）' : ''}`);
