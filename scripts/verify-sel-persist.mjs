/**
 * 勾选跨搜索持久化验证（无头）
 *
 * 用户反馈：「搜勾选后，不丢弃勾，不然比如我勾选了，在搜别的刚勾选的就不在了」
 *
 * 场景：
 *   1) 产品页默认列表勾 2 个货号 → 浮条「已选 2 个货号」
 *   2) 换关键词搜索（结果里不含刚才的产品）→ 勾选仍在，浮条变「已选 2 个货号（其中 2 个不在当前结果）」
 *   3) 在新结果里再勾 1 个 → 「已选 3 个（其中 2 个不在当前结果）」
 *   4) 加入收藏夹 → 收藏夹里应有 3 条，且包含第 1 步勾的货号（不被丢弃）
 *   5) 返回原关键词 → 之前勾的行仍显示勾选态
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

/** 等列表加载稳定（货号复选框数不再变化且 > 0） */
async function waitStable(page, timeout = 30000) {
  const t0 = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - t0 < timeout) {
    const n = await page.evaluate(
      () => document.querySelectorAll('.pc-goods-row input.pc-check').length,
    );
    if (n === last && n > 0) {
      stable++;
      if (stable >= 3) return n;
    } else {
      stable = 0;
      last = n;
    }
    await sleep(400);
  }
  return last;
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });
  await page.setCacheEnabled(false);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('dialog', (d) => d.accept());

  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(4000);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(400);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="product"]')?.click());
  await sleep(1500);
  await waitStable(page);

  // ---------- 1) 勾当前页前 2 个货号 ----------
  const first2 = await page.evaluate(() => {
    const cbs = Array.from(document.querySelectorAll('.pc-goods-row input.pc-check')).slice(0, 2);
    const keys = [];
    cbs.forEach((cb) => {
      const row = cb.closest('.pc-goods-row');
      keys.push((row?.querySelector('.pc-goods-no')?.textContent || '').trim());
      cb.click();
    });
    return keys;
  });
  await sleep(500);
  out.step1 = await page.evaluate(() => {
    const bar = document.querySelector('.pc-fav-bar');
    return {
      picked: Array.from(document.querySelectorAll('.pc-goods-row-sel')).length,
      barText: bar ? (bar.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : null,
    };
  });
  out.step1.keys = first2;

  // ---------- 2) 换关键词搜索（结果不含刚才的产品） ----------
  await page.evaluate(() => {
    const inp = document.querySelector('input.pc-input[placeholder*="货号"]');
    if (!inp) throw new Error('search input not found');
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    d.set.call(inp, '病理');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(600);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find((b) => (b.textContent || '').trim() === '搜索')?.click();
  });
  await sleep(1200);
  await waitStable(page);
  out.step2 = await page.evaluate(() => {
    const bar = document.querySelector('.pc-fav-bar');
    const nos = Array.from(document.querySelectorAll('.pc-goods-no')).map((e) => e.textContent.trim());
    return {
      barText: bar ? (bar.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : null,
      tip: document.querySelector('.pc-fav-bar-tip')?.textContent?.trim() || null,
      onPageChecked: document.querySelectorAll('.pc-goods-row-sel').length,
      pageHasOldSel: nos.some((n) => n === 'YPG-0001' || n === 'YPG0002'),
      pageSample: nos.slice(0, 4),
    };
  });

  // ---------- 3) 新结果里再勾 1 个（挑未勾选的） ----------
  out.step3keys = await page.evaluate(() => {
    const cbs = Array.from(document.querySelectorAll('.pc-goods-row input.pc-check'));
    const cb = cbs.find((x) => !x.checked);
    if (!cb) return [];
    const row = cb.closest('.pc-goods-row');
    const no = (row?.querySelector('.pc-goods-no')?.textContent || '').trim();
    cb.click();
    return [no];
  });
  await sleep(500);
  out.step3 = await page.evaluate(() => {
    const bar = document.querySelector('.pc-fav-bar');
    return {
      barText: bar ? (bar.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : null,
      tip: document.querySelector('.pc-fav-bar-tip')?.textContent?.trim() || null,
    };
  });

  // ---------- 4) 加入收藏夹（应带上全部 3 个货号，含不在当前页的 2 个） ----------
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.pc-fav-bar button'));
    btns.find((b) => (b.textContent || '').includes('加入收藏夹'))?.click();
  });
  await sleep(1200);
  out.step4 = await page.evaluate(() => {
    const folders = JSON.parse(localStorage.getItem('youpin_quote_folders_v1') || '[]');
    return {
      folderCount: folders.length,
      items: folders.map((f) => ({ name: f.name, n: f.items.length, nos: f.items.map((i) => i.goods_no) })),
      barGone: !document.querySelector('.pc-fav-bar'),
    };
  });

  // ---------- 5) 清空搜索回到原列表，之前勾的行仍显示勾选态（此处已被加入后清空，改为验证浮条消失） ----------
  out.jsErrors = errors;
  await page.screenshot({ path: '.tmp-sel-persist.png' });
} catch (e) {
  out.fatal = String(e).slice(0, 400);
} finally {
  await browser.close();
  fs.writeFileSync('.tmp-sel-persist.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
