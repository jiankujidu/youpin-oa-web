// 验证 DesktopCustomer 真实提交：拦截 POST /oa-proxy/*，确认按钮打到正确原站端点（不真正改数据）
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const TARGET = process.argv[2] || 'customer-sea'; // 导航 data-key
const OP = process.argv[3] || '领取'; // 点击的操作按钮文字
const EXPECTED = process.argv[4] || '/customer/index/get'; // 预期端点子串

const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-verifycust';
const edge = spawn(EDGE, [
  `--user-data-dir=${PROFILE}`,
  '--remote-debugging-port=9812', '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let browser;
  for (let i = 0; i < 30; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9812', defaultViewport: { width: 1440, height: 900 } }); break; } catch { await sleep(500); }
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
  for (let r = 0; r < 5; r++) {
    await page.evaluate(() => {
      document.querySelectorAll('.d-nav-parent').forEach((x) => {
        if (x.querySelector('.d-nav-arrow')?.textContent?.includes('▸')) x.click();
      });
    });
    await sleep(300);
  }
  await page.evaluate((k) => { document.querySelector(`.d-nav-item[data-key="${k}"]`)?.click(); }, TARGET);
  await sleep(8000);

  const rowInfo = await page.evaluate((opText) => {
    const tables = [...document.querySelectorAll('table')];
    let totalRows = 0, sampleOps = [];
    for (const t of tables) {
      const trs = t.querySelectorAll('tbody tr');
      totalRows += trs.length;
      if (!sampleOps.length && trs.length) {
        const first = trs[0];
        sampleOps = [...first.querySelectorAll('.gg-xs')].map((a) => a.textContent.trim());
      }
    }
    // 全局查找含目标操作的按钮，确认页面渲染了该操作
    const allBtns = [...document.querySelectorAll('.gg-xs')].map((a) => a.textContent.trim());
    return { tables: tables.length, totalRows, sampleOps, hasTargetOp: allBtns.some((t) => t.includes(opText)) };
  }, OP);
  console.log('page:', JSON.stringify(rowInfo));

  const clicked = await page.evaluate(async (opText) => {
    const SEL = '.gg-xs, .pc-ops-menu-item';
    const find = () => [...document.querySelectorAll(SEL)].find((a) => a.textContent.trim().includes(opText));
    let btn = find();
    if (!btn) {
      // 操作收在「更多 ▾」里：先展开
      const more = [...document.querySelectorAll(SEL)].find((a) => a.textContent.includes('更多'));
      if (more) { more.click(); await new Promise((r) => setTimeout(r, 500)); btn = find(); }
    }
    if (!btn) return false;
    btn.click();
    return btn.textContent.trim();
  }, OP);
  console.log('clicked op btn:', clicked);
  await sleep(1000);

  // 分配面板：勾选第一个员工（若有）
  const pickedEmp = await page.evaluate(() => {
    const cbs = document.querySelectorAll('input[type=checkbox]');
    for (const c of cbs) { if (c.closest('label')) { c.click(); return true; } }
    return false;
  });
  if (pickedEmp) { console.log('picked an employee for distribute'); await sleep(400); }

  const confirmed = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.pc-btn')].find((b) => b.textContent.trim().includes('确认'));
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('clicked confirm:', confirmed);
  await sleep(1500);

  const needle = EXPECTED.replace(/^\/+/, '');
  console.log('EXPECTED endpoint contains:', needle);
  console.log('CAPTURED REQUEST:', JSON.stringify(captured, null, 1));
  console.log('MATCH:', captured.some((c) => c.url.includes(needle)) ? 'YES' : 'NO');
  console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0, 5) : 'none');

  await browser.disconnect();
  edge.kill();
  await sleep(400);
  try { require('node:fs').rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); edge.kill(); process.exit(1); });
