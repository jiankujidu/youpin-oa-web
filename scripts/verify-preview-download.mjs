/**
 * 说明书「真预览 / 真下载」端到端验证
 *  - 预览：点击后应弹出 iframe，src 为 blob:，且能取到真实字节（PDF 头 %PDF）
 *  - 下载：<a> 的 href 必须指向 get_oss_file（真文件端点），且带 download 文件名
 *  - 产品详情弹窗内行内预览同样要能渲染
 * 用法：node scripts/verify-preview-download.mjs [baseUrl]
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
const out = { base: BASE };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });
  await page.setCacheEnabled(false);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.goto(BASE + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3000);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(600);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="product"]')?.click());
  await sleep(9000);

  // ---- 1) 检查按钮形态：下载必须是 <a download>，href 必须是 get_oss_file ----
  out.buttons = await page.evaluate((v) => {
    const wrap = eval(v);
    const row = wrap.querySelector('tbody tr');
    const btns = Array.from(row.querySelectorAll('button, a')).filter((b) =>
      ['预览', '下载'].includes((b.textContent || '').trim()),
    );
    return btns.map((b) => ({
      tag: b.tagName,
      text: (b.textContent || '').trim(),
      href: b.getAttribute('href') || '',
      download: b.getAttribute('download') || '',
    }));
  }, VIS);

  // ---- 2) 点「预览」→ 弹窗 iframe ----
  await page.evaluate((v) => {
    const wrap = eval(v);
    const b = Array.from(wrap.querySelectorAll('tbody tr button')).find((x) => (x.textContent || '').trim() === '预览');
    b.click();
  }, VIS);
  await sleep(1200);
  out.modalOpen = await page.evaluate(() => !!document.querySelector('.doc-preview-mask'));
  out.modalText = await page.evaluate(
    () => (document.querySelector('.doc-preview-mask .d-modal')?.innerText || '').slice(0, 300),
  );
  // 轮询等待（本地 nginx 首次回源文件可能 10s+）
  for (let i = 0; i < 60; i++) {
    const done = await page.evaluate(
      () => !!document.querySelector('.doc-preview-frame') || !!document.querySelector('.doc-preview-mask .d-empty'),
    );
    if (done) break;
    await sleep(1500);
  }
  await sleep(1500);
  out.preview = await page.evaluate(async () => {
    const f = document.querySelector('.doc-preview-frame');
    if (!f) return { ok: false, reason: 'no iframe' };
    const src = f.getAttribute('src') || '';
    let bytes = 0;
    let head = '';
    try {
      const res = await fetch(src);
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
      head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 5)));
    } catch (e) {
      head = 'ERR ' + String(e);
    }
    return {
      ok: src.startsWith('blob:'),
      isBlob: src.startsWith('blob:'),
      bytes,
      head,
      height: Math.round(f.getBoundingClientRect().height),
    };
  });
  await page.screenshot({ path: '.tmp-preview-modal.png' });

  // 关闭预览
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.doc-preview-mask .d-modal-btns button'));
    const b = btns.find((x) => (x.textContent || '').includes('关闭'));
    if (b) b.click();
  });
  await sleep(600);

  // ---- 3) 产品详情弹窗内的行内预览 ----
  await page.evaluate((v) => {
    const wrap = eval(v);
    const t = wrap.querySelector('tbody tr td:nth-child(2) span');
    // 点标题打开详情（第 2 列是产品标题，蓝色可点）
    const cell = Array.from(wrap.querySelectorAll('tbody tr td')).find((td) => td.querySelector('span[style*="1A75FF"]'));
    (cell || t).click();
  }, VIS);
  await sleep(1800);
  out.detailOpen = await page.evaluate(() => !!document.querySelector('.d-mask .pc-kv'));
  out.detailLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.d-mask .pc-link')).map((s) => (s.textContent || '').trim()).slice(0, 12),
  );
  await page.evaluate(() => {
    const s = Array.from(document.querySelectorAll('.d-mask .pc-link')).find((x) => (x.textContent || '').trim() === '预览');
    if (s) s.click();
  });
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(
      () => !!document.querySelector('.d-doc-inline .doc-preview-frame') || !!document.querySelector('.d-doc-inline .d-empty'),
    );
    if (done) break;
    await sleep(1500);
  }
  out.inlineRaw = await page.evaluate(
    () => (document.querySelector('.d-doc-inline')?.innerText || '').slice(0, 160),
  );
  out.inline = await page.evaluate(async () => {
    const f = document.querySelector('.d-doc-inline .doc-preview-frame');
    if (!f) return { ok: false, reason: 'no inline iframe' };
    const src = f.getAttribute('src') || '';
    let bytes = 0;
    let head = '';
    try {
      const res = await fetch(src);
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
      head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 5)));
    } catch (e) {
      head = 'ERR ' + String(e);
    }
    return { ok: src.startsWith('blob:') && bytes > 1000, isBlob: src.startsWith('blob:'), bytes, head };
  });
  await page.screenshot({ path: '.tmp-preview-inline.png' });

  out.jsErrors = errs;
} catch (e) {
  out.fatal = String(e).slice(0, 400);
} finally {
  await browser.close();
}
fs.writeFileSync('.tmp-preview-result.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
