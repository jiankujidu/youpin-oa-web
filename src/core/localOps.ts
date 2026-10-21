/**
 * 本地操作层（"可操作但不提交"）。
 *
 * 需求背景：用户要求桌面版"功能全部一样、能编辑能操作"，但**绝不拿账号往原站提交**。
 * 因此所有写操作（新增 / 编辑 / 删除 / 撤回）都只落到浏览器 localStorage，
 * 与 OA 只读数据在前端合并渲染，并在 UI 上明确标注"本地"。
 *
 * 数据结构（per module）：
 *   added: 本地新增行（id 形如 local-<模块>-<n>）
 *   edits: 对 OA 行的字段覆盖（key = String(id)）
 *   deleted: 已删除的 OA 行 id
 */
import { uid } from './util';

type Row = Record<string, any>;

interface LocalState {
  added: Row[];
  edits: Record<string, Row>;
  deleted: string[];
}

const PREFIX = 'ypoa-ops:';

function key(module: string): string {
  return PREFIX + module;
}

function loadState(module: string): LocalState {
  try {
    const raw = localStorage.getItem(key(module));
    if (raw) {
      const s = JSON.parse(raw) as LocalState;
      return { added: s.added || [], edits: s.edits || {}, deleted: s.deleted || [] };
    }
  } catch {
    /* 坏数据按空处理 */
  }
  return { added: [], edits: {}, deleted: [] };
}

function saveState(module: string, s: LocalState): void {
  try {
    localStorage.setItem(key(module), JSON.stringify(s));
  } catch {
    /* 存储满时静默失败 */
  }
}

/** 是否本地行（新增或已编辑的 OA 行） */
export function isLocalRow(row: Row): boolean {
  return String(row.id ?? '').startsWith('local-') || !!row._local;
}

/** 取本地新增行 */
export function localAdded(module: string): Row[] {
  return loadState(module).added;
}

/**
 * 合并：OA 行 → 去掉已删除 → 应用本地编辑 → 追加本地新增
 * 本地行统一打 `_local: true` 标记，供表格显示"本地"徽标。
 */
export function mergeLocal(module: string, serverRows: Row[]): Row[] {
  const s = loadState(module);
  const out: Row[] = [];
  for (const r of serverRows) {
    const id = String(r.id ?? '');
    if (id && s.deleted.includes(id)) continue;
    const edit = id ? s.edits[id] : undefined;
    out.push(edit ? { ...r, ...edit, _local: true, _op: 'edited' } : { ...r });
  }
  for (const r of s.added) {
    out.push({ ...r, _local: true, _op: 'added' });
  }
  return out;
}

/** 新增一条本地记录 */
export function addLocal(module: string, row: Row): Row {
  const s = loadState(module);
  const rec: Row = { id: `local-${module}-${uid()}`, create_time: new Date().toISOString().slice(0, 19).replace('T', ' '), ...row, _local: true, _op: 'added' };
  s.added.unshift(rec);
  saveState(module, s);
  return rec;
}

/** 保存编辑（本地新增行直接改；OA 行写入 edits 覆盖） */
export function editLocal(module: string, row: Row): Row {
  const s = loadState(module);
  const id = String(row.id ?? '');
  if (id.startsWith('local-')) {
    s.added = s.added.map((r) => (String(r.id) === id ? { ...r, ...row } : r));
  } else if (id) {
    s.edits[id] = { ...(s.edits[id] || {}), ...row };
  }
  saveState(module, s);
  return { ...row, _local: true, _op: 'edited' };
}

/** 删除（OA 行只记删除标记，不碰原站） */
export function deleteLocal(module: string, id: string): void {
  const s = loadState(module);
  const str = String(id ?? '');
  if (str.startsWith('local-')) {
    s.added = s.added.filter((r) => String(r.id) !== str);
  } else if (str && !s.deleted.includes(str)) {
    s.deleted.push(str);
  }
  saveState(module, s);
}

/** 撤回本地编辑（OA 行恢复原样） */
export function revertLocal(module: string, id: string): void {
  const s = loadState(module);
  delete s.edits[String(id)];
  saveState(module, s);
}

/** 清空某模块全部本地操作（设置里用） */
export function clearLocal(module: string): void {
  localStorage.removeItem(key(module));
}

/** 统计各模块本地操作数量（首页/设置展示） */
export function localStats(): { module: string; added: number; edited: number; deleted: number }[] {
  const out: { module: string; added: number; edited: number; deleted: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const s = JSON.parse(localStorage.getItem(k) || '{}') as LocalState;
      const module = k.slice(PREFIX.length);
      out.push({ module, added: (s.added || []).length, edited: Object.keys(s.edits || {}).length, deleted: (s.deleted || []).length });
    }
  } catch {
    /* ignore */
  }
  return out;
}
