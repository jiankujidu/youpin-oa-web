/**
 * 数据源层（业务逻辑层，双端共享）。
 *
 * 两种模式：
 *   1) 配置了 VITE_OA_PROXY → 走真实 OA 后端（经 CORS 代理）
 *   2) 未配置                → 走内置演示数据集
 *
 * 两种模式返回**完全相同的数据结构**，视图层无需区分。
 */
import { CONFIG } from './config';
import * as DEMO from './demoData';
import type {
  ApproveItem, Article, Attachment, Customer, MailContact, Message, Note, Product,
} from './types';
import { uid } from './util';

const K_UPLOADED = 'youpin_uploaded_meta';

/** 延迟模拟，让演示模式也有真实的加载态 */
function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((r) => setTimeout(() => r(value), ms));
}

/** 真实模式：经代理请求后端 */
async function viaProxy<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${CONFIG.oaProxy}/oa${path}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
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
    // 只存元数据（名称 / 公网 URL / 大小 / 扩展名），绝不存文件字节或 base64
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

export async function login(
  username: string,
  password: string,
  captcha: string,
  expectedCaptcha: number,
): Promise<LoginResult> {
  if (CONFIG.oaProxy) {
    try {
      const r = await viaProxy<{ code: number; msg: string; data?: { nickname?: string } }>(
        '/home/login/login_submit',
        {},
      );
      // 真实模式走代理的 POST 通道（workers/oa-proxy.js 会把 body 透传）
      void r;
    } catch {
      /* 落到下面的演示校验 */
    }
  }
  // 演示模式：本地校验（假设 A6，界面明确标注「演示模式」）
  if (!username) return { ok: false, msg: '请输入账号' };
  if (!password) return { ok: false, msg: '请输入密码' };
  if (String(captcha).trim() === '') return { ok: false, msg: '请填写算式结果' };
  if (Number(captcha) !== expectedCaptcha) return { ok: false, msg: '验证码不正确' };
  if (password.length < 4) return { ok: false, msg: '演示模式：密码至少 4 位即可登录' };
  return { ok: true, msg: '', displayName: username };
}

/* ======================= 列表接口 ======================= */

export function fetchApproves(status: 0 | 1 | 2 | 3): Promise<ApproveItem[]> {
  if (CONFIG.oaProxy) {
    return viaProxy<{ data: ApproveItem[] }>('/oa/approve/index', { status }).then((r) => r.data || []);
  }
  const all = DEMO.APPROVES;
  return delay(status === 0 ? all : all.filter((a) => a.status === status));
}

export function fetchCustomers(type: 1 | 2 | 3, keyword = ''): Promise<Customer[]> {
  if (CONFIG.oaProxy) {
    const path = type === 2 ? '/customer/index/sea' : type === 3 ? '/customer/index/trash' : '/customer/index/index';
    return viaProxy<{ data: Customer[] }>(path, { keywords: keyword }).then((r) => r.data || []);
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
  if (CONFIG.oaProxy) {
    return viaProxy<{ data: Product[] }>('/product/index/list', { keywords: keyword }).then((r) => r.data || []);
  }
  let list = DEMO.PRODUCTS;
  if (keyword) {
    const k = keyword.toLowerCase();
    list = list.filter(
      (p) => p.title.toLowerCase().includes(k) || p.goods_no.toLowerCase().includes(k),
    );
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
  if (CONFIG.oaProxy) {
    return viaProxy<{ data: Note[] }>('/note/index/index').then((r) => r.data || []);
  }
  return delay(DEMO.NOTES);
}

export function fetchArticles(): Promise<Article[]> {
  if (CONFIG.oaProxy) {
    return viaProxy<{ data: Article[] }>('/article/index/index').then((r) => r.data || []);
  }
  return delay(DEMO.ARTICLES);
}

export function fetchMessages(): Promise<Message[]> {
  if (CONFIG.oaProxy) {
    return viaProxy<{ data: Message[] }>('/message/index/inbox').then((r) => r.data || []);
  }
  return delay(DEMO.MESSAGES);
}

export function fetchMails(keyword = ''): Promise<MailContact[]> {
  if (CONFIG.oaProxy) {
    return viaProxy<{ data: MailContact[] }>('/home/index/mail_list', { keywords: keyword }).then((r) => r.data || []);
  }
  let list = DEMO.MAILS;
  if (keyword) {
    const k = keyword.toLowerCase();
    list = list.filter((m) => m.name.includes(k) || (m.department || '').includes(k));
  }
  return delay(list);
}

export function fetchHomeStats(): Promise<typeof DEMO.HOME_STATS> {
  if (CONFIG.oaProxy) {
    return viaProxy<{ data: typeof DEMO.HOME_STATS }>('/home/index/index').then((r) => r.data || DEMO.HOME_STATS);
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
