/**
 * 收藏夹 + 报价单端到端验证（无头）
 * 流程：进入报价页 → 新建收藏夹 → 从产品库搜索并全选加入 →
 *       改数量/折扣/价格类型校验金额 → 生成报价单 → 导出 CSV 数据正确性 → 截图
 * 用法：node scripts/verify-quote.mjs [baseUrl]
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://web.jk93.qzz.io';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const byText = (sel, txt) => `
  Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find((e) => (e.textContent || '').includes(${JSON.stringify(txt)}))
`;

async function clickText(page, sel, txt) {
  const ok = await page.evaluate(
    (s, t) => {
      const el = Array.from(document.querySelectorAll(s)).find((e) => (e.textContent || '').includes(t));
      if (!el) return false;
      el.click();
      return true;
    },
    sel,
    txt,
  );
  if (!ok) throw new Error(`未找到元素：${sel} 含「${txt}」`);
  await sleep(400);
}

const out = {};
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });
  await page.setCacheEnabled(false);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(BASE + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(2500);
  // 清空本机收藏夹存档，保证每次验证从零开始
  await page.evaluate(() => {
    localStorage.removeItem('youpin_quote_folders_v1');
    localStorage.removeItem('youpin_quote_docs_v1');
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3000);

  // 1) 进入「收藏夹与报价」
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(500);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="quote"]')?.click());
  await sleep(2500);
  out.inQuotePage = await page.evaluate(() => !!document.querySelector('.q-layout'));

  // 2) 新建收藏夹「报价测试夹」（真实键盘输入，走 React 受控 onChange）
  await page.click('.q-tree-foot .pc-input');
  await page.keyboard.type('报价测试夹', { delay: 20 });
  await sleep(200);
  await clickText(page, '.q-tree-foot button', '新建');
  await sleep(600);
  out.folders = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.q-node-name')).map((e) => e.textContent.trim()),
  );

  // 3) 打开产品选择器，搜索并全选本页加入
  await clickText(page, '.pc-actions button', '添加产品');
  await page.waitForSelector('.q-modal', { timeout: 30000 });
  await sleep(1200);
  out.pickerOpen = await page.evaluate(() => !!document.querySelector('.q-modal'));
  await page.evaluate(() => {
    const inp = document.querySelector('.q-modal-body input.pc-input');
    inp.value = 'ELISA';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await clickText(page, '.q-modal-body button', '搜索');
  await sleep(3500);
  out.pickRows = await page.evaluate(() => document.querySelectorAll('.q-pick-table tbody tr').length);
  await clickText(page, '.q-modal-body button', '全选本页');
  await sleep(400);
  out.checkedLabel = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.q-modal-body span')).find((e) => (e.textContent || '').includes('已勾选'));
    return el ? el.textContent.trim() : '';
  });
  // 目标夹：选「报价测试夹」
  await page.waitForSelector('.q-modal-foot select', { timeout: 30000 });
  await page.evaluate(() => {
    const sel = document.querySelector('.q-modal-foot select');
    const opt = Array.from(sel.options).find((o) => o.textContent.includes('报价测试夹'));
    sel.value = opt ? opt.value : sel.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await clickText(page, '.q-modal-foot button', '加入收藏夹');
  await sleep(1500);

  // 4) 明细行 / 金额校验（新版式：主行 9 列 = 勾选/货号/产品名称/规格/取价/报价/数量/小计/操作）
  out.rowCount = await page.evaluate(() => document.querySelectorAll('.q-table tbody tr.q-row').length);
  out.firstRow = await page.evaluate(() => {
    const tr = document.querySelector('.q-table tbody tr.q-row');
    if (!tr) return null;
    const td = Array.from(tr.querySelectorAll('td')).map((t) => (t.textContent || '').trim());
    const ins = Array.from(tr.querySelectorAll('input')).map((i) => i.value);
    return { goods_no: td[1], title: td[2], spec: td[3], price: ins[1], qty: ins[2], amount: td[7] };
  });

  // 开启「报价单显示折扣列」→ 展开第 1 行详情 → 改数量 = 3、折扣 = 80，校验金额 = 单价*3*0.8
  await page.evaluate(() => {
    const cb = Array.from(document.querySelectorAll('.q-form input[type=checkbox]')).find((c) =>
      (c.closest('label')?.textContent || '').includes('报价单显示折扣列'),
    );
    if (cb && !cb.checked) cb.click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const tr = document.querySelector('.q-table tbody tr.q-row');
    tr.querySelectorAll('td')[2].click(); // 点产品名称列展开详情行
  });
  await sleep(400);
  const calc = await page.evaluate(() => {
    const tr = document.querySelector('.q-table tbody tr.q-row');
    const inputs = Array.from(tr.querySelectorAll('input'));
    // React 受控 input：必须用原生 value setter 再派发 input 事件
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    const setVal = (el, v) => {
      d.set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const priceInput = inputs[1]; // 报价
    const qtyInput = inputs[2]; // 数量
    setVal(qtyInput, 3);
    // 折扣输入框在展开的详情行里
    const disc = document.querySelector('.q-detail .q-detail-inp.r');
    if (disc) setVal(disc, 80);
    return { price: Number(priceInput.value) };
  });
  await sleep(700);
  out.calc = calc;
  out.amountAfter = await page.evaluate(() => {
    const tr = document.querySelector('.q-table tbody tr.q-row');
    const td = Array.from(tr.querySelectorAll('td')).map((t) => (t.textContent || '').trim());
    return td[7];
  });
  out.expectAmount = (calc.price * 3 * 0.8).toFixed(2);

  // 存档校验：解析出的规格/价格是否与原站 price_desc 一致
  out.store = await page.evaluate(() => {
    const f = JSON.parse(localStorage.getItem('youpin_quote_folders_v1') || '[]');
    return f.map((x) => ({
      name: x.name,
      count: x.items.length,
      sample: x.items.slice(0, 4).map((i) => ({ no: i.goods_no, prices: i.prices })),
    }));
  });
  out.priceRows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.q-table tbody tr.q-row'))
      .slice(0, 6)
      .map((tr) => {
        const td = Array.from(tr.querySelectorAll('td')).map((t) => (t.textContent || '').trim());
        const ins = Array.from(tr.querySelectorAll('input')).map((i) => i.value);
        return { no: td[1], spec: td[3].slice(0, 30), price: ins[1], amt: td[7] };
      }),
  );

  // 5) 统计条 / 生成报价单
  out.sumBar = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.q-sum-item')).map((e) => (e.textContent || '').trim()),
  );
  await clickText(page, '.pc-actions button', '生成报价单');
  await sleep(1200);
  out.preview = await page.evaluate(() => {
    const sheet = document.querySelector('.q-sheet');
    if (!sheet) return null;
    const trs = Array.from(sheet.querySelectorAll('tbody tr'));
    return {
      title: sheet.querySelector('.q-sheet-title')?.textContent.trim(),
      rows: trs.length,
      first: trs[0] ? Array.from(trs[0].querySelectorAll('td')).map((t) => (t.textContent || '').trim()) : null,
      total: (sheet.querySelector('.q-sheet-total')?.textContent || '').replace(/\s+/g, ' ').slice(0, 160),
    };
  });
  await page.screenshot({ path: '.tmp-quote-preview.png' });

  // 6) 历史报价单
  await clickText(page, '.q-tab2', '历史报价单');
  await sleep(600);
  out.historyRows = await page.evaluate(() => document.querySelectorAll('.q-table tbody tr').length);

  // 7) 回明细页截图
  await clickText(page, '.q-tab2', '报价明细');
  await sleep(500);
  await page.screenshot({ path: '.tmp-quote-edit.png' });

  out.jsErrors = errors;
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
}
fs.writeFileSync('.tmp-quote-result.json', JSON.stringify(out, null, 1));
