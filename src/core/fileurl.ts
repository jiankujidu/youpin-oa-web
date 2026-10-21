/**
 * OA 文件地址统一解析。
 *
 * 背景（实测结论）：
 *  - 接口返回的 filepath / goods_no_url 是阿里云 OSS 签名直链（//static.upingbio.cn/...），
 *    签名约 3.5 小时过期，直连必 403 —— 这是"打开/下载/转发全部失效"的根因。
 *  - 原站实际走的是稳定流式端点（带会话）：
 *      预览/打开  /api/index/get_oss_file.html?id=<文件id>（支持 &rename= 重命名）
 *      强制下载  /api/index/down_oss_file.html?id=<文件id>（返回明文直链）
 *      静态路径  /oss/<年月>/<md5>.<ext>
 *  - 三者经同源代理（CONFIG.oaProxy，注入固定会话）均返回 200 + 正确 Content-Type。
 */
import { CONFIG } from './config';

/** OA 文件稳定预览地址（经代理注入会话，公网可直接访问，转发链接有效） */
export function oaFileUrl(id: string | number, rename?: string): string {
  if (!CONFIG.oaProxy || id === undefined || id === null || id === '') return '';
  let u = `${CONFIG.oaProxy}/api/index/get_oss_file.html?id=${encodeURIComponent(String(id))}`;
  if (rename) u += `&rename=${encodeURIComponent(rename)}`;
  return u;
}

/**
 * OA 返回的文件地址 → 可直接访问的绝对地址。
 *  - `//static.upingbio.cn/...`（协议相对）→ 补 https:（注意：签名链会过期，仅兜底）
 *  - `/api/...`、`/oss/...`（原站相对路径）→ 前缀代理
 *  - 其余原样返回
 */
export function absOaUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('//')) return 'https:' + path;
  if (/^\/(api|oss)\//.test(path)) {
    return CONFIG.oaProxy ? CONFIG.oaProxy + path : 'https://oa.upingbio.com' + path;
  }
  return path;
}

/**
 * ★ OSS 签名直链 → 走代理的 /oss/ 静态路径（去掉签名参数）。
 * 实测签名直链无论新旧都 403（签名的是阿里云内网 endpoint，外网必然 AccessDenied），
 * 所以它绝不能直接给用户打开；唯一可用形态是经代理的 /oss/<年月>/<md5>.<ext>。
 */
export function signedOssToProxy(url: string): string {
  if (!url) return '';
  const m = url.match(/^(?:https?:)?\/\/static\.upingbio\.cn\/oa\/([^?#]+)/i);
  if (!m) return '';
  return CONFIG.oaProxy ? `${CONFIG.oaProxy}/oss/${m[1]}` : `https://oa.upingbio.com/oss/${m[1]}`;
}

/**
 * 正文 HTML 修复：把 OSS 签名图片 / 原站相对链接改走代理，避免刷新后图挂。
 * 用于公告 / 消息 / 问答 / 产品详情等富文本渲染处。
 */
export function fixContentHtml(html: string): string {
  if (!html || !CONFIG.oaProxy) return html;
  return (
    html
      // 协议相对 / https 的 static.upingbio.cn/oa/ 资源 → 代理 /oss/
      .replace(
        /(src|href)\s*=\s*(["'])\s*(?:https?:)?\/\/static\.upingbio\.cn\/oa\/([^"']+)\2/gi,
        (_m, attr: string, q: string, p: string) => `${attr}=${q}${CONFIG.oaProxy}/oss/${p}${q}`,
      )
      // oa.upingbio.com 域内资源 → 代理
      .replace(
        /(src|href)\s*=\s*(["'])\s*https?:\/\/oa\.upingbio\.com\/(?!oss\/)([^"']+)\2/gi,
        (_m, attr: string, q: string, p: string) => `${attr}=${q}${CONFIG.oaProxy}/${p}${q}`,
      )
      // 原站相对路径 → 前缀代理（避免把已代理地址二次加前缀）
      .replace(
        /(src|href)\s*=\s*(["'])\s*\/(api|oss)\/([^"']+)\2/gi,
        (_m, attr: string, q: string, a: string, p: string) =>
          `${attr}=${q}${CONFIG.oaProxy}/${a}/${p}${q}`,
      )
  );
}
