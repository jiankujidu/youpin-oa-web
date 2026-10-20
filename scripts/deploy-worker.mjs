/**
 * 一键部署 OA 反代 Worker 到 Cloudflare。
 *
 * 前置授权（二选一）：
 *   A. 非交互（推荐）：export CLOUDFLARE_API_TOKEN=cf_xxxxxxxx
 *      Token 权限模板："Edit Cloudflare Workers"（含 Workers Scripts:Edit + Workers KV Storage:Edit）
 *   B. 交互：先跑一次 `npx wrangler login`（弹浏览器授权，凭证留在本机）
 *
 * 用法：node scripts/deploy-worker.mjs
 * 流程：创建/复用 KV → 回填 wrangler.toml → wrangler deploy → 打印后续步骤
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOML = join(ROOT, 'wrangler.toml');
const KV_BINDING = 'OA_SESSIONS';
const WORKER_NAME = 'youpin-oa-proxy';

const log = (...a) => console.log('[deploy]', ...a);

function run(cmd, opts = {}) {
  log('$', cmd);
  return spawnSync(cmd, { shell: true, cwd: ROOT, encoding: 'utf8', ...opts });
}

function runOk(cmd, opts) {
  const r = run(cmd, opts);
  if (r.status !== 0) {
    console.error((r.stdout || '') + (r.stderr || ''));
    throw new Error(`命令失败: ${cmd}`);
  }
  return r.stdout;
}

/* 1. 确认授权可用 */
function ensureAuth() {
  if (process.env.CLOUDFLARE_API_TOKEN) {
    log('使用 CLOUDFLARE_API_TOKEN 授权');
    return;
  }
  const who = run('npx wrangler whoami');
  const out = (who.stdout || '') + (who.stderr || '');
  if (/not authenticated/i.test(out)) {
    console.error(`
未检测到 Cloudflare 授权。请任选其一：

  A. 给我 API Token（推荐，全自动）：
     1. 打开 https://dash.cloudflare.com/profile/api-tokens
     2. Create Token → 模板 "Edit Cloudflare Workers"
     3. 把 token 发给 agent，或本机执行：
        set CLOUDFLARE_API_TOKEN=cf_xxxx   (Windows CMD)
        $env:CLOUDFLARE_API_TOKEN="cf_xxxx" (PowerShell)

  B. 本机交互授权（弹浏览器）：
     npx wrangler login
`);
    process.exit(1);
  }
  log('使用本机已登录的 wrangler 凭证');
}

/* 2. 创建或复用 KV 命名空间 */
function ensureKv() {
  const toml = readFileSync(TOML, 'utf8');
  const m = toml.match(/id\s*=\s*"([^"]+)"/);
  if (m && m[1] && !/REPLACE_WITH/i.test(m[1])) {
    log('KV 已配置，id =', m[1]);
    return m[1];
  }
  log('创建 KV 命名空间', KV_BINDING);
  const out = runOk(`npx wrangler kv namespace create ${KV_BINDING}`);
  const idMatch = out.match(/id\s*[=:]\s*"?([a-f0-9]{32})"?/i);
  if (!idMatch) {
    console.error(out);
    throw new Error('无法从 wrangler 输出解析 KV id，请手动填入 wrangler.toml');
  }
  const id = idMatch[1];
  // 回填 wrangler.toml
  const next = readFileSync(TOML, 'utf8').replace(
    /id\s*=\s*"REPLACE_WITH_YOUR_KV_NAMESPACE_ID"/,
    `id = "${id}"`,
  );
  writeFileSync(TOML, next, 'utf8');
  log('KV id 已回填 wrangler.toml:', id);
  return id;
}

/* 3. 部署 */
function deploy() {
  log('部署 Worker', WORKER_NAME);
  const out = runOk('npx wrangler deploy');
  const urlMatch = out.match(/https:\/\/[^\s]+\.workers\.dev/);
  console.log('\n========== 部署完成 ==========');
  if (urlMatch) log('Worker 地址:', urlMatch[0]);
  return urlMatch ? urlMatch[0] : '';
}

const url = (() => {
  ensureAuth();
  ensureKv();
  return deploy();
})();

console.log(`
后续三步：
  1. 站点接入代理：GitHub 仓库 → Settings → Secrets and variables → Actions → Variables
     新增  VITE_OA_PROXY = ${url || '<上方的 Worker 地址>'}
  2. 推送一次空提交触发重新部署：
     git commit --allow-empty -m "chore: 启用 OA 代理" && git push
  3. 打开站点登录：登录页会显示 OA 后端下发的真实验证码图片，
     用你的 OA 账号登录后，所有数据与写操作都走真实后端。

备注：
  - 真实模式启用后 public/data/realdata.json 快照不再被加载；
    建议推送前先删除该文件并提交，避免真实客户信息仍可从公开 URL 下载：
    git rm public/data/realdata.json
`);
process.exit(0);
