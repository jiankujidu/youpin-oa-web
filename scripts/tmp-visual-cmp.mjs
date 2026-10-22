/** 视觉对比：原站 vs 我们（pages.dev），同视口截图供逐像素核对 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = '9777';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-cmp-profile';
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/';
const SID = process.env.SID || '4e34f5357794b5f34efd948e91d97c79';
const OURS = process.env.OURS || 'https://youpin-oa.pages.dev/';

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
  await page.setCookie({ name: 'PHPSESSID', value: SID, domain: '.oa.upingbio.com', path: '/' });

  // 1) 原站主框架（首页）
  await page.goto('https://oa.upingbio.com/home/index/index', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2500);
  await page.screenshot({ path: `${OUT}.tmp-cmp-origin-home.png` });
  console.log('origin-home done');

  // 2) 我们的首页
  await page.goto(OURS, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3500);
  await page.screenshot({ path: `${OUT}.tmp-cmp-ours-home.png` });
  console.log('ours-home done');

  // 3) 原站客户列表
  await page.goto('https://oa.upingbio.com/customer/index/index', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2500);
  await page.screenshot({ path: `${OUT}.tmp-cmp-origin-customer.png` });
  console.log('origin-customer done');

  // 4) 我们的客户列表（点侧栏菜单）
  await page.goto(OURS, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.d-nav-item')];
    items.find((i) => i.textContent.includes('客户列表'))?.click();
  });
  await sleep(3500);
  await page.screenshot({ path: `${OUT}.tmp-cmp-ours-customer.png` });
  console.log('ours-customer done');

  // 5) 原站登录页（用户第一眼）
  await page.goto('https://oa.upingbio.com/home/login/index', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}.tmp-cmp-origin-login.png` });

  // 6) 我们的登录页
  await page.goto(OURS, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2000);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.screenshot({ path: `${OUT}.tmp-cmp-ours-login.png` });
  console.log('login pages done');

  await browser.disconnect();
  edge.kill();
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
