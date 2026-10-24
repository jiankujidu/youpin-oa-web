/**
 * 报价页新版式交互验证（无头）——2026-10-24 表格/侧栏重设计回归
 * 1) 主行 9 列（勾选/货号/产品名称/规格/取价/报价/数量/小计/操作）
 * 2) 行点击/箭头展开详情行（序号/种属/应用场景/计价方式/目录价/所属夹平铺）
 * 3) 详情行内可编辑（计价方式/折扣/备注）并落库
 * 4) 侧栏：新建子夹 / 重命名 / 删除 / 删除当前夹后自动回退 / 计数 pill
 * 5) 经销商模式详情行出现「经销价(底价)」；JS 零错误；截图 .tmp-quote-detail.png
 * 用法：node scripts/verify-quote-layout.mjs [baseUrl]
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://youpin-oa.pages.dev';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  // 无头下自动接受 confirm（删除收藏夹等），避免阻塞页面线程
  page.on('dialog', (d) => d.accept());

  // 种子数据（与 tmp-quote-shot 相同）
  await page.goto(BASE + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(2500);
  await page.evaluate(() => {
    const mk = (id, name, parentId, items) => ({ id, name, parentId, items, create_time: Date.now() });
    const item = (no, title, cate, species, application, spec, dir, dist, qty, note, sel) => ({
      id: 'it-' + no, productId: 'p-' + no, goods_no: no, title, cate,
      species, application, method: 'ELISA', gene: 'IFN-γ', mw: '15.8 kDa', source: '原核表达',
      prices: [{ spec, unit: '盒', dir, dist }, { spec: spec + '（大包装）', unit: '盒', dir: dir * 5, dist: dist * 5 }],
      specIndex: 0, priceType: 'dir', custom: dir, qty, unit: '盒', discount: 100, note, sel: !!sel,
    });
    const folders = [
      mk('f1', '默认收藏夹', null, [
        item('YPG-0001', '马A型流感病毒抗体（EIVA Ab）ELISA试剂盒', 'ELISA-普通ELISA', '马', '兽医学检测', '96T', 200, 120, 1, '', true),
        item('BYHS91888', '人白介素-6（IL-6）ELISA试剂盒', 'ELISA-普通ELISA', '人', '临床检验', '96T', 680, 420, 2, '含税票', true),
      ]),
      mk('f1s1', '流感项目', 'f1', [
        item('SM91888', '猪流感病毒H1N1抗体检测试剂盒', 'ELISA-普通ELISA', '猪', '兽医学检测', '96T', 450, 280, 3, '', false),
      ]),
    ];
    localStorage.setItem('youpin_quote_folders_v1', JSON.stringify(folders));
    localStorage.setItem('youpin_quote_docs_v1', JSON.stringify([]));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(2800);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(500);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="quote"]')?.click());
  await sleep(2500);

  // ---- 1) 主行列结构 ----
  out.mainCols = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.q-table thead th')).map((th) => (th.textContent || '').trim()),
  );
  out.rowCount = await page.evaluate(() => document.querySelectorAll('.q-table tbody tr.q-row').length);
  out.detailRowsBefore = await page.evaluate(() => document.querySelectorAll('.q-table tbody tr.q-detail').length);
  out.selectedRows = await page.evaluate(() => document.querySelectorAll('.q-table tbody tr.q-row.on').length);

  // ---- 2) 点击第 1 行（空白处）展开详情 ----
  await page.evaluate(() => {
    const tr = document.querySelector('.q-table tbody tr.q-row');
    const td = tr.querySelectorAll('td')[2]; // 产品名称列
    td.click();
  });
  await sleep(400);
  out.detailKvs = await page.evaluate(() => {
    const d = document.querySelector('.q-table tbody tr.q-detail');
    if (!d) return null;
    return Array.from(d.querySelectorAll('.q-detail-kv')).map((kv) => {
      const k = kv.querySelector('.k')?.textContent.trim();
      const v = kv.querySelector('.v')?.textContent.trim();
      const inp = kv.querySelector('input');
      return inp ? `${k}=<input:${inp.value}>` : `${k}=${v}`;
    });
  });
  out.arrowOpen = await page.evaluate(() => !!document.querySelector('.q-exp.open'));

  // ---- 3) 详情行内改计价方式 → 存档同步 ----
  out.unitEdit = await page.evaluate(() => {
    const d = document.querySelector('.q-table tbody tr.q-detail');
    const inp = d.querySelector('.q-detail-inp:not(.r)');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '支');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return inp.value;
  });
  await sleep(400);
  out.unitStored = await page.evaluate(() => {
    const f = JSON.parse(localStorage.getItem('youpin_quote_folders_v1') || '[]');
    return f[0].items[0].unit;
  });

  // ---- 4) 箭头再点收起 ----
  await page.evaluate(() => document.querySelector('.q-exp')?.click());
  await sleep(300);
  out.detailRowsAfterCollapse = await page.evaluate(() => document.querySelectorAll('.q-table tbody tr.q-detail').length);

  // ---- 5) 侧栏：新建子夹（点根夹 ＋） ----
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.q-node')).find((n) => (n.textContent || '').includes('默认收藏夹'));
    row.querySelectorAll('.q-node-op')[0].click(); // ＋
  });
  await sleep(300);
  await page.keyboard.type('季度促销');
  await sleep(200);
  await page.keyboard.press('Enter');
  await sleep(500);
  out.folderTree = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.q-node-name')).map((e) => e.textContent.trim()),
  );
  out.childIndent = await page.evaluate(() => {
    const child = Array.from(document.querySelectorAll('.q-node')).find((n) => (n.textContent || '').includes('季度促销'));
    return child ? child.className : null;
  });

  // ---- 6) 重命名（✎ → 输入新名 → Enter） ----
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.q-node')).find((n) => (n.textContent || '').includes('季度促销'));
    row.querySelectorAll('.q-node-op')[1].click(); // ✎
  });
  await sleep(300);
  await page.evaluate(() => {
    const inp = document.querySelector('.q-name-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '季度促销清单');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.keyboard.press('Enter');
  await sleep(500);
  out.afterRename = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.q-node-name')).map((e) => e.textContent.trim()),
  );

  // ---- 7) 删除子夹（✕ → confirm，已由 dialog 监听自动接受） ----
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.q-node')).find((n) => (n.textContent || '').includes('季度促销清单'));
    row.querySelectorAll('.q-node-op')[2].click(); // ✕
  });
  await sleep(800);
  out.afterDelete = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.q-node-name')).map((e) => e.textContent.trim()),
  );

  // ---- 8) 截图：默认态 + 经销商模式（详情行展示经销价） ----
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.pc-btn')).filter((b) => (b.textContent || '').includes('经销商'));
    btns[0]?.click();
  });
  await sleep(600);
  await page.evaluate(() => {
    const tr = document.querySelector('.q-table tbody tr.q-row');
    tr.querySelectorAll('td')[2].click();
  });
  await sleep(500);
  await page.screenshot({ path: '.tmp-quote-detail.png' });
  out.detailKvsDealer = await page.evaluate(() => {
    const d = document.querySelector('.q-table tbody tr.q-detail');
    return d ? Array.from(d.querySelectorAll('.q-detail-kv .k')).map((e) => e.textContent.trim()) : null;
  });

  out.jsErrors = errors;
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
}
fs.writeFileSync('.tmp-quote-layout.json', JSON.stringify(out, null, 1));
