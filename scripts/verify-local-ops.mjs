/**
 * 桌面版「本地新增/编辑」无头验证：打开客户页 → 点新增 → 填表单保存 → 校验列表出现本地行；
 * 校验 0 JS 报错。
 * 用法：node verify-local-ops.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const BASE = process.argv[2] || 'https://youpin-oa.pages.dev/';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = '9745';

const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-lops-${Date.now()}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox', '--headless=new', '--disable-gpu', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const b = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(3000);

// 导航到 客户列表
const nav = await p.evaluate(() => {
  const items = [...document.querySelectorAll('.d-nav-item, .pc-td, a, span, div')];
  const el = items.find((e) => e.textContent.trim() === '客户列表');
  if (el) { el.click(); return true; }
  return false;
});
log('[D] 进入客户列表:', nav);
await sleep(6000);

// 点「新增客户」
const add = await p.evaluate(() => {
  const btn = [...document.querySelectorAll('.pc-btn, button')].find((x) => /新增客户/.test(x.textContent));
  if (btn) { btn.click(); return true; }
  return false;
});
log('[D] 点新增客户:', add);
await sleep(1200);

// 填写表单：React 受控组件，须用原生 setter + input 事件
const filled = await p.evaluate(() => {
  const modal = document.querySelector('.d-modal');
  if (!modal) return { ok: false, reason: 'no-modal' };
  const nameInput = [...modal.querySelectorAll('input')].find((i) => /XX 大学/.test(i.placeholder || ''));
  if (!nameInput) return { ok: false, reason: 'no-name-input', phs: [...modal.querySelectorAll('input')].map((i) => i.placeholder) };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(nameInput, '测试本地客户-验收');
  nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  const save = [...modal.querySelectorAll('button')].find((x) => /保存（本地）/.test(x.textContent));
  return { ok: !!save, reason: '' };
});
log('[D] 弹窗填写:', JSON.stringify(filled));
await sleep(300);
await p.evaluate(() => {
  const modal = document.querySelector('.d-modal');
  const save = [...modal.querySelectorAll('button')].find((x) => /保存（本地）/.test(x.textContent));
  save && save.click();
});
await sleep(2000);

// 校验本地行出现
const localRow = await p.evaluate(() => {
  const badges = [...document.querySelectorAll('.pc-tag-local, span')].filter((s) => /本地新增/.test(s.textContent));
  const name = document.body.innerText.includes('测试本地客户-验收');
  return { badges: badges.length, namePresent: name };
});
log('[D] 本地行校验:', JSON.stringify(localRow));
log('[D] JS错误:', errs.length, errs.slice(0, 3));

await b.disconnect();
process.exit(0);
