/**
 * Cloudflare 一键配置：给 GitHub Pages 绑定自定义域名 + SSL 模式。
 *
 * 需要环境变量 CLOUDFLARE_API_TOKEN（权限：Zone.DNS:Edit + Zone.SSL and Certificates:Edit，
 * Zone 范围限定 jk93.qzz.io）。
 *
 * 做四件事：
 *   1. 查出 jk93.qzz.io 的 zone id
 *   2. 清理目标子域下冲突的 A/AAAA 记录（CNAME 不能与其他记录共存）
 *   3. 创建/更新 CNAME：<子域>.jk93.qzz.io → jiankujidu.github.io（灰云，GitHub Pages 必须 non-proxied）
 *   4. SSL/TLS 模式设为 full（GitHub 证书生效后可升 full(strict)）
 *
 * 用法：
 *   CLOUDFLARE_API_TOKEN=cf_xxx node scripts/cf-setup.mjs            # 默认子域 web
 *   CLOUDFLARE_API_TOKEN=cf_xxx RECORD_NAME=web node scripts/cf-setup.mjs
 */
import { execSync } from 'node:child_process';

const API = 'https://api.cloudflare.com/client/v4';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_NAME = 'jk93.qzz.io';
// 目标子域：默认 web（web.jk93.qzz.io），可用 RECORD_NAME 覆盖（如 oa1）
const RECORD_NAME = process.env.RECORD_NAME || process.argv[2] || 'web';
const PAGES_HOST = 'jiankujidu.github.io';
const FULL_NAME = `${RECORD_NAME}.${ZONE_NAME}`;

const log = (...a) => console.log('[cf-setup]', ...a);

if (!TOKEN) {
  console.error(`
缺少 CLOUDFLARE_API_TOKEN。创建方式：
  https://dash.cloudflare.com/profile/api-tokens → Create Token → Create Custom Token
  权限：
    - Zone.DNS:Edit
    - Zone.SSL and Certificates:Edit
    - Zone Resources: Include → Specific zone → ${ZONE_NAME}
`);
  process.exit(1);
}

async function cf(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!body.success) {
    console.error(JSON.stringify(body.errors || body, null, 2));
    throw new Error(`CF API 失败: ${path}`);
  }
  return body.result;
}

/* 1. zone id */
const zones = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
if (!zones.length) {
  console.error(`账号下没有 ${ZONE_NAME} 这个 zone。请先在 Cloudflare 添加该站点（Add a Site），并确认 NS 已委托。`);
  process.exit(1);
}
const zoneId = zones[0].id;
log('zone:', ZONE_NAME, '→', zoneId);

/* 2. 清理冲突记录：同名的 A/AAAA 会阻止 CNAME 创建（如 web 曾指向 10.69.217.156 野记录） */
for (const t of ['A', 'AAAA']) {
  const stale = await cf(
    `/zones/${zoneId}/dns_records?type=${t}&name=${encodeURIComponent(FULL_NAME)}`,
  );
  for (const r of stale) {
    await cf(`/zones/${zoneId}/dns_records/${r.id}`, { method: 'DELETE' });
    log(`已删除冲突 ${t} 记录: ${r.name} → ${r.content}`);
  }
}

/* 3. CNAME 记录（存在则更新，不存在则创建） */
const existing = await cf(
  `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(FULL_NAME)}`,
);
const payload = {
  type: 'CNAME',
  name: RECORD_NAME,
  content: PAGES_HOST,
  proxied: false, // 灰云：GitHub Pages 自定义域名不能被 CF 代理
  ttl: 1,
};
let record;
if (existing.length) {
  record = await cf(`/zones/${zoneId}/dns_records/${existing[0].id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  log('已更新 CNAME:', record.name, '→', record.content, '（灰云）');
} else {
  record = await cf(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  log('已创建 CNAME:', record.name, '→', record.content, '（灰云）');
}

/* 4. SSL 模式 → full（Pages 证书签发后可在后台升 Full(strict)） */
try {
  await cf(`/zones/${zoneId}/settings/ssl`, {
    method: 'PATCH',
    body: JSON.stringify({ value: 'full' }),
  });
  log('SSL/TLS 模式已设为 full');
} catch {
  log('SSL 模式设置失败（可能 token 缺 Zone.SSL:Edit 权限），可稍后在 CF 后台手动设');
}

console.log(`
========== DNS 配置完成 ==========
记录：${FULL_NAME}  CNAME → ${PAGES_HOST}（灰云 DNS-only）

接下来 GitHub 会自动：
  1. 检测到 DNS 正确指向后，给 https://${FULL_NAME}/ 签发 TLS 证书（通常 5~60 分钟）
  2. 之后 http://${FULL_NAME} 会 301 到 https://

验证命令（等几分钟后执行）：
  curl -sI http://${FULL_NAME}/ | head -3
  curl -s http://${FULL_NAME}/ | grep -o "<title>[^<]*</title>"   # 应显示「优品OA」
`);
process.exit(0);
