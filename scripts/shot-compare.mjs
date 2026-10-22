/** 对比截图：本地 dist（serve-dist 托管）vs 原站，输出并排核对图 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-shot-profile2';
const PORT = 9776;
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/';
const SID = process.argv[2] || '';
const LOCAL = process.env.LOCAL_BASE || 'http://127.0.0.1:5199/';

const edge = spawn(EDGE, [
  `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',
  '--headless=new',
  '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 我们站点页面 = hash 路由? 看路由器:无 hash 则单页内 tab,截图默认 home */
const ours = [['ours-home', LOCAL]];
const origin = [['origin-home', 'https://oa.upingbio.com/home/index/main.html']];

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

  for (const [name, url] of [...ours, ...origin]) {
    try {
      if (SID && url.includes('oa.upingbio.com')) {
        await page.setCookie({ name: 'PHPSESSID', value: SID, domain: '.oa.upingbio.com', path: '/' });
      }
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(3000);
      await page.screenshot({ path: `${OUT}.tmp-cmp-${name}.png` });
      console.log('shot', name, '->', `${OUT}.tmp-cmp-${name}.png`);
    } catch (e) {
      console.log(name, 'ERR', e.message);
    }
  }
  await browser.disconnect();
  edge.kill();
}
main().catch((e) => {
  console.error(e);
  edge.kill();
  process.exit(1);
});
