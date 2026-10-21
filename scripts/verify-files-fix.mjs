/**
 * 验证附件"打开/下载/转发"修复（手机 + 桌面）。
 * 用法: node scripts/verify-files-fix.mjs [BASE]
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = '9821';
const BASE = process.argv[2] || 'https://youpin-oa.pages.dev/';

const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-ffx-${PORT}-${Date.now()}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox', '--headless=new', '--disable-gpu', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const out = [];
function log(...a) { console.log(...a); out.push(a.join(' ')); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 打开页面前挂 window.open 桩 + popup 捕获；返回被打开的 URL */
async function withPopup(p, fn) {
  await p.evaluate(() => {
    window.__opened = [];
    const orig = window.open.bind(window);
    (window).__openOrig = orig;
    window.open = (...args) => {
      window.__opened.push(String(args[0] || ''));
      return null;
    };
  });
  await fn();
  await sleep(2500);
  const url = await p.evaluate(() => (window.__opened || []).join(' || '));
  await p.evaluate(() => { if (window.__openOrig) window.open = window.__openOrig; });
  return url || null;
}

async function clickText(p, sel, text) {
  return p.evaluate((sel, text) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(text));
    if (el) { el.click(); return true; }
    return false;
  }, sel, text);
}

async function toastText(p) {
  return p.evaluate(() =>
    [...document.querySelectorAll('.m-toast')].map((e) => e.textContent.trim()).join(' | '),
  );
}

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}` });

/* ======================= 手机端 ======================= */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 150)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('C:' + m.text().slice(0, 130)); });

  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(6000);
  log('[M] isMobileUI:', await p.evaluate(() => !!document.querySelector('.m-root')));

  await clickText(p, '.m-tab', '首页');
  await sleep(800);
  const nav = await p.evaluate(() => {
    const el = [...document.querySelectorAll('.m-grid-item')].find((e) => e.textContent.includes('附件管理'));
    if (el) { el.click(); return true; }
    return false;
  });
  log('[M] 进入附件管理:', nav);
  await sleep(5000);

  const m = await p.evaluate(() => {
    const c = document.querySelector('.m-container');
    const cards = c ? c.querySelectorAll('.m-card').length : 0;
    const warn = !!c?.querySelector('.warn-red');
    const btns = [...(c?.querySelectorAll('.m-mini-btn') || [])].map((b) => b.textContent.trim());
    const firstName = c?.querySelector('.m-att-name')?.textContent?.trim() || '';
    const title = document.querySelector('.m-topbar-title')?.textContent?.trim() || '';
    return { cards, warn, btns: btns.slice(0, 8), firstName, title };
  });
  log('[M] 页面:', m.title, '卡片数:', m.cards, '文件:', m.firstName, '红横幅:', m.warn, '按钮:', m.btns.join('/'));

  // 打开
  const url = await withPopup(p, () => clickText(p, '.m-mini-btn', '打开'));
  log('[M] 打开 → popup:', url ? url.slice(0, 110) : '(无 popup)');
  await sleep(500);
  // 下载
  await clickText(p, '.m-mini-btn', '下载');
  await sleep(5000);
  log('[M] 下载 toast:', await toastText(p));
  // 转发：轮询抓 toast（toast 存活时间短）
  await clickText(p, '.m-mini-btn', '转发');
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const t = await toastText(p);
    if (t) t.split('|').forEach((x) => seen.add(x.trim()));
    await sleep(500);
  }
  log('[M] 转发 toast(轮询):', [...seen].join(' | ') || '(未捕获)');
  log('[M] JS错误:', errors.length ? errors.slice(0, 4) : '0');
  await p.close();
}

/* ======================= 桌面端 ======================= */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 150)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('C:' + m.text().slice(0, 130)); });

  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(6000);
  const isDesktop = await p.evaluate(() => !document.querySelector('.m-root'));
  log('[D] isDesktopUI:', isDesktop);

  // 侧栏/菜单进文件库
  const clicked = await p.evaluate(() => {
    const els = [...document.querySelectorAll('a,span,li,div')].filter((e) => e.textContent.trim() === '文件库' && e.offsetParent);
    if (els.length) { els[0].click(); return true; }
    return false;
  });
  if (!clicked) {
    // 可能要先点"日常办公"父菜单
    await p.evaluate(() => {
      const els = [...document.querySelectorAll('a,span,li,div')].filter((e) => e.textContent.trim() === '日常办公' && e.offsetParent);
      els[0]?.click();
    });
    await sleep(800);
    await p.evaluate(() => {
      const els = [...document.querySelectorAll('a,span,li,div')].filter((e) => e.textContent.trim() === '文件库' && e.offsetParent);
      els[0]?.click();
    });
  }
  await sleep(5000);

  const d = await p.evaluate(() => {
    const table = document.querySelector('.pc-table, table');
    const rows = document.querySelectorAll('tbody tr').length;
    const warn = /上传服务未配置/.test(document.body.innerText);
    const drop = !!document.querySelector('.d-dropzone');
    const ops = [...document.querySelectorAll('.pc-ops .gg-xs')].map((b) => b.textContent.trim()).slice(0, 6);
    return { rows, warn, drop, ops };
  });
  log('[D] 文件库行数:', d.rows, '红横幅:', d.warn, '上传区:', d.drop, '操作列:', d.ops.join('/'));

  const url2 = await withPopup(p, () => clickText(p, '.pc-ops .gg-xs', '打开'));
  log('[D] 打开 → popup:', url2 ? url2.slice(0, 110) : '(无 popup)');
  log('[D] JS错误:', errors.length ? errors.slice(0, 4) : '0');
  await p.close();
}

await browser.disconnect();
edge.kill();
console.log('=== DONE ===');
