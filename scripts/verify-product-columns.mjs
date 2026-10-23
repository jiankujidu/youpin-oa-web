// 验证产品页新增 7 列（来源/定量定性/种属英文名/浓度点/产品代码/属性/阅读权限范围）是否渲染且有真实数据
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'https://web.jk93.qzz.io';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-verifyprodcols';

const edge = spawn(EDGE, [
  `--user-data-dir=${PROFILE}`,
  '--remote-debugging-port=9813', '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NEW_COLS = ['来源', '定量/定性', '种属英文名', '浓度点', '产品代码', '属性', '阅读权限范围'];

(async () => {
  let browser;
  for (let i = 0; i < 30; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9813', defaultViewport: { width: 1680, height: 1000 } }); break; } catch { await sleep(500); }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message.slice(0, 160)));

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  // 侧边栏分组默认折叠：先展开「产品管理」父分组，再点产品列表
  await page.evaluate(() => {
    for (const p of document.querySelectorAll('.d-nav-parent')) {
      if (p.textContent.includes('产品管理') && p.querySelector('.d-nav-arrow')?.textContent?.includes('▸')) p.click();
    }
  });
  await sleep(600);
  await page.evaluate((k) => { document.querySelector(`.d-nav-item[data-key="${k}"]`)?.click(); }, 'product');
  await sleep(9000);

  const info = await page.evaluate((NEW_COLS) => {
    // 多页签保活：只取可见容器内的表（隐藏页签的表仍在 DOM 里）
    const tables = [...document.querySelectorAll('table')].filter((t) => t.offsetParent !== null || t.getClientRects().length);
    // 取行数最多的可见表（产品数据表）
    let best = null, bestN = -1;
    for (const t of tables) {
      const n = t.querySelectorAll('tbody tr').length;
      if (n > bestN) { bestN = n; best = t; }
    }
    if (!best) return { ok: false, reason: 'no table', tables: tables.length };
    const heads = [...best.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const trs = [...best.querySelectorAll('tbody tr')];
    // 按表头文本定位新列索引，统计前 10 行非空率
    const cols = {};
    for (const name of NEW_COLS) {
      const idx = heads.findIndex((h) => h.includes(name));
      if (idx < 0) { cols[name] = { found: false }; continue; }
      let nonEmpty = 0; const samples = [];
      for (const tr of trs.slice(0, 10)) {
        const tds = tr.querySelectorAll('td');
        const v = (tds[idx]?.textContent || '').trim();
        if (v && v !== '—') nonEmpty++;
        if (samples.length < 3 && v && v !== '—') samples.push(v.slice(0, 30));
      }
      cols[name] = { found: true, nonEmpty, of: Math.min(10, trs.length), samples };
    }
    return { ok: true, heads, headCount: heads.length, rowCount: trs.length, cols };
  }, NEW_COLS);

  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-prodcols.png' });
  console.log('shot -> .tmp-prodcols.png');
  console.log('errors:', JSON.stringify(errors.slice(0, 8)));
  await browser.disconnect();
  edge.kill();
})().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
