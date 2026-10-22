#!/usr/bin/env node
/**
 * 全站快照:抓取原站所有页面 HTML + 静态资源,作为 1:1 复刻基准。
 * 用法: OA_SID=<PHPSESSID> node scripts/snapshot-origin.mjs
 * 输出: origin-snapshot/
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'origin-snapshot');
const BASE = 'https://oa.upingbio.com';
const SID = (process.env.OA_SID || '').trim();
if (!SID) { console.error('需要 OA_SID 环境变量'); process.exit(1); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Referer': BASE + '/',
  'Cookie': `PHPSESSID=${SID}`,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// 站点地图:菜单树(与原站 data-id 对齐)
const PAGES = [
  ['frame', '/'],
  ['home', '/home/index/index'],
  ['login', '/home/login/index.html'],
  ['profile', '/home/index/edit_personal'],
  ['password', '/home/index/edit_password'],
  ['files', '/home/files/index'],
  ['note', '/note/index/index'],
  ['approve', '/oa/approve/index'],
  ['advancedeposit', '/finance/advancedepositlog/index'],
  ['deduction', '/finance/deductionlog/index'],
  ['deduction-checked', '/finance/deductionlog/checkedlist'],
  ['margindeposit', '/finance/margindepositlog/index'],
  ['invoice-apply', '/finance/invoice/index'],
  ['invoice-handle', '/finance/invoice/list'],
  ['income-invoice', '/finance/income/index'],
  ['orderapply-apply', '/finance/orderapply/index'],
  ['orderapply-handle', '/finance/orderapply/list'],
  ['customer', '/customer/index/index'],
  ['customer-sea', '/customer/index/sea'],
  ['customer-trash', '/customer/index/trash'],
  ['contact', '/customer/contact/index'],
  ['chance', '/customer/chance/index'],
  ['trace', '/customer/trace/index'],
  ['order-apply', '/customer/order/index'],
  ['order-handle', '/customer/order/list'],
  ['sample', '/customer/sample/index'],
  ['schoolexhibition', '/customer/schoolexhibition/index'],
  ['schoolexhibition-handle', '/customer/schoolexhibition/list'],
  ['article', '/article/index/index'],
  ['aftersale', '/customer/aftersalesservice/index'],
  ['openai', '/article/index/openai'],
  ['product', '/product/index/list'],
];

mkdirSync(OUT, { recursive: true });

async function fetchPage(path) {
  const res = await fetch(BASE + path, { headers: HEADERS, redirect: 'manual' });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, loc: res.headers.get('location') || '', buf };
}

const results = [];
for (const [name, path] of PAGES) {
  try {
    const { status, loc, buf } = await fetchPage(path);
    writeFileSync(join(OUT, `${name}.html`), buf);
    const isLogin = buf.includes('login_submit') || buf.includes('gougu-login');
    results.push([name, path, status, buf.length, isLogin ? 'LOGIN(会话失效)' : 'ok', loc]);
    console.log(`${isLogin ? '⚠' : '✓'} ${name} ${path} -> ${status} ${buf.length}B${loc ? ' -> ' + loc : ''}`);
  } catch (e) {
    results.push([name, path, 'ERR', 0, String(e.message || e), '']);
    console.log(`✗ ${name} ${path} -> ${e.message}`);
  }
}

// 汇总
const okCount = results.filter(r => r[4] === 'ok').length;
console.log(`\n完成: ${okCount}/${PAGES.length} 页有效(非登录页)`);
writeFileSync(join(OUT, '_manifest.json'), JSON.stringify(results.map(r => ({ name: r[0], path: r[1], status: r[2], bytes: r[3], state: r[4] })), null, 2));
