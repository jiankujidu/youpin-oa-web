/**
 * 产品列表列顺序 / 首屏可见性 / 按货号勾选验证
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

  /* ---- 按货号勾选：复选框在货号列内、每个货号一个，与整行产品无关 ---- */
  out.goodsColCb = await page.evaluate((v) => {
    const rows = Array.from(eval(v).querySelectorAll('tbody tr'));
    return rows.map((tr) => {
      const tds = tr.querySelectorAll('td');
      const no = tds[0].querySelectorAll('.pc-goods-no').length; // 该产品的货号变体数
      const cb = tds[0].querySelectorAll('input[type="checkbox"]').length; // 货号列内复选框数
      return { no, cb };
    });
  }, VIS);
  // 关键断言：每个货号各一个复选框（cb === no），多变体产品也不是 1 个
  out.cbPerVariantOk = out.goodsColCb.length > 0 && out.goodsColCb.every((x) => x.cb === x.no && x.no > 0);
  // 找出多变体样本，供行为验证
  out.multiVariantSample = out.goodsColCb.find((x) => x.no >= 2) || null;

  out.headCheckbox = await page.evaluate((v) => !!eval(v).querySelector('thead th:first-child input[type="checkbox"]'), VIS);

  /* ---- 列顺序 + 首屏可见性（12 业务列，无前置独立勾选列） ---- */
  out.geometry = await page.evaluate((v) => {
    const wrap = eval(v);
    const ths = Array.from(wrap.querySelectorAll('thead th'));
    const wr = wrap.getBoundingClientRect();
    const opIdx = ths.findIndex((t) => (t.textContent || '').trim() === '操作');
    const opRect = opIdx >= 0 ? ths[opIdx].getBoundingClientRect() : null;
    const firstN = ths.slice(0, 12).map((t) => {
      const r = t.getBoundingClientRect();
      return { title: (t.textContent || '').trim(), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
    });
    return {
      wrapLeft: Math.round(wr.left),
      wrapWidth: Math.round(wr.width),
      scrollLeft: wrap.scrollLeft,
      scrollWidth: wrap.scrollWidth,
      firstN,
      firstRight: firstN.length ? firstN[firstN.length - 1].right : 0,
      opLeft: opRect ? Math.round(opRect.left) : null,
      opWidth: opRect ? Math.round(opRect.width) : null,
    };
  }, VIS);
  const g = out.geometry;
  out.keyColsVisible = !!g.opLeft && g.firstRight <= g.opLeft + 1 && (g.scrollLeft || 0) === 0;
  out.expectCols = ['产品货号/说明书', '产品标题', '种属', '应用', '价格明细', '基因名称', '方法学', '分子量', '来源', '定量/定性', '分类', '浓度点'];
  out.orderOk = out.expectCols.every((t, i) => (out.heads[i] || '') === t);

  /* ---- 勾选行为 ----
     ① 勾第一个货号 → 只有该货号行高亮（pc-goods-row-sel=1）、浮条「已选 1 个货号」
     ② 勾多变体产品的第一个货号 → 该行内仅第一个变体高亮，第二个不变
     ③ 表头全选 → 所有货号全勾、浮条计数 = 本页货号总数 */
  await page.evaluate((v) => eval(v).querySelector('tbody tr td:first-child .pc-goods-row input[type="checkbox"]')?.click(), VIS);
  await sleep(400);
  out.afterPickOne = await page.evaluate((v) => ({
    selGoods: eval(v).querySelectorAll('tbody tr .pc-goods-row-sel').length,
    bar: (document.querySelector('.pc-fav-bar')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
  }), VIS);
  out.headStateAfterOne = await page.evaluate((v) => {
    const el = eval(v).querySelector('thead th:first-child input[type="checkbox"]');
    return el ? { checked: el.checked, indeterminate: el.indeterminate } : null;
  }, VIS);

  // 多变体行内只勾第一个变体：第二个变体不得高亮
  out.multiRowPartial = await page.evaluate((v) => {
    const rows = Array.from(eval(v).querySelectorAll('tbody tr'));
    for (const tr of rows) {
      const variants = Array.from(tr.querySelectorAll('.pc-goods-row'));
      if (variants.length >= 2) {
        return {
          total: variants.length,
          selInRow: variants.filter((x) => x.classList.contains('pc-goods-row-sel')).length,
        };
      }
    }
    return null;
  }, VIS);

  // 表头全选
  await page.evaluate((v) => eval(v).querySelector('thead th:first-child input[type="checkbox"]')?.click(), VIS);
  await sleep(500);
  out.afterAll = await page.evaluate((v) => {
    const w = eval(v);
    const cbs = Array.from(w.querySelectorAll('tbody tr .pc-goods-row input[type="checkbox"]'));
    return {
      variantCount: cbs.length,
      allChecked: cbs.length > 0 && cbs.every((i) => i.checked),
      selGoods: w.querySelectorAll('tbody tr .pc-goods-row-sel').length,
      bar: (document.querySelector('.pc-fav-bar')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    };
  }, VIS);
  // 全选后表头应回到全选态（非半选）
  out.headStateAll = await page.evaluate((v) => {
    const el = eval(v).querySelector('thead th:first-child input[type="checkbox"]');
    return el ? { checked: el.checked, indeterminate: el.indeterminate } : null;
  }, VIS);

  // 行高体检：前 6 行
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
  // 等到「真数据行」出现（货号列内复选框渲染出来），空态/加载中行不算
  await p.waitForSelector('.pc-table tbody tr', { timeout: 60000 });
  try {
    await p.waitForSelector('tbody tr .pc-goods-row input[type="checkbox"]', { timeout: 60000 });
  } catch {
    /* 空数据时放行，由后续断言暴露 */
  }
  await sleep(1500);
}

fs.writeFileSync('.tmp-cols-result.json', JSON.stringify(out, null, 1));
