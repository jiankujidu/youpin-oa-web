import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = '9799';
const BASE = process.env.BASE || 'https://youpin-oa.pages.dev/';
const WAIT = Number(process.env.WAIT || 4000);

const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-mob-${PORT}-${Date.now()}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const b = await puppeteer.connect({
  browserURL: `http://127.0.0.1:${PORT}`,
  defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
});
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
p.on('console', (m) => { if (m.type() === 'error') errors.push('C:' + m.text().slice(0, 140)); });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function clickByText(sel, text) {
  return p.evaluate((sel, text) => {
    const els = [...document.querySelectorAll(sel)];
    const el = els.find((e) => e.textContent.trim().includes(text));
    if (el) { el.click(); return true; }
    return false;
  }, sel, text);
}

async function containerInfo() {
  return p.evaluate(() => {
    const title = document.querySelector('.m-topbar-title')?.textContent?.trim() || '';
    const c = document.querySelector('.m-container');
    const txt = c ? c.innerText.replace(/\s+/g, ' ').slice(0, 160) : '';
    const cards = c?.querySelectorAll('.m-card').length || 0;
    const notice = c?.querySelector('.m-notice') ? true : false;
    const empty = /暂无|演示模式|功能不可用/.test(txt);
    return { title, txt, cards, notice, empty };
  });
}

async function goHome() { await clickByText('.m-tab', '首页'); await sleep(800); }

const report = [];
try {
  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(6000);

  // 确认是手机版
  const isMobile = await p.evaluate(() => !!document.querySelector('.m-root'));
  console.log('isMobileUI:', isMobile);

  // 首页办公入口
  const entries = await p.evaluate(() =>
    [...document.querySelectorAll('.m-grid-item .m-gi-text')].map((e) => e.textContent.trim()),
  );
  console.log('HOME_ENTRIES(' + entries.length + '):', entries.join(' / '));

  for (const name of entries) {
    await goHome();
    const ok = await clickByText('.m-grid-item .m-gi-text', name);
    if (!ok) { report.push([name, 'CLICK_FAIL', '']); continue; }
    await sleep(WAIT + 1500);
    const info = await containerInfo();
    report.push([name, info.title, `cards=${info.cards} notice=${info.notice} empty=${info.empty} | ${info.txt}`]);
  }

  // 我的 tab 财务/常用
  await goHome();
  await clickByText('.m-tab', '我的');
  await sleep(1500);
  const mineItems = await p.evaluate(() =>
    [...document.querySelectorAll('.m-menu-item .m-mi-left')].map((e) => e.textContent.trim()),
  );
  console.log('MINE_ITEMS(' + mineItems.length + '):', mineItems.join(' / '));
  for (const name of mineItems) {
    await clickByText('.m-tab', '我的'); await sleep(600);
    const ok = await clickByText('.m-menu-item .m-mi-left', name);
    if (!ok) { report.push([name, 'CLICK_FAIL', '']); continue; }
    await sleep(WAIT + 1500);
    const info = await containerInfo();
    report.push([name, info.title, `cards=${info.cards} notice=${info.notice} empty=${info.empty} | ${info.txt}`]);
  }

  // 审批 tab
  await goHome();
  await clickByText('.m-tab', '审批'); await sleep(WAIT + 1500);
  report.push(['[审批页]', ...(await (async () => { const i = await containerInfo(); return [i.title, `cards=${i.cards} | ${i.txt}`]; })())]);

  // 客户 tab
  await goHome();
  await clickByText('.m-tab', '客户'); await sleep(WAIT + 1500);
  report.push(['[客户页]', ...(await (async () => { const i = await containerInfo(); return [i.title, `cards=${i.cards} | ${i.txt}`]; })())]);
} catch (e) {
  console.log('FATAL', String(e).slice(0, 200));
}

console.log('\n===== 手机版功能审计 =====');
for (const r of report) console.log('•', r[0], '→', r[1], '::', r[2]);
console.log('\nJS错误数:', errors.length);
errors.slice(0, 20).forEach((e) => console.log('  !', e));

await b.disconnect();
edge.kill();
