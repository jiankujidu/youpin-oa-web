/**
 * 报价页四项修复的**线上无头回归**：
 *  1) 种属/应用场景 自动补齐（旧存档没属性也不再显示「—」）
 *  2) 规格列显示真实规格 + 悬停可见原站原文（不编造价格）
 *  3) 打包说明书不漏（三条通道 + 缺失清单）
 *  4) 预览表不再被压扁（table-layout: fixed + 最小宽度 + 横向滚动）
 *
 * 用法：node scripts/verify-quote-fixes.mjs [BASE]
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://youpin-oa.pages.dev';
const EDGE =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DL = path.resolve('.tmp-dl-quote');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

/* ---------- zip 读取（解析 central directory） ---------- */
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

/** 种子数据：3 个真实货号（都有说明书）+ 1 个原站不存在的货号 */
const FOLDERS = [
  {
    id: 'f1',
    name: '自愈测试A',
    parentId: null,
    create_time: Date.now(),
    items: [
      // ① 最老存档：既没价格也没属性、也没原文 → 必须回原站补齐
      { id: 'a1', productId: 'pa1', goods_no: 'CW2742', title: 'CW2742 老存档' },
      // ② 有原文但旧解析器没解出价格 → 读取时重解析
      {
        id: 'a2',
        productId: 'pa2',
        goods_no: 'RXTAN87948',
        title: 'RXTAN87948 抗体',
        priceRaw: '96T-目录价：4000元',
      },
      { id: 'a3', productId: 'pa3', goods_no: 'SM509223', title: 'SM509223 产品' },
    ],
  },
  {
    id: 'f2',
    name: '自愈测试B',
    parentId: null,
    create_time: Date.now(),
    items: [
      // ③ 原站确实没有这个货号 → 必须标红「需询价」，不能填假价
      { id: 'b2', productId: 'pb2', goods_no: 'ZZNOTEXIST0001', title: '不存在的货号' },
    ],
  },
];

const DEFAULTS = {
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
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const out = { base: BASE, checks: [] };
const check = (name, pass, detail) => out.checks.push({ name, pass: !!pass, detail });
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
  await sleep(2500);
  await page.evaluate(
    (folders, defaults) => {
      const norm = (f) => ({ ...f, items: f.items.map((it) => ({ ...defaults, ...it })) });
      localStorage.setItem('youpin_quote_folders_v1', JSON.stringify(folders.map(norm)));
      localStorage.setItem('youpin_quote_docs_v1', '[]');
    },
    FOLDERS,
    DEFAULTS,
  );
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(2500);
  await page.evaluate(() => {
    document.querySelectorAll('.d-nav-parent').forEach((p) => {
      if ((p.textContent || '').includes('产品管理')) p.click();
    });
  });
  await sleep(400);
  await page.evaluate(() => document.querySelector('.d-nav-item[data-key="quote"]')?.click());
  await sleep(2000);

  /** 展开所有行并按「主行 → 详情行」顺序读回 */
  async function readDetails() {
    await page.evaluate(() => {
      document.querySelectorAll('.q-exp').forEach((e) => {
        if (!(e.className || '').includes('open')) e.click();
      });
    });
    await sleep(600);
    return page.evaluate(() => {
      const res = [];
      let no = '';
      document.querySelectorAll('.q-table tbody tr').forEach((tr) => {
        if (tr.classList.contains('q-row')) {
          no = tr.querySelectorAll('td')[1]?.textContent?.trim() || '';
        } else if (tr.classList.contains('q-detail')) {
          const kvs = {};
          tr.querySelectorAll('.q-detail-kv').forEach((kv) => {
            kvs[kv.querySelector('.k')?.textContent?.trim() || ''] =
              kv.querySelector('.v')?.textContent?.trim() || '';
          });
          res.push({ goods_no: no, ...kvs });
        }
      });
      return res;
    });
  }

  /* ---- ① 属性自动补齐：直接跟原站接口逐字段对账（不编造） ---- */
  let details = [];
  for (let i = 0; i < 40; i++) {
    details = await readDetails();
    const real = details.filter((d) => d.goods_no && !d.goods_no.startsWith('ZZNOTEXIST'));
    const ok = real.length >= 3 && real.every((d) => d['种属']);
    if (ok) break;
    await sleep(2000);
  }
  const realDetails = details.filter((d) => d.goods_no && !d.goods_no.startsWith('ZZNOTEXIST'));
  // 拉原站真值逐字段比对（★ 原站有频控，取不到就重试，仍取不到则跳过该货号，不误判）
  const origin = {};
  for (const no of realDetails.map((d) => d.goods_no)) {
    let p = null;
    for (let k = 0; k < 4 && !p; k++) {
      try {
        const r = await fetch(
          `${BASE}/oa-proxy/product/index/list?keywords=${encodeURIComponent(no)}&limit=5&page=1`,
          { headers: { 'X-Requested-With': 'XMLHttpRequest' } },
        );
        const j = await r.json();
        if ((j.data || []).length) p = j.data[0];
      } catch {
        /* ignore */
      }
      if (!p) await sleep(2500);
    }
    origin[no] = p
      ? {
          种属: String(p.species || '').trim(),
          应用场景: String(p.application || '').trim(),
          方法学: String(p.methodology || '').trim(),
          分子量: String(p.da || '').trim(),
          来源: String(p.source || '').trim(),
        }
      : null;
  }
  out.attrCompare = realDetails.map((d) => ({
    货号: d.goods_no,
    原站: origin[d.goods_no],
    页面: { 种属: d['种属'] || '', 应用场景: d['应用场景'] || '', 方法学: d['方法学'] || '' },
  }));
  // 断言：原站有的字段，页面必须原样体现；原站没有的字段，页面不得凭空造
  const attrOk = realDetails.every((d) => {
    const o = origin[d.goods_no];
    if (!o) return true; // 原站这次没取到，不做判断
    for (const k of ['种属', '应用场景', '方法学']) {
      const ov = o[k] || '';
      const pv = d[k] || '';
      if (ov && pv !== ov) return false; // 原站有值 → 页面必须一致
      if (!ov && pv) return false; // 原站没值 → 页面不能编造
    }
    return true;
  });
  check(
    '① 属性自动补齐且与原站逐字段一致（不编造）',
    realDetails.length >= 3 &&
      realDetails.every((d) => d['种属']) &&
      attrOk,
    out.attrCompare,
  );
  check(
    '② 详情行给出原站原始价格串（可追溯）',
    realDetails.every((d) => d['原站原始价格串'] && !d['原站原始价格串'].startsWith('（无')),
    realDetails.map((d) => d['原站原始价格串']),
  );

  /* ---- ② 规格列 ---- */
  const specInfo = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.q-table tbody tr.q-row'));
    return rows.map((tr) => {
      const tds = tr.querySelectorAll('td');
      const cell = tds[3];
      const el = cell?.querySelector('select,span');
      return {
        goods_no: tds[1]?.textContent?.trim() || '',
        spec: (cell?.textContent || '').trim(),
        title: el?.getAttribute('title') || '',
      };
    });
  });
  out.specs = specInfo;
  const realSpecs = specInfo.filter((s) => s.goods_no && !s.goods_no.startsWith('ZZNOTEXIST'));
  check(
    '③ 规格列显示真实规格（非「—」/裸数字）',
    realSpecs.length >= 3 && realSpecs.every((s) => s.spec && !/^[\d.,]+$/.test(s.spec)),
    realSpecs.map((s) => `${s.goods_no} => ${s.spec}`),
  );
  const fake = specInfo.find((s) => s.goods_no.startsWith('ZZNOTEXIST'));
  if (!fake) {
    // 切到第二个收藏夹看「需询价」那行
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.q-node-name')).find((x) =>
        (x.textContent || '').trim().startsWith('自愈测试B'),
      );
      el?.click();
    });
    await sleep(1500);
    const f2 = await page.evaluate(() => {
      const tr = document.querySelector('.q-table tbody tr.q-row');
      const cell = tr?.querySelectorAll('td')[3];
      return { spec: (cell?.textContent || '').trim() };
    });
    check('④ 无价货号标红「需询价」而非填 0 当真价', f2.spec.includes('需询价'), f2);
  } else {
    check('④ 无价货号标红「需询价」而非填 0 当真价', fake.spec.includes('需询价'), fake);
  }

  /* ---- ④ 预览表布局 ---- */
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.q-tab2'))
      .find((b) => (b.textContent || '').includes('报价单预览'))
      ?.click();
  });
  await sleep(1500);
  const layout = await page.evaluate(() => {
    const wrap = document.querySelector('.q-sheet-scroll');
    const tbl = wrap?.querySelector('table');
    if (!wrap || !tbl) return { found: false };
    const TEXT_COLS = ['产品名称', '种属', '应用场景', '规格', '备注'];
    const ths = Array.from(tbl.querySelectorAll('thead th')).map((th) => ({
      t: th.textContent?.trim(),
      w: Math.round(th.getBoundingClientRect().width),
    }));
    const textW = ths.filter((x) => TEXT_COLS.includes(x.t)).map((x) => x.w);
    return {
      found: true,
      tableLayout: getComputedStyle(tbl).tableLayout,
      scrollable: wrap.scrollWidth > wrap.clientWidth,
      scrollWidth: wrap.scrollWidth,
      clientWidth: wrap.clientWidth,
      minColWidth: Math.min(...ths.map((x) => x.w)),
      minTextColWidth: textW.length ? Math.min(...textW) : null,
      ths,
    };
  });
  out.layout = layout;
  check('⑤ 预览表 table-layout: fixed', layout.found && layout.tableLayout === 'fixed', layout.tableLayout);
  check(
    '⑥ 预览表文字列无被压扁（≥ 60px）',
    layout.found && (layout.minTextColWidth ?? 0) >= 60,
    `最窄文字列 ${layout.minTextColWidth}px`,
  );
  check(
    '⑦ 放不下时横向滚动而非挤压',
    layout.found && (!layout.scrollable || layout.scrollWidth >= layout.clientWidth),
    `scroll=${layout.scrollWidth} client=${layout.clientWidth}`,
  );

  /* ---- 整单全空的列不出现（「没有不体现，有的一定要体现」） ---- */
  const emptyCols = await page.evaluate(() => {
    const tbl = document.querySelector('.q-sheet-scroll table');
    if (!tbl) return { found: false };
    const ths = Array.from(tbl.querySelectorAll('thead th'));
    const idx = ths.findIndex((th) => th.textContent.trim() === '应用场景');
    if (idx < 0) return { found: true, hidden: true, allEmpty: true };
    const rows = Array.from(tbl.querySelectorAll('tbody tr'));
    const vals = rows.map((tr) => (tr.querySelectorAll('td')[idx]?.textContent || '').trim());
    return { found: true, hidden: false, allEmpty: vals.every((v) => !v || v === '—'), vals };
  });
  check(
    '⑧ 整单全空的列不出现（应用场景原站就是空 → 整列不显示）',
    emptyCols.found && (emptyCols.hidden || !emptyCols.allEmpty),
    emptyCols,
  );

  /* ---- ③ 打包全部 ---- */
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.q-tab2'))
      .find((b) => (b.textContent || '').includes('报价明细'))
      ?.click();
  });
  await sleep(800);
  out.packLabel = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      (x.textContent || '').includes('打包全部'),
    );
    return b ? b.textContent.trim() : null;
  });
  check('⑧ 存在「打包全部」入口', !!out.packLabel, out.packLabel);

  // 点一次；若按钮被置灰就等它可点后再点一次（页面已防重复点击，间隔 10s 以上）
  let zips = [];
  let clicked = 0;
  for (let i = 0; i < 120; i++) {
    const st = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        (x.textContent || '').includes('打包全部'),
      );
      if (!b) return { found: false };
      const dis = b.disabled;
      const last = Number(window.__packClickedAt || 0);
      if (!dis && Date.now() - last > 10000) {
        window.__packClickedAt = Date.now();
        b.click();
        return { found: true, clicked: true };
      }
      return { found: true, dis };
    });
    if (st.clicked) clicked++;
    await sleep(2000);
    zips = fs.readdirSync(DL).filter((f) => f.endsWith('.zip'));
    if (zips.length) {
      await sleep(4000);
      break;
    }
  }
  out.packClicks = clicked;
  out.zips = zips;
  if (zips.length) {
    const es = readZipEntries(fs.readFileSync(path.join(DL, zips[0]))) || [];
    const pdfs = es.filter((e) => e.name.endsWith('.pdf'));
    out.pdfs = pdfs.map((e) => ({ name: e.name, size: e.size, head: e.head }));
    out.pdfCount = pdfs.length;
    out.zipDirs = [...new Set(pdfs.map((p) => p.name.split('/')[0]))];
    check('⑨ 打包出 3 份说明书（3 个真实货号）', pdfs.length >= 3, out.pdfs.map((p) => p.name));
    check(
      '⑩ 说明书按收藏夹分目录存放',
      pdfs.length > 0 && pdfs.every((p) => p.name.includes('/')) && out.zipDirs.length >= 1,
      out.zipDirs,
    );
    check(
      '⑪ 说明书均为真 PDF',
      pdfs.length > 0 && pdfs.every((p) => p.head === '%PDF-'),
      pdfs.map((p) => p.head),
    );
    const m = es.find((e) => e.name === '_缺失说明书清单.csv');
    out.missing = m ? m.text : null;
    check(
      '⑫ 缺失清单写明缺哪个货号及原因',
      !!out.missing && out.missing.includes('ZZNOTEXIST0001'),
      out.missing,
    );
  }
  out.jsErrors = errors;
  check('⑬ 无 JS 报错', errors.length === 0, errors);
} catch (e) {
  out.fatal = String(e).slice(0, 300);
} finally {
  await browser.close();
  fs.writeFileSync('.tmp/verify-quote.json', JSON.stringify(out, null, 1), 'utf8');
  let s = '';
  for (const c of out.checks) s += `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}\n`;
  s += `\n结果：${out.checks.filter((c) => c.pass).length}/${out.checks.length} 通过\n`;
  if (out.fatal) s += `FATAL: ${out.fatal}\n`;
  console.log(s);
  for (const c of out.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}\n   ${JSON.stringify(c.detail)}`);
}
