// 产品页 1:1 核对：列集合/列宽 vs 原站；冻结列滚动后仍可见；货号列变体与按钮；状态着色字号
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'https://web.jk93.qzz.io';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-verifyprodcols';

// 原站 product.html cols（顺序/标题/宽度）；「编号」列在原站源码里被注释掉，故不在此列
const ORIGIN = [
  ['产品货号/说明书', 300], ['状态', 66], ['分类', 150], ['价格明细', 200], ['产品标题', 250],
  ['种属', 100], ['应用', 100], ['基因名称', 100], ['其他别称', 100], ['分子量', 100],
  ['来源', 100], ['定量/定性', 100], ['种属英文名称', 100], ['方法学', 100], ['浓度点', 100],
  ['英文名称', 100], ['Tag', 100], ['表达系统', 100], ['产品代码', 100], ['属性', 80],
  ['下载量', 80], ['阅读权限范围', 100], ['操作', 150],
];

const edge = spawn(EDGE, [`--user-data-dir=${PROFILE}`, '--remote-debugging-port=9818', '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let browser;
  for (let i = 0; i < 30; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9818', defaultViewport: { width: 1680, height: 1000 } }); break; } catch { await sleep(500); }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message.slice(0, 300)));
  const prodReq = [];
  page.on('response', (res) => { if (res.url().includes('/product/index/list')) prodReq.push(`${res.status()} ${res.url().slice(0, 90)}`); });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(4500);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if (p.textContent.includes('产品管理') && p.querySelector('.d-nav-arrow')?.textContent?.includes('▸')) p.click();
    });
  });
  await sleep(600);
  await page.evaluate(() => { document.querySelector('.d-nav-item[data-key="product"]')?.click(); });
  await sleep(9000);

  const r = await page.evaluate((ORIGIN) => {
    const tables = [...document.querySelectorAll('table')].filter((t) => t.offsetParent !== null || t.getClientRects().length);
    let t = null, best = -1;
    for (const x of tables) { const n = x.querySelectorAll('tbody tr').length; if (n > best) { best = n; t = x; } }
    if (!t) return { ok: false, reason: 'no table' };
    const wrap = t.closest('.pc-table-wrap');
    const ths = [...t.querySelectorAll('thead th')];
    const heads = ths.map((x) => x.textContent.trim());
    const widths = ths.map((x) => Math.round(x.getBoundingClientRect().width));
    // 去掉勾选列（title 为空）后与原站逐列比对
    const dataIdx = heads.map((h, i) => [h, i]).filter(([h]) => h !== '');
    const mine = dataIdx.map(([h]) => h);
    const want = ORIGIN.map(([h]) => h);
    const colOk = JSON.stringify(mine) === JSON.stringify(want);
    const widthDiffs = [];
    dataIdx.forEach(([, i], k) => {
      const w = widths[i], ow = ORIGIN[k][1];
      if (Math.abs(w - ow) > 2) widthDiffs.push(`${ORIGIN[k][0]}: 我们${w} vs 原站${ow}`);
    });

    // 冻结列：横向滚动 600px 后，冻结单元格应仍完整落在 wrap 可见区内
    const before = wrap.scrollLeft;
    wrap.scrollLeft = 600;
    const wr = wrap.getBoundingClientRect();
    const frzInfo = [];
    ths.forEach((th, i) => {
      if (th.style.position === 'sticky') {
        const b = th.getBoundingClientRect();
        const side = th.style.left !== '' ? 'left' : 'right';
        frzInfo.push({ col: heads[i], side, visible: b.left >= wr.left - 1 && b.right <= wr.right + 1, offset: th.style.left || th.style.right });
      }
    });
    wrap.scrollLeft = before;

    // 首行货号单元格：变体数 + 预览/下载按钮数
    const firstRow = t.querySelector('tbody tr');
    const goodsTd = firstRow?.querySelectorAll('td')[1];
    const goods = {
      text: (goodsTd?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 130),
      variants: goodsTd ? goodsTd.querySelectorAll('.pc-goods-row').length : 0,
      previewBtns: goodsTd ? [...goodsTd.querySelectorAll('.gg-xs')].filter((b) => b.textContent.includes('预览')).length : 0,
      downloadBtns: goodsTd ? [...goodsTd.querySelectorAll('.gg-xs')].filter((b) => b.textContent.includes('下载')).length : 0,
    };
    // 操作列按钮（原站：复制/编辑/删除）
    const opTd = firstRow?.querySelectorAll('td')[firstRow.querySelectorAll('td').length - 1];
    const opBtns = opTd ? [...opTd.querySelectorAll('.gg-xs')].map((b) => b.textContent.trim()) : [];
    // 工具栏按钮（原站 #toolbarDemo）
    const toolbar = [...document.querySelectorAll('.pc-actions button')].map((b) => b.textContent.trim());
    // 状态列：字号 + 颜色
    const statusTd = firstRow?.querySelectorAll('td')[2];
    const stEl = statusTd?.querySelector('span');
    const status = stEl ? { text: stEl.textContent.trim(), color: getComputedStyle(stEl).color, fs: getComputedStyle(stEl).fontSize } : null;

    return {
      ok: true, rows: best, colCount: heads.length, colOk, widthDiffs,
      heads, frzInfo, goods, opBtns, toolbar, status,
      scrolls: wrap.scrollWidth > wrap.clientWidth + 2,
      maxThH: Math.max(...ths.map((x) => Math.round(x.getBoundingClientRect().height))),
    };
  }, ORIGIN);

  console.log(JSON.stringify(r, null, 1));
  console.log('PRODUCT API:', JSON.stringify(prodReq));
  console.log('JS ERRORS:', errs.length ? JSON.stringify(errs.slice(0, 6)) : 'none');
  await page.screenshot({ path: 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-prodcols.png' });
  await browser.disconnect();
  edge.kill();
})().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
