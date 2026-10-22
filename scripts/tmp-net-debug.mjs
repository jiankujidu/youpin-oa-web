/** 临时：网络级调试我们的首页（打印所有 /oa-proxy/ 请求状态） */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = '9779';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-cmp-profile';
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
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}` });
      break;
    } catch { await sleep(500); }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/oa-proxy/')) console.log(`[resp] ${r.status()} ${u.slice(0, 110)}`);
  });
  page.on('requestfailed', (r) => console.log(`[FAILED] ${r.url().slice(0, 110)} ${r.failure()?.errorText}`));
  await page.goto(OURS, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(6000);
  const loading = await page.evaluate(() => document.body.innerText.includes('加载中'));
  console.log('still loading:', loading);
  await browser.disconnect();
  edge.kill();
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
