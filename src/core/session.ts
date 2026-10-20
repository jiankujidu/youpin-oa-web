/**
 * 会话与本地持久化。
 *
 * 硬约束：localStorage 只存「会话标记 / 账号 / 收藏夹元数据（URL 字符串）」，
 *        **绝不存文件字节**，也绝不把文件 base64 塞进 localStorage 冒充上传。
 */
import type { FavDoc, FavFolder, Session } from './types';
import { uid } from './util';

const K_SESSION = 'youpin_session';
const K_REMEMBER = 'youpin_remember';
const K_FAV = 'youpin_fav_folders';
const K_NAME = 'youpin_display_name';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式下 localStorage 可能不可写，忽略 */
  }
}

/* ======================= 会话 ======================= */

export function getSession(): Session | null {
  return read<Session | null>(K_SESSION, null);
}

export function setSession(s: Session): void {
  write(K_SESSION, s);
}

export function clearSession(): void {
  try {
    localStorage.removeItem(K_SESSION);
  } catch {
    /* ignore */
  }
}

/** 仅持久化显示名，避免每次登录重新解析 */
export function setDisplayName(name: string): void {
  try {
    localStorage.setItem(K_NAME, name);
  } catch {
    /* ignore */
  }
}
export function getDisplayName(): string {
  try {
    return localStorage.getItem(K_NAME) || '';
  } catch {
    return '';
  }
}

/* ======================= 记住账号密码 ======================= */

export interface Remembered {
  u: string;
  p: string;
}

export function getRemembered(): Remembered | null {
  return read<Remembered | null>(K_REMEMBER, null);
}
export function setRemembered(u: string, p: string): void {
  write(K_REMEMBER, { u, p });
}
export function clearRemembered(): void {
  try {
    localStorage.removeItem(K_REMEMBER);
  } catch {
    /* ignore */
  }
}

/* ======================= 说明书收藏夹（只存元数据 + 公网 URL） ======================= */

export function getFolders(): FavFolder[] {
  const list = read<FavFolder[]>(K_FAV, []);
  return Array.isArray(list) ? list : [];
}

function saveFolders(list: FavFolder[]): void {
  write(K_FAV, list);
}

export function createFolder(name: string): FavFolder {
  const list = getFolders();
  const folder: FavFolder = {
    id: uid('fav'),
    name: name || '未命名文件夹',
    docs: [],
    create_time: Date.now(),
  };
  list.unshift(folder);
  saveFolders(list);
  return folder;
}

export function renameFolder(id: string, name: string): void {
  const list = getFolders();
  const f = list.find((x) => x.id === id);
  if (f) {
    f.name = name;
    saveFolders(list);
  }
}

export function deleteFolder(id: string): void {
  saveFolders(getFolders().filter((x) => x.id !== id));
}

/** 收藏一份说明书（只存名称 + 公网 URL） */
export function addDocToFolder(folderId: string, name: string, url: string, productId?: string): void {
  const list = getFolders();
  const f = list.find((x) => x.id === folderId);
  if (!f) return;
  if (f.docs.some((d) => d.url === url)) return;
  const doc: FavDoc = {
    id: uid('doc'),
    name,
    url,
    productId,
    add_time: Date.now(),
  };
  f.docs.unshift(doc);
  saveFolders(list);
}

export function removeDocFromFolder(folderId: string, docId: string): void {
  const list = getFolders();
  const f = list.find((x) => x.id === folderId);
  if (!f) return;
  f.docs = f.docs.filter((d) => d.id !== docId);
  saveFolders(list);
}
