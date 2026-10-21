/**
 * 数据源层（业务逻辑层，双端共享）。
 *
 * 两种模式：
 *   1) 配置了 VITE_OA_PROXY → 走真实 OA 后端（经有状态会话代理）
 *   2) 未配置                → 走内置演示数据集
 *
 * 两种模式返回**完全相同的数据结构**，视图层无需区分。
 */
import { CONFIG, IS_DEMO_DATA } from './config';
import * as DEMO from './demoData';
import { getDisplayName } from './session';
import { SUB_PAGES, mapRemoteRow } from './biz';
import type { BizRow } from './biz';
import type {
  ApproveItem, Article, Attachment, Customer, MailContact, Message, Note, Product,
} from './types';
import { uid } from './util';
import { absOaUrl, oaFileUrl, signedOssToProxy } from './fileurl';

const K_UPLOADED = 'youpin_uploaded_meta';
const K_OA_SID = 'youpin_oa_sid';
/** 本地写操作落点（演示模式下的真实生效：新建客户 / 审批决定 / 个人资料） */
const K_CUSTOMER_LOCAL = 'youpin_customers_local';
const K_APPROVE_OVR = 'youpin_approve_overrides';
const K_APPROVE_LOCAL = 'youpin_approves_local';
const K_PROFILE = 'youpin_profile';

/* ======================= 真实数据快照（public/data/realdata.json） ======================= */

/**
 * 由 scripts/fetch-realdata.mjs 用真实 OA 账号抓取烘焙的业务数据快照。
 * 未配置代理时的数据源：有快照用快照（真实数据），无快照回落演示数据集。
 */
interface RealSnapshot {
  fetchedAt: string;
  source: string;
  masked: boolean;
  home: { msg_num: number };
  approves: ApproveItem[];
  customers: Customer[];
  products: Product[];
  notes: Note[];
  articles: Article[];
  messages: Message[];
  mails: MailContact[];
  attachments: Attachment[];
}

let REAL: RealSnapshot | null = null;
let realInit: Promise<void> | null = null;

/** 应用启动时调用：异步加载真实数据快照（不阻塞 UI，失败静默回落演示数据） */
export function initRealSnapshot(): Promise<void> {
  if (!IS_DEMO_DATA || REAL) return Promise.resolve();
  if (!realInit) {
    const base = CONFIG.base.endsWith('/') ? CONFIG.base : CONFIG.base + '/';
    realInit = fetch(`${base}data/realdata.json`)
      .then((r) => (r.ok ? (r.json() as Promise<RealSnapshot>) : null))
      .then((d) => {
        REAL = d;
      })
      .catch(() => {
        REAL = null;
      });
  }
  return realInit;
}

/** 快照状态（登录页据此显示「真实数据快照」或「演示模式」） */
export function realSnapshotInfo(): { loaded: boolean; fetchedAt: string; source: string; masked: boolean } {
  return {
    loaded: !!REAL,
    fetchedAt: REAL?.fetchedAt || '',
    source: REAL?.source || '',
    masked: !!REAL?.masked,
  };
}

/* ======================= 本地写操作存储（演示模式下真实生效） ======================= */

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** 本机新建的客户（演示模式下真实进入列表；真实模式下由后端返回，本地仅作乐观插入） */
function readLocalCustomers(): Customer[] {
  return readJson<Customer[]>(K_CUSTOMER_LOCAL, []);
}

/** 本机发起的审批（演示模式下真实进入待审批列表） */
function readLocalApproves(): ApproveItem[] {
  return readJson<ApproveItem[]>(K_APPROVE_LOCAL, []);
}

/** 演示模式数据源：优先真实快照，回落演示数据集（统一键名） */
function S() {
  const local = readLocalCustomers();
  const merge = (base: Customer[]) => (local.length ? [...local, ...base] : base);
  return REAL
    ? {
        approves: REAL.approves,
        customers: merge(REAL.customers),
        products: REAL.products,
        attachments: REAL.attachments,
        notes: REAL.notes,
        articles: REAL.articles,
        messages: REAL.messages,
        mails: REAL.mails,
      }
    : {
        approves: DEMO.APPROVES,
        customers: DEMO.CUSTOMERS,
        products: DEMO.PRODUCTS,
        attachments: DEMO.ATTACHMENTS,
        notes: DEMO.NOTES,
        articles: DEMO.ARTICLES,
        messages: DEMO.MESSAGES,
        mails: DEMO.MAILS,
      };
}

/* ======================= OA 代理会话（仅存随机 sessionId，绝不存 OA Cookie） ======================= */

function getOaSid(): string {
  try {
    return localStorage.getItem(K_OA_SID) || '';
  } catch {
    return '';
  }
}
function setOaSid(sid: string): void {
  try {
    if (sid) localStorage.setItem(K_OA_SID, sid);
    else localStorage.removeItem(K_OA_SID);
  } catch {
    /* ignore */
  }
}
/** 退出真实后端登录（仅清掉本地 sessionId；OA 服务端会话由后端自行过期） */
export function clearOaSession(): void {
  setOaSid('');
}

/** 延迟模拟，让演示模式也有真实的加载态 */
function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((r) => setTimeout(() => r(value), ms));
}

/* ======================= 真实模式：经有状态代理请求后端 ======================= */

/**
 * 统一的代理请求。自动附带 x-oa-session，并从响应回写最新的 sessionId。
 * 返回原始 Response，由调用方按 JSON / Blob 解析。
 */
/**
 * 统一代理请求。直接转发「完整 OA 相对路径」（含其自身的 /oa 前缀），不做任何前缀改写：
 *   /oa/approve/check        → https://oa.upingbio.cn/oa/approve/check
 *   /home/login/login_submit → https://oa.upingbio.cn/home/login/login_submit
 * 浏览器仅持 x-oa-session；OA 会话 Cookie 由代理在 KV 中维护。
 */
async function oaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const sid = getOaSid();
  const headers = new Headers(init.headers);
  if (sid) headers.set('x-oa-session', sid);
  // 后端以此判定 ajax：缺失会返回整页 HTML 而不是 JSON 列表
  if (!headers.has('X-Requested-With')) headers.set('X-Requested-With', 'XMLHttpRequest');
  const res = await fetch(`${CONFIG.oaProxy}${path}`, { ...init, headers });
  const newSid = res.headers.get('x-oa-session');
  if (newSid) setOaSid(newSid);
  return res;
}

/** 带会话的写操作：OA 的 apiPost 会带 X-Requested-With 头，这里显式补上 */
function oaPost(path: string, data: Record<string, string>, withXhr = true): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (withXhr) headers['X-Requested-With'] = 'XMLHttpRequest';
  return oaFetch(path, { method: 'POST', headers, body: new URLSearchParams(data).toString() });
}

/**
 * 取当前真实登录人姓名（解析后台「基本资料」页）。
 * 免登录模式下仍显示后端会话的真实用户，而不是写死的游客名。
 */
export async function fetchMyName(): Promise<string> {
  if (IS_DEMO_DATA) return '';
  try {
    const res = await oaFetch('/home/index/edit_personal.html');
    if (!res.ok) return '';
    const html = await res.text();
    const byTd = html.match(/姓名<\/td>[\s\S]{0,120}?>\s*([^<>\s]{1,20})\s*</);
    if (byTd && byTd[1]) return byTd[1].trim();
    const byInput = html.match(/name="nickname"[^>]*value="([^"]{1,20})"/);
    return byInput ? byInput[1].trim() : '';
  } catch {
    return '';
  }
}

/** 取真实服务端验证码图片（blob），用于代理模式的登录页 */
export async function fetchCaptchaUrl(): Promise<string> {
  const res = await oaFetch('/captcha.html');
  if (!res.ok) throw new Error(`验证码获取失败 HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** GET 列表接口：带上会话头，并把响应解析为列表（对真实后端形态容错） */
async function oaList<T>(path: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const res = await oaFetch(`${path}${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = (await res.json()) as any;
  return extractList<T>(r);
}

/** 真实后端列表响应形态未知，做最大兼容：
 *  {data:[...]} / {data:{list:[...]}} / {list:[...]} / {data:{data:[...]}} */
function extractList<T>(r: any): T[] {
  if (!r) return [];
  if (Array.isArray(r)) return r as T[];
  if (Array.isArray(r.data)) return r.data as T[];
  if (r.data && Array.isArray(r.data.list)) return r.data.list as T[];
  if (Array.isArray(r.list)) return r.list as T[];
  if (r.data && Array.isArray(r.data.data)) return (r.data as any).data as T[];
  return [];
}

function extractObj<T>(r: any, fallback: T): T {
  if (!r) return fallback;
  if (r.data && typeof r.data === 'object') return r.data as T;
  return (r as T) ?? fallback;
}

/** 带分页的列表请求：返回原始行 + 后端总数（gouguOA 返回 count） */
async function oaPage(
  path: string,
  params: Record<string, unknown> = {},
): Promise<{ rows: Record<string, any>[]; total: number }> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const res = await oaFetch(`${path}${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = (await res.json()) as any;
  const rows = extractList<Record<string, any>>(r);
  const total =
    Number(r?.count ?? r?.total ?? r?.data?.count ?? r?.data?.total ?? rows.length) || rows.length;
  return { rows, total };
}

export { oaPage };

/* ======================= 上传后的附件（持久化元数据，非文件字节） ======================= */

function readUploaded(): Attachment[] {
  try {
    const raw = localStorage.getItem(K_UPLOADED);
    const list = raw ? (JSON.parse(raw) as Attachment[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeUploaded(list: Attachment[]): void {
  try {
    const slim = list.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      filepath: a.filepath,
      filesize: a.filesize,
      fileext: a.fileext,
      create_time: a.create_time,
      admin_name: a.admin_name,
      group_title: a.group_title,
    }));
    localStorage.setItem(K_UPLOADED, JSON.stringify(slim));
  } catch {
    /* ignore */
  }
}

/** 上传成功后登记一条附件记录（真实 URL 来自上传服务） */
export function addUploadedAttachment(meta: {
  url: string;
  name: string;
  size: number;
  ext: string;
  adminName?: string;
}): Attachment {
  const now = new Date();
  const p = (n: number) => (n < 10 ? '0' + n : '' + n);
  const item: Attachment = {
    id: uid('att'),
    name: meta.name,
    url: meta.url,
    filepath: meta.url,
    filesize: meta.size,
    fileext: meta.ext,
    create_time: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`,
    admin_name: meta.adminName || '我',
    group_title: '本机上传',
  };
  const list = readUploaded();
  list.unshift(item);
  writeUploaded(list);
  return item;
}

export function removeUploadedAttachment(id: string): void {
  writeUploaded(readUploaded().filter((a) => a.id !== id));
}

/* ======================= 登录 ======================= */

export interface LoginResult {
  ok: boolean;
  msg: string;
  displayName?: string;
}

/**
 * 演示模式（未配置 VITE_OA_PROXY）允许的账号白名单。
 * 未接后端时无法真正校验账号密码，为防止「任意账号都能进」，这里限定只有白名单账号可登录；
 * 接了后端（配置代理）后走后端真实校验，任意合法 OA 账号均可登录。
 */
const DEMO_USERNAMES = ['chenmeilong', 'demo'];

/** 登录页脚注用：演示模式可登录的账号提示 */
export const DEMO_ACCOUNT_HINT = `演示模式可用账号：${DEMO_USERNAMES.join(' / ')}`;

/**
 * 登录。
 * - 演示模式（未配置代理）：本地校验算式验证码（界面明确标注「演示模式」）。
 * - 真实模式（配置了代理）：POST 到 /home/login/login_submit，由后端校验验证码与会话。
 *   expectedCaptcha 仅演示模式使用。
 */
export async function login(
  username: string,
  password: string,
  captcha: string,
  expectedCaptcha?: number,
): Promise<LoginResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaFetch('/home/login/login_submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password, captcha }).toString(),
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        /* 非 JSON（如直接返回 HTML） */
      }
      if (res.ok && data && data.code === 0) {
        const dn = data?.data?.nickname || data?.data?.admin_name || data?.data?.name || username;
        return { ok: true, msg: '', displayName: dn };
      }
      return { ok: false, msg: (data && data.msg) || `登录失败（HTTP ${res.status}）` };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常，请重试' };
    }
  }

  // 演示模式：账号白名单 + 本地算式验证码校验
  if (!username) return { ok: false, msg: '请输入账号' };
  if (!password) return { ok: false, msg: '请输入密码' };
  if (String(captcha).trim() === '') return { ok: false, msg: '请填写算式结果' };
  if (expectedCaptcha !== undefined && Number(captcha) !== expectedCaptcha)
    return { ok: false, msg: '验证码不正确' };
  if (!DEMO_USERNAMES.includes(username.trim().toLowerCase()))
    return {
      ok: false,
      msg: `演示模式仅支持账号 ${DEMO_USERNAMES.join(' / ')}（接入 OA 后端后可登录任意账号）`,
    };
  if (password.length < 4) return { ok: false, msg: '密码至少 4 位' };
  return { ok: true, msg: '', displayName: username };
}

/* ======================= 列表接口 ======================= */

export function fetchApproves(status: 0 | 1 | 2 | 3): Promise<ApproveItem[]> {
  if (!IS_DEMO_DATA) return oaList<ApproveItem>('/oa/approve/index', { status });
  // 本机发起的审批合并进列表（新发起的排前面），再按状态筛选
  const all = [...readLocalApproves(), ...S().approves];
  return delay(status === 0 ? all : all.filter((a) => getApproveStatus(a) === status));
}

export function fetchCustomers(type: 1 | 2 | 3, keyword = ''): Promise<Customer[]> {
  if (!IS_DEMO_DATA) {
    const path = type === 2 ? '/customer/index/sea' : type === 3 ? '/customer/index/trash' : '/customer/index/index';
    return oaList<Customer>(path, { keywords: keyword, limit: 100 });
  }
  let list = S().customers;
  if (type === 2) list = list.filter((c) => c.grade === 'lead');
  else if (type === 3) list = list.filter((c) => c.grade === 'sleep');
  else list = list.filter((c) => c.grade !== 'sleep');
  if (keyword) {
    const k = keyword.toLowerCase();
    list = list.filter(
      (c) => c.name.toLowerCase().includes(k) || (c.contact || '').includes(k) || (c.tel || '').includes(k),
    );
  }
  return delay(list);
}

/** 列表分页结果（真实总数 + 当页数据） */
export interface ListPage<T> {
  rows: T[];
  total: number;
}

/** 客户分页取数：后端总数为 1000+，逐页载入后可翻页浏览全部 */
export function fetchCustomerPage(
  type: 1 | 2 | 3,
  keyword = '',
  page = 1,
  limit = 100,
): Promise<ListPage<Customer>> {
  const path = type === 2 ? '/customer/index/sea' : type === 3 ? '/customer/index/trash' : '/customer/index/index';
  if (!IS_DEMO_DATA) {
    return oaPage(path, { keywords: keyword, page, limit }).then(({ rows, total }) => ({
      rows: rows as unknown as Customer[],
      total,
    }));
  }
  return fetchCustomers(type, keyword).then((rows) => ({ rows, total: rows.length }));
}

export function fetchProducts(keyword = ''): Promise<Product[]> {
  if (!IS_DEMO_DATA) return oaList<Product>('/product/index/list', { keywords: keyword, limit: 50 });
  let list = S().products;
  if (keyword) {
    const k = keyword.toLowerCase();
    list = list.filter((p) => p.title.toLowerCase().includes(k) || p.goods_no.toLowerCase().includes(k));
  }
  return delay(list);
}

/** 产品分页取数：后端 12 万+，逐页载入后可翻页浏览 */
export function fetchProductPage(keyword = '', page = 1, limit = 50): Promise<ListPage<Product>> {
  if (!IS_DEMO_DATA) {
    return oaPage('/product/index/list', { keywords: keyword, page, limit }).then(({ rows, total }) => ({
      rows: rows as unknown as Product[],
      total,
    }));
  }
  return fetchProducts(keyword).then((rows) => ({ rows, total: rows.length }));
}

/** 附件 = 真实 OA 文件库（/home/files/index）+ 本机上传（本机上传的排前面） */
export function fetchAttachments(keyword = ''): Promise<Attachment[]> {
  if (!IS_DEMO_DATA) {
    return oaList<any>('/home/files/index', { keywords: keyword, limit: 50 }).then((rows) =>
      rows.map((r) => ({
        id: String(r.id),
        name: r.name || r.filename || '未命名',
        // ★ 稳定流式端点（get_oss_file?id=，经代理注入会话）。
        //   不用 r.filepath：那是 OSS 签名直链（内网 endpoint，永远 403），只能转代理 /oss/。
        url:
          absOaUrl(r.ossfilepath || '') ||
          oaFileUrl(r.id, r.name) ||
          signedOssToProxy(r.filepath || ''),
        filepath: r.filepath || '',
        filesize: Number(r.filesize || 0),
        fileext: r.fileext || '',
        create_time: r.create_time,
        admin_name: r.admin_name,
        group_title: r.group_title,
      })),
    );
  }
  const uploaded = readUploaded();
  const list = [...uploaded, ...S().attachments];
  const filtered = keyword
    ? list.filter((a) => a.name.toLowerCase().includes(keyword.toLowerCase()))
    : list;
  return delay(filtered, 160);
}

export function fetchNotes(): Promise<Note[]> {
  if (!IS_DEMO_DATA) return oaList<Note>('/note/index/index', { limit: 100 });
  return delay(S().notes);
}

export function fetchArticles(): Promise<Article[]> {
  if (!IS_DEMO_DATA) return oaList<Article>('/article/index/index', { limit: 100 });
  return delay(S().articles);
}

export function fetchMessages(): Promise<Message[]> {
  if (!IS_DEMO_DATA) return oaList<Message>('/message/index/inbox', { limit: 100 });
  return delay(S().messages);
}

export function fetchMails(keyword = ''): Promise<MailContact[]> {
  if (!IS_DEMO_DATA) {
    // 后端 id/mobile 是数字、且含 pwd/salt 等敏感字段：统一收敛成字符串并只留通讯录需要的列
    return oaList<any>('/home/index/mail_list', { keywords: keyword, limit: 200 }).then((rows) =>
      rows.map((r) => ({
        id: String(r.id),
        name: r.name || r.nickname || r.username || '—',
        department: r.department || '',
        position: r.position || '',
        mobile: r.mobile ? String(r.mobile) : '',
        tel: String(r.mobile ?? r.tel ?? ''),
        email: r.email || '',
      })),
    );
  }
  let list = S().mails;
  if (keyword) {
    const k = keyword.toLowerCase();
    list = list.filter((m) => m.name.includes(k) || (m.department || '').includes(k));
  }
  return delay(list);
}

export function fetchHomeStats(): Promise<typeof DEMO.HOME_STATS> {
  if (!IS_DEMO_DATA) {
    // 后端 /home/index/index 仅返回 {data:{msg_num}}，其余统计需从各自接口补全
    const unread = oaFetch('/home/index/index')
      .then((r) => r.json())
      .then((r) => (r?.data?.msg_num ?? 0))
      .catch(() => 0);
    const pending = fetchApproves(1)
      .then((rows) => rows.length)
      .catch(() => 0);
    const cust = fetchCustomers(1)
      .then((rows) => rows.length)
      .catch(() => 0);
    return Promise.all([unread, pending, cust]).then(([unreadMsg, pendingApprove, myCustomer]) => ({
      pendingApprove,
      myCustomer,
      monthOrder: 0,
      monthAmount: '—',
      unreadMsg,
    }));
  }
  const src = S();
  const stats = {
    pendingApprove: src.approves.filter((a) => a.status === 1).length,
    myCustomer: src.customers.filter((c) => c.grade !== 'sleep').length,
    monthOrder: 0,
    monthAmount: '—',
    unreadMsg: src.messages.filter((m) => !m.is_read).length,
  };
  return delay(stats, 120);
}

/* ======================= 审批操作 ======================= */

/**
 * 审批决定的本地落点：刷新后仍然生效（此前存内存，刷新即丢，是「点了没反应」的主因之一）。
 */
function readOverrides(): Record<string, { status: 2 | 3; remark: string }> {
  return readJson<Record<string, { status: 2 | 3; remark: string }>>(K_APPROVE_OVR, {});
}

function persistDecision(id: string, pass: boolean, remark: string): void {
  const all = readOverrides();
  all[id] = { status: pass ? 2 : 3, remark };
  writeJson(K_APPROVE_OVR, all);
}

export interface ActionResult {
  ok: boolean;
  msg: string;
}

/**
 * 审批通过 / 拒绝。
 * - 真实模式：POST /oa/approve/check（后端 status：1通过 2拒绝），成功后本地同步状态。
 * - 演示模式：本地持久化生效（列表与筛选立即反映，刷新不丢）。
 */
export async function applyApproveDecision(
  id: string,
  pass: boolean,
  remark: string,
): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/oa/approve/check', { id, status: pass ? '1' : '2', remark });
      const data = (await res.json().catch(() => null)) as any;
      if (res.ok && data && data.code === 0) {
        persistDecision(id, pass, remark);
        return { ok: true, msg: '' };
      }
      return { ok: false, msg: (data && data.msg) || `提交失败（HTTP ${res.status}）` };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常，请重试' };
    }
  }
  persistDecision(id, pass, remark);
  return { ok: true, msg: '' };
}

export function getApproveStatus(item: ApproveItem): 0 | 1 | 2 | 3 {
  return readOverrides()[item.id]?.status ?? item.status;
}

/** 审批意见（本地决定优先） */
export function getApproveRemark(item: ApproveItem): string {
  return readOverrides()[item.id]?.remark || item.remark || '';
}

/**
 * 发起审批。
 * - 真实模式：POST /oa/approve/add（该接口按原 APP 约定不带 XHR 头）
 * - 演示模式：本地落库为「待审批」，随即出现在审批列表并可被通过 / 拒绝。
 */
export async function createApprove(input: {
  typeName: string;
  title: string;
  content?: string;
}): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost(
        '/oa/approve/add',
        { type_name: input.typeName, title: input.title, content: input.content || '' },
        false,
      );
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && data.msg) || '提交失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常，请重试' };
    }
  }
  const now = new Date();
  const p = (n: number) => (n < 10 ? '0' + n : '' + n);
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
  const name = sessionDisplayName();
  const item: ApproveItem = {
    id: uid('appr'),
    title: input.title,
    type_name: input.typeName,
    status: 1,
    admin_name: name,
    create_time: stamp,
    content: input.content || `申请人：${name}\n申请事由：${input.title}`,
    remark: '',
    flow: [
      { name: '发起申请', state: 'ok', admin_name: name, time: stamp },
      { name: '部门主管审批', state: 'wait', admin_name: '', time: '' },
    ],
  };
  writeJson(K_APPROVE_LOCAL, [item, ...readLocalApproves()]);
  return { ok: true, msg: '' };
}

/** 当前登录人显示名（发起审批 / 新增客户时作为申请人） */
function sessionDisplayName(): string {
  return getDisplayName() || '我';
}

/* ======================= 子页面（财务 / 客户子类 / 订单 等） ======================= */

/**
 * 子页面列表。真实模式按注册表里的真实接口路径取数并映射为统一 BizRow；
 * 演示模式用内置业务数据集（结构与真实响应一致）。
 */
/** 子页面分页结果：BizRow（列表/详情用）+ 原始行（动态真实列用）+ 后端总数 */
export interface SubPageResult {
  rows: BizRow[];
  raw: Record<string, any>[];
  total: number;
}

/** 子页面取数（服务端分页 + 后端关键词搜索） */
export function fetchSubPage(
  key: string,
  page = 1,
  limit = 20,
  keywords = '',
): Promise<SubPageResult> {
  const def = SUB_PAGES[key];
  if (!def) return delay({ rows: [], raw: [], total: 0 } as SubPageResult, 100);
  if (!IS_DEMO_DATA) {
    return oaPage(def.path, { page, limit, keywords })
      .then(({ rows, total }) => ({ rows: rows.map(mapRemoteRow), raw: rows, total }))
      .catch(() => ({ rows: def.demo(), raw: [], total: def.demo().length }));
  }
  const d = def.demo();
  return delay({ rows: d, raw: [], total: d.length } as SubPageResult, 150);
}

/** 兼容旧调用：一次性取前 100 条（手机端用） */
export function fetchSubRows(key: string): Promise<BizRow[]> {
  return fetchSubPage(key, 1, 100).then((r) => r.rows);
}

/** 子页面标题（两端共用） */
export function subPageTitle(key: string): string {
  return SUB_PAGES[key]?.title || '功能';
}

/* ======================= 客户写操作 ======================= */

export interface CustomerInput {
  name: string;
  contact?: string;
  tel?: string;
  source?: string;
  address?: string;
  remark?: string;
}

/**
 * 新增客户。
 * - 真实模式：POST /customer/index/add（后端返回 id 后回填）。
 * - 演示模式：本地落库，立即出现在客户列表（刷新不丢）。
 */
export async function createCustomer(input: CustomerInput): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/customer/index/add', {
        name: input.name,
        contact: input.contact || '',
        tel: input.tel || '',
        source: input.source || '',
        address: input.address || '',
        remark: input.remark || '',
      });
      const data = (await res.json().catch(() => null)) as any;
      if (res.ok && data && data.code === 0) return { ok: true, msg: '' };
      return { ok: false, msg: (data && data.msg) || `提交失败（HTTP ${res.status}）` };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常，请重试' };
    }
  }
  const now = new Date();
  const p = (n: number) => (n < 10 ? '0' + n : '' + n);
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
  const item: Customer = {
    id: uid('cust'),
    name: input.name,
    grade: 'lead',
    grade_text: '重点线索',
    contact: input.contact || '',
    tel: input.tel || '',
    source: input.source || '手工录入',
    intent: 3,
    status: 1,
    has_wechat: false,
    admin_name: '我',
    create_time: stamp,
    last_time: stamp,
    address: input.address || '',
    remark: input.remark || '',
  };
  writeJson(K_CUSTOMER_LOCAL, [item, ...readLocalCustomers()]);
  return { ok: true, msg: '' };
}

/** 客户转公海（真实模式 POST /customer/index/to_sea；演示模式本地标记） */
export async function customerToSea(id: string): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/customer/index/to_sea', { id });
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && data.msg) || '操作失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  const list = readLocalCustomers();
  const hit = list.find((c) => c.id === id);
  if (hit) {
    hit.grade = 'sleep';
    hit.grade_text = '沉睡客户';
    writeJson(K_CUSTOMER_LOCAL, list);
  }
  return { ok: true, msg: '' };
}

/* ======================= 个人资料 / 修改密码 ======================= */

export interface Profile {
  nickname?: string;
  mobile?: string;
  email?: string;
  department?: string;
  position?: string;
}

export function getProfile(): Profile {
  return readJson<Profile>(K_PROFILE, {});
}

/** 保存基本资料（真实模式 POST /home/index/edit_personal） */
export async function saveProfile(p: Profile): Promise<ActionResult> {
  writeJson(K_PROFILE, p);
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/home/index/edit_personal', {
        nickname: p.nickname || '',
        mobile: p.mobile || '',
        email: p.email || '',
      });
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && data.msg) || '保存失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  return { ok: true, msg: '' };
}

/** 修改密码（真实模式 POST /home/index/edit_password；演示模式仅本地校验） */
export async function changePassword(oldPwd: string, newPwd: string): Promise<ActionResult> {
  if (newPwd.length < 6) return { ok: false, msg: '新密码至少 6 位' };
  if (oldPwd === newPwd) return { ok: false, msg: '新密码不能与旧密码相同' };
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/home/index/edit_password', {
        old_password: oldPwd,
        password: newPwd,
        re_password: newPwd,
      });
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && data.msg) || '修改失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  return { ok: true, msg: '演示模式：密码已在本地校验通过（接后端后将真实修改）' };
}
