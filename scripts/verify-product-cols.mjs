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

  /* 批量选择模式：默认（关闭）货号列无复选框、干净；点「批量选择」后才出现整列复选框 + 表头全选 + 底部条 */
  out.defaultPickCount = await page.evaluate(
    (v) => eval(v).querySelectorAll('tbody tr .pc-goods-cell input[type="checkbox"]').length,
    VIS,
  );
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.pc-btn')).find((x) => (x.textContent || '').includes('批量选择'));
    if (b) b.click();
  });
  await sleep(500);
  out.afterOpenMode = await page.evaluate((v) => ({
    btn: (Array.from(document.querySelectorAll('.pc-btn')).find((x) => (x.textContent || '').includes('退出选择'))?.textContent || '').trim(),
    pickVisible: eval(v).querySelectorAll('tbody tr .pc-goods-cell input[type="checkbox"]').length,
    headPick: !!eval(v).querySelector('thead .pc-th-pick input[type="checkbox"]'),
  }), VIS);

  out.geometry = await page.evaluate((v) => {
    const wrap = eval(v);
    const ths = Array.from(wrap.querySelectorAll('thead th'));
    const wr = wrap.getBoundingClientRect();
    const opIdx = ths.findIndex((t) => (t.textContent || '').trim() === '操作');
    const opRect = opIdx >= 0 ? ths[opIdx].getBoundingClientRect() : null;
    const KEY = 12; // 首屏必须完整可见的列数
    const firstN = ths.slice(0, KEY).map((t) => {
      const r = t.getBoundingClientRect();
      return { title: (t.textContent || '').trim(), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
    });
    return {
      wrapLeft: Math.round(wr.left),
      wrapRight: Math.round(wr.right),
      wrapWidth: Math.round(wr.width),
      scrollLeft: wrap.scrollLeft,
      scrollWidth: wrap.scrollWidth,
      keyCount: KEY,
      first9: firstN,
      first9Right: firstN.length ? firstN[firstN.length - 1].right : 0,
      opLeft: opRect ? Math.round(opRect.left) : null,
      opWidth: opRect ? Math.round(opRect.width) : null,
    };
  }, VIS);
  /** 首屏可见判定：第 12 列右边界 ≤ 操作列左边界（右冻结列不遮挡），且横向未滚动 */
  const g = out.geometry;
  out.nineColsVisible = !!g.opLeft && g.first9Right <= g.opLeft + 1 && (g.scrollLeft || 0) === 0;
  out.expectCols = ['产品货号/说明书', '产品标题', '种属', '应用', '价格明细', '基因名称', '方法学', '分子量', '来源', '定量/定性', '分类', '浓度点'];
  out.orderOk = out.expectCols.every((t, i) => (out.heads[i] || '') === t);

  /* 行勾选（「勾选货号」方案）：
     ① 货号列内常驻复选框（不需要 hover 就看得见）② 点货号文字同样切换 ③ 表头全选（含半选态） */
  out.pickBox = await page.evaluate((v) => {
    const wrap = eval(v);
    const boxes = Array.from(wrap.querySelectorAll('tbody tr .pc-goods-cell input[type="checkbox"]'));
    if (!boxes.length) return null;
    const first = boxes[0];
    const r = first.getBoundingClientRect();
    const cs = getComputedStyle(first);
    const noEl = first.closest('td')?.querySelector('.pc-goods-no');
    return {
      count: boxes.length,
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.1 && r.width > 8,
      w: Math.round(r.width),
      inFirstCol: first.closest('td') === wrap.querySelector('tbody tr td'),
      noText: (noEl?.textContent || '').trim().slice(0, 24),
    };
  }, VIS);

  // ① 点第一个货号复选框
  await page.evaluate((v) => eval(v).querySelector('tbody tr .pc-goods-cell input[type="checkbox"]')?.click(), VIS);
  await sleep(400);
  out.afterPick = await page.evaluate((v) => ({
    selRows: eval(v).querySelectorAll('tbody tr.pc-row-sel').length,
    checkedBoxes: Array.from(eval(v).querySelectorAll('tbody tr .pc-goods-cell input[type="checkbox"]')).filter((i) => i.checked).length,
    favBar: (document.querySelector('.pc-fav-bar')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
  }), VIS);

  // ② 点第二行的货号文字（应勾选第 2 行）
  await page.evaluate((v) => {
    const tr = eval(v).querySelectorAll('tbody tr')[1];
    tr?.querySelector('.pc-goods-no')?.click();
  }, VIS);
  await sleep(400);
  out.afterClickNo = await page.evaluate((v) => ({
    selRows: eval(v).querySelectorAll('tbody tr.pc-row-sel').length,
    row2Checked: !!eval(v).querySelectorAll('tbody tr')[1]?.querySelector('input[type="checkbox"]')?.checked,
  }), VIS);

  // ③ 表头全选（先取消已选，再全选，验证半选态）
  out.headState = await page.evaluate((v) => {
    const el = eval(v).querySelector('thead .pc-th-pick input[type="checkbox"]');
    return el ? { checked: el.checked, indeterminate: el.indeterminate } : null;
  }, VIS);
  await page.evaluate((v) => eval(v).querySelector('thead .pc-th-pick input[type="checkbox"]')?.click(), VIS);
  await sleep(500);
  out.afterAll = await page.evaluate((v) => ({
    selRows: eval(v).querySelectorAll('tbody tr.pc-row-sel').length,
    rows: eval(v).querySelectorAll('tbody tr').length,
    allChecked: Array.from(eval(v).querySelectorAll('tbody tr input[type="checkbox"]')).every((i) => i.checked),
    bar: (document.querySelector('.pc-fav-bar')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
  }), VIS);

  // 行高体检：flex 化货号列后行高不应被撑高（前 6 行）
  out.rowHeights = await page.evaluate((v) => {
    const rows = Array.from(eval(v).querySelectorAll('tbody tr')).slice(0, 6);
    return rows.map((tr) => {
      const td = tr.querySelector('td');
      const inner = td?.firstElementChild;
      return {
        tr: Math.round(tr.getBoundingClientRect().height),
        content: inner ? Math.round(inner.getBoundingClientRect().height) : null,
      };
    });
  }, VIS);

  await page.screenshot({ path: '.tmp-cols.png' });
  out.jsErrors = errs;
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
}

async function waitTable(p) {
  // 等到「真数据行」出现（货号复选框渲染出来），空态/加载中行不算
  await p.waitForSelector('.pc-table tbody tr', { timeout: 60000 });
  try {
    await p.waitForSelector('tbody tr .pc-goods-cell input[type="checkbox"]', { timeout: 60000 });
  } catch {
    /* 空数据时放行，由后续断言暴露 */
  }
  await sleep(1500);
}

fs.writeFileSync('.tmp-cols-result.json', JSON.stringify(out, null, 1));
