/**
 * 产品分类树形多选验证（无头）——对齐原站 xmSelect：
 * 1) 打开分类下拉：93 节点、默认全展开、树形缩进（三级）
 * 2) 工具栏：全选（93）/ 清空
 * 3) 搜索「病理」→ 只留命中节点及其祖先链
 * 4) 单选「ELISA-普通ELISA」(id=3) → 表格 20 行分类列全为该分类，count=27714
 * 5) 再加选「ELISA-通用试剂盒」(id=11) → 并集 count=27810，两分类都出现
 * 6) 父子独立：选父「ELISA」(id=1) 后子项不自动选中
 * 7) 触发器 chips：已选 N 个分类；点 chip × 移除
 * 8) JS 零错误 + 截图（展开态）
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://youpin-oa.pages.dev';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};

/** 等分页「共 N 条」文本稳定（过滤后自动重载，避免读到加载中/旧值） */
const waitCountStable = async (page, stableMs = 1600, maxMs = 20000) => {
  const read = () => page.evaluate(() => {
    const m = (document.body.innerText || '').match(/共\s*([\d,]+)\s*条/);
    return m ? m[1] : '';
  });
  let last = await read();
  let stable = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(300);
    const cur = await read();
    if (cur && cur === last) {
      stable += 300;
      if (stable >= stableMs) return cur;
    } else {
      stable = 0;
      last = cur;
    }
  }
  return last;
};

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
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(BASE + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3500);
  // 进产品列表
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(400);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="product"]')?.click());
  await sleep(3000);
  await page.waitForSelector('.q-table, .pc-table, table', { timeout: 30000 }).catch(() => {});
  await sleep(1500);

  // ---- 1) 打开分类下拉 ----
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.pc-pick-btn'));
    const b = btns.find((x) => (x.textContent || '').includes('产品分类'));
    b?.click();
  });
  await sleep(500);
  out.open = await page.evaluate(() => {
    const pop = document.querySelector('.pc-pick-pop');
    const items = Array.from(document.querySelectorAll('.pc-tree-item'));
    // 树深度：统计各 paddingLeft 档位
    const depths = new Set(items.map((i) => i.style.paddingLeft));
    return {
      popupOpen: !!pop,
      nodeCount: items.length,
      depthSteps: [...depths].sort(),
      // 默认全展开：带 ▾ 的父节点数 vs 收起态
      expandedArrows: document.querySelectorAll('.pc-tree-arrow').length,
      checkedCount: Array.from(document.querySelectorAll('.pc-tree-item input.pc-check')).filter((c) => c.checked).length,
      toolbarText: (document.querySelector('.pc-tree-toolbar')?.textContent || '').replace(/\s+/g, ' ').trim(),
      searchPlaceholder: document.querySelector('.pc-pick-search')?.getAttribute('placeholder') || '',
    };
  });

  // ---- 2) 工具栏全选 → 93 ----
  await page.evaluate(() => {
    const tools = Array.from(document.querySelectorAll('.pc-tree-tool'));
    tools.find((t) => (t.textContent || '').startsWith('全选'))?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await sleep(400);
  out.afterAll = await page.evaluate(() => ({
    checked: Array.from(document.querySelectorAll('.pc-tree-item input.pc-check')).filter((c) => c.checked).length,
    clearBtnText: Array.from(document.querySelectorAll('.pc-tree-tool')).map((t) => t.textContent.trim()).join(' | '),
    chips: (document.querySelector('.pc-tree-chips')?.textContent || '').replace(/\s+/g, ' ').trim(),
  }));

  // ---- 3) 清空 ----
  await page.evaluate(() => {
    const tools = Array.from(document.querySelectorAll('.pc-tree-tool'));
    tools.find((t) => (t.textContent || '').startsWith('清空'))?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await sleep(300);
  out.afterClear = await page.evaluate(() => ({
    checked: Array.from(document.querySelectorAll('.pc-tree-item input.pc-check')).filter((c) => c.checked).length,
    chips: !!document.querySelector('.pc-tree-chips'),
  }));

  // ---- 4) 搜索「病理」 ----
  await page.type('.pc-pick-search', '病理');
  await sleep(400);
  out.afterSearch = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.pc-tree-item')).map((i) => (i.textContent || '').trim());
    return {
      nodeCount: items.length,
      allMatch: items.every((t) => t.includes('病理')),
      hasAncestorChain: items.some((t) => t.includes('病理技术服务')), // 祖先链保留
      sample: items.slice(0, 5),
    };
  });
  // 清搜索框
  await page.evaluate(() => {
    const s = document.querySelector('.pc-pick-search');
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    d.set.call(s, '');
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(300);

  // ---- 5) 单选「普通ELISA」（ELISA 子项，id=3）----
  // 注意：选中后触发器显示 chips 不再含「产品分类」字样，统一定位为页面上第一个 .pc-pick-btn
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.pc-tree-item'));
    const it = items.find((i) => i.querySelector('b')?.textContent === '普通ELISA');
    it?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await sleep(600);
  await page.evaluate(() => {
    document.querySelector('.pc-pick-btn')?.click(); // 收起
  });
  await waitCountStable(page); // activeFilter 变化会自动触发重载，等计数稳定
  out.afterPick3 = await page.evaluate(() => {
    // 页面上有多个 .pc-table（公告表等），按表头含「产品标题」定位产品表
    const tbl = Array.from(document.querySelectorAll('table.pc-table')).find((t) =>
      Array.from(t.querySelectorAll('thead th')).some((th) => (th.textContent || '').trim() === '产品标题'),
    );
    if (!tbl) return { found: false };
    const ths = Array.from(tbl.querySelectorAll('thead th'));
    const cateIdx = ths.findIndex((t) => (t.textContent || '').trim() === '分类');
    const trs = Array.from(tbl.querySelectorAll('tbody tr'));
    const cates = trs.map((tr) => {
      const tds = Array.from(tr.querySelectorAll('td'));
      return (tds[cateIdx]?.textContent || '').trim();
    }).filter(Boolean);
    return {
      found: true,
      cateIdx,
      rows: trs.length,
      allELISA: cates.length > 0 && cates.every((c) => c === 'ELISA-普通ELISA'),
      cateSample: [...new Set(cates)].slice(0, 3),
      triggerTitle: document.querySelector('.pc-pick-btn')?.getAttribute('title'),
    };
  });
  // 触发一次真实搜索，拿服务端 count
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find((b) => (b.textContent || '').trim() === '搜索')?.click();
  });
  out.count3 = await waitCountStable(page);

  // ---- 6) 再加选「通用试剂盒」（id=11） → 并集 ----
  await page.evaluate(() => {
    document.querySelector('.pc-pick-btn')?.click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.pc-tree-item'));
    const it = items.find((i) => i.querySelector('b')?.textContent === '通用试剂盒');
    it?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await sleep(500);
  await page.evaluate(() => {
    document.querySelector('.pc-pick-btn')?.click();
  });
  out.count3_11 = await waitCountStable(page);

  // ---- 7) 父子独立：选父「ELISA」(id=1)，子项不自动选中 ----
  await page.evaluate(() => {
    document.querySelector('.pc-pick-btn')?.click();
  });
  await sleep(400);
  out.parentPick = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.pc-tree-item'));
    const elisa = items.find((i) => i.querySelector('b')?.textContent === 'ELISA');
    elisa?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return !!elisa;
  });
  await sleep(400);
  out.parentPickState = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.pc-tree-item'));
    const st = (t) => {
      const it = items.find((i) => i.querySelector('b')?.textContent === t);
      return it ? !!it.querySelector('input.pc-check')?.checked : null;
    };
    return { ELISA: st('ELISA'), 普通ELISA: st('普通ELISA'), 通用试剂盒: st('通用试剂盒') };
  });
  // chips × 移除「ELISA」
  await page.evaluate(() => {
    document.querySelector('.pc-pick-btn')?.click();
  });
  await sleep(300);
  out.chipRemove = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('.pc-tree-chip'));
    chips[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); // 移除第一个 chip
    return { before: chips.map((x) => (x.textContent || '').replace('×', '').trim()) };
  });
  await sleep(300);
  out.chipRemoveAfter = await page.evaluate(() => ({
    chips: Array.from(document.querySelectorAll('.pc-tree-chip')).map((c) => (c.textContent || '').replace('×', '').trim()),
    checkedELISA: (() => {
      const items = Array.from(document.querySelectorAll('.pc-tree-item'));
      const it = items.find((i) => i.querySelector('b')?.textContent === 'ELISA');
      return it ? !!it.querySelector('input.pc-check')?.checked : null;
    })(),
  }));

  // ---- 8) 截图：下拉展开态 ----
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.pc-pick-btn'));
    const b = btns.find((x) => (x.textContent || '').includes('产品分类'));
    b?.click();
  });
  await sleep(500);
  await page.screenshot({ path: '.tmp-cate-tree.png' });
  out.shot = '.tmp-cate-tree.png';

  out.jsErrors = errors;
} catch (e) {
  out.fatal = String(e).slice(0, 300);
} finally {
  fs.writeFileSync('.tmp-cate-result.json', JSON.stringify(out, null, 1));
  await browser.close();
}
console.log(JSON.stringify(out, null, 1));
