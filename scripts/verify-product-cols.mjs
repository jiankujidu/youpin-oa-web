/**
 * 产品列表列顺序 / 首屏可见性 / 行勾选（无复选框列方案）验证
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

  out.geometry = await page.evaluate((v) => {
    const wrap = eval(v);
    const ths = Array.from(wrap.querySelectorAll('thead th'));
    const wr = wrap.getBoundingClientRect();
    const opIdx = ths.findIndex((t) => (t.textContent || '').trim() === '操作');
    const opRect = opIdx >= 0 ? ths[opIdx].getBoundingClientRect() : null;
    const first9 = ths.slice(0, 9).map((t) => {
      const r = t.getBoundingClientRect();
      return { title: (t.textContent || '').trim(), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
    });
    return {
      wrapLeft: Math.round(wr.left),
      wrapRight: Math.round(wr.right),
      wrapWidth: Math.round(wr.width),
      scrollLeft: wrap.scrollLeft,
      scrollWidth: wrap.scrollWidth,
      first9,
      first9Right: first9.length ? first9[first9.length - 1].right : 0,
      opLeft: opRect ? Math.round(opRect.left) : null,
      opWidth: opRect ? Math.round(opRect.width) : null,
    };
  }, VIS);
  /** 首屏可见判定：第 9 列右边界 ≤ 操作列左边界（右冻结列不遮挡） */
  const g = out.geometry;
  out.nineColsVisible = !!g.opLeft && g.first9Right <= g.opLeft + 1;

  // 行勾选：hover 第一行（真实鼠标移动），检查行首圆点是否显形
  const rowBox = await page.evaluate((v) => {
    const tr = eval(v).querySelector('tbody tr');
    const r = tr.getBoundingClientRect();
    return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) };
  }, VIS);
  await page.mouse.move(rowBox.x, rowBox.y);
  await sleep(400);
  out.pickVisible = await page.evaluate((v) => {
    const p = eval(v).querySelector('tbody tr .pc-row-pick');
    if (!p) return null;
    const cs = getComputedStyle(p);
    return { opacity: cs.opacity, w: Math.round(p.getBoundingClientRect().width) };
  }, VIS);
  await page.evaluate((v) => eval(v).querySelector('tbody tr .pc-row-pick')?.click(), VIS);
  await sleep(400);
  out.afterPick = await page.evaluate((v) => ({
    selRows: eval(v).querySelectorAll('tbody tr.pc-row-sel').length,
    favBar: (document.querySelector('.pc-fav-bar')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
  }), VIS);

  // 表头全选圆点
  await page.evaluate((v) => eval(v).querySelector('.pc-pick-all')?.click(), VIS);
  await sleep(500);
  out.afterAll = await page.evaluate((v) => ({
    selRows: eval(v).querySelectorAll('tbody tr.pc-row-sel').length,
    bar: (document.querySelector('.pc-fav-bar')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
  }), VIS);

  await page.screenshot({ path: '.tmp-cols.png' });
  out.jsErrors = errs;
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
}

async function waitTable(p) {
  await p.waitForSelector('.pc-table tbody tr', { timeout: 60000 });
  await sleep(1500);
}

fs.writeFileSync('.tmp-cols-result.json', JSON.stringify(out, null, 1));
