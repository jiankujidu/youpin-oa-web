/**
 * 真实转发（分享）。
 *
 * 硬约束遵守：
 *  - 优先 Web Share API（真实调起系统分享面板）
 *  - 降级链：navigator.share(files) → navigator.share(url) → 剪贴板复制 → execCommand 兜底
 *  - 绝不是「把文字塞进一个假弹窗」；每一步都是真实系统行为
 *  - 所有可分享物都是**公网 URL** 或**真实 File 对象**，刷新不丢失
 *
 * 原 APP 链路：AndroidBridge.shareFile(url,name) / shareZip(jsonList,name)
 *             → 下载 → ShareProvider content:// → Intent.ACTION_SEND
 */
import JSZip from 'jszip';
import { sanitizeName } from './util';

export type ShareOutcome =
  | { ok: true; via: 'web-share-files' | 'web-share-url' | 'clipboard' | 'download' | 'open' }
  | { ok: false; reason: string; via?: never };

/** 浏览器是否支持分享文件（Web Share Level 2） */
export function canShareFiles(files: File[]): boolean {
  if (typeof navigator === 'undefined') return false;
  const n = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!n.share || typeof n.canShare !== 'function') return false;
  try {
    return n.canShare({ files });
  } catch {
    return false;
  }
}

export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** 剪贴板写入（带 execCommand 兜底） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 落到下面兜底 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 转发文本 / 链接。
 * Web Share 优先；不支持时复制到剪贴板（明确返回 via，UI 据此提示用户）。
 */
export async function shareContent(payload: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<ShareOutcome> {
  const { title, text, url } = payload;
  if (canShare()) {
    try {
      await navigator.share({ title, text, url });
      return { ok: true, via: 'web-share-url' };
    } catch (e) {
      // 用户主动取消：不当作失败传播
      if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
        return { ok: false, reason: '已取消' };
      }
      // share 不可用继续降级
    }
  }
  const body = [title, text, url].filter(Boolean).join('\n');
  const copied = await copyText(body);
  if (copied) return { ok: true, via: 'clipboard' };
  return { ok: false, reason: '当前浏览器不支持分享，且复制失败' };
}

/**
 * 转发单个文件。
 * 优先把真实 File 交给系统分享面板；不支持时降级为「复制公网 URL」；
 * 若只有 URL 没有 File，先 fetch 成 File 再分享（真实网络请求，非模拟）。
 */
export async function shareFile(input: { file?: File; url?: string; name: string }): Promise<ShareOutcome> {
  const name = sanitizeName(input.name);
  let file = input.file;

  if (!file && input.url) {
    try {
      const res = await fetch(input.url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    } catch {
      // 下载失败 → 退到「复制可分享 URL」
      const copied = await copyText(input.url);
      return copied
        ? { ok: true, via: 'clipboard' }
        : { ok: false, reason: '无法获取该文件，复制链接也失败了' };
    }
  }

  if (!file) return { ok: false, reason: '没有可转发的文件' };

  if (canShareFiles([file])) {
    try {
      await navigator.share({ files: [file], title: name });
      return { ok: true, via: 'web-share-files' };
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
        return { ok: false, reason: '已取消' };
      }
      // 继续降级
    }
  }

  // 降级 1：分享/复制可访问 URL
  if (input.url) {
    if (canShare()) {
      try {
        await navigator.share({ title: name, url: input.url });
        return { ok: true, via: 'web-share-url' };
      } catch {
        /* 继续 */
      }
    }
    const copied = await copyText(input.url);
    if (copied) return { ok: true, via: 'clipboard' };
  }

  // 降级 2：直接下载到本机，由用户手动发送
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, via: 'download' };
  } catch {
    return { ok: false, reason: '分享失败，且无法下载' };
  }
}

/**
 * 转发多个文件：JSZip 前端打包成 zip 后走系统分享。
 * 对齐 APP 的 AndroidBridge.shareZip。
 */
export async function shareFilesAsZip(
  items: { name: string; url?: string; file?: File }[],
  zipName = '优品OA-转发',
): Promise<ShareOutcome> {
  if (!items.length) return { ok: false, reason: '请先选择要转发的文件' };

  const zip = new JSZip();
  let added = 0;
  for (const it of items) {
    try {
      let blob: Blob | null = null;
      if (it.file) blob = it.file;
      else if (it.url) {
        const res = await fetch(it.url, { mode: 'cors' });
        if (!res.ok) continue;
        blob = await res.blob();
      }
      if (!blob) continue;
      zip.file(sanitizeName(it.name), blob);
      added++;
    } catch {
      /* 单份失败跳过，不中断整包（对齐 APP v1.1.76 行为） */
    }
  }
  if (!added) return { ok: false, reason: '没有可打包的文件（链接可能已失效）' };

  const blob = await zip.generateAsync({ type: 'blob' });
  const zipFile = new File([blob], `${sanitizeName(zipName)}-${added}份.zip`, {
    type: 'application/zip',
  });

  if (canShareFiles([zipFile])) {
    try {
      await navigator.share({ files: [zipFile], title: zipFile.name });
      return { ok: true, via: 'web-share-files' };
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
        return { ok: false, reason: '已取消' };
      }
    }
  }
  // 降级：下载 zip
  try {
    const url = URL.createObjectURL(zipFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, via: 'download' };
  } catch {
    return { ok: false, reason: '打包失败' };
  }
}

/** 打开系统/浏览器「查看器」：Office 文件走 Office Online（限制 L-2 的降级） */
export function openWithViewer(url: string): void {
  const office = /\.(\w+)$/.exec(url)?.[1];
  const isOffice = office && ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(office);
  const target = isOffice
    ? `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`
    : url;
  window.open(target, '_blank', 'noopener,noreferrer');
}
