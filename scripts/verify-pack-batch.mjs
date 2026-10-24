/** 真实场景复现：5 个不同货号（都有说明书）→ 打包 → 数 zip 里几份 PDF、缺了谁 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://youpin-oa.pages.dev';
const EDGE =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DL = path.resolve('.tmp-dl-diag');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

const u16 = (b, o) => b.readUInt16LE(o);
const u32 = (b, o) => b.readUInt32LE(o);
function readZipEntries(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = u16(buf, eocd + 10);
  let off = u32(buf, eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (u32(buf, off) !== 0x02014b50) break;
    const size = u32(buf, off + 24);
    const nameLen = u16(buf, off + 28);
    const extraLen = u16(buf, off + 30);
    const commentLen = u16(buf, off + 32);
    const localOff = u32(buf, off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    const lNameLen = u16(buf, localOff + 26);
    const lExtraLen = u16(buf, localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.slice(start, start + size);
    out.push({ name, size, text: data.toString('utf8'), head: data.slice(0, 5).toString('latin1') });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const PICKS = [
  { no: 'CW2742', id: '944307', oss: '202609/74bbfcb8008ce17fc96c49894c65846c.pdf' },
  { no: 'SM509223', id: '794514', oss: '202608/9480d82f069aa5c18c0bbbfd92c648a1.pdf' },
  { no: 'YPY33156', id: '538570', oss: '202511/33d59c2859260d06686db46a2b729e7b.pdf' },
  { no: 'BYmab-18318', id: '990363', oss: '202610/ec1a2fbc98d96bdd8b38fa55122614c9.pdf' },
  { no: 'BYmab-31802', id: '1001140', oss: '202610/56131657790ac79ca00122410066cbbf.pdf' },
];

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
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3000);
  await page.evaluate((picks) => {
    const mk = (p, i) => ({
      id: 'o' + i,
      productId: 'p' + i,
      goods_no: p.no,
      title: p.no + ' 测试产品',
      cate: '',
      species: '',
      application: '',
      method: '',
      gene: '',
      mw: '',
      source: '',
      prices: [{ spec: '96T', unit: '盒', dir: 100, dist: 80 }],
      priceRaw: '',
      specIndex: 0,
      priceType: 'dir',
      custom: 0,
      qty: 1,
      unit: '盒',
      discount: 100,
      note: '',
      sel: true,
      docs: [{ no: p.no, id: p.id, ossPath: p.oss, fileName: p.no + '.pdf' }],
      add_time: Date.now(),
    });
    localStorage.setItem(
      'youpin_quote_folders_v1',
      JSON.stringify([
        { id: 'f1', name: '五件测试', parentId: null, create_time: Date.now(), items: picks.map(mk) },
      ]),
    );
    localStorage.setItem('youpin_quote_docs_v1', '[]');
  }, PICKS);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3000);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(400);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="quote"]')?.click());
  await sleep(2500);

  out.rowCount = await page.evaluate(() => document.querySelectorAll('.q-table tbody tr').length);
  // 点「打包本夹」
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((b) => (b.textContent || '').includes('打包本夹'))
      ?.click();
  });
  let zips = [];
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    zips = fs.readdirSync(DL).filter((f) => f.endsWith('.zip'));
    if (zips.length) {
      await sleep(3000);
      break;
    }
  }
  out.zips = zips;
  if (zips.length) {
    const buf = fs.readFileSync(path.join(DL, zips[0]));
    const es = readZipEntries(buf) || [];
    out.pdfs = es.filter((e) => e.name.endsWith('.pdf')).map((e) => ({ name: e.name, size: e.size, head: e.head }));
    out.pdfCount = out.pdfs.length;
    const m = es.find((e) => e.name === '_缺失说明书清单.csv');
    out.missing = m ? m.text : null;
  }
  out.jsErrors = errors;
} catch (e) {
  out.fatal = String(e).slice(0, 300);
} finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
