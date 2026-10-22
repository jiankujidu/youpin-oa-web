/** 业务页列结构对比：原站快照(field/title) vs 我们的线上渲染列(th) */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = process.env.DBG || '9793';
const BASE = process.env.BASE || 'http://127.0.0.1:5199/';
const WAIT = Number(process.env.WAIT || 5000);
const SNAP = path.join(process.cwd(), 'origin-snapshot');

/**
 * 菜单 key → 原站快照文件（侧栏已改三级折叠树，索引会随展开状态漂移，改用稳定 key）。
 * key 取自 DesktopApp MENU 的 node.key；无原站快照的页不列（通讯录/AI问答）。
 */
const PAGE_MAP = {
  files: 'files.html',
  note: 'note.html',
  approve: 'approve.html',
  'finance-advance': 'advancedeposit.html',
  deduction: 'deduction.html',
  'deduction-checked': 'deduction-checked.html',
  margin: 'margindeposit.html',
  'invoice-my': 'invoice-apply.html',
  'invoice-handle': 'invoice-handle.html',
  'finance-income': 'income-invoice.html',
  'finance-order': 'orderapply-apply.html',
  'orderapply-handle': 'orderapply-handle.html',
  customer: 'customer.html',
  'customer-sea': 'customer-sea.html',
  'customer-trash': 'customer-trash.html',
  contact: 'contact.html',
  chance: 'chance.html',
  trace: 'trace.html',
  'order-my': 'order-apply.html',
  'order-handle': 'order-handle.html',
  sample: 'sample.html',
  school: 'schoolexhibition.html',
  'school-handle': 'schoolexhibition-handle.html',
  article: 'article.html',
  after: 'aftersale.html',
  product: 'product.html',
};

/** 从 src/core/pageSpecs.ts（gen-page-specs 产物，已过滤注释列）读取原站列 —— 与渲染同源，避免双解析器漂移 */
function originColumns(key) {
  const specs = fs.readFileSync(path.join(process.cwd(), 'src', 'core', 'pageSpecs.ts'), 'utf8');
  const a = specs.indexOf(`"${key}":`);
  if (a < 0) return [];
  const from = specs.indexOf('{', a);
  let depth = 0;
  let i = from;
  for (; i < specs.length; i++) {
    if (specs[i] === '{') depth++;
    else if (specs[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const obj = JSON.parse(specs.slice(from, i + 1));
  return (obj.cols || []).filter((c) => c.field !== '__ops').map((c) => c.title);
}

const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-cols-profile-${PORT}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));

// 折叠树：先把所有一级/二级分组展开，子项才会进 DOM
for (let round = 0; round < 4; round++) {
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if (p.querySelector('.d-nav-arrow')?.textContent?.includes('▸')) p.click();
    });
  });
  await new Promise((r) => setTimeout(r, 600));
}

const navItems = await page.evaluate(() =>
  [...document.querySelectorAll('.d-nav-item[data-key]')].map((e) => ({
    key: e.getAttribute('data-key'),
    label: e.textContent.trim(),
  })),
);

const out = [];
for (const it of navItems) {
  await page.evaluate((k) => {
    document.querySelector(`.d-nav-item[data-key="${k}"]`)?.click();
  }, it.key);
  await new Promise((r) => setTimeout(r, WAIT));
  const live = await page.evaluate(() => {
    const wrap = [...document.querySelectorAll('.d-wrap > div')].find((d) => !/display:\s*none/.test(d.getAttribute('style') || ''));
    return [...(wrap?.querySelectorAll('.pc-table thead th') || [])].map((t) => t.textContent.trim());
  });
  // 按菜单 key 读原站列（pageSpecs 与渲染同源）
  const oc = originColumns(it.key);
  out.push({ label: it.label, snap: PAGE_MAP[it.key], origin: oc, live });
}

// 对比输出（「操作」列双方都规整掉：原站 __ops 已过滤、我们固定渲染一列操作）
const stripOps = (arr) => arr.filter((t) => t && t !== '操作');
console.log('页签'.padEnd(12), '原站列数', '我们列数', '差异');
for (const r of out) {
  const origin = stripOps(r.origin);
  const live = stripOps(r.live);
  const missing = origin.filter((t) => t && !live.some((l) => l.includes(t) || t.includes(l)));
  const extra = live.filter((l) => l && !origin.some((t) => t.includes(l) || l.includes(t)));
  const flag = missing.length || extra.length ? '⚠️' : '✅';
  console.log(
    `${flag} ${r.label}`.padEnd(16),
    String(origin.length).padStart(4),
    String(live.length).padStart(6),
    missing.length ? ` 原站有我们没有: ${missing.join(',')}` : '',
    extra.length ? ` 我们有原站没有: ${extra.join(',')}` : '',
  );
}
console.log('\nJS 错误:', errs.length ? errs.join(' ; ') : '无');
await browser.disconnect();
edge.kill();
