/** 通用工具（对齐 app.js 的同名函数行为） */

export function esc(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 剥离服务端高亮 HTML 标签后再转义（对齐 app.js 的 plain） */
export function plain(s: unknown): string {
  return esc(String(s == null ? '' : s).replace(/<[^>]*>/g, ''));
}

function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

/** 支持时间戳（秒）与字符串两种输入，对齐 app.js fmtTime */
export function fmtTime(t: string | number | null | undefined): string {
  if (!t) return '';
  if (typeof t === 'number') {
    const d = new Date(t * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  // 字符串时间统一到「分钟」精度（原站常返回带秒的串，表格里换行且秒位无意义）
  return String(t).replace(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}):\d{2}.*$/, '$1 $2');
}

export function fmtSize(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  if (v < 1024) return v + 'B';
  if (v < 1048576) return (v / 1024).toFixed(1) + 'KB';
  return (v / 1048576).toFixed(1) + 'MB';
}

/** 生成简易唯一 id */
export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 文件名安全化：去掉路径分隔符与非法字符（对齐 MainActivity.sanitizeName） */
export function sanitizeName(name: string | null | undefined): string {
  if (!name) return 'file';
  const s = String(name).replace(/[\\/:*?"<>|]/g, '_').trim();
  return s || 'file';
}

export function fileExt(name: string): string {
  return (String(name).split('.').pop() || '').toLowerCase();
}

// ======================= Toast 事件总线 =======================
type ToastListener = (msg: string) => void;
const toastListeners: ToastListener[] = [];

export function onToast(fn: ToastListener): () => void {
  toastListeners.push(fn);
  return () => {
    const i = toastListeners.indexOf(fn);
    if (i >= 0) toastListeners.splice(i, 1);
  };
}

/** 对齐 APP 的 toast()：有原生桥走原生，否则自绘 */
export function toast(msg: string): void {
  for (const fn of toastListeners) {
    try {
      fn(msg);
    } catch {
      /* ignore */
    }
  }
}

// ======================= 下载 =======================
/** 触发浏览器标准下载（限制 L-1：目录不可控） */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeName(filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** CSV 单元格转义（含逗号/引号/换行时加双引号） */
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 导出 CSV（对齐原站「导出」按钮）。
 * 带 BOM，保证 Excel 直接打开中文不乱码；本地生成，不提交原站。
 * @param filename 文件名（自动补 .csv）
 * @param columns  表头（title 即 CSV 首行）
 * @param rows     每行的列值（顺序与 columns 对齐）
 */
export function downloadCsv(
  filename: string,
  columns: { key: string; title: string }[],
  rows: Record<string, unknown>[],
): void {
  const head = columns.map((c) => csvCell(c.title)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(',')).join('\r\n');
  const csv = `\uFEFF${head}\r\n${body}\r\n`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename.replace(/\.csv$/i, '') + '.csv');
}

/** 把公网 URL fetch 成 File（转发给 Web Share 前必须拿到真实 File 对象） */
export async function urlToFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const blob = await res.blob();
  return new File([blob], sanitizeName(filename), { type: blob.type || 'application/octet-stream' });
}
