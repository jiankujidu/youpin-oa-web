/** 临时：整页截图我们的首页（验证两张活跃度图是否渲染） */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = '9778';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-fullshot-profile';
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/';
const OURS = process.env.OURS || 'https://web.jk93.qzz.io/';

const edge = spawn(EDGE, [
  `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let browser;
  for (let i = 0; i < 30; i++) {
    try {
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1440, height: 900 } });
      break;
    } catch { await sleep(500); }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto(OURS, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 等图表 canvas 真正渲染（main.html 服务端渲染最慢 ~9s）
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 3, { timeout: 40000 }).catch(() => console.log('warn: charts not rendered after 40s'));
  await sleep(1500);
  // 滚到底触发图表渲染后再回顶部整页截
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  // 不用 fullPage（会改变视口致 echarts canvas 被回收）：把视口拉高到整页高度再截
  const fullH = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
  await page.setViewport({ width: 1440, height: Math.min(fullH, 6000) });
  await sleep(1200); // 等图表 resize 重绘
  await page.screenshot({ path: `${OUT}.tmp-cmp-ours-home-full.png`, fullPage: false });
  console.log('full page done');
  // 图表数据落地检查
  const info = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height }));
    return { canvases };
  });
  console.log('canvases:', JSON.stringify(info.canvases));
  await browser.disconnect();
  edge.kill();
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
