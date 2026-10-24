/**
 * 收藏夹批量下载 / 打包验证（无头 + 真实落盘）
 *
 * 用户需求：「收藏夹的可以批量下载，或者打包文件夹」
 *
 * 验证：
 *  1) 侧栏文件夹上有 ⤓ 打包按钮；工具栏有「⤓ 批量下载说明书」「📦 打包收藏夹」
 *  2) 点「打包收藏夹」→ 浏览器真实落盘一个 zip → 解包检查：
 *     内含「产品清单.csv」+ N 份说明书 PDF（PDF 头 %PDF-）
 *  3) 清单 CSV 内容含货号 / 名称 / 规格 / 报价 / 数量 / 小计
 *  4) 旧存档条目（没有说明书快照）也能按货号回原站补齐后打包
 *  5) 「批量下载说明书」= **逐个 PDF 文件落盘**（不是一个 zip）
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://youpin-oa.pages.dev';
const EDGE =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DL = path.resolve('.tmp-downloads');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

/** 小端读取（WorkBuddy 的 node shim 精简了 Buffer，只有 readUInt16LE/readUInt32LE） */
const u16 = (b, o) => (b.readUInt16LE ? b.readUInt16LE(o) : b.readUInt16(o));
const u32 = (b, o) => (b.readUInt32LE ? b.readUInt32LE(o) : b.readUInt32(o));

/** 极简 zip 读取（本地文件用） */
function readZipEntries(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = u16(buf,eocd + 10);
  let off = u32(buf,eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (u32(buf,off) !== 0x02014b50) break;
    const size = u32(buf,off + 24);
    const nameLen = u16(buf,off + 28);
    const extraLen = u16(buf,off + 30);
    const commentLen = u16(buf,off + 32);
    const localOff = u32(buf,off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    const lNameLen = u16(buf,localOff + 26);
    const lExtraLen = u16(buf,localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.slice(dataStart, dataStart + size);
    out.push({ name, size, head: data.slice(0, 5).toString('latin1') });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

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
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('dialog', (d) => d.accept());

  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DL,
    eventsEnabled: true,
  });
  // ★ Chrome「多文件下载」策略：无头环境下多余的自动下载会被 cancel，
  //   所以用 downloadWillBegin 事件断言「每个说明书都真的触发了下载」，
  //   而不是断言磁盘上落了几个文件。
  const dlBegins = [];
  client.on('Browser.downloadWillBegin', (e) => dlBegins.push(e.suggestedFilename));

  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3500);

  // 种子：两个条目 —— 一个带说明书快照（新加的），一个不带（旧存档，靠兜底回原站查）
  await page.evaluate(() => {
    const mk = (id, no, title, docs) => ({
      id,
      productId: 'p-' + id,
      goods_no: no,
      title,
      cate: 'ELISA-普通ELISA',
      species: '人',
      application: '临床检验',
      method: '间接两步法',
      gene: '',
      mw: '',
      source: '',
      prices: [{ spec: '96T', unit: '盒', dir: 200, dist: 120 }],
      specIndex: 0,
      priceType: 'dir',
      custom: 200,
      qty: 2,
      unit: '盒',
      discount: 100,
      note: '',
      sel: true,
      docs,
      add_time: Date.now(),
    });
    localStorage.setItem(
      'youpin_quote_folders_v1',
      JSON.stringify([
        {
          id: 'f1',
          name: '打包测试夹',
          parentId: null,
          create_time: Date.now(),
          items: [
            // 2026-10 的新文件：原站 /oss/ 路由可直出（不依赖 static.upingbio.cn）
            mk('a1', 'SM91888', '科研 人整合素α3(ITG α3)检测试剂盒', [
              {
                no: 'SM91888',
                id: '1030227',
                ossPath: '202610/1bbc2b2176308a03b84c6202186ca5c3.pdf',
                fileName: 'SM91888科研 人整合素α3(ITG α3)检测试剂盒.pdf',
              },
            ]),
            // 2025-02 的老文件：只能靠 get_oss_file?id= 通道（该通道目前被原站过期证书挡住）
            mk('a2', 'RXTAN87948', '科研 猴抗S蛋白IgG抗体(SIgG)定性检测试剂盒', [
              {
                no: 'RXTAN87948',
                id: '355370',
                ossPath: '202502/d15cf1f27216fff085baa1bba8e9090c.pdf',
                fileName: 'RXTAN87948科研 猴抗S蛋白IgG抗体(SIgG)定性检测试剂盒(ELISA).pdf',
              },
            ]),
          ],
        },
      ]),
    );
    localStorage.setItem('youpin_quote_docs_v1', '[]');
  });
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

  // ---- 1) 按钮是否就位 ----
  out.buttons = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent || '').trim());
    return {
      bulk: btns.some((b) => b.includes('批量下载说明书')),
      pack: btns.some((b) => b.includes('打包收藏夹')),
      nodeOpTitles: Array.from(document.querySelectorAll('.q-node .q-node-op')).map((o) =>
        (o.getAttribute('title') || '').slice(0, 14),
      ),
    };
  });

  // ---- 2) 点「打包收藏夹」，等 zip 落盘 ----
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((b) => (b.textContent || '').includes('打包收藏夹'))
      ?.click();
  });
  let zips = [];
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    zips = fs.readdirSync(DL).filter((f) => f.endsWith('.zip'));
    if (zips.length) {
      await sleep(2500);
      break;
    }
  }
  out.zipFiles = zips;
  if (zips.length) {
    const f = path.join(DL, zips[0]);
    out.zipSize = fs.statSync(f).size;
    const buf = fs.readFileSync(f);
    const entries = readZipEntries(buf);
    out.zipEntries = entries;
    out.hasManifest = !!entries?.some((e) => e.name === '产品清单.csv');
    out.pdfCount = entries?.filter((e) => e.name.endsWith('.pdf')).length || 0;
    out.pdfHeadOk =
      entries?.filter((e) => e.name.endsWith('.pdf')).every((e) => e.head === '%PDF-') ?? false;
    // 清单内容
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = u16(buf,eocd + 10);
    let off = u32(buf,eocd + 16);
    for (let i = 0; i < count; i++) {
      const nameLen = u16(buf,off + 28);
      const extraLen = u16(buf,off + 30);
      const commentLen = u16(buf,off + 32);
      const size = u32(buf,off + 24);
      const localOff = u32(buf,off + 42);
      const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
      if (name === '产品清单.csv') {
        const lNameLen = u16(buf,localOff + 26);
        const lExtraLen = u16(buf,localOff + 28);
        const start = localOff + 30 + lNameLen + lExtraLen;
        out.manifestText = buf.slice(start, start + size).toString('utf8');
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
  }

  // ---- 3) 批量下载说明书：逐个 PDF 文件落盘（不是一个 zip）----
  fs.readdirSync(DL).forEach((f) => fs.rmSync(path.join(DL, f), { force: true }));
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((b) => (b.textContent || '').includes('批量下载说明书'))
      ?.click();
  });
  await sleep(3000);
  out.bulkToast = await page.evaluate(
    () => document.querySelector('.pc-toast, .toast, [class*="toast"]')?.textContent?.trim() || null,
  );
  let bulk = [];
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    bulk = fs.readdirSync(DL);
    if (bulk.length) {
      await sleep(2500);
      break;
    }
  }
  out.bulkFiles = bulk;
  out.bulkTriggers = dlBegins.filter((n) => n.endsWith('.pdf'));
  out.bulkIsZip = bulk.some((f) => f.endsWith('.zip'));
  const bulkPdfs = bulk.filter((f) => f.endsWith('.pdf'));
  out.bulkPdfCount = bulkPdfs.length;
  out.bulkPdfHeadOk = bulkPdfs.every((f) => {
    const fd = fs.openSync(path.join(DL, f), 'r');
    const b = Buffer.alloc(5);
    fs.readSync(fd, b, 0, 5, 0);
    fs.closeSync(fd);
    return b.toString('latin1') === '%PDF-';
  });

  await page.screenshot({ path: '.tmp-folder-pack.png' });
  out.jsErrors = errors;
} catch (e) {
  out.fatal = String(e).slice(0, 500);
} finally {
  await browser.close();
  fs.writeFileSync('.tmp-folder-pack.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
