/**
 * 为 Cloudflare Pages 部署做准备：把同源代理（Pages Functions）写进待部署目录。
 *
 * 产物：dist-pages/functions/oa-proxy/[[path]].js
 *   → 线上 https://<pages 域名>/oa-proxy/<真实 OA 路径>，与站点同源，
 *      既不跨域、也不依赖 workers.dev（后者在部分网络不可达）。
 *
 * 用法：
 *   OA_FIXED_SID=<PHPSESSID> node scripts/prepare-pages.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SID = (process.env.OA_FIXED_SID || '').trim();
const OUT_DIR = join(ROOT, 'dist-pages', 'functions', 'oa-proxy');

const src = readFileSync(join(ROOT, 'workers', 'pages-proxy.js'), 'utf8');
const code = src.replace('__FIXED_SID__', SID);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, '[[path]].js'), code, 'utf8');

/**
 * wrangler pages deploy 只从「仓库根目录的 functions/」打包 Functions
 * （放在构建产物目录里的那份不会被打包），因此两处都写一份。
 * 根目录的 functions/ 含会话 ID，已在 .gitignore 中排除。
 */
const ROOT_DIR = join(ROOT, 'functions', 'oa-proxy');
mkdirSync(ROOT_DIR, { recursive: true });
writeFileSync(join(ROOT_DIR, '[[path]].js'), code, 'utf8');

console.log(
  `[prepare-pages] 已写入 ${OUT_DIR}/[[path]].js 与 ${ROOT_DIR}/[[path]].js（固定会话：${
    SID ? SID.slice(0, 6) + '…' : '未设置 → 线上将无数据'
  }）`,
);
