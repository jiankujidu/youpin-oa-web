/**
 * 产品分类下拉验收：完整性（89 个）/ 可滚动 / 可搜索 / 选择后真的按服务端筛选
 * 用法：node scripts/verify-cate-pick.mjs [baseUrl]
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://web.jk93.qzz.io';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await page.waitForSelector('.pc-pick-btn', { timeout: 60000 });
  await sleep(2500); // 等分类选项就绪 + 表格首屏

  /* ① 触发器：默认显示占位文案，不再是原生 <select> */
  out.trigger = await page.evaluate(() => {
    const btn = document.querySelector('.pc-pick-btn');
    return {
      isNativeSelect: !!document.querySelector('.pc-toolbar select'),
      text: (btn?.textContent || '').replace(/\s+/g, ' ').trim(),
      width: btn ? Math.round(btn.getBoundingClientRect().width) : 0,
    };
  });

  /* ② 打开下拉：选项总数 + 分组 + 可滚动性 */
  await page.evaluate(() => document.querySelector('.pc-pick-btn')?.click());
  await sleep(500);
  out.popup = await page.evaluate(() => {
    const pop = document.querySelector('.pc-pick-pop');
    const list = document.querySelector('.pc-pick-list');
    const items = Array.from(document.querySelectorAll('.pc-pick-item'));
    const groups = Array.from(document.querySelectorAll('.pc-pick-group')).map((g) =>
      (g.textContent || '').trim(),
    );
    return {
      open: !!pop,
      groups,
      total: items.length,
      firstFew: items.slice(0, 4).map((i) => (i.textContent || '').replace(/\s+/g, ' ').trim()),
      // 可滚动：内容高度 > 可视高度，且 overflow-y 为 auto/scroll
      scrollable: list
        ? list.scrollHeight > list.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(list).overflowY)
        : false,
      listH: list ? list.clientHeight : 0,
      contentH: list ? list.scrollHeight : 0,
      searchBox: !!document.querySelector('.pc-pick-search'),
      searchPlaceholder: document.querySelector('.pc-pick-search')?.getAttribute('placeholder') || '',
    };
  });

  /* ③ 滚动到底：验证列表真的能拉到底部（用户反馈「不能下拉」） */
  out.scrollToBottom = await page.evaluate(() => {
    const list = document.querySelector('.pc-pick-list');
    if (!list) return null;
    list.scrollTop = list.scrollHeight;
    return { scrollTop: Math.round(list.scrollTop), max: Math.round(list.scrollHeight - list.clientHeight) };
  });
  await sleep(200);
  out.lastItemVisible = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.pc-pick-item'));
    const last = items[items.length - 1];
    if (!last) return null;
    const r = last.getBoundingClientRect();
    const lr = document.querySelector('.pc-pick-list').getBoundingClientRect();
    return { text: (last.textContent || '').trim(), withinList: r.bottom <= lr.bottom + 2 && r.top >= lr.top - 2 };
  });

  /* ④ 搜索过滤（必须走原生 value setter，否则 React 的 value tracker 不认） */
  const setNativeValue = `(() => {
    const s = document.querySelector('.pc-pick-search');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(s, %KW%);
    s.dispatchEvent(new Event('input', { bubbles: true }));
  })()`;
  await page.evaluate(setNativeValue.replace('%KW%', JSON.stringify('病理')));
  await sleep(300);
  out.search = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.pc-pick-item'));
    return {
      count: items.length,
      allMatch: items.length > 0 && items.every((i) => (i.textContent || '').includes('病理')),
      sample: items.slice(0, 3).map((i) => (i.textContent || '').replace(/\s+/g, ' ').trim()),
    };
  });
  await page.evaluate(setNativeValue.replace('%KW%', JSON.stringify('')));
  await sleep(200);

  /* ⑤ 选中一个二级分类 → 触发器显示该分类，且表格按服务端重新筛选 */
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.pc-pick-item'));
    const hit = items.find((i) => (i.textContent || '').includes('ELISA-普通ELISA'));
    hit?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await sleep(400);
  out.afterPick = await page.evaluate(() => ({
    triggerText: (document.querySelector('.pc-pick-btn')?.textContent || '').replace(/\s+/g, ' ').trim(),
    popupClosed: !document.querySelector('.pc-pick-pop'),
  }));

  // 等表格按该分类重载，统计分类列是否全是所选分类
  await sleep(6000);
  out.filtered = await page.evaluate((v) => {
    const w = eval(v);
    const rows = Array.from(w.querySelectorAll('tbody tr'));
    const cates = rows.map((tr) => {
      const tds = tr.querySelectorAll('td');
      return tds.length > 1 ? (tds[1].textContent || '').trim() : '';
    });
    return {
      rowCount: rows.length,
      // 第 2 列是「产品标题」，分类在最后一列附近；这里统计可见行里出现的目标分类次数
      hitRows: rows.filter((tr) => (tr.textContent || '').includes('ELISA-普通ELISA')).length,
      firstRowText: rows[0] ? (rows[0].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '',
      cates,
    };
  }, VIS);

  /* ⑥ 再点一次同一项 = 取消筛选（回到占位文案） */
  await page.evaluate(() => document.querySelector('.pc-pick-btn')?.click());
  await sleep(400);
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.pc-pick-item'));
    const hit = items.find((i) => (i.textContent || '').includes('ELISA-普通ELISA'));
    hit?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await sleep(300);
  out.afterUnpick = await page.evaluate(() =>
    (document.querySelector('.pc-pick-btn')?.textContent || '').replace(/\s+/g, ' ').trim(),
  );

  await page.screenshot({ path: '.tmp-cate-pick.png' });
  out.jsErrors = errs;
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
}

fs.writeFileSync('.tmp-cate-pick-result.json', JSON.stringify(out, null, 1));
