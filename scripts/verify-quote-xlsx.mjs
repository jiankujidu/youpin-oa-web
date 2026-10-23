/**
 * 报价单 Excel 导出端到端验证
 * 流程：进入报价页 → 建夹 → 从产品库加入 → 回填属性 → 终端客户（无经销价）→
 *       导出 .xlsx 并落盘 → 解析 xlsx 校验列（种属/应用场景恒有、经销价/折扣不出现）
 * 用法：node scripts/verify-quote-xlsx.mjs [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://web.jk93.qzz.io';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DL = path.resolve('.tmp-downloads');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

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
  const cdp = await page.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }).catch(() => {});
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true }).catch(() => {});

  await page.goto(BASE + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(2500);
  await page.evaluate(() => {
    localStorage.removeItem('youpin_quote_folders_v1');
    localStorage.removeItem('youpin_quote_docs_v1');
    localStorage.removeItem('youpin_quote_settings_v1');
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3000);

  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(500);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="quote"]')?.click());
  await sleep(2500);

  // 建夹
  await page.click('.q-tree-foot .pc-input');
  await page.keyboard.type('XLSX测试夹', { delay: 15 });
  await clickText(page, '.q-tree-foot button', '新建');
  await sleep(600);

  // 加产品
  await clickText(page, '.pc-actions button', '添加产品');
  await page.waitForSelector('.q-modal', { timeout: 30000 });
  await sleep(1000);
  await page.evaluate(() => {
    const inp = document.querySelector('.q-modal-body input.pc-input');
    inp.value = 'ELISA';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await clickText(page, '.q-modal-body button', '搜索');
  await sleep(4000);
  await clickText(page, '.q-modal-body button', '全选本页');
  await sleep(400);
  await page.waitForSelector('.q-modal-foot select', { timeout: 30000 });
  await page.evaluate(() => {
    const sel = document.querySelector('.q-modal-foot select');
    const opt = Array.from(sel.options).find((o) => o.textContent.includes('XLSX测试夹'));
    sel.value = opt ? opt.value : sel.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await clickText(page, '.q-modal-foot button', '加入收藏夹');
  await sleep(1500);
  out.rows = await page.evaluate(() => document.querySelectorAll('.q-table tbody tr').length);

  // 回填属性（种属/应用场景等）
  const filled = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      (x.getAttribute('title') || '').includes('按货号回原站产品库补回'),
    );
    if (!b) return false;
    b.click();
    return true;
  });
  out.fillClicked = filled;
  await sleep(6000);

  // 客户类型：终端客户（不体现经销价）
  await clickText(page, '.q-field button', '终端客户');
  await sleep(400);
  out.modeHint = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.q-field span')).find((e) =>
      (e.textContent || '').includes('不体现经销价'),
    );
    return el ? el.textContent.trim() : '';
  });

  // 附加列：勾上 分类/方法学/基因名称/分子量/来源，验证 Excel 有这些列
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.q-field label'));
    for (const lb of labels) {
      const t = (lb.textContent || '').trim();
      if (['分类', '方法学', '基因名称', '分子量', '来源'].includes(t)) {
        const cb = lb.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) cb.click();
      }
    }
  });
  await sleep(600);

  // 去预览页导出
  await clickText(page, '.q-tab2', '报价单预览');
  await sleep(1200);
  await clickText(page, '.q-card-head button', '导出 Excel 报价单');
  await sleep(3000);

  // 等文件落盘
  let file = null;
  for (let i = 0; i < 40; i++) {
    const fs2 = fs.readdirSync(DL).filter((f) => f.endsWith('.xlsx'));
    if (fs2.length) {
      file = path.join(DL, fs2[0]);
      break;
    }
    await sleep(500);
  }
  if (!file) {
    // 兜底：直接读 localStorage 里的存档手动触发不了，报失败
    out.downloaded = false;
    out.dirList = fs.readdirSync(DL);
  } else {
    out.downloaded = true;
    out.fileName = path.basename(file);
    out.fileSize = fs.statSync(file).size;
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const names = Object.keys(zip.files);
    out.zipParts = names.slice(0, 12);
    const shared = names.includes('xl/sharedStrings.xml')
      ? await zip.file('xl/sharedStrings.xml').async('string')
      : '';
    const sheet = names.includes('xl/worksheets/sheet1.xml')
      ? await zip.file('xl/worksheets/sheet1.xml').async('string')
      : '';
    const strs = [];
    const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let m;
    while ((m = re.exec(shared))) strs.push(m[1]);
    // 行 → 单元格文本
    const rowsTxt = [];
    const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
    while ((m = rowRe.exec(sheet))) {
      const cells = [];
      const cRe = /<c[^>]*?(?:\s+t="(\w+)")?[^>]*>([\s\S]*?)<\/c>/g;
      let c;
      while ((c = cRe.exec(m[1]))) {
        const t = c[1];
        const inner = c[2];
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        const inl = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        let val = '';
        if (inl) val = inl[1];
        else if (v && t === 's') val = strs[Number(v[1])] ?? '';
        else if (v) val = v[1];
        cells.push(val);
      }
      rowsTxt.push(cells);
    }
    out.rowCount = rowsTxt.length;
    const headRow = rowsTxt.find((r) => r.includes('货号')) || [];
    out.sheetHead = headRow.filter(Boolean);
    const all = rowsTxt.map((r) => r.join(' ')).join('\n');
    out.has = {
      种属: all.includes('种属'),
      应用场景: all.includes('应用场景'),
      目录价: all.includes('目录价'),
      小计: all.includes('小计'),
      合计大写: /合计金额（大写）/.test(all),
      分类: all.includes('分类'),
      方法学: all.includes('方法学'),
    };
    out.absent = {
      经销价: !all.includes('经销价'),
      折扣: !all.includes('折扣'),
    };
    out.sampleRow = (rowsTxt.find((r) => r.some((x) => /^[A-Z0-9-]{4,}$/.test(x))) || []).slice(0, 14);
    out.metaLine = rowsTxt.find((r) => r.some((x) => String(x).includes('报价单号'))) || [];
  }
  out.jsErrors = errors;
} catch (e) {
  out.fatal = String(e).slice(0, 400);
} finally {
  await browser.close();
}
fs.writeFileSync('.tmp-xlsx-result.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
