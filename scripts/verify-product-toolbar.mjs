// 验证产品页工具栏（原站 12 按钮）/ 筛选栏（两行 9 项）/ 分页条 与原站一致
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'https://web.jk93.qzz.io';
const PORT = 9851;
const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-verifyprodcols`,
  `--remote-debugging-port=${PORT}`, '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXPECT_TOOLBAR = [
  '+ 添加产品', '批量导入(同步)', '批量导入(异步)', '批量更新(异步)', '批量下架', '批量上架',
  '导出产品(csv)', '导出选中行数据(0)', '批量生成UP说明书', '导入(异步)&UP说明书',
  '导出产品(说明书下载量排行榜)',
];
const EXPECT_FILTERS = ['产品分类', '种属', '应用', '请选择状态', '选择时间区间', '产品标题', '基因名称', '其他别称', '货号/其他别称/基因名称/产品标题/产品代码'];

(async () => {
  let b;
  for (let i = 0; i < 40; i++) {
    try { b = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1680, height: 1000 } }); break; }
    catch { await sleep(500); }
  }
  const page = await b.newPage();
  await page.setViewport({ width: 1680, height: 1000 });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);
  // 展开侧栏「产品管理」分组后点「产品列表」
  await page.evaluate(() => {
    const parents = [...document.querySelectorAll('.d-nav-parent')];
    const p = parents.find((x) => x.textContent.includes('产品管理'));
    p?.click();
  });
  await sleep(600);
  await page.evaluate(() => {
    document.querySelector('.d-nav-item[data-key="product"]')?.click();
  });
  // 等表格行
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('.pc-table tbody tr').length);
    if (n > 0) break;
    await sleep(1000);
  }
  await sleep(2500);

  const info = await page.evaluate((EXP_TB, EXP_FL) => {
    const tb = [...document.querySelectorAll('.pc-actions button')].map((x) => x.textContent.trim());
    const fl = [...document.querySelectorAll('.pc-toolbar input, .pc-toolbar select')].map((x) => x.getAttribute('placeholder') || (x.tagName === 'SELECT' ? x.options[x.selectedIndex]?.text : ''));
    const hasFuzzy = [...document.querySelectorAll('.pc-toolbar button')].some((x) => x.textContent.trim() === '模糊');
    const hasClear = [...document.querySelectorAll('.pc-toolbar button')].some((x) => x.textContent.trim() === '清空');
    // 分页条
    const pgText = [...document.querySelectorAll('.pc-pager')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
    const pgBtns = [...document.querySelectorAll('.pc-pager button, .pc-pager input, .pc-pager select, .pc-pager a')].map((x) => x.textContent.trim()).slice(0, 30);
    return {
      toolbar: tb,
      toolbarOk: EXP_TB.every((t) => tb.some((x) => x.includes(t))),
      filters: fl,
      filtersOk: EXP_FL.every((t) => fl.some((x) => (x || '').includes(t))),
      hasFuzzy, hasClear,
      pgText: pgText.slice(0, 220), pgBtns: pgBtns.slice(0, 25),
    };
  }, EXPECT_TOOLBAR, EXPECT_FILTERS);
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-prodcols.png' });
  await b.disconnect();
  edge.kill();
})().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
