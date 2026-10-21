/** 截取原站后台真实界面（带固定会话），用于 1:1 对齐 UI */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-shot-profile';
const PORT = 9775;
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/';
const SID = process.argv[2];

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
  await page.setCookie({ name: 'PHPSESSID', value: SID, domain: '.oa.upingbio.com', path: '/' });
  await page.setViewport({ width: 1440, height: 900 });

  const shots = [
    ['frame', 'https://oa.upingbio.com/home/index/index'],
    ['customer', 'https://oa.upingbio.com/customer/index/index'],
    ['product', 'https://oa.upingbio.com/product/index/list.html'],
  ];
  for (const [name, url] of shots) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(2500);
      await page.screenshot({ path: `${OUT}.tmp-origin-${name}.png` });
      const info = await page.evaluate(() => {
        const g = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return { w: Math.round(r.width), h: Math.round(r.height), bg: s.backgroundColor, color: s.color };
        };
        return {
          url: location.href,
          title: document.title,
          header: g('.layui-header'),
          logo: g('.layui-logo'),
          side: g('.layui-side'),
          sideMenu: g('.layui-side-menu'),
          body: g('.layui-body'),
          bodyBg: g('body')?.bg,
        };
      });
      console.log(name, JSON.stringify(info));
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
