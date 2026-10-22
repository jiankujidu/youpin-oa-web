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

/** 原站页面文件 → 菜单点击索引（导航第 0 项是「工作台」，业务页从 1 开始；末两项 AI问答/通讯录无快照页） */
const PAGE_MAP = {
  1: 'files.html',
  2: 'note.html',
  3: 'approve.html',
  4: 'advancedeposit.html',
  5: 'deduction.html',
  6: 'deduction-checked.html',
  7: 'margindeposit.html',
  8: 'invoice-apply.html',
  9: 'invoice-handle.html',
  10: 'income-invoice.html',
  11: 'orderapply-apply.html',
  12: 'orderapply-handle.html',
  13: 'customer.html',
  14: 'customer-sea.html',
  15: 'customer-trash.html',
  16: 'contact.html',
  17: 'chance.html',
  18: 'trace.html',
  19: 'order-apply.html',
  20: 'order-handle.html',
  21: 'sample.html',
  22: 'schoolexhibition.html',
  23: 'schoolexhibition-handle.html',
  24: 'article.html',
  25: 'aftersale.html',
  27: 'product.html',
};

/** 从原站 HTML 提取主表格列：定位第一个 cols: [[ ... ]] 块（括号配对），解析其中的 field/title 对 */
function originColumns(file) {
  const html = fs.readFileSync(path.join(SNAP, file), 'utf8');
  const m = /cols:\s*\[\[/.exec(html);
  if (!m) return [];
  let depth = 0;
  let i = html.indexOf('[', m.index);
  const from = i;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  const block = html.slice(from, i + 1);
  const cols = [];
  // 跳过被注释的列（//{ field: 'id', ... }）
  const re = /field\s*:\s*['"]([\w]+)['"]\s*,\s*(?:[^{};]*?title\s*:\s*['"]([^'"]+)['"])/g;
  let mm;
  while ((mm = re.exec(block))) {
    const lineStart = block.lastIndexOf('\n', mm.index) + 1;
    const prefix = block.slice(lineStart, mm.index);
    if (prefix.includes('//')) continue; // 注释掉的列
    cols.push({ field: mm[1], title: mm[2] });
  }
  return cols;
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

const navItems = await page.evaluate(() =>
  [...document.querySelectorAll('.d-nav-item')]
    .filter((e) => !e.classList.contains('d-nav-parent'))
    .map((e, i) => ({ i, label: e.textContent.trim() })),
);

const out = [];
for (const it of navItems) {
  await page.evaluate((idx) => {
    const list = [...document.querySelectorAll('.d-nav-item')].filter((e) => !e.classList.contains('d-nav-parent'));
    list[idx]?.click();
  }, it.i);
  await new Promise((r) => setTimeout(r, WAIT));
  const live = await page.evaluate(() => {
    const wrap = [...document.querySelectorAll('.d-wrap > div')].find((d) => !/display:\s*none/.test(d.getAttribute('style') || ''));
    return [...(wrap?.querySelectorAll('.pc-table thead th') || [])].map((t) => t.textContent.trim());
  });
  // 按菜单点击索引找对应原站页面
  const snapFile = PAGE_MAP[it.i];
  const oc = snapFile ? originColumns(snapFile) : [];
  out.push({ label: it.label, snap: snapFile, origin: oc.map((c) => c.title), live });
}

// 对比输出
console.log('页签'.padEnd(12), '原站列数', '我们列数', '差异');
for (const r of out) {
  const missing = r.origin.filter((t) => t && !r.live.some((l) => l.includes(t) || t.includes(l)));
  const extra = r.live.filter((l) => l && !r.origin.some((t) => t.includes(l) || l.includes(t)) && l !== '操作');
  const flag = missing.length || extra.length ? '⚠️' : '✅';
  console.log(
    `${flag} ${r.label}`.padEnd(16),
    String(r.origin.length).padStart(4),
    String(r.live.length).padStart(6),
    missing.length ? ` 原站有我们没有: ${missing.join(',')}` : '',
    extra.length ? ` 我们有原站没有: ${extra.join(',')}` : '',
  );
}
console.log('\nJS 错误:', errs.length ? errs.join(' ; ') : '无');
await browser.disconnect();
edge.kill();
