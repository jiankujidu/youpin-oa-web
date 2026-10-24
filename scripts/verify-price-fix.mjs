/**
 * 价格自愈验证（无头 + 线上真实数据）
 *
 * 用户反馈：「你瞎识别的」——页面上出现「规格 — / 经销价 / 0 / ¥0.00」的行。
 *
 * 根因：收藏条目里存的 prices 是**旧解析器**的产物（当时不支持无标签/按样计价等写法），
 *      解析能力升级后，旧快照不会自动更新，于是页面一直显示空规格 + ¥0.00。
 *
 * 验证：
 *  1) 注入「旧存档」条目 A：prices=[] 但 priceRaw 是真实原文 → 进页面应**自动补齐**，显示规格与报价
 *  2) 注入「更旧存档」条目 B：prices=[] 且 priceRaw 为空 → 点「↻ 刷新价格(1)」应回原站重取并补齐
 *  3) 仍然无价的行必须显示红色「需询价」，不能静默当 ¥0.00
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://youpin-oa.pages.dev';
const EDGE =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const out = { base: BASE };

async function readRows(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.q-table tbody tr')).map((tr) => {
      const tds = Array.from(tr.querySelectorAll('td'));
      return {
        goods_no: tds[1]?.textContent?.trim() || '',
        spec: tds[3]?.querySelector('select')?.selectedOptions?.[0]?.textContent?.trim()
          || tds[3]?.textContent?.trim() || '',
        basis: tds[4]?.querySelector('select')?.value || '',
        quote: tds[5]?.querySelector('input')?.value || '',
        amount: tds[7]?.textContent?.trim() || '',
      };
    }),
  );
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });
  await page.setCacheEnabled(false);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('dialog', (d) => d.accept());

  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3000);

  // 种子：两条「旧存档」条目 —— 一条存了原站原文，一条连原文都没有
  await page.evaluate(() => {
    const mk = (id, no, title, priceRaw) => ({
      id,
      productId: 'p-' + id,
      goods_no: no,
      title,
      cate: '',
      species: '',
      application: '',
      method: '',
      gene: '',
      mw: '',
      source: '',
      prices: [],
      priceRaw,
      specIndex: 0,
      priceType: 'dir',
      custom: 0,
      qty: 1,
      unit: '盒',
      discount: 100,
      note: '',
      sel: true,
      docs: [],
      add_time: Date.now(),
    });
    localStorage.setItem(
      'youpin_quote_folders_v1',
      JSON.stringify([
        {
          id: 'f1',
          name: '价格自愈测试',
          parentId: null,
          create_time: Date.now(),
          items: [
            // A：旧解析器不支持的写法（当时解析为空），但原文完整 → 应自动补齐
            mk(
              'o1',
              'SM91888',
              '科研 人整合素α3(ITG α3)检测试剂盒',
              '规格：96T-目录价：3000元/经销价：1200元,规格：48T-目录价：2400元/经销价：1000元',
            ),
            // B：连原文都没有（更早的存档）→ 应靠「↻ 刷新价格」回原站重取
            mk('o2', 'RXTAN87948', '科研 猴抗S蛋白IgG抗体(SIgG)定性检测试剂盒', ''),
          ],
        },
      ]),
    );
    localStorage.setItem('youpin_quote_docs_v1', '[]');
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3000);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(400);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="quote"]')?.click());
  await sleep(3000);

  // ---- 1) 自动补齐（有原文）----
  await sleep(6000);
  out.rowsAfterAuto = await readRows(page);
  out.autoRefreshBtn = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('button'))
        .map((b) => (b.textContent || '').trim())
        .find((t) => t.includes('刷新价格')) || null,
  );

  // ---- 2) 手动刷新（无原文，回原站重取）----
  // 先注入一条「原站确实没有价格」的条目（货号不存在），验证它会显示红色「需询价」而不是 ¥0.00
  await page.evaluate(() => {
    const raw = localStorage.getItem('youpin_quote_folders_v1');
    const list = JSON.parse(raw || '[]');
    list[0].items.push({
      id: 'o3',
      productId: 'p-o3',
      goods_no: 'ZZZNOPE0002',
      title: '（测试）原站无价格的产品',
      cate: '',
      species: '',
      application: '',
      method: '',
      gene: '',
      mw: '',
      source: '',
      prices: [],
      priceRaw: '',
      specIndex: 0,
      priceType: 'dir',
      custom: 0,
      qty: 1,
      unit: '盒',
      discount: 100,
      note: '',
      sel: true,
      docs: [],
      add_time: Date.now(),
    });
    localStorage.setItem('youpin_quote_folders_v1', JSON.stringify(list));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3000);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(400);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="quote"]')?.click());
  await sleep(10000);
  out.rowsWithMissing = await readRows(page);
  out.needInquiryShown = out.rowsWithMissing.some((r) => r.spec.includes('需询价'));
  out.stillZero = out.rowsWithMissing.filter((r) => r.quote === '0').map((r) => r.goods_no);

  const clicked = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      (x.textContent || '').includes('刷新价格'),
    );
    if (!b) return false;
    b.click();
    return true;
  });
  out.clickedRefresh = clicked;
  if (clicked) {
    await sleep(12000);
    out.rowsAfterRefresh = await readRows(page);
    out.toast = await page.evaluate(
      () =>
        document.querySelector('.pc-toast, .toast, [class*="toast"]')?.textContent?.trim() || null,
    );
  }

  await page.screenshot({ path: '.tmp-price-fix.png' });
  out.jsErrors = errors;
} catch (e) {
  out.fatal = String(e).slice(0, 400);
} finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
