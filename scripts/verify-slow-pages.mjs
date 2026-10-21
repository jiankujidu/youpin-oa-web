/** 抽查慢接口页面：产品 / 附件 / 问答，等待更久后统计行数与列数 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = process.env.DBG || '9790';
const BASE = process.env.BASE || 'https://web.jk93.qzz.io/';

const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-slow-profile-${PORT}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

await new Promise((r) => setTimeout(r, 2500));
const browser = await puppeteer.connect({
  browserURL: `http://127.0.0.1:${PORT}`,
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));

async function gotoMenu(label) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll('.d-nav-item')].find((e) => e.textContent.trim() === t);
    if (el) el.click();
  }, label);
}

for (const [label, wait] of [['产品列表', 16000], ['附件管理', 16000], ['售前售后查询', 16000]]) {
  await gotoMenu(label);
  await new Promise((r) => setTimeout(r, wait));
  const info = await page.evaluate(() => ({
    title: document.querySelector('.pc-title')?.textContent?.trim(),
    desc: document.querySelector('.pc-desc')?.textContent?.trim(),
    ths: [...document.querySelectorAll('.pc-table thead th')].map((t) => t.textContent.trim()),
    rows: document.querySelectorAll('.pc-table tbody tr').length,
    pager: document.querySelector('.pc-pager-info')?.textContent?.trim(),
    first: [...(document.querySelectorAll('.pc-table tbody tr')[0]?.querySelectorAll('td') || [])]
      .slice(0, 5)
      .map((td) => td.textContent.trim().slice(0, 24))
      .join(' | '),
  }));
  console.log(`### ${label}: ${info.title} | ${info.desc}`);
  console.log('    列(' + info.ths.length + '):', info.ths.join(' / '));
  console.log('    行数:', info.rows, '| 分页:', info.pager);
  console.log('    首行:', info.first);
  await page.screenshot({ path: `C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-slow-${label}.png` });
}

console.log('JS 错误:', errs.length ? errs.join(' ; ') : '无');
await browser.disconnect();
edge.kill();
