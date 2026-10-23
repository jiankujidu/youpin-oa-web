// 产品页 1:1 验收：原站 vs 我们（同视口/同流程），产出并排截图 + 关键 DOM 断言
// 用法：node scripts/verify-product-1to1.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/';
const SID = process.env.SID || '844affb982e3c939352619154584e3a5';
const OURS = process.env.OURS || 'https://web.jk93.qzz.io';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-verify-prod';

const edge = spawn(EDGE, [`--user-data-dir=${PROFILE}`, '--remote-debugging-port=9819', '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const W = Number(process.env.W || 1680);

async function fullShot(page, file) {
  // 不用 fullPage（会回收 canvas/懒渲染）：把视口拉到 scrollHeight 再普通截图
  const h = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  await page.setViewport({ width: W, height: Math.min(Math.max(h, 900), 6000) });
  await sleep(1200);
  await page.screenshot({ path: file });
  await page.setViewport({ width: W, height: 1000 });
  return h;
}

(async () => {
  let b;
  for (let i = 0; i < 40; i++) {
    try { b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9819', defaultViewport: { width: W, height: 1000 } }); break; } catch { await sleep(500); }
  }
  const page = await b.newPage();
  await page.setViewport({ width: W, height: 1000 });
  await page.setCacheEnabled(false);

  /* ---------- 原站 ---------- */
  await page.setCookie({ name: 'PHPSESSID', value: SID, domain: '.oa.upingbio.com', path: '/' });
  await page.goto('https://oa.upingbio.com/product/index/list', { waitUntil: 'networkidle2', timeout: 90000 });
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('.layui-table-body tbody tr').length);
    if (n > 0) break;
    await sleep(1000);
  }
  await sleep(3500);
  const oh = await fullShot(page, `${OUT}.tmp-1to1-origin.png`);
  const oInfo = await page.evaluate((cleanSrc) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const trs = [...document.querySelectorAll('.layui-table-body tbody tr')];
    const pg = document.querySelector('.layui-table-page');
    return {
      rows: trs.length,
      pagers: [pg].filter(Boolean).map((p) => clean(p.textContent)).slice(0, 160),
      row0: trs[0] ? [...trs[0].querySelectorAll('td')].map((td) => clean(td.textContent).slice(0, 40)) : [],
      btnCount: document.querySelectorAll('.layui-btn-container .layui-btn').length,
    };
    // eslint-disable-next-line no-unused-expressions
  });
  console.log('ORIGIN height', oh, JSON.stringify(oInfo).slice(0, 600));

  /* ---------- 我们 ---------- */
  await page.goto(OURS + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(5000);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => { if (p.textContent.includes('产品管理')) p.click(); });
  });
  await sleep(800);
  await page.evaluate(() => { document.querySelector('.d-nav-item[data-key="product"]')?.click(); });
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => {
      const t = [...document.querySelectorAll('table')].filter((x) => x.getClientRects().length)
        .sort((a, b) => b.querySelectorAll('tbody tr').length - a.querySelectorAll('tbody tr').length)[0];
      const txt = t?.querySelector('tbody')?.textContent || '';
      return txt.includes('加载中') ? 0 : (t?.querySelectorAll('tbody tr').length || 0);
    });
    if (n >= 20) break;
    await sleep(1000);
  }
  await sleep(2500);
  const mh = await fullShot(page, `${OUT}.tmp-1to1-ours.png`);
  const mInfo = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const tables = [...document.querySelectorAll('table')].filter((x) => x.getClientRects().length);
    const t = tables.sort((a, b) => b.querySelectorAll('tbody tr').length - a.querySelectorAll('tbody tr').length)[0];
    const wrap = t?.closest('div');
    return {
      rows: t?.querySelectorAll('tbody tr').length || 0,
      pagers: [...(wrap ? wrap.querySelectorAll('.pc-pager') : [])].map((p) => clean(p.textContent)),
      allPagers: [...document.querySelectorAll('.pc-pager')].map((p) => clean(p.textContent)),
      row0: t ? [...t.querySelectorAll('tbody tr')[0].querySelectorAll('td')].map((td) => clean(td.textContent).slice(0, 40)) : [],
      btns: [...document.querySelectorAll('.pc-btn')].map((x) => `${clean(x.textContent)}|${getComputedStyle(x).backgroundColor}`),
    };
  });
  console.log('OURS height', mh, JSON.stringify(mInfo).slice(0, 1800));
  await b.disconnect();
  edge.kill();
})().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
