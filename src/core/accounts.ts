/**
 * 多账号注册表（替代此前「单一写死账号」的形态）。
 *
 * 能力：
 *   - 账号可配置：构建期预置（VITE_OA_ACCOUNTS）+ 运行期动态增删
 *   - 登录后在多个账号间切换，并持久化当前选中账号
 *   - 每个账号携带自己的 OA 会话（PHPSESSID），请求时经 x-oa-sid 头/__sid 参数下发代理
 *
 * 存储（localStorage，仅存账号元数据与 PHPSESSID，绝不存 OA 密码以外的敏感信息外的文件字节）：
 *   youpin_oa_accounts_v1       账号注册表 JSON
 *   youpin_oa_current_account_v1 当前选中账号 id
 *   youpin_oa_accounts_seeded_v1 预置账号是否已播种（删空后不会被重新播种）
 *
 * 兼容旧数据/旧部署：
 *   - 无任何账号时不发送 x-oa-sid → 代理回落构建期固定会话（OA_FIXED_SID），行为与旧版完全一致
 *   - 旧的 youpin_oa_sid（代理 KV 会话 id，登录验证码链专用）继续沿用，不受本模块影响
 */
import { CONFIG } from './config';
import { uid } from './util';

export interface OaAccount {
  id: string;
  /** 显示名（顶栏/切换列表用） */
  label: string;
  /** OA 登录名 */
  username: string;
  /** 可选：保存后可在账号管理里一键重新登录（随注册表存在本机 localStorage） */
  password?: string;
  /** 已验证可用的 PHPSESSID；空表示尚未取得会话 */
  sid?: string;
  /** 来源：preset=构建期预置 / manual=手工粘贴 sid / login=账号密码登录 */
  source: 'preset' | 'manual' | 'login';
  createdAt: number;
  lastUsedAt: number;
  /** 最近一次校验结果 */
  status: 'unknown' | 'valid' | 'invalid';
  lastError?: string;
}

const K_ACCOUNTS = 'youpin_oa_accounts_v1';
const K_CURRENT = 'youpin_oa_current_account_v1';
const K_SEEDED = 'youpin_oa_accounts_seeded_v1';

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
    /* 隐私模式下不可写，忽略 */
  }
}
/**
 * 宽松读取字符串键：本模块自己写入的是 JSON 字符串（"acc-a"），
 * 但手写/旧数据/外部工具可能写入裸字符串（acc-a）——JSON.parse 会抛错，
 * 旧实现直接回落空值导致「账号明明在却选不中」。这里对裸字符串原样采用。
 */
function readLoose(key: string, fallback = ''): string {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return fallback;
    try {
      const v = JSON.parse(raw);
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      return fallback;
    } catch {
      return raw;
    }
  } catch {
    return fallback;
  }
}
/** 宽松读取布尔键（播种标记等）：接受 true / "true" / 1 */
function readFlag(key: string): boolean {
  const v = readLoose(key, '');
  return v === 'true' || v === '1';
}

/* ======================= 预置账号（构建期配置） ======================= */

/** 解析 VITE_OA_ACCOUNTS（JSON 数组），容错：单条对象也接受 */
export function parsePresetAccounts(raw: string | undefined): OaAccount[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const now = Date.now();
    return list
      .filter((a) => a && typeof a === 'object' && (a.username || a.sid))
      .map((a, i) => ({
        id: String(a.id || `preset-${i + 1}`),
        label: String(a.label || a.username || `账号${i + 1}`),
        username: String(a.username || ''),
        password: a.password ? String(a.password) : undefined,
        sid: a.sid ? String(a.sid) : undefined,
        source: 'preset' as const,
        createdAt: now,
        lastUsedAt: now,
        status: (a.sid ? 'unknown' : 'unknown') as OaAccount['status'],
      }));
  } catch {
    return [];
  }
}

/* ======================= 注册表 CRUD ======================= */

let cache: OaAccount[] | null = null;
const listeners = new Set<() => void>();

function load(): OaAccount[] {
  if (cache) return cache;
  const stored = readJson<OaAccount[] | OaAccount>(K_ACCOUNTS, []);
  const presets = parsePresetAccounts(CONFIG.presetAccounts);
  if ((!stored || (Array.isArray(stored) && !stored.length)) && presets.length && !readFlag(K_SEEDED)) {
    // 首次运行：把构建期预置账号播种进注册表，并选中默认账号（兼容旧部署的一次性迁移）
    cache = presets;
    writeJson(K_ACCOUNTS, presets);
    writeJson(K_SEEDED, true);
    const def = CONFIG.defaultAccountId || presets[0].id;
    if (presets.some((p) => p.id === def)) writeJson(K_CURRENT, def);
    return cache;
  }
  // 容忍单对象形态（手写数据只写了一个账号对象时）
  if (stored && !Array.isArray(stored) && typeof stored === 'object') {
    cache = [stored as OaAccount];
    return cache;
  }
  cache = Array.isArray(stored) ? stored : [];
  return cache;
}

function save(next: OaAccount[]): void {
  cache = next;
  writeJson(K_ACCOUNTS, next);
  listeners.forEach((fn) => fn());
}

/** 全部账号（按最近使用倒序） */
export function listAccounts(): OaAccount[] {
  return [...load()].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export function getAccount(id: string): OaAccount | null {
  return load().find((a) => a.id === id) || null;
}

/** 新增账号；username+sid 全同视为重复（合并而不是新增） */
export function addAccount(input: {
  label?: string;
  username: string;
  password?: string;
  sid?: string;
  source?: OaAccount['source'];
  status?: OaAccount['status'];
}): OaAccount {
  const list = load();
  const dup = list.find(
    (a) => a.username === input.username && (a.sid || '') === (input.sid || ''),
  );
  if (dup) {
    const merged: OaAccount = {
      ...dup,
      label: input.label || dup.label,
      password: input.password ?? dup.password,
      sid: input.sid ?? dup.sid,
      status: input.status ?? dup.status,
      lastUsedAt: Date.now(),
    };
    save(list.map((a) => (a.id === dup.id ? merged : a)));
    return merged;
  }
  const acc: OaAccount = {
    id: uid('acc'),
    label: input.label || input.username || '未命名账号',
    username: input.username,
    password: input.password,
    sid: input.sid,
    source: input.source || 'manual',
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    status: input.status || 'unknown',
  };
  save([...list, acc]);
  return acc;
}

export function updateAccount(id: string, patch: Partial<OaAccount>): OaAccount | null {
  const list = load();
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const next = [...list];
  next[idx] = { ...next[idx], ...patch };
  save(next);
  return next[idx];
}

/** 删除账号；删的是当前账号时清除选中（回落旧行为：代理固定会话） */
export function removeAccount(id: string): void {
  save(load().filter((a) => a.id !== id));
  if (getCurrentAccountId() === id) writeJson(K_CURRENT, '');
}

/* ======================= 当前选中账号 ======================= */

export function getCurrentAccountId(): string {
  return readLoose(K_CURRENT) || '';
}

export function setCurrentAccount(id: string): void {
  writeJson(K_CURRENT, id);
  const acc = getAccount(id);
  if (acc) updateAccount(id, { lastUsedAt: Date.now() });
  listeners.forEach((fn) => fn());
}

/** 当前账号；无 = 旧版免登录形态（代理用固定会话） */
export function getCurrentAccount(): OaAccount | null {
  const id = getCurrentAccountId();
  return id ? getAccount(id) : null;
}

/** 当前账号的 PHPSESSID（api 层注入 x-oa-sid 用；空=不注入） */
export function currentAccountSid(): string {
  return getCurrentAccount()?.sid || '';
}

/** 账号变更订阅（顶栏 chip / 页面刷新用） */
export function subscribeAccounts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
