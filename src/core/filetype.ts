import { fileExt } from './util';

/** 沿用 APP 的 APPROVE_FILE_EXTS */
export const FILE_EXTS = [
  'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx', 'ppt', 'pptx',
  'xls', 'xlsx', 'pdf', 'zip', 'rar', '7z', 'txt', 'wps', 'mp4',
];

/** 沿用 APP 的阈值 */
export const FILE_MAX = 10 * 1024 * 1024;

export interface FileTypeInfo {
  /** 徽标文案 */
  t: string;
  /** 徽标背景色 */
  c: string;
}

/** 文件类型徽标：颜色 + 文案（对齐 app.js 的 FILE_TYPE_MAP 视觉习惯） */
const MAP: Record<string, FileTypeInfo> = {
  pdf: { t: 'PDF', c: '#f53f3f' },
  doc: { t: 'DOC', c: '#2b6cb0' },
  docx: { t: 'DOC', c: '#2b6cb0' },
  wps: { t: 'WPS', c: '#2b6cb0' },
  xls: { t: 'XLS', c: '#16a34a' },
  xlsx: { t: 'XLS', c: '#16a34a' },
  ppt: { t: 'PPT', c: '#d97706' },
  pptx: { t: 'PPT', c: '#d97706' },
  png: { t: 'IMG', c: '#7c3aed' },
  jpg: { t: 'IMG', c: '#7c3aed' },
  jpeg: { t: 'IMG', c: '#7c3aed' },
  gif: { t: 'IMG', c: '#7c3aed' },
  zip: { t: 'ZIP', c: '#64748b' },
  rar: { t: 'RAR', c: '#64748b' },
  '7z': { t: '7Z', c: '#64748b' },
  txt: { t: 'TXT', c: '#86909c' },
  mp4: { t: 'MP4', c: '#0ea5e9' },
};

export function fileTypeInfo(name: string): FileTypeInfo {
  return MAP[fileExt(name)] || { t: 'FILE', c: '#86909c' };
}

/** 是否 Office 文档（限制 L-2 的降级分支用） */
export function isOfficeDoc(name: string): boolean {
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt(name));
}

export function validateFile(file: File): string | null {
  const ext = fileExt(file.name);
  if (FILE_EXTS.indexOf(ext) < 0) return `不支持的格式：${file.name}`;
  if (file.size > FILE_MAX) return `文件过大（>10MB）：${file.name}`;
  if (file.size === 0) return `文件为空：${file.name}`;
  return null;
}
