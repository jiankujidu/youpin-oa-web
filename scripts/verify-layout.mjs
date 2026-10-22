/** 数值化 1:1 核对：抽取本地构建产物的关键计算样式，与实测原站令牌对比 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-verify-profile';
const PORT = 9777;
const LOCAL = process.env.LOCAL_BASE || 'http://127.0.0.1:5199/';

const EXPECT = {
  '.d-topbar': { height: '50px', backgroundColor: 'rgb(255, 255, 255)' },
  '.d-sidebar': { width: '180px', backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(50, 50, 50)' },
  '.d-page-tab.is-active, .d-page-tab.active': { height: '42px' },
  '.d-page-tab.is-active': { borderTopColor: 'rgb(26, 117, 255)' },
};

const edge = spawn(EDGE, [
  `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',
  '--headless=new',
  '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let browser;
  for (let i = 0; i < 40; i++) {
    try {
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1440, height: 900 } });
      break;
    } catch { await sleep(500); }
  }
  if (!browser) { console.log('EDGE_LAUNCH_FAIL'); edge.kill(); process.exit(1); }

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(LOCAL, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForSelector('.d-sidebar', { timeout: 15000 }).catch(() => {});
  await sleep(3500);

  const metrics = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        exists: true,
        height: s.height, width: s.width,
        backgroundColor: s.backgroundColor,
        color: s.color,
        borderTopColor: s.borderTopColor,
        childCount: el.children.length,
      };
    };
    // 主动标签：优先 .active/.is-active，否则取第一个 tab
    let active = document.querySelector('.d-page-tab.active, .d-page-tab.is-active');
    if (!active) active = document.querySelector('.d-page-tab');
    const activeStyle = active ? getComputedStyle(active) : null;
    return {
      topbar: pick('.d-topbar'),
      sidebar: pick('.d-sidebar'),
      pageTab: activeStyle ? {
        exists: true, height: activeStyle.height,
        borderTopColor: activeStyle.borderTopColor,
      } : null,
      navItems: document.querySelectorAll('.d-nav-item').length,
      tabs: document.querySelectorAll('.d-page-tab').length,
      bodyText: (document.body.innerText || '').slice(0, 200),
    };
  });

  console.log('METRICS=' + JSON.stringify(metrics, null, 2));
  console.log('PAGE_ERRORS=' + JSON.stringify(errors.slice(0, 10)));

  // 断言
  const checks = [];
  const c = (name, got, exp) => checks.push({ name, got, exp, pass: got === exp });
  if (metrics.topbar) c('topbar.height', metrics.topbar.height, '50px');
  if (metrics.sidebar) {
    c('sidebar.width', metrics.sidebar.width, '180px');
    c('sidebar.bg', metrics.sidebar.backgroundColor, 'rgb(255, 255, 255)');
    c('sidebar.color', metrics.sidebar.color, 'rgb(50, 50, 50)');
  }
  if (metrics.pageTab) {
    c('pageTab.height', metrics.pageTab.height, '42px');
    c('pageTab.borderTop', metrics.pageTab.borderTopColor, 'rgb(26, 117, 255)');
  }
  console.log('CHECKS=' + JSON.stringify(checks, null, 2));

  await browser.disconnect();
  edge.kill();
  const failed = checks.filter((x) => !x.pass);
  process.exit(failed.length || errors.length ? 2 : 0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
