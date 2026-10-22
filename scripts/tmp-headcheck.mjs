/** 临时：点开指定页签并 dump 表头（验证 DesktopTable 渲染列） */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const KEY = process.argv[2] || 'order-handle';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = '9801';
const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-headcheck-${PORT}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
for (let i = 0; i < 30; i++) {
  try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1600, height: 900 } }); break; }
  catch { await sleep(500); }
}
const page = await browser.newPage();
await page.goto('https://web.jk93.qzz.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(4000);
for (let r = 0; r < 4; r++) {
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if (p.querySelector('.d-nav-arrow')?.textContent?.includes('▸')) p.click();
    });
  });
  await sleep(400);
}
await page.evaluate((k) => { document.querySelector(`.d-nav-item[data-key="${k}"]`)?.click(); }, KEY);
await sleep(9000);
const ths = await page.evaluate(() => {
  const wrap = [...document.querySelectorAll('.d-wrap > div')].find((d) => !/display:\s*none/.test(d.getAttribute('style') || ''));
  return [...(wrap?.querySelectorAll('.pc-table thead th') || [])].map((t) => t.textContent.trim());
});
console.log('th count:', ths.length);
console.log(ths.join(' | '));
await browser.disconnect();
edge.kill();
