// 验证业务表格操作真实提交：拦截请求，确认按钮打到正确原站端点（不真正删除数据）
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'https://web.jk93.qzz.io';
const TARGET = process.argv[2] || 'note'; // 测试页面 data-key
const DEL_URL = process.argv[3] || '/oa-proxy/note/index/delete'; // 预期端点

const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-verifyops`,
  '--remote-debugging-port=9811', '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let browser;
  for (let i = 0; i < 30; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9811', defaultViewport: { width: 1440, height: 900 } }); break; } catch { await sleep(500); }
  }
  const page = await browser.newPage();
  const captured = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/oa-proxy/') && req.method() === 'POST') {
      captured.push({ url: u.replace(/https?:\/\/[^/]+/, ''), post: req.postData() });
      return req.abort();
    }
    req.continue();
  });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message.slice(0, 200)));

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  // 展开全部侧栏分组
  for (let r = 0; r < 5; r++) {
    await page.evaluate(() => {
      document.querySelectorAll('.d-nav-parent').forEach((x) => {
        if (x.querySelector('.d-nav-arrow')?.textContent?.includes('▸')) x.click();
      });
    });
    await sleep(300);
  }
  // 点击目标页
  await page.evaluate((k) => { document.querySelector(`.d-nav-item[data-key="${k}"]`)?.click(); }, TARGET);
  await sleep(7000);

  const rowInfo = await page.evaluate(() => {
    const tbl = document.querySelector('.dt-table');
    const tr = tbl?.querySelector('tbody tr');
    if (!tr) return { rows: 0 };
    const ops = [...tr.querySelectorAll('.dt-op')].map((a) => a.textContent.trim());
    return { rows: tbl.querySelectorAll('tbody tr').length, ops };
  });
  console.log('table:', JSON.stringify(rowInfo));

  // 点击首行最后一个操作（通常是删除/移库类危险操作）
  const clicked = await page.evaluate(() => {
    const tr = document.querySelector('.dt-table tbody tr');
    if (!tr) return false;
    const ops = [...tr.querySelectorAll('.dt-op')];
    if (!ops.length) return false;
    ops[ops.length - 1].click();
    return ops[ops.length - 1].textContent.trim();
  });
  console.log('clicked op btn:', clicked);
  await sleep(800);
  // 确认弹窗
  const confirmed = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.pc-btn')].find((b) => b.textContent.trim() === '确认');
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('clicked confirm:', confirmed);
  await sleep(1500);

  console.log('CAPTURED REQUEST:', JSON.stringify(captured, null, 1));
  console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0, 5) : 'none');

  await browser.disconnect();
  edge.kill();
  await sleep(400);
  try { require('node:fs').rmSync('C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-verifyops', { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); edge.kill(); process.exit(1); });
