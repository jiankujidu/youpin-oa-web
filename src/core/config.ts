/**
 * 运行时配置：全部来自构建期环境变量（Vite 会把 VITE_* 静态注入）。
 * 凭证缺失时一律给出「未配置」明确降级，绝不静默失败。
 */

const env = import.meta.env;

/** 运行时可被 URL 参数 ?oa_proxy=https://... 覆盖，方便本地/线上自测代理，无需重新构建 */
function resolveOaProxy(): string {
  try {
    const p = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('oa_proxy');
    if (p) return p.replace(/\/+$/, '');
  } catch {
    /* ignore */
  }
  return ((env.VITE_OA_PROXY as string) || '').replace(/\/+$/, '');
}

export const CONFIG = {
  /** 站点 base（GitHub Pages 子路径由 workflow 注入 VITE_BASE） */
  base: (env.VITE_BASE as string) || '/',

  /** 真实 OA 后端的 CORS 代理地址。留空 = 使用内置演示数据集（见 ARCHITECTURE A2） */
  oaProxy: resolveOaProxy(),

  /**
   * 构建期预置账号（多账号体系的「可配置」入口）。
   * VITE_OA_ACCOUNTS = JSON 数组，如：
   *   [{"id":"main","label":"陈美龙（主账号）","username":"chenmeilong","password":"...","sid":"..."}]
   * 留空 = 无预置账号（旧部署形态：客户端不注入账号会话，代理用固定会话）。
   */
  presetAccounts: ((env.VITE_OA_ACCOUNTS as string) || '').trim(),

  /** 预置账号里的默认账号 id（缺省取第一个） */
  defaultAccountId: ((env.VITE_OA_DEFAULT_ACCOUNT as string) || '').trim(),

  /** 上传服务凭证（三选一，按优先级尝试） */
  upload: {
    cloudinary: {
      cloudName: (env.VITE_CLOUDINARY_CLOUD as string) || '',
      uploadPreset: (env.VITE_CLOUDINARY_PRESET as string) || '',
      folder: (env.VITE_CLOUDINARY_FOLDER as string) || 'youpin-oa',
    },
    uploadcare: {
      pubKey: (env.VITE_UPLOADCARE_PUB_KEY as string) || '',
    },
    /** Cloudflare R2 / S3 兼容：预签名 URL 签发端点（由 workers/oa-proxy.js 提供） */
    r2: {
      presignEndpoint: (env.VITE_R2_PRESIGN_URL as string) || '',
    },
  },

  /** 沿用 APP 的阈值：10MB、17 种扩展名 */
  maxFileSize: 10 * 1024 * 1024,
};

export const IS_DEMO_DATA = !CONFIG.oaProxy;

/** 已配置的上传提供方（按优先级） */
export type UploadProviderName = 'cloudinary' | 'uploadcare' | 'r2';

export function configuredProviders(): UploadProviderName[] {
  const list: UploadProviderName[] = [];
  const u = CONFIG.upload;
  if (u.cloudinary.cloudName && u.cloudinary.uploadPreset) list.push('cloudinary');
  if (u.uploadcare.pubKey) list.push('uploadcare');
  if (u.r2.presignEndpoint) list.push('r2');
  return list;
}

export const PROVIDER_LABEL: Record<UploadProviderName, string> = {
  cloudinary: 'Cloudinary',
  uploadcare: 'Uploadcare',
  r2: 'Cloudflare R2 / S3',
};

/** 每个提供方的凭证获取途径（README 与 UI 面板共用） */
export const PROVIDER_HOWTO: Record<UploadProviderName, string> = {
  cloudinary:
    '注册 cloudinary.com → Dashboard 取 Cloud Name → Settings ▸ Upload ▸ Upload presets 新建一个 Signing Mode = Unsigned 的 preset → 填 VITE_CLOUDINARY_CLOUD 与 VITE_CLOUDINARY_PRESET',
  uploadcare:
    '注册 uploadcare.com → 项目 Dashboard ▸ API keys 取 Public Key → 填 VITE_UPLOADCARE_PUB_KEY',
  r2: 'Cloudflare R2 开一个公开读 bucket → 部署 workers/oa-proxy.js（内含 /presign）→ 填 VITE_R2_PRESIGN_URL',
};
