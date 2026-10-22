/** 全量巡检：逐个点击侧栏菜单，统计每个页面的标题/列数/行数/分页/首行，抓 JS 错误 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = process.env.DBG || '9791';
const BASE = process.env.BASE || 'https://web.jk93.qzz.io/';
const WAIT = Number(process.env.WAIT || 9000);

const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-audit-profile-${PORT}`,
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
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));

const items = await page.evaluate(() =>
  [...document.querySelectorAll('.d-nav-item')]
    .filter((e) => !e.classList.contains('d-nav-parent'))
    .map((e, i) => ({ i, label: e.textContent.trim() })),
);
console.log('菜单项:', items.map((x) => x.label).join(' / '));

const rows = [];
for (const it of items) {
  await page.evaluate((idx) => {
    const list = [...document.querySelectorAll('.d-nav-item')].filter((e) => !e.classList.contains('d-nav-parent'));
    list[idx]?.click();
  }, it.i);
  await new Promise((r) => setTimeout(r, WAIT));
  const info = await page.evaluate(() => {
    // 多页签保活：所有已开页签都挂在 DOM 里（隐藏的 display:none），必须限定统计范围到「可见」的那个页签包裹层
    const wrap = [...document.querySelectorAll('.d-wrap > div')].find((d) => !/display:\s*none/.test(d.getAttribute('style') || ''));
    const q = (sel) => (wrap ? wrap.querySelectorAll(sel) : []);
    const first3 = [...q('.pc-table tbody tr')][0]?.querySelectorAll('td') || [];
    return {
      title: (wrap?.querySelector('.pc-title')?.textContent || '').trim()
        || document.querySelector('.d-page-tab.on')?.textContent?.trim(),
      ths: [...q('.pc-table thead th')].map((t) => t.textContent.trim()),
      dataRows: [...q('.pc-table tbody tr')].filter(
        (tr) => !/暂无数据|没有数据|无数据/.test(tr.textContent),
      ).length,
      empty: !!wrap?.querySelector('.pc-empty, .pc-table-empty'),
      pager: (wrap?.querySelector('.pc-pager-info')?.textContent || '').trim(),
      loading: !!wrap?.querySelector('.pc-loading, .pc-spin'),
      first: [...first3].slice(0, 4).map((td) => td.textContent.trim().slice(0, 20)).join(' | '),
    };
  });
  rows.push({ label: it.label, ...info });
  const flag = info.dataRows === 0 ? '❌0行' : '✅';
  console.log(
    `${flag} ${it.label} | 列${info.ths.length} 行${info.dataRows} | ${info.pager} | ${info.first.slice(0, 80)}`,
  );
}

console.log('\n=== 汇总 ===');
console.log('页面数:', rows.length, '| 无数据页:', rows.filter((r) => r.dataRows === 0).map((r) => r.label).join(', ') || '无');
console.log('JS 错误:', errs.length ? errs.join(' ; ') : '无');
await browser.disconnect();
edge.kill();
