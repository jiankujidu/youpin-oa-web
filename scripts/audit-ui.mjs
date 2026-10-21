/**
 * UI 体检（系统性自动检测，而非肉眼抽查）
 * 对每一个桌面页面量化检测：
 *   A. 首屏利用率 / 最大连续空白 / 滚动倍数   —— 「留白过多、要滚很久」
 *   B. 横向溢出                                —— 「布局被撑破」
 *   C. 行高异常（表格行 > 90px）               —— 「某一列把行撑爆」
 *   D. 文本被裁剪（无 title 的溢出）            —— 「看不到完整内容」
 *   E. 点击目标过小（< 24px）                  —— 「鼠标点不中」
 *   F. 超大间距（相邻区块垂直间隙 > 40px）      —— 「间距过大」
 *   G. 字号过小（< 11px）                      —— 「可读性」
 * 用法：
 *   BASE=https://youpin-oa.pages.dev/ W=1440 H=900 node scripts/audit-ui.mjs
 *   OUT=reports/ui-audit.md node scripts/audit-ui.mjs
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = process.env.DBG || '9797';
const BASE = process.env.BASE || 'https://youpin-oa.pages.dev/';
const W = Number(process.env.W || 1440);
const H = Number(process.env.H || 900);
const WAIT = Number(process.env.WAIT || 6000);
const OUT = process.env.OUT || 'reports/ui-audit.md';

const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-uiaudit-${PORT}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

await new Promise((r) => setTimeout(r, 2500));
const browser = await puppeteer.connect({
  browserURL: `http://127.0.0.1:${PORT}`,
  defaultViewport: { width: W, height: H },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

/* ------------------------------------------------------------------ *
 * 页面内执行的检测函数（返回纯数据）
 * ------------------------------------------------------------------ */
const PROBE = `(() => {
  const vh = window.innerHeight, vw = window.innerWidth;
  const doc = document.documentElement;
  const root = document.querySelector('.d-content') || document.body;
  const rootRect = root.getBoundingClientRect();
  const viewH = root.clientHeight;                 // 主内容区可视高度（真正的「首屏」）

  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + id + cls;
  };

  // 只统计主内容区内的元素（排除侧栏/顶栏造成的假间距）
  const all = [...root.querySelectorAll('*')].filter(vis);
  // 「有信息」的元素：有直接文本，或有背景/边框（容器也算占位）
  const content = all.filter((el) => {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const s = getComputedStyle(el);
    const hasBox = s.backgroundImage !== 'none'
      || (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent')
      || s.borderTopWidth !== '0px' || s.borderBottomWidth !== '0px';
    return hasText || hasBox;
  });

  /* ---- A. 首屏利用率 & 连续空白（以内容区可视高度为准）---- */
  const bands = [];
  for (const el of content) {
    const r = el.getBoundingClientRect();
    const top = Math.max(rootRect.top, r.top), bot = Math.min(rootRect.bottom, r.bottom);
    if (bot <= top) continue;
    bands.push([top - rootRect.top, bot - rootRect.top]);
  }
  bands.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const b of bands) {
    const last = merged[merged.length - 1];
    if (last && b[0] <= last[1] + 1) last[1] = Math.max(last[1], b[1]);
    else merged.push([b[0], b[1]]);
  }
  const filled = merged.reduce((s, b) => s + (b[1] - b[0]), 0);
  let maxGap = 0, gapAt = 0;
  for (let i = 1; i < merged.length; i++) {
    const g = merged[i][0] - merged[i - 1][1];
    if (g > maxGap) { maxGap = g; gapAt = Math.round(merged[i - 1][1]); }
  }
  if (merged.length && merged[0][0] > maxGap) { maxGap = merged[0][0]; gapAt = 0; }
  const bottomBlank = merged.length ? Math.round(viewH - merged[merged.length - 1][1]) : viewH;
  // 需滚动倍数（内容区自身滚动）
  const scrollX = Math.round((root.scrollHeight / Math.max(1, viewH)) * 10) / 10;

  /* ---- B. 表格横向溢出（必须横向滚动的像素数）---- */
  let tableOverflow = 0, tableW = 0;
  const wrap = root.querySelector('.pc-table-wrap');
  if (wrap) {
    const t = wrap.querySelector('.pc-table');
    if (t) {
      tableW = Math.round(t.getBoundingClientRect().width);
      tableOverflow = Math.max(0, Math.round(t.scrollWidth - wrap.clientWidth));
    }
  }
  const hOverflow = Math.max(0, doc.scrollWidth - doc.clientWidth);

  /* ---- C. 行高异常 ---- */
  const rows = [...root.querySelectorAll('.pc-table tbody tr')]
    .map((tr) => ({ h: Math.round(tr.getBoundingClientRect().height), t: tr.textContent.trim().slice(0, 24) }))
    .filter((r) => r.h > 56);

  /* ---- D. 文本被裁剪（有溢出且没有 title/悬浮提示）---- */
  const clipped = [];
  for (const el of content) {
    const s = getComputedStyle(el);
    if (!/hidden|clip/.test(s.overflowX + s.overflowY)) continue;
    if (el.title || el.hasAttribute('title')) continue;
    if (el.classList.contains('home-hero') || el.classList.contains('pc-table-wrap')) continue; // 装饰/容器不算
    const overX = el.scrollWidth - el.clientWidth;
    const overY = el.scrollHeight - el.clientHeight;
    if (overX > 2 || overY > 2) {
      clipped.push(label(el) + ' x+' + overX + ' y+' + overY);
      if (clipped.length >= 6) break;
    }
  }

  /* ---- E. 点击目标过小 ---- */
  const tiny = [];
  for (const el of all) {
    const clickable = el.tagName === 'BUTTON' || el.tagName === 'A'
      || el.getAttribute('role') === 'button' || el.classList.contains('pc-link')
      || el.classList.contains('gg-xs') || el.classList.contains('pc-btn')
      || el.classList.contains('pc-tab') || el.classList.contains('pc-pg');
    if (!clickable) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 24 || r.width < 24) tiny.push(label(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (tiny.length >= 6) break;
  }

  /* ---- F. 超大间距（主内容区相邻区块垂直间隙 > 32px）---- */
  const boxes = content
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.height > 4 && r.bottom > rootRect.top && r.top < rootRect.bottom * 2)
    .map((r) => [r.top - rootRect.top, r.bottom - rootRect.top])
    .sort((a, b) => a[0] - b[0]);
  const mb = [];
  for (const b of boxes) {
    const last = mb[mb.length - 1];
    if (last && b[0] <= last[1] + 1) last[1] = Math.max(last[1], b[1]);
    else mb.push([b[0], b[1]]);
  }
  const bigGaps = [];
  for (let i = 1; i < mb.length; i++) {
    const g = mb[i][0] - mb[i - 1][1];
    if (g > 32) bigGaps.push({ gap: Math.round(g), at: Math.round(mb[i - 1][1]) });
  }
  bigGaps.sort((a, b) => b.gap - a.gap);
  const topGaps = bigGaps.slice(0, 4);

  /* ---- G. 字号过小（正文 < 12px，微标 < 10px）---- */
  const tinyFont = [];
  for (const el of content) {
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (!txt) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) { tinyFont.push(label(el) + ' ' + fs + 'px「' + txt.slice(0, 8) + '」'); if (tinyFont.length >= 5) break; }
  }

  return {
    vh, vw, viewH,
    title: root.querySelector('.pc-title')?.textContent?.trim() || document.querySelector('.d-page-tab.on')?.textContent?.trim(),
    foldFill: Math.round((filled / viewH) * 100),
    bottomBlank, maxGap: Math.round(maxGap), gapAt,
    scrollX, docH: root.scrollHeight,
    hOverflow, tableOverflow, tableW,
    tallRows: rows.slice(0, 4),
    clipped, tiny, topGaps, tinyFont,
  };
})()`;

/* ------------------------------------------------------------------ */

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 6000));

const navs = await page.evaluate(() =>
  [...document.querySelectorAll('.d-nav-item')]
    .filter((e) => !e.classList.contains('d-nav-parent'))
    .map((e, i) => ({ i, label: e.textContent.trim().replace(/\s+/g, ' ') })),
);

const results = [];
for (const nav of navs) {
  await page.evaluate((idx) => {
    const list = [...document.querySelectorAll('.d-nav-item')].filter((e) => !e.classList.contains('d-nav-parent'));
    list[idx]?.click();
  }, nav.i);
  await new Promise((r) => setTimeout(r, WAIT));
  let d;
  try { d = await page.evaluate(PROBE); } catch (e) { d = { title: 'ERR ' + String(e).slice(0, 60) }; }
  results.push({ nav: nav.label, ...d });
}

await browser.disconnect();
edge.kill();

/* ------------------------------- 汇总 ------------------------------- */
const ok = (b) => (b ? '✅' : '❌');
const lines = [];
lines.push(`# UI 体检报告`);
lines.push('');
lines.push(`- 目标：${BASE}`);
lines.push(`- 视口：${W}×${H} ｜ 页面数：${results.length}`);
lines.push(`- JS 错误：${errs.length}${errs.length ? ' → ' + errs.slice(0, 3).join(' | ') : ''}`);
lines.push('');
lines.push('| 页面 | 首屏填充率 | 首屏底部空白 | 最大空隙 | 需滚动 | 表格横向溢出 | 高行(>56) | 文本裁剪 | 小点击目标 | 大间距(>32) |');
lines.push('|---|---|---|---|---|---|---|---|---|---|');
let bad = 0;
for (const r of results) {
  const problems = (r.foldFill !== undefined && r.foldFill < 75) || r.hOverflow > 0
    || r.tableOverflow > 0 || (r.tallRows || []).length || (r.clipped || []).length
    || (r.tiny || []).length || (r.topGaps || []).length || (r.scrollX || 0) > 1.6;
  if (problems) bad++;
  lines.push(
    `| ${r.nav} | ${r.foldFill ?? '-'}% | ${r.bottomBlank ?? '-'}px | ${r.maxGap ?? '-'}px@${r.gapAt ?? '-'} | ${r.scrollX ?? '-'}× | ${r.tableOverflow ?? '-'}px | ${(r.tallRows || []).length} | ${(r.clipped || []).length} | ${(r.tiny || []).length} | ${(r.topGaps || []).length} |`,
  );
}
lines.push('');
lines.push(`**有问题的页面：${bad} / ${results.length}**`);
lines.push('');
for (const r of results) {
  const details = [];
  if (r.tableOverflow > 0) details.push('表格横向溢出 ' + r.tableOverflow + 'px（表宽 ' + r.tableW + 'px）');
  if ((r.topGaps || []).length) details.push('大间距 ' + r.topGaps.map((g) => g.gap + 'px@' + g.at).join(', '));
  if ((r.tallRows || []).length) details.push('高行 ' + r.tallRows.map((x) => x.h + 'px「' + x.t + '」').join(', '));
  if ((r.clipped || []).length) details.push('裁剪 ' + r.clipped.join(', '));
  if ((r.tiny || []).length) details.push('小目标 ' + r.tiny.join(', '));
  if ((r.tinyFont || []).length) details.push('小字 ' + r.tinyFont.join(', '));
  if (!details.length) continue;
  lines.push(`### ${r.nav}`);
  for (const d of details) lines.push(`- ${d}`);
  lines.push('');
}

const md = lines.join('\n');
mkdirSync('reports', { recursive: true });
writeFileSync(OUT, md, 'utf8');
console.log(md);
console.log('\n→ 已写入 ' + OUT);
