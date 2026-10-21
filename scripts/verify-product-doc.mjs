/**
 * 专项验证：产品说明书 预览/转发 不得打开 static.upingbio.cn 签名直链（永远 403）。
 * 用 window.open 桩捕获 URL。用法：node verify-product-doc.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://youpin-oa.pages.dev/';
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
import { existsSync } from 'fs';
const exe = EDGE.find(existsSync);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ['--no-sandbox', `--user-data-dir=${process.env.TEMP}/pptr-prod-${Date.now()}`],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });
await sleep(2000);

// 进入手机版产品页（底部 tab 或 hash）
const goSub = await page.evaluate(() => {
  const fn = (window).__goSub;
  return typeof fn === 'function';
});
if (goSub) {
  await page.evaluate(() => window.__goSub('product'));
} else {
  // 兜底：改 hash
  await page.evaluate(() => { location.hash = '#/product'; });
}
await sleep(5000);

// 捕获 window.open
await page.evaluate(() => {
  window.__opened = [];
  window.open = (u) => { window.__opened.push(String(u)); return null; };
});

// 点击第一个产品卡片
const clicked = await page.evaluate(() => {
  const c = document.querySelector('.m-card.clickable');
  if (c) { c.click(); return true; }
  return false;
});
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
