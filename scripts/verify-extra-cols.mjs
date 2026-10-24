/**
 * 报价单附加属性列「没有不体现，有的一定要体现」验证（无头）
 *
 * 用户原话：「没有不体现，有的一定要体现」——
 * 在「报价单附加列」里勾了 方法学/基因名称/分子量/来源 后：
 *   · 本单所有产品该字段都为空（原站本来就没值）→ 这一列根本不出现
 *   · 至少一行有值（如方法学「间接两步法」）→ 这一列必须出现
 *   · 明细表展开的详情行：该行没值的属性项也不出现（不再是一片「—」）
 */
import fs from 'node:fs';
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

/** 种子收藏夹：item1 方法学有值（间接两步法），其余附加字段空；item2 全空 */
const SEED = () => {
  const item = (id, no, title, method) => ({
    id,
    productId: 'p-' + id,
    goods_no: no,
    title,
    cate: 'ELISA-普通ELISA',
    species: '人',
    application: '临床检验',
    method: method || '',
    gene: '',
    mw: '',
    source: '',
    prices: [{ spec: '96T', unit: '盒', dir: 200, dist: 120 }],
    specIndex: 0,
    priceType: 'dir',
    custom: 200,
    qty: 1,
    unit: '盒',
    discount: 100,
    note: '',
    sel: true,
    add_time: Date.now(),
  });
  localStorage.setItem(
    'youpin_quote_folders_v1',
    JSON.stringify([
      {
        id: 'f1',
        name: '默认收藏夹',
        parentId: null,
        create_time: Date.now(),
        items: [
          item('a1', 'YPG-0001', '马A型流感病毒抗体（EIVA Ab）ELISA试剂盒', '间接两步法'),
          item('a2', 'YPG-0002', '某蛋白检测试剂盒', ''),
        ],
      },
    ]),
  );
  localStorage.setItem('youpin_quote_docs_v1', '[]');
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });
  await page.setCacheEnabled(false);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('dialog', (d) => d.accept());

  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3500);
  await page.evaluate(SEED);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3500);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(400);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="quote"]')?.click());
  await sleep(2500);

  // ---- 1) 勾选全部 4 个附加列 + 备注 ----
  out.ticked = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    const want = ['方法学', '基因名称', '分子量', '来源', '备注'];
    const hit = [];
    for (const w of want) {
      const lb = labels.find((l) => (l.textContent || '').trim() === w);
      const cb = lb?.querySelector('input.pc-check');
      if (cb && !cb.checked) cb.click();
      hit.push(w + ':' + (cb ? (cb.checked ? 'on' : 'off') : 'n/a'));
    }
    return hit;
  });
  await sleep(800);

  // ---- 2) 明细表展开详情行：空值项不出现（切页签前先测） ----
  out.detailClicked = await page.evaluate(() => {
    const tr = document.querySelector('.q-table tbody tr');
    tr?.querySelector('.q-exp')?.click();
    return true;
  });
  await sleep(600);
  out.detailKvs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.q-detail-kv')).map((kv) => ({
      k: kv.querySelector('.k')?.textContent?.trim(),
      v: kv.querySelector('.v')?.textContent?.trim() ?? '(可编辑)',
    })),
  );
  out.detailHasDash = out.detailKvs.some((kv) => kv.v === '—');

  // ---- 3) 切到「报价单预览」页签 ----
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.q-tab2'));
    tabs.find((t) => (t.textContent || '').includes('报价单预览'))?.click();
  });
  await sleep(900);

  // ---- 4) 报价单预览（.q-sheet）表头：方法学在，基因名称/分子量/来源不在 ----
  out.sheetHeads = await page.evaluate(() => {
    const t = document.querySelector('.q-sheet table');
    return t ? Array.from(t.querySelectorAll('thead th')).map((y) => (y.textContent || '').trim()) : null;
  });

  // ---- 3) 预览表体：方法学列有值行显示「间接两步法」，无值行留空 ----
  out.sheetBody = await page.evaluate(() => {
    const t = document.querySelector('.q-sheet table');
    if (!t) return null;
    const heads = Array.from(t.querySelectorAll('thead th')).map((y) => (y.textContent || '').trim());
    const mi = heads.indexOf('方法学');
    const ni = heads.indexOf('产品名称');
    return Array.from(t.querySelectorAll('tbody tr')).map((tr) => {
      const td = Array.from(tr.querySelectorAll('td')).map((x) => (x.textContent || '').trim());
      return { title: ni >= 0 ? td[ni] : null, method: mi >= 0 ? td[mi] : null };
    });
  });

  await page.screenshot({ path: '.tmp-extra-cols.png' });
  out.jsErrors = errors;
} catch (e) {
  out.fatal = String(e).slice(0, 400);
} finally {
  await browser.close();
  fs.writeFileSync('.tmp-extra-cols.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
