/**
 * 产品列表列顺序 / 首屏可见性 / 独立勾选列（勾线）验证
 * 用法：node scripts/verify-product-cols.mjs [baseUrl]
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://web.jk93.qzz.io';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 多页签保活：DOM 里有多张 .pc-table，只取当前可见的那张 */
const VIS = `(() => Array.from(document.querySelectorAll('.pc-table-wrap')).find((w) => w.offsetParent !== null && w.getBoundingClientRect().width > 200))()`;

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const out = {};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });
  await page.setCacheEnabled(false);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  await page.goto(BASE + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3000);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(600);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="product"]')?.click());
  await waitTable(page);

  out.heads = await page.evaluate(
    (v) => Array.from(eval(v).querySelectorAll('thead th')).map((t) => (t.textContent || '').trim()),
    VIS,
  );

  /** 独立勾选列（勾线）：整行一个复选框，最左常驻；货号列内不得有复选框 */
  out.firstColCbPerRow = await page.evaluate((v) => {
    const rows = Array.from(eval(v).querySelectorAll('tbody tr'));
    return rows.map((tr) => tr.querySelector('td').querySelectorAll('input[type="checkbox"]').length);
  }, VIS);
  out.goodsColCbCount = await page.evaluate((v) => {
    const rows = Array.from(eval(v).querySelectorAll('tbody tr'));
    return rows.reduce(
      (s, tr) => s + (tr.querySelectorAll('td')[1]?.querySelectorAll('input[type="checkbox"]').length || 0),
      0,
    );
  }, VIS);
  out.headCheckbox = await page.evaluate((v) => !!eval(v).querySelector('thead th:first-child input[type="checkbox"]'), VIS);

  /* 多变体行：含多个货号的产品，整行仍只有 1 个复选框 */
  out.multiGoodsRow = await page.evaluate((v) => {
    const rows = Array.from(eval(v).querySelectorAll('tbody tr'));
    for (const tr of rows) {
      const tds = tr.querySelectorAll('td');
      const no = tds[1] ? tds[1].querySelectorAll('.pc-goods-no').length : 0;
      const cb = tds[0].querySelectorAll('input[type="checkbox"]').length;
      if (no >= 2) return { noCount: no, rowCb: cb };
    }
    return { noCount: 0, rowCb: 0, note: '无多变体样本' };
  }, VIS);

  /* 列顺序 + 首屏可见性 */
  const KEY = 13; // 勾选 + 12 列业务列
  out.geometry = await page.evaluate((v) => {
    const wrap = eval(v);
    const ths = Array.from(wrap.querySelectorAll('thead th'));
    const wr = wrap.getBoundingClientRect();
    const opIdx = ths.findIndex((t) => (t.textContent || '').trim() === '操作');
    const opRect = opIdx >= 0 ? ths[opIdx].getBoundingClientRect() : null;
    const firstN = ths.slice(0, 13).map((t) => {
      const r = t.getBoundingClientRect();
      return { title: (t.textContent || '').trim(), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
    });
    return {
      wrapLeft: Math.round(wr.left),
      wrapWidth: Math.round(wr.width),
      scrollLeft: wrap.scrollLeft,
      scrollWidth: wrap.scrollWidth,
      keyCount: 13,
      firstN,
      firstRight: firstN.length ? firstN[firstN.length - 1].right : 0,
      opLeft: opRect ? Math.round(opRect.left) : null,
      opWidth: opRect ? Math.round(opRect.width) : null,
    };
  }, VIS);
  const g = out.geometry;
  out.keyColsVisible = !!g.opLeft && g.firstRight <= g.opLeft + 1 && (g.scrollLeft || 0) === 0;
  out.expectCols = ['', '产品货号/说明书', '产品标题', '种属', '应用', '价格明细', '基因名称', '方法学', '分子量', '来源', '定量/定性', '分类', '浓度点'];
  out.orderOk = out.expectCols.every((t, i) => (out.heads[i] || '') === t);

  /* 勾选行为：① 点第一行第一列复选框 → 选中 1 ② 点表头全选 → 全选 */
  await page.evaluate((v) => eval(v).querySelector('tbody tr td:first-child input[type="checkbox"]')?.click(), VIS);
  await sleep(400);
  out.afterPick = await page.evaluate((v) => ({
    selRows: eval(v).querySelectorAll('tbody tr.pc-row-sel').length,
    bar: (document.querySelector('.pc-fav-bar')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
  }), VIS);
  out.headState = await page.evaluate((v) => {
    const el = eval(v).querySelector('thead th:first-child input[type="checkbox"]');
    return el ? { checked: el.checked, indeterminate: el.indeterminate } : null;
  }, VIS);
  await page.evaluate((v) => eval(v).querySelector('thead th:first-child input[type="checkbox"]')?.click(), VIS);
  await sleep(500);
  out.afterAll = await page.evaluate((v) => ({
    selRows: eval(v).querySelectorAll('tbody tr.pc-row-sel').length,
    rows: eval(v).querySelectorAll('tbody tr').length,
    allChecked: Array.from(eval(v).querySelectorAll('tbody tr td:first-child input[type="checkbox"]')).every((i) => i.checked),
    bar: (document.querySelector('.pc-fav-bar')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
  }), VIS);

  // 行高体检：前 6 行内容高度
  out.rowHeights = await page.evaluate((v) => {
    const rows = Array.from(eval(v).querySelectorAll('tbody tr')).slice(0, 6);
    return rows.map((tr) => {
      const td = tr.querySelector('td');
      const inner = td?.firstElementChild;
      return { tr: Math.round(tr.getBoundingClientRect().height), content: inner ? Math.round(inner.getBoundingClientRect().height) : null };
    });
  }, VIS);

  await page.screenshot({ path: '.tmp-cols.png' });
  out.jsErrors = errs;
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
}

async function waitTable(p) {
  // 等到「真数据行」出现（首列复选框渲染出来），空态/加载中行不算
  await p.waitForSelector('.pc-table tbody tr', { timeout: 60000 });
  try {
    await p.waitForSelector('tbody tr td:first-child input[type="checkbox"]', { timeout: 60000 });
  } catch {
    /* 空数据时放行，由后续断言暴露 */
  }
  await sleep(1500);
}

fs.writeFileSync('.tmp-cols-result.json', JSON.stringify(out, null, 1));
