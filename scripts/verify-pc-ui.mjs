/**
 * PC 后台版式验证：登录页结构 + 注入会话后检查后台布局（侧栏/顶栏/统计卡/表格/分页）
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-verify-profile';
const PORT = 9771;
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/';
const SITE = 'https://web.jk93.qzz.io/';

const edge = spawn(EDGE, [
  `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',
  '--headless=new',
  '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitPort(secs = 30) {
  for (let i = 0; i < secs; i++) {
    await sleep(1000);
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch {}
  }
  return false;
}

let browser = null;
try {
  if (!(await waitPort())) throw new Error('调试端口未开启');
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1600, height: 950 } });
  const page = (await browser.pages())[0] || (await browser.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));

  // ---------- 1. 登录页 ----------
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const login = await page.evaluate(() => {
    const card = document.querySelector('.lg-card');
    const logo = document.querySelector('.lg-logo');
    const btn = document.querySelector('.lg-submit');
    const cap = document.querySelector('.lg-captcha-img img');
    const cs = card ? getComputedStyle(card) : null;
    return {
      hasCard: !!card,
      cardWidth: cs?.width,
      logoLoaded: logo ? logo.naturalWidth > 0 : false,
      logoW: logo?.naturalWidth || 0,
      btnText: btn?.textContent?.trim(),
      btnBg: btn ? getComputedStyle(btn).backgroundColor : null,
      hasCaptchaImg: !!cap,
      captchaSrc: (cap?.getAttribute('src') || '').slice(0, 40),
      bg: getComputedStyle(document.querySelector('.lg-root')).backgroundImage.slice(0, 60),
      inputs: [...document.querySelectorAll('.lg-bottom input')].map((i) => i.placeholder),
    };
  });
  console.log('【登录页】', JSON.stringify(login, null, 1));
  await page.screenshot({ path: OUT + '.tmp-pc-login.png' });

  // ---------- 2. 注入会话进后台 ----------
  await page.evaluate(() => {
    localStorage.setItem('youpin_session', JSON.stringify({ username: 'chenmeilong', displayName: '陈美龙', loginAt: Date.now() }));
    localStorage.setItem('youpin_display_name', '陈美龙');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep
  ;
  await sleep(3500);
  const shell = await page.evaluate(() => {
    const side = document.querySelector('.d-sidebar');
    const nav = [...document.querySelectorAll('.d-nav-item')];
    const stats = [...document.querySelectorAll('.pc-stat')];
    const panel = document.querySelector('.pc-panel');
    const table = document.querySelector('.pc-table');
    return {
      sidebarWidth: side ? getComputedStyle(side).width : null,
      topbarHeight: document.querySelector('.d-topbar') ? getComputedStyle(document.querySelector('.d-topbar')).height : null,
      navCount: nav.length,
      navLabels: nav.slice(0, 6).map((n) => n.innerText.trim()),
      title: document.querySelector('.pc-title')?.textContent,
      crumb: document.querySelector('.pc-crumb')?.textContent,
      statCount: stats.length,
      statValues: stats.map((s) => s.querySelector('.pc-stat-value')?.textContent),
      hasPanel: !!panel,
      hasTable: !!table,
      tableCols: [...document.querySelectorAll('.pc-table thead th')].map((t) => t.innerText.trim()),
      rowCount: document.querySelectorAll('.pc-table tbody tr').length,
      hasPager: !!document.querySelector('.pc-pager'),
      contentBg: getComputedStyle(document.querySelector('.d-content')).backgroundColor,
      quickCount: document.querySelectorAll('.pc-quick-item').length,
    };
  });
  console.log('【后台-工作台】', JSON.stringify(shell, null, 1));
  await page.screenshot({ path: OUT + '.tmp-pc-home.png' });

  // ---------- 3. 打开一个子页面（客户联系人） ----------
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.d-nav-group')];
    const g = items.find((i) => i.textContent.includes('客户业务'));
    if (g) g.click();
  });
  await sleep(600);
  await page.evaluate(() => {
    const it = [...document.querySelectorAll('.d-nav-item')].find((n) => n.innerText.includes('客户联系人'));
    if (it) it.click();
  });
  await sleep(3000);
  const sub = await page.evaluate(() => ({
    title: document.querySelector('.pc-title')?.textContent,
    crumb: document.querySelector('.pc-crumb')?.textContent,
    cols: [...document.querySelectorAll('.pc-table thead th')].map((t) => t.innerText.trim()),
    rows: document.querySelectorAll('.pc-table tbody tr').length,
    firstRow: [...document.querySelectorAll('.pc-table tbody tr')][0]?.innerText.replace(/\s+/g, ' ').slice(0, 60),
    hasSearch: !!document.querySelector('.pc-input'),
    pager: document.querySelector('.pc-pager')?.innerText.replace(/\s+/g, ' '),
  }));
  console.log('【后台-客户联系人】', JSON.stringify(sub, null, 1));
  await page.screenshot({ path: OUT + '.tmp-pc-sub.png' });

  console.log('页面错误:', errors.length ? errors : '无');
} catch (e) {
  console.log('错误:', String(e.message).slice(0, 200));
} finally {
  if (browser) await browser.disconnect().catch(() => {});
  try { edge.kill('SIGKILL'); } catch {}
}
