/**
 * 专项验证：产品说明书 预览/转发 不得打开 static.upingbio.cn 签名直链（永远 403）。
 * 用 window.open 桩捕获 URL。用法：node verify-product-doc.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const BASE = process.argv[2] || 'https://youpin-oa.pages.dev/';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = '9733';

const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-pdoc-${Date.now()}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox', '--headless=new', '--disable-gpu', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await puppeteer.connect({
  browserURL: `http://127.0.0.1:${PORT}`,
  defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });
await sleep(4000);

// 首页 → 产品管理
const navOk = await page.evaluate(() => {
  const tab = [...document.querySelectorAll('.m-tab')].find((t) => t.textContent.trim() === '首页');
  if (tab) tab.click();
  return true;
});
await sleep(1000);
const clickedEntry = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.m-grid-item .m-gi-text')].find((e) => e.textContent.trim() === '产品管理');
  if (el) { el.click(); return true; }
  return false;
});
log('[M] 进入产品管理:', clickedEntry);

// 捕获 window.open
await page.evaluate(() => {
  window.__opened = [];
  window.open = (u) => { window.__opened.push(String(u)); return null; };
});

// 点击第一个产品卡片（等真实接口出列表）
let clicked = false;
for (let i = 0; i < 8 && !clicked; i++) {
  clicked = await page.evaluate(() => {
    const c = document.querySelector('.m-card.clickable');
    if (c) { c.click(); return true; }
    return false;
  });
  if (!clicked) await sleep(2000);
}
log('[M] 点击产品卡片:', clicked);
await sleep(4000);

// 点击第一个「预览」
const prevClicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.m-mini-btn')];
  const b = btns.find((x) => x.textContent.trim() === '预览');
  if (b) { b.click(); return true; }
  return false;
});
log('[M] 点击预览:', prevClicked);
await sleep(2500);

const opened = await page.evaluate(() => window.__opened || []);
log('[M] 打开的 URL:', opened);
log('[M] 含签名直链(static.upingbio.cn):', opened.some((u) => u.includes('static.upingbio.cn')));
log('[M] 走稳定端点(get_oss_file/oa-proxy):', opened.some((u) => u.includes('get_oss_file') || u.includes('oa-proxy')));

// 转发按钮
const fwdClicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.m-mini-btn')];
  const b = btns.find((x) => x.textContent.trim() === '转发');
  if (b) { b.click(); return true; }
  return false;
});
await sleep(1500);
log('[M] 点击转发:', fwdClicked);
const toast = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.m-toast, [class*="toast"]')];
  return els.map((e) => e.textContent.trim()).filter(Boolean).join(' | ');
});
log('[M] toast:', toast);
log('[M] JS错误:', errors.length, errors.slice(0, 3));

await browser.close();
log('=== DONE ===');
