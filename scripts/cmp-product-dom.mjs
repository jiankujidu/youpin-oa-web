// 产品页结构化比对：原站 vs 我们（同一浏览器/同一视口，导出可 diff 的 JSON）
// 用法：node scripts/cmp-product-dom.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/';
const SID = process.env.SID || '844affb982e3c939352619154584e3a5';
const OURS = process.env.OURS || 'https://web.jk93.qzz.io';
const ORIGIN = process.env.ORIGIN || 'https://oa.upingbio.com/product/index/list';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-cmp-dom';

const edge = spawn(EDGE, [`--user-data-dir=${PROFILE}`, '--remote-debugging-port=9817', '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DUMP = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  // 最宽的可见 table
  const tables = [...document.querySelectorAll('table')].filter(vis);
  const table = tables.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  const ths = table ? [...table.querySelectorAll('thead th')].map((th) => ({
    t: clean(th.textContent), w: Math.round(th.getBoundingClientRect().width),
  })) : [];
  const trs = table ? [...table.querySelectorAll('tbody tr')] : [];
  const rows = trs.slice(0, 2).map((tr) => [...tr.querySelectorAll('td')].map((td) => ({
    t: clean(td.textContent).slice(0, 80),
    html: (td.innerHTML || '').replace(/\s+/g, ' ').trim().slice(0, 220),
    h: Math.round(td.getBoundingClientRect().height),
  })));
  const btns = [...document.querySelectorAll('button, a.layui-btn, .pc-btn, [class*="btn"]')]
    .filter(vis)
    .map((b) => ({
      t: clean(b.textContent).slice(0, 24),
      cls: b.className.toString().slice(0, 60),
      bg: getComputedStyle(b).backgroundColor,
      color: getComputedStyle(b).color,
      fs: getComputedStyle(b).fontSize,
    }))
    .filter((b) => b.t && b.t.length < 26);
  const filters = [...document.querySelectorAll('input, select')].filter(vis).map((x) => ({
    tag: x.tagName.toLowerCase(), ph: x.getAttribute('placeholder') || x.getAttribute('lay-verify') || '',
    name: x.name || x.id || '', val: (x.value || '').slice(0, 20),
    t: clean(x.parentElement?.textContent || '').slice(0, 30),
  }));
  // 分页条（必须取「选中表格所在容器」内的那条：多页签保活会让旧页签的分页条残留在 DOM 里）
  const scope = table?.closest('.pc-panel, .layui-table-view, div') || document;
  const pager = scope.querySelector('.layui-table-page, .layui-laypage, .pc-pager, [class*="pager"], [class*="page-bar"]')
    || document.querySelector('.layui-table-page, .layui-laypage, .pc-pager, [class*="pager"], [class*="page-bar"]');
  return {
    url: location.href,
    bodyText: clean(document.body.innerText).slice(0, 400),
    hasSidebar: !!document.querySelector('.layui-side, .d-side, [class*="sidebar"], nav'),
    tableWidth: table ? Math.round(table.getBoundingClientRect().width) : 0,
    ths, rowCount: trs.length, rows,
    btns, filters,
    pager: pager ? clean(pager.textContent).slice(0, 160) : '',
  };
};

(async () => {
  let browser;
  for (let i = 0; i < 40; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9817', defaultViewport: { width: 1680, height: 1000 } }); break; } catch { await sleep(500); }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });
  await page.setCacheEnabled(false); // 复用 profile 时务必关缓存，否则会拿到旧构建
  const result = {};

  // ---- 原站 ----
  await page.setCookie({ name: 'PHPSESSID', value: SID, domain: '.oa.upingbio.com', path: '/' });
  await page.goto(ORIGIN, { waitUntil: 'networkidle2', timeout: 90000 });
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
    if (n > 0) break;
    await sleep(1000);
  }
  await sleep(3000);
  result.origin = await page.evaluate(DUMP);
  await page.screenshot({ path: `${OUT}.tmp-dom-origin.png` });

  // ---- 我们 ----
  await page.goto(OURS + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(5000);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if (p.textContent.includes('产品管理')) p.click();
    });
  });
  await sleep(800);
  await page.evaluate(() => { document.querySelector('.d-nav-item[data-key="product"]')?.click(); });
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
    if (n > 0) break;
    await sleep(1000);
  }
  await sleep(2500);
  result.ours = await page.evaluate(DUMP);
  await page.screenshot({ path: `${OUT}.tmp-dom-ours.png` });

  writeFileSync(`${OUT}.tmp-dom-diff.json`, JSON.stringify(result, null, 2));
  console.log('ORIGIN ths:', JSON.stringify(result.origin.ths));
  console.log('OURS   ths:', JSON.stringify(result.ours.ths));
  console.log('ORIGIN pager:', result.origin.pager);
  console.log('OURS   pager:', result.ours.pager);
  console.log('ORIGIN btns:', JSON.stringify(result.origin.btns.slice(0, 30)));
  console.log('OURS   btns:', JSON.stringify(result.ours.btns.slice(0, 30)));
  console.log('ORIGIN filters:', JSON.stringify(result.origin.filters.slice(0, 16)));
  console.log('OURS   filters:', JSON.stringify(result.ours.filters.slice(0, 16)));
  console.log('ORIGIN row0:', JSON.stringify(result.origin.rows[0]?.slice(0, 8)));
  console.log('OURS   row0:', JSON.stringify(result.ours.rows[0]?.slice(0, 8)));
  console.log('saved -> .tmp-dom-diff.json');
  await browser.disconnect();
  edge.kill();
})().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
