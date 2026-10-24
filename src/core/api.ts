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
import { PRODUCT_CATES_LEAF, PRODUCT_CATES_PARENT } from './productCates';
import { getDisplayName } from './session';
import { currentAccountSid } from './accounts';
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
 *
 * 多账号：选中了账号且该账号有 sid 时，附带 x-oa-sid（原始 PHPSESSID）覆盖代理会话；
 *   sidOverride 供「添加账号前的校验」使用（用候选 sid 试一次，不影响当前账号）。
 *
 * opts.noXhr：页面型端点专用。原站 nginx 对 /home/index/edit_personal、/home/index/main.html
 *   这类**整页 HTML** 端点，带 X-Requested-With 头会 403（实测）；标记后代理改为**不下发**
 *   XHR 头（普通 /home/api/* 列表接口仍必须带，否则返回整页 HTML 而非 JSON）。
 */
async function oaFetch(
  path: string,
  init: RequestInit = {},
  sidOverride?: string,
  opts: { noXhr?: boolean } = {},
): Promise<Response> {
  const sid = getOaSid();
  const headers = new Headers(init.headers);
  if (sid) headers.set('x-oa-session', sid);
  const accSid = sidOverride ?? currentAccountSid();
  if (accSid) headers.set('x-oa-sid', accSid);
  // 后端以此判定 ajax：缺失会返回整页 HTML 而不是 JSON 列表
  if (opts.noXhr) headers.set('x-oa-no-xhr', '1');
  else if (!headers.has('X-Requested-With')) headers.set('X-Requested-With', 'XMLHttpRequest');
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
 * 通用真实写操作（供表格行操作 / 工具栏调用）。
 * 直接 POST 到原站端点并返回 {ok, msg}；演示模式（无代理）一律 ok:true 仅本地提示。
 * 这是「功能要都能用」的落地：删除 / 移库 / 分配 / 审批流 / 新增编辑 等都走这里真实提交。
 */
export async function oaAction(
  path: string,
  data: Record<string, string>,
  opts: { noXhr?: boolean } = {},
): Promise<ActionResult> {
  if (IS_DEMO_DATA) return { ok: true, msg: '（演示模式）已提交' };
  try {
    const res = await oaPost(path, data, !opts.noXhr);
    const txt = await res.text();
    let code = 0;
    let msg = '';
    try {
      const j = JSON.parse(txt);
      code = j.code ?? j.status ?? (j.success ? 0 : -1);
      msg = j.msg || j.message || j.info || '';
    } catch {
      // 非 JSON（原站有时返回纯文本）按成功判定
      code = res.ok ? 0 : -1;
      msg = txt.slice(0, 80);
    }
    if (res.ok && (code === 0 || code === 200 || code === 1)) return { ok: true, msg: msg || '操作成功' };
    return { ok: false, msg: msg || `操作失败（HTTP ${res.status}）` };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : '网络异常，请重试' };
  }
}

/** 当前登录人资料（解析后台「基本资料」页 /home/index/edit_personal）。
 *  ★ 必须 noXhr：该端点带 X-Requested-With 会被原站 nginx 403（实测）。
 * 免登录模式下仍显示后端会话的真实用户，而不是写死的游客名。
 * sid 参数：多账号校验时用候选会话取该账号的登录人名。 */
export interface MyProfile {
  name: string;
  avatar: string;
  mobile: string;
  email: string;
  department: string;
  position: string;
}

export async function fetchMyProfile(sidOverride?: string): Promise<MyProfile> {
  const empty: MyProfile = { name: '', avatar: '', mobile: '', email: '', department: '', position: '' };
  if (IS_DEMO_DATA) return empty;
  try {
    const res = await oaFetch('/home/index/edit_personal', {}, sidOverride, { noXhr: true });
    if (!res.ok) return empty;
    const html = await res.text();
    const td = (label: string): string => {
      const m = html.match(new RegExp(`${label}</td>\\s*<td[^>]*>([\\s\\S]{0,80}?)</td>`));
      return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
    };
    const byTd = html.match(/姓名<\/td>[\s\S]{0,120}?>\s*([^<>\s]{1,20})\s*</);
    const byInput = html.match(/name="nickname"[^>]*value="([^"]{1,20})"/);
    const byCite = html.match(/<cite>([^<]{1,20})<\/cite>/);
    const avatar =
      html.match(/name="thumb"[^>]*value="([^"]+)"/)?.[1] ||
      html.match(/src="(\/storage\/avatars\/[^"]+)"/)?.[1] ||
      html.match(/name="avatar"[^>]*value="([^"]+)"/)?.[1] ||
      '';
    return {
      name: (byTd && byTd[1]) || (byInput && byInput[1]) || (byCite && byCite[1]) || '',
      avatar,
      mobile: td('手机') || td('手机号'),
      email: td('邮箱'),
      department: td('部门'),
      position: td('职位') || td('岗位'),
    };
  } catch {
    return empty;
  }
}

/**
 * 取当前真实登录人姓名（解析后台「基本资料」页）。
 * sid 参数：多账号校验时用候选会话取该账号的登录人名。
 */
export async function fetchMyName(sidOverride?: string): Promise<string> {
  const p = await fetchMyProfile(sidOverride);
  return p.name;
}

/** 取真实服务端验证码图片（blob），用于代理模式的登录页。sidOverride：新增账号时用全新会话走验证码链 */
export async function fetchCaptchaUrl(sidOverride?: string): Promise<string> {
  const res = await oaFetch('/captcha.html', {}, sidOverride);
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
): Promise<{ rows: Record<string, any>[]; total: number; totalRow?: Record<string, any> }> {
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
  return { rows, total, totalRow: (r as any)?.totalRow };
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
  /** 登录成功后代理回传的新 PHPSESSID（x-oa-login-sid 头），用于沉淀为账号会话 */
  sid?: string;
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
 *   sidOverride：新增账号时传入全新随机会话，使「验证码→登录」绑定到该会话，
 *     登录成功后由代理回传的 x-oa-login-sid 即为新账号可用的 PHPSESSID。
 */
export async function login(
  username: string,
  password: string,
  captcha: string,
  expectedCaptcha?: number,
  sidOverride?: string,
): Promise<LoginResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaFetch(
        '/home/login/login_submit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ username, password, captcha }).toString(),
        },
        sidOverride,
      );
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        /* 非 JSON（如直接返回 HTML） */
      }
      // 代理在登录成功时回传新会话的 PHPSESSID（x-oa-login-sid），沉淀为账号会话
      const loginSid = res.headers.get('x-oa-login-sid') || '';
      if (res.ok && data && data.code === 0) {
        const dn = data?.data?.nickname || data?.data?.admin_name || data?.data?.name || username;
        return { ok: true, msg: '', displayName: dn, sid: loginSid || undefined };
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

/* ======================= 多账号：会话校验 ======================= */

/**
 * 用候选 PHPSESSID 探一次真实接口，验证账号会话是否可用。
 * 不影响当前选中账号（sidOverride 只作用于本次请求）。
 * 返回 ok + 该会话下解析出的登录人名（顺带作为账号默认标签）。
 */
export async function validateAccountSid(
  sid: string,
): Promise<{ ok: boolean; msg: string; name?: string }> {
  if (!IS_DEMO_DATA) {
    if (!sid.trim()) return { ok: false, msg: '请填写 PHPSESSID' };
    try {
      const res = await oaFetch('/customer/index/index?limit=1', {}, sid.trim());
      if (!res.ok) return { ok: false, msg: `HTTP ${res.status}` };
      const r = (await res.json()) as any;
      if (r && r.code === 0) {
        const nm = await fetchMyName(sid.trim());
        return { ok: true, msg: '', name: nm || '' };
      }
      return { ok: false, msg: (r && r.msg) || '会话无效（OA 未接受该 PHPSESSID）' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常，请重试' };
    }
  }
  return { ok: false, msg: '演示模式未接 OA 后端，无法校验会话' };
}

/* ======================= 列表接口 ======================= */

/** 我处理的审批（原站工作台「待审审批」口径：/oa/approve/list；无权限时安全回落空列表=0） */
export function fetchApproveHandle(): Promise<ApproveItem[]> {
  if (!IS_DEMO_DATA) return oaList<ApproveItem>('/oa/approve/list', {}).catch(() => []);
  return Promise.resolve([]);
}

export function fetchApproves(status: 0 | 1 | 2 | 3): Promise<ApproveItem[]> {
  if (!IS_DEMO_DATA) return oaList<ApproveItem>('/oa/approve/index', { status });  // 本机发起的审批合并进列表（新发起的排前面），再按状态筛选
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

/** 客户分页取数：后端总数为 1000+，逐页载入后可翻页浏览全部
 *  scope：客户列表页页签（原站 hidden input tab：1全部 2我的 3下属 4共享），仅列表页用 */
export function fetchCustomerPage(
  type: 1 | 2 | 3,
  keyword = '',
  page = 1,
  limit = 100,
  scope: 1 | 2 | 3 | 4 = 1,
): Promise<ListPage<Customer>> {
  const path = type === 2 ? '/customer/index/sea' : type === 3 ? '/customer/index/trash' : '/customer/index/index';
  if (!IS_DEMO_DATA) {
    return oaPage(path, { keywords: keyword, page, limit, tab: type === 1 ? scope : undefined }).then(
      ({ rows, total }) => ({ rows: rows as unknown as Customer[], total }),
    );
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
/** 产品筛选条件（服务端过滤，全量 12 万条实时生效） */
export interface ProductFilter {
  species?: string;
  cateId?: string;
  application?: string;
  /** 原站筛选（全部服务端参数，见 product.html #searchForm） */
  /** 产品属性（type）：1=精华 2=热门 3=推荐 */
  type?: string;
  status?: string;
  diffTime?: string;
  productName?: string;
  geneName?: string;
  otherName?: string;
  /** 模糊(1)/分明(0) */
  keywordType?: string;
}

export function fetchProductPage(keyword = '', page = 1, limit = 50, filter?: ProductFilter): Promise<ListPage<Product>> {
  if (!IS_DEMO_DATA) {
    const params: Record<string, string | number> = { keywords: keyword, page, limit };
    if (filter?.species) params.species = filter.species;
    if (filter?.cateId) params.cate_id = filter.cateId;
    if (filter?.application) params.application = filter.application;
    if (filter?.type) params.type = filter.type;
    if (filter?.status) params.status = filter.status;
    if (filter?.diffTime) params.diff_time = filter.diffTime;
    if (filter?.productName) params.product_name = filter.productName;
    if (filter?.geneName) params.gene_name = filter.geneName;
    if (filter?.otherName) params.other_name = filter.otherName;
    if (filter?.keywordType) params.keyword_type = filter.keywordType;
    return oaPage('/product/index/list', params).then(({ rows, total }) => ({
      rows: rows as unknown as Product[],
      total,
    }));
  }
  return fetchProducts(keyword).then((rows) => ({ rows, total: rows.length }));
}

/**
 * 产品分类下拉选项（完整清单）。
 *
 * 历史：早期靠「拉前 2000 条产品去重」推导分类，既慢（两次 1000 条请求）又不全
 * （12 万+ 产品里排后面的分类永远不出现，用户反馈「这不齐全」）。
 * 现改为：src/core/productCates.ts 里的全量探测快照（一级 14 + 二级 75）
 * + 运行时从已加载产品行中新发现的分类合并（原站新增分类也能出现）。
 */
export async function fetchProductCateOptions(): Promise<{ id: string; title: string; count?: number }[]> {
  const base: { id: string; title: string; count?: number }[] = [
    ...PRODUCT_CATES_PARENT.map((c) => ({ id: c.id, title: c.title, count: c.count })),
    ...PRODUCT_CATES_LEAF.map((c) => ({ id: c.id, title: c.title, count: c.count })),
  ];
  try {
    const extra = sessionStorage.getItem('youpin_prod_cates_extra');
    if (extra) {
      const seen = new Set(base.map((c) => c.id));
      for (const c of JSON.parse(extra) as { id: string; title: string }[]) {
        if (c.id && c.title && !seen.has(c.id)) {
          seen.add(c.id);
          base.push(c);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return base;
}

/** 把产品行里新出现的分类记进 sessionStorage，供 fetchProductCateOptions 合并（原站新增分类自适应） */
export function rememberDiscoveredCates(rows: Array<{ cate_id?: unknown; cate_title?: unknown }>): void {
  try {
    const prev: { id: string; title: string }[] = JSON.parse(sessionStorage.getItem('youpin_prod_cates_extra') || '[]');
    const seen = new Set(prev.map((c) => c.id));
    for (const r of rows) {
      const id = String(r.cate_id ?? '');
      const title = String(r.cate_title ?? '').trim();
      if (id && title && !seen.has(id)) {
        seen.add(id);
        prev.push({ id, title });
      }
    }
    sessionStorage.setItem('youpin_prod_cates_extra', JSON.stringify(prev));
  } catch {
    /* ignore */
  }
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

/* ======================= 工作台首页（1:1 原站 /home/index/main.html） ======================= */

/**
 * 工作台「待办事项」6 项计数。
 * 原站为服务端渲染进 main.html 的整页数值（待审审批/待审报销/待审发票/待回款/待审合同/待完成任务），
 * 逐账号会话不同而不同 —— 直接解析 main.html 拿到的就是原站此刻展示的同一组数字。
 * ★ noXhr：main.html 是整页 HTML 端点，带 XHR 头会被原站 nginx 403。
 */
export interface HomeBoard {
  todoApprove: number;
  todoExpense: number;
  todoInvoice: number;
  todoIncome: number;
  todoContract: number;
  todoTask: number;
}

export async function fetchHomeBoard(): Promise<HomeBoard> {
  const zero: HomeBoard = {
    todoApprove: 0, todoExpense: 0, todoInvoice: 0,
    todoIncome: 0, todoContract: 0, todoTask: 0,
  };
  if (IS_DEMO_DATA) return zero;
  try {
    const res = await oaFetch('/home/index/main.html', {}, undefined, { noXhr: true });
    if (!res.ok) return zero;
    const html = await res.text();
    // 待办区：6 个 <li>，每个含 <p>标签</p><p><cite>数字</cite></p>，按顺序解析
    const block = html.match(/待办事项[\s\S]*?<\/ul>/);
    if (!block) return zero;
    const nums = [...block[0].matchAll(/<cite>\s*(\d+)\s*<\/cite>/g)].map((m) => Number(m[1]));
    if (nums.length < 6) return zero;
    return {
      todoApprove: nums[0], todoExpense: nums[1], todoInvoice: nums[2],
      todoIncome: nums[3], todoContract: nums[4], todoTask: nums[5],
    };
  } catch {
    return zero;
  }
}

/** 工作台「公告列表」（原站 /home/api/get_note_list，layui table 数据接口） */
export function fetchHomeNotes(): Promise<Note[]> {
  if (!IS_DEMO_DATA) return oaList<Note>('/home/api/get_note_list', {}).catch(() => []);
  return Promise.resolve([]);
}

/** 工作台「知识列表」（原站 /home/api/get_article_list） */
export function fetchHomeArticles(): Promise<Article[]> {
  if (!IS_DEMO_DATA) return oaList<Article>('/home/api/get_article_list', {}).catch(() => []);
  return Promise.resolve([]);
}

/** 员工活跃度数据（原站 /home/api/get_view_data）：
 *  data_first=今日 24 小时、data_second=昨日 24 小时、data_three=近一年 {日期: 活跃度} */
export interface ViewData {
  dataFirst: number[];
  dataSecond: number[];
  dataThree: Record<string, number>;
}

export async function fetchViewData(): Promise<ViewData | null> {
  if (IS_DEMO_DATA) return null;
  try {
    const res = await oaFetch('/home/api/get_view_data', {});
    if (!res.ok) return null;
    const r = (await res.json()) as any;
    if (!r || r.code !== 0 || !r.data) return null;
    return {
      dataFirst: Array.isArray(r.data.data_first) ? r.data.data_first.map(Number) : [],
      dataSecond: Array.isArray(r.data.data_second) ? r.data.data_second.map(Number) : [],
      dataThree: r.data.data_three && typeof r.data.data_three === 'object' ? r.data.data_three : {},
    };
  } catch {
    return null;
  }
}

/** 最活跃员工（原站 /home/api/get_view_log）：最近 30 天前十 {name, count} */
export async function fetchViewLog(): Promise<{ name: string; count: number }[]> {
  if (IS_DEMO_DATA) return [];
  try {
    const res = await oaFetch('/home/api/get_view_log', {});
    if (!res.ok) return [];
    const r = (await res.json()) as any;
    const logs = r?.data?.data_logs;
    if (!Array.isArray(logs)) return [];
    return logs.map((x: any) => ({ name: String(x.name || ''), count: Number(x.count || 0) }));
  } catch {
    return [];
  }
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
 * 审批通过 / 拒绝 / 撤回 —— 严格按原站：
 * POST /api/index/flow_check  { id, type:1, check_node, check_admin_ids, check: 1通过|2拒绝|3撤回, content }
 * 原站规则：通过/拒绝必须填审批意见；撤回必须填撤回理由。
 */
export async function applyApproveDecision(
  id: string,
  pass: boolean,
  remark: string,
): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/api/index/flow_check', {
        id,
        type: '1',
        check: pass ? '1' : '2',
        content: remark,
      });
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

/** 审批撤回（原站：check=3 + 撤回理由，POST /api/index/flow_check） */
export async function revokeApprove(id: string, reason: string): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/api/index/flow_check', {
        id,
        type: '1',
        check: '3',
        content: reason,
      });
      const data = (await res.json().catch(() => null)) as any;
      if (res.ok && data && data.code === 0) return { ok: true, msg: '' };
      return { ok: false, msg: (data && data.msg) || `撤回失败（HTTP ${res.status}）` };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常，请重试' };
    }
  }
  return { ok: true, msg: '' };
}

/** 删除我发起的审批（原站 POST /oa/approve/delete {id}） */
export async function deleteApprove(id: string): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/oa/approve/delete', { id });
      const data = (await res.json().catch(() => null)) as any;
      if (res.ok && data && data.code === 0) return { ok: true, msg: '' };
      return { ok: false, msg: (data && data.msg) || `删除失败（HTTP ${res.status}）` };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常，请重试' };
    }
  }
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
 * 发起审批（原站 POST /oa/approve/add，按原 APP 约定不带 XHR 头）。
 * 成功后刷新列表即可看到真实单据进入审批流。
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
        : { ok: false, msg: (data && (data.msg || data.message)) || '提交失败（原站可能要求按类型填写表单字段）' };
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
 * 新增/编辑客户（原站同一端点：POST /customer/index/add，带 id 即编辑）。
 * 字段名严格按原站表单：name / c_name(联系人) / c_mobile(手机) / address / content(备注)。
 */
export async function createCustomer(input: CustomerInput & { id?: string }): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const payload: Record<string, string> = {
        name: input.name,
        c_name: input.contact || '',
        c_mobile: input.tel || '',
        address: input.address || '',
        content: input.remark || '',
      };
      if (input.id && !/^\s*$/.test(input.id)) payload.id = input.id;
      const res = await oaPost('/customer/index/add', payload);
      const data = (await res.json().catch(() => null)) as any;
      if (res.ok && data && data.code === 0) return { ok: true, msg: '' };
      return { ok: false, msg: (data && (data.msg || data.message)) || `提交失败（HTTP ${res.status}）` };
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

/** 客户移入公海（原站 POST /customer/index/to_sea {id}） */
export async function customerToSea(id: string): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/customer/index/to_sea', { id });
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && (data.msg || data.message)) || '操作失败' };
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

/** 公海客户放入废弃列表（原站 POST /customer/index/to_trash {id}） */
export async function customerToTrash(id: string): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/customer/index/to_trash', { id });
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && (data.msg || data.message)) || '操作失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  return { ok: true, msg: '' };
}

/** 废弃客户彻底删除（原站 POST /customer/index/delete {id}） */
export async function customerDeleteHard(id: string): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/customer/index/delete', { id });
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && (data.msg || data.message)) || '删除失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  return { ok: true, msg: '' };
}

/** 客户备注（原站 POST /customer/api/update_intent {customer_id, flag:4, remark}） */
export async function updateCustomerRemark(customerId: string, remark: string): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/customer/api/update_intent', {
        customer_id: customerId,
        flag: '4',
        remark,
      });
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && (data.msg || data.message)) || '操作失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  return { ok: true, msg: '' };
}

/** GET 原站 JSON 接口（如员工/部门树），失败返回 null */
async function oaGetJson<T = any>(path: string, params?: Record<string, string>): Promise<T | null> {
  try {
    const qs = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    const res = await oaFetch(`${path}${qs}`);
    if (!res.ok) return null;
    const txt = await res.text();
    try {
      return JSON.parse(txt) as T;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/** 公海客户领取（原站 POST /customer/index/get {id}） */
export async function customerGet(id: string): Promise<ActionResult> {
  if (IS_DEMO_DATA) return { ok: true, msg: '' };
  try {
    const res = await oaPost('/customer/index/get', { id });
    const data = (await res.json().catch(() => null)) as any;
    if (res.ok && data && data.code === 0) return { ok: true, msg: data.msg || '' };
    return { ok: false, msg: (data && (data.msg || data.message)) || '领取失败' };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
  }
}

/** 废弃客户恢复（原站 POST /customer/index/revert {id}） */
export async function customerRevert(id: string): Promise<ActionResult> {
  if (IS_DEMO_DATA) return { ok: true, msg: '' };
  try {
    const res = await oaPost('/customer/index/revert', { id });
    const data = (await res.json().catch(() => null)) as any;
    if (res.ok && data && data.code === 0) return { ok: true, msg: data.msg || '' };
    return { ok: false, msg: (data && (data.msg || data.message)) || '恢复失败' };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
  }
}

/** 公海客户分配（原站 POST /customer/api/distribute {id, uid, did}） */
export async function customerDistribute(id: string, uid: string, did = ''): Promise<ActionResult> {
  if (IS_DEMO_DATA) return { ok: true, msg: '' };
  try {
    const res = await oaPost('/customer/api/distribute', { id, uid, did });
    const data = (await res.json().catch(() => null)) as any;
    if (res.ok && data && data.code === 0) return { ok: true, msg: data.msg || '' };
    return { ok: false, msg: (data && (data.msg || data.message)) || '分配失败' };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
  }
}

/** 客户走访记录（原站 POST /customer/api/visit_record {customer_id, visitor, visit_date}） */
export async function customerVisit(customerId: string, visitor: string, visitDate: string): Promise<ActionResult> {
  if (IS_DEMO_DATA) return { ok: true, msg: '' };
  try {
    const res = await oaPost('/customer/api/visit_record', {
      customer_id: customerId,
      visitor,
      visit_date: visitDate,
    });
    const data = (await res.json().catch(() => null)) as any;
    if (res.ok && data && data.code === 0) return { ok: true, msg: data.msg || '' };
    return { ok: false, msg: (data && (data.msg || data.message)) || '提交失败' };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
  }
}

/** 客户分类（原站 POST /customer/api/set_customer_classification {customer_id, customer_name, classification}） */
export async function customerClassification(
  customerId: string,
  customerName: string,
  classification: string,
): Promise<ActionResult> {
  if (IS_DEMO_DATA) return { ok: true, msg: '' };
  try {
    const res = await oaPost('/customer/api/set_customer_classification', {
      customer_id: customerId,
      customer_name: customerName,
      classification,
    });
    const data = (await res.json().catch(() => null)) as any;
    if (res.ok && data && data.code === 0) return { ok: true, msg: data.msg || '' };
    return { ok: false, msg: (data && (data.msg || data.message)) || '提交失败' };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
  }
}

/** 部门树（原站 GET /api/index/get_department_tree） */
export async function getDepartmentTree(): Promise<any[] | null> {
  return oaGetJson<any[]>('/api/index/get_department_tree');
}

/** 员工列表（原站 GET /api/index/get_employee，可选 dept 过滤） */
export async function getEmployees(deptId?: string): Promise<{ id: string; name: string }[]> {
  const data = await oaGetJson<{ data?: { id?: string; name?: string; username?: string }[] } | any[]>(
    '/api/index/get_employee',
    deptId ? { dept: deptId } : undefined,
  );
  if (!data) return [];
  const arr = Array.isArray(data) ? data : (data.data as any[]) || [];
  return arr
    .map((e) => ({ id: String(e.id ?? ''), name: String(e.name || e.username || '') }))
    .filter((e) => e.id && e.name);
}

/* ======================= 产品写操作 ======================= */

export interface ProductInput {
  title: string;
  species?: string;
  application?: string;
  cate?: string;
  cate_title?: string;
  gene_name?: string;
  methodology?: string;
  expression_system?: string;
  brand?: string;
  content?: string;
}

/** 新增/编辑/复制产品（原站同一端点：POST /product/index/add，带 id 即编辑，带 old_id 即复制） */
export async function productSave(
  input: ProductInput & { id?: string; old_id?: string },
): Promise<ActionResult> {
  if (IS_DEMO_DATA) return { ok: true, msg: '' };
  try {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v != null && v !== '') payload[k] = String(v);
    }
    if (input.id) payload.id = input.id;
    if (input.old_id) payload.old_id = input.old_id;
    const res = await oaPost('/product/index/add', payload);
    const data = (await res.json().catch(() => null)) as any;
    if (res.ok && data && data.code === 0) return { ok: true, msg: data.msg || '' };
    return { ok: false, msg: (data && (data.msg || data.message)) || '提交失败' };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : '网络异常，请重试' };
  }
}

/** 删除产品（原站 POST /product/index/delete {id}） */
export async function productDelete(id: string): Promise<ActionResult> {
  if (IS_DEMO_DATA) return { ok: true, msg: '' };
  try {
    const res = await oaPost('/product/index/delete', { id });
    const data = (await res.json().catch(() => null)) as any;
    if (res.ok && data && data.code === 0) return { ok: true, msg: data.msg || '' };
    return { ok: false, msg: (data && (data.msg || data.message)) || '删除失败' };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
  }
}

/* ======================= 产品批量导入 / 上下架 / 导出（原站 toolbar 事件） ======================= */

/**
 * multipart 上传（经代理，二进制原样透传）。
 * 原站 layui upload 的 url：
 *   /api/import/import_product?type=1|2  批量导入（同步/异步）
 *   /api/import/import_product_update    批量更新(异步)
 *   /api/import/import_product_under     批量下架
 *   /api/import/import_product_up        批量上架
 *   /api/tool/deal_up_instructions       批量生成UP说明书（数据+模板+arrange）
 *   /api/tool/deal_product_temp_instructions 导入(异步)&说明书
 *   /api/tool/deal_product_instructions  导入(异步)&UP说明书
 */
async function oaUpload(
  path: string,
  form: FormData,
  extra: Record<string, string> = {},
): Promise<ActionResult> {
  if (IS_DEMO_DATA) return { ok: true, msg: '（演示模式）已提交' };
  try {
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    const res = await oaFetch(path, { method: 'POST', body: form });
    const txt = await res.text();
    let msg = '';
    let code = 0;
    try {
      const j = JSON.parse(txt);
      code = j.code ?? j.status ?? -1;
      msg = j.msg || j.message || '';
    } catch {
      code = res.ok ? 0 : -1;
      msg = txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    }
    if (res.ok && (code === 0 || code === 200)) return { ok: true, msg: msg || '操作成功' };
    return { ok: false, msg: msg || `操作失败（HTTP ${res.status}）` };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : '网络异常，请重试' };
  }
}

/** 批量导入产品（type=1 同步 / type=2 异步） */
export function productImport(file: File, type: 1 | 2): Promise<ActionResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  return oaUpload(`/api/import/import_product?type=${type}`, form);
}

/** 批量更新产品（异步，Excel） */
export function productImportUpdate(file: File): Promise<ActionResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  return oaUpload('/api/import/import_product_update', form);
}

/** 批量下架（Excel 货号清单） */
export function productImportUnder(file: File): Promise<ActionResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  return oaUpload('/api/import/import_product_under', form);
}

/** 批量上架（Excel 货号清单） */
export function productImportUp(file: File): Promise<ActionResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  return oaUpload('/api/import/import_product_up', form);
}

/** 批量生成UP说明书（数据 xlsx + 模板 docx + 文件名列序号 arrange） */
export function productUpInstructions(
  dataFile: File,
  tplFile: File,
  arrange: string,
): Promise<ActionResult> {
  const form = new FormData();
  form.append('file', dataFile, dataFile.name);
  form.append('file_template', tplFile, tplFile.name);
  return oaUpload('/api/tool/deal_up_instructions', form, { arrange });
}

/** 批量导入产品(异步)&生成UP说明书 */
export function productAndUpInstructions(
  dataFile: File,
  tplFile: File,
  arrange: string,
): Promise<ActionResult> {
  const form = new FormData();
  form.append('file', dataFile, dataFile.name);
  form.append('file_template', tplFile, tplFile.name);
  return oaUpload('/api/tool/deal_product_instructions', form, { arrange });
}

/** 批量导入产品(异步)&生成说明书（模板） */
export function productTempInstructions(
  dataFile: File,
  tplFile: File,
  arrange: string,
): Promise<ActionResult> {
  const form = new FormData();
  form.append('file', dataFile, dataFile.name);
  form.append('file_template', tplFile, tplFile.name);
  return oaUpload('/api/tool/deal_product_temp_instructions', form, { arrange });
}

/**
 * 导出产品数据（对齐原站 window.open）：
 *   /product/index/list?export=1&limit=10000000[&ids=1,2,3]
 * 需带账号会话（img/a 无法带自定义头 → 用 __sid 查询参数）。
 */
export function productExportUrl(ids?: string[]): string {
  const sid = currentAccountSid();
  const q = new URLSearchParams({ export: '1', limit: '10000000' });
  if (ids && ids.length) q.set('ids', ids.join(','));
  const base = `${CONFIG.oaProxy}/product/index/list?${q.toString()}`;
  return sid ? `${base}&__sid=${encodeURIComponent(sid)}` : base;
}

/** 导出产品（说明书下载量排行榜）：/product/api/exportDownload?export_file_type=2 */
export function productExportDownloadUrl(): string {
  const sid = currentAccountSid();
  const base = `${CONFIG.oaProxy}/product/api/exportDownload?export_file_type=2`;
  return sid ? `${base}&__sid=${encodeURIComponent(sid)}` : base;
}

/* ======================= 消息 / 公告写操作 ======================= */

/**
 * 消息批量操作（原站 POST /message/index/check {ids:'1,2', type, source:3}）。
 * type: 1=设为已读，2=放入垃圾箱（删除）。
 */
export async function messageCheck(ids: string[], type: 1 | 2): Promise<ActionResult> {
  if (!ids.length) return { ok: false, msg: '请选择要操作的消息' };
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/message/index/check', {
        ids: ids.join(','),
        type: String(type),
        source: '3',
      });
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && (data.msg || data.message)) || '操作失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  return { ok: true, msg: '' };
}

/** 公告新增/编辑（原站 POST /note/index/add，带 id 即编辑） */
export async function noteSave(input: { id?: string; title: string; content?: string }): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const payload: Record<string, string> = { title: input.title, content: input.content || '' };
      if (input.id) payload.id = input.id;
      const res = await oaPost('/note/index/add', payload);
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && (data.msg || data.message)) || `提交失败（HTTP ${res.status}）` };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  return { ok: true, msg: '' };
}

/** 问答知识新增/编辑（原站 POST /article/index/listadd，带 id 即编辑） */
export async function articleSave(input: { id?: string; title: string; content?: string }): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const payload: Record<string, string> = { title: input.title, content: input.content || '' };
      if (input.id) payload.id = input.id;
      const res = await oaPost('/article/index/listadd', payload);
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && (data.msg || data.message)) || `提交失败（HTTP ${res.status}）` };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  return { ok: true, msg: '' };
}

/** 问答知识删除（原站 POST /article/index/listdelete {id}） */
export async function articleDelete(id: string): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/article/index/listdelete', { id });
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && (data.msg || data.message)) || '删除失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  return { ok: true, msg: '' };
}

/** 公告删除（原站 POST /note/index/delete {id}） */
export async function noteDelete(id: string): Promise<ActionResult> {
  if (!IS_DEMO_DATA) {
    try {
      const res = await oaPost('/note/index/delete', { id });
      const data = (await res.json().catch(() => null)) as any;
      return res.ok && data && data.code === 0
        ? { ok: true, msg: '' }
        : { ok: false, msg: (data && (data.msg || data.message)) || '删除失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
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

/** 保存基本资料（原站 POST /home/index/edit_personal） */
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
        : { ok: false, msg: (data && (data.msg || data.message)) || '保存失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  return { ok: true, msg: '' };
}

/** 修改密码（原站 POST /home/index/edit_password） */
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
        : { ok: false, msg: (data && (data.msg || data.message)) || '修改失败' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : '网络异常' };
    }
  }
  return { ok: true, msg: '' };
}
