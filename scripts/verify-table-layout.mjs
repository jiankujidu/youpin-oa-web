// 实测表格布局：宽表应横向滚动且表头单行；窄表应铺满容器
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'https://web.jk93.qzz.io';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-measuretbl';
const edge = spawn(EDGE, [`--user-data-dir=${PROFILE}`, '--remote-debugging-port=9815', '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(page, groupText, itemKey) {
  await page.evaluate((g) => {
    for (const p of document.querySelectorAll('.d-nav-parent')) {
      if (p.textContent.includes(g) && p.querySelector('.d-nav-arrow')?.textContent?.includes('▸')) p.click();
    }
  }, groupText);
  await sleep(500);
  await page.evaluate((k) => { document.querySelector(`.d-nav-item[data-key="${k}"]`)?.click(); }, itemKey);
  await sleep(7000);
}

async function measure(page) {
  return page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')].filter((t) => t.offsetParent !== null || t.getClientRects().length);
    let best = null, bestN = -1;
    for (const t of tables) { const n = t.querySelectorAll('tbody tr').length; if (n > bestN) { bestN = n; best = t; } }
    if (!best) return { ok: false };
    const wrap = best.closest('.pc-table-wrap');
    const ths = [...best.querySelectorAll('thead th')];
    const thH = ths.map((t) => Math.round(t.getBoundingClientRect().height));
    const colW = ths.map((t) => Math.round(t.getBoundingClientRect().width));
    return {
      ok: true,
      rows: bestN,
      cols: ths.length,
      wrapClient: wrap ? Math.round(wrap.clientWidth) : null,
      tableScrollW: Math.round(best.scrollWidth),
      wrapScrollW: wrap ? Math.round(wrap.scrollWidth) : null,
      scrolls: wrap ? wrap.scrollWidth > wrap.clientWidth + 2 : false,
      maxThH: Math.max(...thH),
      multiLineTh: thH.filter((h) => h > 34).length,
      colW,
      tableMinW: best.style.minWidth || '',
    };
  });
}

(async () => {
  let browser;
  for (let i = 0; i < 30; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9815', defaultViewport: { width: 1680, height: 1000 } }); break; } catch { await sleep(500); }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(5000);

  console.log('--- 产品列表 (26 列宽表) ---');
  await openPage(page, '产品管理', 'product');
  console.log(JSON.stringify(await measure(page)));

  console.log('--- 预存款管理 (窄表，应铺满不滚动) ---');
  await openPage(page, '财务管理', 'finance-advance');
  console.log(JSON.stringify(await measure(page)));

  console.log('--- 客户联系人 (中表) ---');
  await openPage(page, '客户管理', 'contact');
  console.log(JSON.stringify(await measure(page)));

  await browser.disconnect();
  edge.kill();
})().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
