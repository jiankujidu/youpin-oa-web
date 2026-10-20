/**
 * 真实文件上传。
 *
 * 硬约束遵守：
 *  - 全程真实网络请求（XHR，带 upload.onprogress 真实进度）
 *  - 返回**公网可访问 URL**，可刷新后继续使用
 *  - 绝不用 localStorage / sessionStorage / 内存对象「存储」文件或模拟上传
 *  - 凭证缺失时抛 UploadUnconfiguredError，由 UI 明确降级（不假装成功、不崩溃）
 *
 * 原 APP 链路：AndroidBridge.pickFiles → base64 → AndroidBridge.uploadFileBase64Async
 *             → multipart POST /api/index/upload（带 Cookie 会话）
 * 新链路（静态站无后端）：File API → 第三方对象存储直传 → 公网 URL
 */
import { CONFIG, configuredProviders, type UploadProviderName } from './config';
import type { UploadProgress } from './types';
import { sanitizeName } from './util';

export class UploadUnconfiguredError extends Error {
  readonly kind = 'unconfigured' as const;
  constructor() {
    super('未配置上传服务');
    this.name = 'UploadUnconfiguredError';
  }
}

export interface UploadResult {
  /** 公网可访问地址 */
  url: string;
  name: string;
  size: number;
  ext: string;
  provider: UploadProviderName;
  /** 提供方返回的资源标识（用于后续删除/管理） */
  assetId?: string;
}

/* ======================= 底层：带进度的 XHR POST/PUT ======================= */

function xhrUpload(
  url: string,
  method: 'POST' | 'PUT',
  body: FormData | Blob,
  headers: Record<string, string>,
  onProgress?: (p: UploadProgress) => void,
  timeoutMs = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = timeoutMs;
    for (const k in headers) {
      // 由浏览器自动设定的头交给浏览器，避免 Content-Type 破坏 multipart boundary
      if (k.toLowerCase() === 'content-type') continue;
      xhr.setRequestHeader(k, headers[k]);
    }
    xhr.upload.onprogress = (e) => {
      if (!onProgress || !e.lengthComputable) return;
      onProgress({
        loaded: e.loaded,
        total: e.total,
        percent: Math.round((e.loaded / e.total) * 100),
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
      else reject(new Error(`上传失败 HTTP ${xhr.status}：${xhr.responseText.slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new Error('网络异常，上传失败'));
    xhr.ontimeout = () => reject(new Error('上传超时'));
    xhr.send(body);
  });
}

/* ======================= 提供方 1：Cloudinary 免签上传 ======================= */

async function uploadCloudinary(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  const { cloudName, uploadPreset, folder } = CONFIG.upload.cloudinary;
  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
  const fd = new FormData();
  fd.append('file', file, sanitizeName(file.name));
  fd.append('upload_preset', uploadPreset);
  if (folder) fd.append('folder', folder);

  const raw = await xhrUpload(endpoint, 'POST', fd, {}, onProgress);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Cloudinary 返回异常：' + raw.slice(0, 200));
  }
  if (json.error) throw new Error(String((json.error as { message?: string })?.message || json.error));
  const url = String(json.secure_url || json.url || '');
  if (!url) throw new Error('Cloudinary 未返回访问地址');
  return {
    url,
    name: file.name,
    size: file.size,
    ext: (String(json.format) || '').toLowerCase(),
    provider: 'cloudinary',
    assetId: String(json.public_id || ''),
  };
}

/* ======================= 提供方 2：Uploadcare 直传 ======================= */

async function uploadUploadcare(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  const { pubKey } = CONFIG.upload.uploadcare;
  const fd = new FormData();
  fd.append('UPLOADCARE_PUB_KEY', pubKey);
  fd.append('UPLOADCARE_STORE', 'auto');
  fd.append('file', file, sanitizeName(file.name));

  const raw = await xhrUpload('https://upload.uploadcare.com/base/', 'POST', fd, {}, onProgress);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Uploadcare 返回异常：' + raw.slice(0, 200));
  }
  // Uploadcare 返回 { file: "<uuid>" } 时封面为 cdn 地址
  const fileId = json.file ?? json.uuid;
  if (!fileId) throw new Error('Uploadcare 未返回文件标识');
  const uuid = String(fileId);
  const url = `https://ucarecdn.com/${uuid}/${encodeURIComponent(sanitizeName(file.name))}`;
  return {
    url,
    name: file.name,
    size: file.size,
    ext: file.name.split('.').pop()?.toLowerCase() || '',
    provider: 'uploadcare',
    assetId: uuid,
  };
}

/* ======================= 提供方 3：Cloudflare R2 / S3 兼容（预签名 PUT） ======================= */

async function uploadR2(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  const endpoint = CONFIG.upload.r2.presignEndpoint;

  // ① 向 Worker 要预签名 URL（Worker 持有 R2 密钥，前端从不接触密钥）
  const presignRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: sanitizeName(file.name),
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    }),
  });
  if (!presignRes.ok) throw new Error(`预签名失败 HTTP ${presignRes.status}`);
  const presign = (await presignRes.json()) as { url?: string; publicUrl?: string; key?: string };
  if (!presign.url) throw new Error('预签名接口未返回上传地址');

  // ② 直传 PUT 到 R2
  await xhrUpload(
    presign.url,
    'PUT',
    file,
    { 'Content-Type': file.type || 'application/octet-stream' },
    onProgress,
  );

  const url = presign.publicUrl || presign.url.split('?')[0];
  return {
    url,
    name: file.name,
    size: file.size,
    ext: file.name.split('.').pop()?.toLowerCase() || '',
    provider: 'r2',
    assetId: presign.key,
  };
}

const IMPL: Record<
  UploadProviderName,
  (file: File, onProgress?: (p: UploadProgress) => void) => Promise<UploadResult>
> = {
  cloudinary: uploadCloudinary,
  uploadcare: uploadUploadcare,
  r2: uploadR2,
};

/* ======================= 对外入口 ======================= */

export function isUploadConfigured(): boolean {
  return configuredProviders().length > 0;
}

export function activeProvider(): UploadProviderName | null {
  const list = configuredProviders();
  return list.length ? list[0] : null;
}

/**
 * 上传单个文件。
 * @throws UploadUnconfiguredError 未配置任何上传服务
 * @throws Error 真实网络/服务错误（错误信息直接展示给用户）
 */
export async function uploadFile(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  const providers = configuredProviders();
  if (!providers.length) throw new UploadUnconfiguredError();

  let lastErr: unknown = null;
  for (const p of providers) {
    try {
      const r = await IMPL[p](file, onProgress);
      return r;
    } catch (e) {
      lastErr = e;
      // 换下一个已配置提供方重试
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('上传失败');
}

/** 批量上传（串行，逐个上报进度） */
export async function uploadFiles(
  files: File[],
  onEach?: (index: number, file: File, res: UploadResult | null, err: Error | null) => void,
  onProgress?: (index: number, p: UploadProgress) => void,
): Promise<{ ok: UploadResult[]; fail: { file: File; err: Error }[] }> {
  const ok: UploadResult[] = [];
  const fail: { file: File; err: Error }[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const r = await uploadFile(f, onProgress ? (p) => onProgress(i, p) : undefined);
      ok.push(r);
      onEach?.(i, f, r, null);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // 未配置时立即中止整批，避免重复报同样的错
      fail.push({ file: f, err });
      onEach?.(i, f, null, err);
      if (err instanceof UploadUnconfiguredError) break;
    }
  }
  return { ok, fail };
}
