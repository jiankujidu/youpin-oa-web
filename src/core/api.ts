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
import type {
  ApproveItem, Article, Attachment, Customer, MailContact, Message, Note, Product,
} from './types';
import { uid } from './util';

const K_UPLOADED = 'youpin_uploaded_meta';
const K_OA_SID = 'youpin_oa_sid';

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
async function oaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const sid = getOaSid();
  const headers = new Headers(init.headers);
  if (sid) headers.set('x-oa-session', sid);
  const res = await fetch(`${CONFIG.oaProxy}/oa${path}`, { ...init, headers });
  const newSid = res.headers.get('x-oa-session');
  if (newSid) setOaSid(newSid);
  return res;
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

  // 演示模式：本地校验
  if (!username) return { ok: false, msg: '请输入账号' };
  if (!password) return { ok: false, msg: '请输入密码' };
  if (String(captcha).trim() === '') return { ok: false, msg: '请填写算式结果' };
  if (expectedCaptcha !== undefined && Number(captcha) !== expectedCaptcha)
    return { ok: false, msg: '验证码不正确' };
  if (password.length < 4) return { ok: false, msg: '演示模式：密码至少 4 位即可登录' };
  return { ok: true, msg: '', displayName: username };
}

/* ======================= 列表接口 ======================= */

export function fetchApproves(status: 0 | 1 | 2 | 3): Promise<ApproveItem[]> {
  if (!IS_DEMO_DATA) return oaList<ApproveItem>('/approve/index', { status });
  const all = DEMO.APPROVES;
  return delay(status === 0 ? all : all.filter((a) => a.status === status));
}

export function fetchCustomers(type: 1 | 2 | 3, keyword = ''): Promise<Customer[]> {
  if (!IS_DEMO_DATA) {
    const path = type === 2 ? '/customer/index/sea' : type === 3 ? '/customer/index/trash' : '/customer/index/index';
    return oaList<Customer>(path, { keywords: keyword });
  }
  let list = DEMO.CUSTOMERS;
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

export function fetchProducts(keyword = ''): Promise<Product[]> {
  if (!IS_DEMO_DATA) return oaList<Product>('/product/index/list', { keywords: keyword });
  let list = DEMO.PRODUCTS;
  if (keyword) {
    const k = keyword.toLowerCase();
    list = list.filter((p) => p.title.toLowerCase().includes(k) || p.goods_no.toLowerCase().includes(k));
  }
  return delay(list);
}

/** 附件 = 内置样本 + 本机真实上传（真实上传的排前面） */
export function fetchAttachments(keyword = ''): Promise<Attachment[]> {
  const uploaded = readUploaded();
  const list = [...uploaded, ...DEMO.ATTACHMENTS];
  const filtered = keyword
    ? list.filter((a) => a.name.toLowerCase().includes(keyword.toLowerCase()))
    : list;
  return delay(filtered, 160);
}

export function fetchNotes(): Promise<Note[]> {
  if (!IS_DEMO_DATA) return oaList<Note>('/note/index/index');
  return delay(DEMO.NOTES);
}

export function fetchArticles(): Promise<Article[]> {
  if (!IS_DEMO_DATA) return oaList<Article>('/article/index/index');
  return delay(DEMO.ARTICLES);
}

export function fetchMessages(): Promise<Message[]> {
  if (!IS_DEMO_DATA) return oaList<Message>('/message/index/inbox');
  return delay(DEMO.MESSAGES);
}

export function fetchMails(keyword = ''): Promise<MailContact[]> {
  if (!IS_DEMO_DATA) return oaList<MailContact>('/home/index/mail_list', { keywords: keyword });
  let list = DEMO.MAILS;
  if (keyword) {
    const k = keyword.toLowerCase();
    list = list.filter((m) => m.name.includes(k) || (m.department || '').includes(k));
  }
  return delay(list);
}

export function fetchHomeStats(): Promise<typeof DEMO.HOME_STATS> {
  if (!IS_DEMO_DATA) {
    return oaFetch('/home/index/index')
      .then((r) => r.json())
      .then((r) => extractObj<typeof DEMO.HOME_STATS>(r, DEMO.HOME_STATS))
      .catch(() => DEMO.HOME_STATS);
  }
  return delay(DEMO.HOME_STATS, 120);
}

/* ======================= 审批操作 ======================= */

const approveOverrides = new Map<string, 2 | 3>();

export function applyApproveDecision(id: string, pass: boolean, remark: string): void {
  approveOverrides.set(id, pass ? 2 : 3);
}

export function getApproveStatus(item: ApproveItem): 0 | 1 | 2 | 3 {
  return approveOverrides.get(item.id) ?? item.status;
}
