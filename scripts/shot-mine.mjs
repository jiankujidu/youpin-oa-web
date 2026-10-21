/** 截取本站点对齐原站后的效果，与 .tmp-origin-*.png 对照 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-shot3-profile';
const PORT = 9782;
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

async function main() {
  let browser;
  for (let i = 0; i < 30; i++) {
    try {
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1440, height: 900 } });
      break;
    } catch {
      await sleep(500);
    }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 首页（工作台）
  await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);
  await page.screenshot({ path: `${OUT}.tmp-mine-home.png` });
  console.log('home shot done');

  // 客户列表
  const rows = await page.evaluate(() => [...document.querySelectorAll('.d-nav-item')].map((e) => e.textContent.trim()));
  const target = rows.findIndex((t) => t === '客户列表');
  if (target >= 0) {
    await page.evaluate((i) => document.querySelectorAll('.d-nav-item')[i].click(), target);
    await sleep(4000);
    await page.screenshot({ path: `${OUT}.tmp-mine-customer.png` });
    console.log('customer shot done');
  } else {
    console.log('menu not found:', rows.join(' / '));
  }
  await browser.disconnect();
  edge.kill();
}
main().catch((e) => {
  console.error(e);
  edge.kill();
  process.exit(1);
});
