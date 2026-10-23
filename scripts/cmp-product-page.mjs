// 并排比对：原站产品页 vs 我们产品页（同一视口截图；SID 经环境变量注入，默认用固定会话）
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/';
const SID = process.env.SID || '844affb982e3c939352619154584e3a5';
const OURS = process.env.OURS || 'https://web.jk93.qzz.io';
const ORIGIN = process.env.ORIGIN || 'https://oa.upingbio.com/product/index/list';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-cmp-prod';

const edge = spawn(EDGE, [`--user-data-dir=${PROFILE}`, '--remote-debugging-port=9816', '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let browser;
  for (let i = 0; i < 30; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9816', defaultViewport: { width: 1680, height: 1000 } }); break; } catch { await sleep(500); }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });

  // ---- 原站 ----
  await page.setCookie({ name: 'PHPSESSID', value: SID, domain: '.oa.upingbio.com', path: '/' });
  try {
    await page.goto(ORIGIN, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(6000);
    const oi = await page.evaluate(() => {
      const t = document.querySelector('.layui-table-view table, table.layui-table, table');
      const ths = t ? [...t.querySelectorAll('thead th')].map((x) => x.textContent.trim()) : [];
      const rows = t ? t.querySelectorAll('tbody tr').length : 0;
      return { url: location.pathname, title: document.title, ths, rows, loginRedirect: /login/i.test(location.pathname) };
    });
    console.log('ORIGIN:', JSON.stringify(oi));
    await page.screenshot({ path: `${OUT}.tmp-cmp-origin-prod.png` });
    console.log('shot origin -> .tmp-cmp-origin-prod.png');
  } catch (e) { console.log('ORIGIN ERR:', e.message); }

  // ---- 我们 ----
  try {
    await page.goto(OURS + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    await page.evaluate(() => {
      document.querySelectorAll('.d-nav-parent').forEach((p) => {
        if (p.textContent.includes('产品管理') && p.querySelector('.d-nav-arrow')?.textContent?.includes('▸')) p.click();
      });
    });
    await sleep(600);
    await page.evaluate(() => { document.querySelector('.d-nav-item[data-key="product"]')?.click(); });
    await sleep(9000);
    const mi = await page.evaluate(() => {
      const t = [...document.querySelectorAll('table')].filter((x) => x.offsetParent !== null || x.getClientRects().length)
        .sort((a, b) => b.querySelectorAll('tbody tr').length - a.querySelectorAll('tbody tr').length)[0];
      const ths = t ? [...t.querySelectorAll('thead th')].map((x) => x.textContent.trim()) : [];
      return { ths, rows: t ? t.querySelectorAll('tbody tr').length : 0 };
    });
    console.log('OURS:', JSON.stringify(mi));
    await page.screenshot({ path: `${OUT}.tmp-cmp-ours-prod.png` });
    console.log('shot ours -> .tmp-cmp-ours-prod.png');
  } catch (e) { console.log('OURS ERR:', e.message); }

  await browser.disconnect();
  edge.kill();
})().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
