/**
 * 货号列「预览 / 下载」按钮：原站 vs 我们，逐元素对比计算样式与行为属性
 * 用法：node scripts/cmp-goods-btns.mjs [oursBase]
 */
import puppeteer from 'puppeteer-core';

const SID = process.env.OA_SID || '844affb982e3c939352619154584e3a5';
const OURS = process.argv[2] || 'https://web.jk93.qzz.io';
const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const PROPS = [
  'display',
  'height',
  'lineHeight',
  'fontSize',
  'fontWeight',
  'padding',
  'borderRadius',
  'backgroundColor',
  'color',
  'borderColor',
  'borderWidth',
  'cursor',
  'textAlign',
];

const dump = `(() => {
  const PROPS = ${JSON.stringify(PROPS)};
  const out = [];
  const els = Array.from(document.querySelectorAll('.pc-xs-btn, .layui-btn-xs, [class*="laytable-cell-1-0-1"] button, [class*="laytable-cell-1-0-1"] a'));
  for (const el of els.slice(0, 8)) {
    const cs = getComputedStyle(el);
    const o = { tag: el.tagName, text: (el.textContent || '').trim(), cls: el.className };
    for (const p of PROPS) o[p] = cs[p];
    o.href = el.getAttribute('href') || el.getAttribute('data-href') || '';
    o.download = el.getAttribute('download') || '';
    o.title = el.getAttribute('title') || '';
    out.push(o);
  }
  // 货号单元格整体结构（行数 = 变体数）
  const cell = document.querySelector('.pc-goods-cell, [class*="laytable-cell-1-0-1"]');
  const cellInfo = cell
    ? {
        cls: cell.className,
        text: (cell.textContent || '').trim().slice(0, 160),
        html: cell.innerHTML.slice(0, 700),
        childBlocks: Array.from(cell.children).map((c) => c.tagName + '.' + c.className),
      }
    : null;
  return { out, cellInfo };
})()`;



async function run() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    userDataDir: undefined,
  });
  const result = {};

  // ---------- 原站 ----------
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1680, height: 1000 });
    await page.setExtraHTTPHeaders({ Cookie: `PHPSESSID=${SID}` });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
    );
    await page.goto('https://oa.upingbio.com/product/index/list', { waitUntil: 'networkidle2', timeout: 120000 });
    await new Promise((r) => setTimeout(r, 4000));
    result.origin = await page.evaluate(dump);
    await page.close();
  }

  // ---------- 我们 ----------
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1680, height: 1000 });
    await page.setCacheEnabled(false);
    await page.goto(OURS + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise((r) => setTimeout(r, 3000));
    // 进入产品页：先展开侧栏「产品管理」分组，再点 data-key=product
    await page.evaluate(() => {
      document.querySelectorAll('.d-nav-parent').forEach((p) => {
        if ((p.textContent || '').includes('产品管理')) p.click();
      });
    });
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate(() => {
      document.querySelector('.d-nav-item[data-key="product"]')?.click();
    });
    await new Promise((r) => setTimeout(r, 7000));
    result.ours = await page.evaluate(dump);
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(result, null, 1));
}

run().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
