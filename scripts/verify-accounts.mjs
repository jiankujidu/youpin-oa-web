/**
 * 多账号体系无头验证：
 *   播种账号（JSON 规范写入，与应用自身写盘格式一致）
 *   → 顶栏 chip → 请求带 x-oa-sid → 裸字符串旧数据兼容 → 切换下拉 → 账号管理页
 *   → 切换账号 → 删除 → 退出回落固定会话
 *
 * 作用域注意：桌面端所有页签「保活渲染（隐藏不卸载）」，
 * 统计表格行数/按钮时必须限定「可见页签」，否则会把隐藏页签的元素算进来。
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = process.env.DBG || '9798';
const BASE = process.env.BASE || 'http://127.0.0.1:5199/';
const SID = process.env.SID || '4e34f5357794b5f34efd948e91d97c79';

const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-acc-profile-${PORT}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

/** 观察发往 /oa-proxy 的请求是否带了 x-oa-sid */
const seen = { withSid: 0, withoutSid: 0, badSid: 0 };
page.on('request', (req) => {
  if (!req.url().includes('/oa-proxy/')) return;
  const s = req.headers()['x-oa-sid'];
  if (!s) seen.withoutSid++;
  else if (s === SID) seen.withSid++;
  else seen.badSid++;
});

const ok = (label, cond, extra = '') => console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' | ' + extra : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) 播种两个账号（JSON 规范写入，与应用 setCurrentAccount 的写盘格式一致）
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
await page.evaluate((sid) => {
  const now = Date.now();
  localStorage.setItem('youpin_oa_accounts_v1', JSON.stringify([
    { id: 'acc-a', label: '账号甲（测试）', username: 'jia', sid, source: 'manual', createdAt: now, lastUsedAt: now - 1000, status: 'valid' },
    { id: 'acc-b', label: '账号乙（测试）', username: 'yi', sid, source: 'login', createdAt: now, lastUsedAt: now, status: 'valid' },
  ]));
  localStorage.setItem('youpin_oa_current_account_v1', JSON.stringify('acc-a'));
}, SID);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(4000);

// 2) 顶栏显示当前账号标签
const chip = await page.evaluate(() => document.querySelector('.d-user-name')?.textContent?.trim() || '');
ok('顶栏账号 chip 显示当前账号（账号甲）', chip.includes('账号甲'), chip);

// 3) 数据请求带 x-oa-sid
ok('OA 请求携带 x-oa-sid（账号甲会话）', seen.withSid > 0 && seen.badSid === 0, JSON.stringify(seen));

// 3b) 旧数据兼容：current 键是裸字符串（非 JSON）时也要能选中账号
const beforeLoose = { ...seen };
await page.evaluate(() => {
  localStorage.setItem('youpin_oa_current_account_v1', 'acc-a'); // 裸字符串，模拟手写/旧数据
});
await page.reload({ waitUntil: 'networkidle2' });
await sleep(3500);
const chipLoose = await page.evaluate(() => document.querySelector('.d-user-name')?.textContent?.trim() || '');
ok('旧数据兼容：裸字符串 current 也能选中账号并注入 sid',
  chipLoose.includes('账号甲') && seen.withSid > beforeLoose.withSid,
  `chip=${chipLoose} seen=${JSON.stringify(seen)}`);

// 4) 顶栏下拉出现切换列表
await page.click('.d-user');
await sleep(400);
const menuText = await page.evaluate(() => document.querySelector('.d-user-menu')?.textContent || '');
ok('下拉含「切换账号」与两个账号', menuText.includes('切换账号') && menuText.includes('账号甲') && menuText.includes('账号乙'));

// 5) 打开账号管理页（限定可见页签统计）
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.d-user-menu-item')];
  items.find((i) => i.textContent.includes('账号管理'))?.click();
});
await sleep(1500);
const accPage = await page.evaluate(() => {
  const wrap = [...document.querySelectorAll('.d-wrap > div')].find(
    (d) => !/display:\s*none/.test(d.getAttribute('style') || ''),
  );
  return {
    title: wrap?.querySelector('.pc-title')?.textContent || '',
    rows: wrap?.querySelectorAll('.pc-table tbody tr').length || 0,
    hasAdd: [...(wrap?.querySelectorAll('button') || [])].some((b) => b.textContent.includes('验证并添加')),
    hasLoginAdd: [...(wrap?.querySelectorAll('button') || [])].some((b) => b.textContent.includes('账号密码登录')),
  };
});
ok('账号管理页渲染（标题/2 行/两种添加方式）', accPage.title.includes('账号管理') && accPage.rows === 2 && accPage.hasAdd && accPage.hasLoginAdd, JSON.stringify(accPage));

// 6) 切到账号乙（点击「设为当前」）→ 页面刷新后 chip 变乙
await page.evaluate(() => {
  const wrap = [...document.querySelectorAll('.d-wrap > div')].find(
    (d) => !/display:\s*none/.test(d.getAttribute('style') || ''),
  );
  const rows = [...(wrap?.querySelectorAll('.pc-table tbody tr') || [])];
  rows.find((r) => r.textContent.includes('账号乙'))?.querySelector('.gg-xs.blue')?.click();
});
await sleep(2500);
const chip2 = await page.evaluate(() => document.querySelector('.d-user-name')?.textContent?.trim() || '');
ok('切换后顶栏显示账号乙', chip2.includes('账号乙'), chip2);

// 7) 删除账号甲 → 当前是乙，删除甲不影响当前；列表剩 1 个账号
await page.evaluate(() => {
  document.querySelector('.d-user')?.click(); // 先打开顶栏下拉
});
await sleep(300);
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.d-user-menu-item')];
  items.find((i) => i.textContent.includes('账号管理'))?.click();
});
await sleep(1200);
await page.evaluate(() => {
  const wrap = [...document.querySelectorAll('.d-wrap > div')].find(
    (d) => !/display:\s*none/.test(d.getAttribute('style') || ''),
  );
  const rows = [...(wrap?.querySelectorAll('.pc-table tbody tr') || [])];
  rows.find((r) => r.textContent.includes('账号甲'))?.querySelector('.gg-xs.red')?.click();
});
await sleep(400);
await page.evaluate(() => {
  const wrap = [...document.querySelectorAll('.d-wrap > div')].find(
    (d) => !/display:\s*none/.test(d.getAttribute('style') || ''),
  );
  const btns = [...(wrap?.querySelectorAll('.pc-btn-danger') || [])];
  btns[btns.length - 1]?.click();
});
await sleep(1200);
const remain = await page.evaluate(() => {
  const wrap = [...document.querySelectorAll('.d-wrap > div')].find(
    (d) => !/display:\s*none/.test(d.getAttribute('style') || ''),
  );
  return wrap?.querySelectorAll('.pc-table tbody tr').length || 0;
});
ok('删除账号甲后列表剩 1 个账号', remain === 1, `rows=${remain}`);

// 8) 退出当前账号（顶栏下拉「退出」）→ 清空选择 → 回落固定会话（请求不再带 sid）
const before = { ...seen };
await page.evaluate(() => {
  document.querySelector('.d-user')?.click();
});
await sleep(300);
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.d-user-menu-item')];
  items.find((i) => i.textContent.trim() === '退出')?.click();
});
await sleep(2500);
const afterLogout = await page.evaluate(() => ({
  current: localStorage.getItem('youpin_oa_current_account_v1'),
}));
ok('退出后清除账号选择（回落固定会话模式）', !afterLogout.current || afterLogout.current === '' || afterLogout.current === '""', JSON.stringify(afterLogout));

console.log('\n请求头统计:', JSON.stringify(seen), '（退出前）', JSON.stringify(before));
console.log('JS 错误:', errs.length ? errs.join(' ; ') : '无');
await browser.disconnect();
edge.kill();
