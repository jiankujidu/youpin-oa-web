/**
 * 极简 XLSX 写入器（零依赖，浏览器端直接生成 .xlsx）
 * ---------------------------------------------------------------------------
 *  · 不压缩（ZIP method=0 stored），自己写 CRC32 + 中央目录，避免引入打包库
 *  · 字符串用 inlineStr，不用 sharedStrings，结构最小
 *  · 支持：列宽 / 行高 / 合并单元格 / 冻结行 / 边框 / 底色 / 数字格式 / 打印设置
 *  · 配色沿用报价单模板（主色 #15803D、表头 #22C15E、报价列 #FFFBE6）
 */

export type CellVal = string | number | null | undefined;

export interface XCell {
  v: CellVal;
  /** 样式 id（见下方 S） */
  s?: number;
}

export interface XRow {
  /** 行高（磅） */
  h?: number;
  cells: XCell[];
}

export interface XSheet {
  /** 列宽（字符数），按列顺序 */
  cols?: number[];
  rows: XRow[];
  /** 合并区域：[r1, c1, r2, c2]，1-based */
  merges?: [number, number, number, number][];
  /** 冻结前 N 行 */
  freezeRow?: number;
  landscape?: boolean;
}

/* ---------------------------------- 样式 ---------------------------------- */
interface Xf {
  numFmt?: number;
  fontId: number;
  fillId: number;
  borderId: number;
  h?: 'left' | 'center' | 'right';
  v?: 'top' | 'center';
  wrap?: boolean;
}

const GREEN = 'FF15803D';
const GREEN_BG = 'FF22C15E';
const LINE = 'FFD8E2DC';
const TEXT = 'FF334155';
const MUTED = 'FF64748B';
const YELLOW = 'FFFFFBE6';
const ZEBRA_A = 'FFF1F8F3';
const ZEBRA_B = 'FFF1F5F9';

const fonts: string[] = [];
const fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
const borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
const xfs: Xf[] = [];

function addFont(sz: number, opts: { b?: boolean; color?: string; name?: string } = {}): number {
  const name = opts.name || '微软雅黑';
  fonts.push(
    `<font><sz val="${sz}"/><name val="${name}"/><charset val="134"/>${opts.b ? '<b/>' : ''}${
      opts.color ? `<color rgb="${opts.color}"/>` : ''
    }</font>`,
  );
  return fonts.length - 1;
}

function addFill(color: string): number {
  fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`);
  return fills.length - 1;
}

function addBorder(opts: { color?: string; top?: 'thin' | 'medium' } = {}): number {
  const c = opts.color || LINE;
  const side = (name: string, style: string) => `<${name} style="${style}"><color rgb="${c}"/></${name}>`;
  borders.push(
    `<border>${side('left', 'thin')}${side('right', 'thin')}${side('top', opts.top || 'thin')}${side(
      'bottom',
      'thin',
    )}<diagonal/></border>`,
  );
  return borders.length - 1;
}

function addXf(x: Xf): number {
  xfs.push(x);
  return xfs.length - 1;
}

/* 字体 */
const F_DEF = addFont(11);
const F_TITLE = addFont(16, { b: true, color: GREEN });
const F_SUB = addFont(10, { color: MUTED });
const F_META = addFont(10, { color: TEXT });
const F_HEAD = addFont(11, { b: true, color: 'FFFFFFFF' });
const F_BODY = addFont(10.5, { color: TEXT });
const F_TOTAL = addFont(12, { b: true, color: GREEN });
const F_NOTE = addFont(9, { color: MUTED });

/* 填充 */
const FILL_HEAD = addFill(GREEN_BG);
const FILL_QUOTE = addFill(YELLOW);
const FILL_ZEBRA_A = addFill(ZEBRA_A);
const FILL_ZEBRA_B = addFill(ZEBRA_B);

/* 边框 */
const B_NONE = 0;
const B_BODY = addBorder();
const B_TOTAL = addBorder({ top: 'medium', color: GREEN });

/* 单元格样式（索引即 s 值） */
export const S = {
  /** 默认 */
  def: addXf({ fontId: F_DEF, fillId: 0, borderId: B_NONE }),
  /** 大标题 */
  title: addXf({ fontId: F_TITLE, fillId: 0, borderId: B_NONE, h: 'center', v: 'center' }),
  /** 副标题 */
  sub: addXf({ fontId: F_SUB, fillId: 0, borderId: B_NONE, h: 'center', v: 'center' }),
  /** 抬头信息（客户 / 日期 / 有效期） */
  meta: addXf({ fontId: F_META, fillId: 0, borderId: B_NONE, h: 'left', v: 'center' }),
  /** 抬头信息（右对齐） */
  metaR: addXf({ fontId: F_META, fillId: 0, borderId: B_NONE, h: 'right', v: 'center' }),
  /** 表头 */
  head: addXf({ fontId: F_HEAD, fillId: FILL_HEAD, borderId: B_BODY, h: 'center', v: 'center', wrap: true }),
  /** 正文-左 */
  text: addXf({ fontId: F_BODY, fillId: 0, borderId: B_BODY, h: 'left', v: 'center' }),
  /** 正文-中 */
  textC: addXf({ fontId: F_BODY, fillId: 0, borderId: B_BODY, h: 'center', v: 'center' }),
  /** 数字（#0.00） */
  num: addXf({ numFmt: 3, fontId: F_BODY, fillId: 0, borderId: B_BODY, h: 'right', v: 'center' }),
  /** 整数 */
  int: addXf({ numFmt: 1, fontId: F_BODY, fillId: 0, borderId: B_BODY, h: 'center', v: 'center' }),
  /** 报价列（黄底） */
  quote: addXf({ numFmt: 3, fontId: F_BODY, fillId: FILL_QUOTE, borderId: B_BODY, h: 'right', v: 'center' }),
  /** 斑马行-左 */
  zText: addXf({ fontId: F_BODY, fillId: FILL_ZEBRA_A, borderId: B_BODY, h: 'left', v: 'center' }),
  /** 斑马行-中 */
  zTextC: addXf({ fontId: F_BODY, fillId: FILL_ZEBRA_A, borderId: B_BODY, h: 'center', v: 'center' }),
  /** 斑马行-数字 */
  zNum: addXf({ numFmt: 3, fontId: F_BODY, fillId: FILL_ZEBRA_A, borderId: B_BODY, h: 'right', v: 'center' }),
  /** 斑马行-整数 */
  zInt: addXf({ numFmt: 1, fontId: F_BODY, fillId: FILL_ZEBRA_A, borderId: B_BODY, h: 'center', v: 'center' }),
  /** 斑马行-报价 */
  zQuote: addXf({ numFmt: 3, fontId: F_BODY, fillId: FILL_QUOTE, borderId: B_BODY, h: 'right', v: 'center' }),
  /** 合计-标签 */
  totalL: addXf({ fontId: F_TOTAL, fillId: FILL_ZEBRA_B, borderId: B_TOTAL, h: 'right', v: 'center' }),
  /** 合计-金额 */
  totalN: addXf({ numFmt: 3, fontId: F_TOTAL, fillId: FILL_ZEBRA_B, borderId: B_TOTAL, h: 'right', v: 'center' }),
  /** 备注 */
  note: addXf({ fontId: F_NOTE, fillId: 0, borderId: B_NONE, h: 'left', v: 'center', wrap: true }),
} as const;

/* --------------------------------- XML --------------------------------- */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // 控制字符在 XML 1.0 非法，需剔除
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function colName(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function cellXml(ref: string, c: XCell): string {
  const s = c.s ? ` s="${c.s}"` : '';
  if (c.v === null || c.v === undefined || c.v === '') return `<c r="${ref}"${s}/>`;
  if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`;
}

function buildSheetXml(sh: XSheet): string {
  const nCols = Math.max(...sh.rows.map((r) => r.cells.length), sh.cols?.length || 1, 1);
  const nRows = sh.rows.length || 1;
  const cols = (sh.cols || [])
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const rows = sh.rows
    .map((r, ri) => {
      const h = r.h ? ` ht="${r.h}" customHeight="1"` : '';
      const cells = r.cells.map((c, ci) => cellXml(`${colName(ci + 1)}${ri + 1}`, c)).join('');
      return `<row r="${ri + 1}"${h} spans="1:${nCols}">${cells}</row>`;
    })
    .join('');
  const merges = (sh.merges || [])
    .map(([r1, c1, r2, c2]) => `<mergeCell ref="${colName(c1)}${r1}:${colName(c2)}${r2}"/>`)
    .join('');
  const pane = sh.freezeRow
    ? `<pane ySplit="${sh.freezeRow}" topLeftCell="A${sh.freezeRow + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  const orient = sh.landscape === false ? 'portrait' : 'landscape';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${colName(
    nCols,
  )}${nRows}"/><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>${
    cols ? `<cols>${cols}</cols>` : ''
  }<sheetData>${rows}</sheetData>${merges ? `<mergeCells count="${sh.merges!.length}">${merges}</mergeCells>` : ''}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="${orient}" fitToWidth="1" fitToHeight="0" paperSize="9"/></worksheet>`;
}

function buildStylesXml(): string {
  const numFmts = `<numFmts count="0"/>`;
  const fontXml = `<fonts count="${fonts.length}" x14ac:knownFonts="1" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac">${fonts.join(
    '',
  )}</fonts>`;
  const fillXml = `<fills count="${fills.length}">${fills.join('')}</fills>`;
  const borderXml = `<borders count="${borders.length}">${borders.join('')}</borders>`;
  const xfXml = xfs
    .map((x) => {
      const al = `<alignment horizontal="${x.h || 'left'}" vertical="${x.v || 'center'}"${x.wrap ? ' wrapText="1"' : ''}/>`;
      const parts = [
        x.numFmt ? `numFmtId="${x.numFmt}"` : '',
        `fontId="${x.fontId}"`,
        `fillId="${x.fillId}"`,
        `borderId="${x.borderId}"`,
        'xfId="0"',
        'applyFont="1"',
        'applyFill="1"',
        'applyBorder="1"',
        'applyAlignment="1"',
        x.numFmt ? 'applyNumberFormat="1"' : '',
      ].filter(Boolean);
      return `<xf ${parts.join(' ')}>${al}</xf>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts}${fontXml}${fillXml}${borderXml}<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfXml}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/></styleSheet>`;
}

/* --------------------------------- ZIP --------------------------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

class ByteWriter {
  private parts: Uint8Array[] = [];
  len = 0;
  u8(v: number) {
    const b = new Uint8Array(1);
    b[0] = v & 0xff;
    this.parts.push(b);
    this.len += 1;
  }
  u16(v: number) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v >>> 0, true);
    this.parts.push(b);
    this.len += 2;
  }
  u32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    this.parts.push(b);
    this.len += 4;
  }
  raw(b: Uint8Array) {
    this.parts.push(b);
    this.len += b.length;
  }
  out(): Uint8Array {
    const res = new Uint8Array(this.len);
    let o = 0;
    for (const p of this.parts) {
      res.set(p, o);
      o += p.length;
    }
    return res;
  }
}

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const w = new ByteWriter();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];
  // 固定时间戳（2000-01-01 00:00），保证产物稳定
  const dosTime = 0;
  const dosDate = 0x0021; // 1980-01-01 → 用 0x0021 表示 2000-01-01
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const offset = w.len;
    w.u32(0x04034b50);
    w.u16(20);
    w.u16(0x0800);
    w.u16(0);
    w.u16(dosTime);
    w.u16(dosDate);
    w.u32(crc);
    w.u32(f.data.length);
    w.u32(f.data.length);
    w.u16(nameBytes.length);
    w.u16(0);
    w.raw(nameBytes);
    w.raw(f.data);
    central.push({ name: nameBytes, crc, size: f.data.length, offset });
  }
  const cdStart = w.len;
  for (const c of central) {
    w.u32(0x02014b50);
    w.u16(20);
    w.u16(20);
    w.u16(0x0800);
    w.u16(0);
    w.u16(dosTime);
    w.u16(dosDate);
    w.u32(c.crc);
    w.u32(c.size);
    w.u32(c.size);
    w.u16(c.name.length);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u32(0);
    w.u32(c.offset);
    w.raw(c.name);
  }
  const cdSize = w.len - cdStart;
  w.u32(0x06054b50);
  w.u16(0);
  w.u16(0);
  w.u16(central.length);
  w.u16(central.length);
  w.u32(cdSize);
  w.u32(cdStart);
  w.u16(0);
  return w.out();
}

/* --------------------------------- 入口 --------------------------------- */
export function buildXlsx(sh: XSheet, docTitle = '报价单'): Uint8Array {
  const enc = new TextEncoder();
  const sheet = buildSheetXml(sh);
  const files = [
    {
      name: '[Content_Types].xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="报价单" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    { name: 'xl/styles.xml', data: enc.encode(buildStylesXml()) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) },
    {
      name: 'docProps/core.xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(
          docTitle,
        )}</dc:title><dc:creator>优品生物 OA</dc:creator><cp:lastModifiedBy>优品生物 OA</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date()
          .toISOString()
          .slice(0, 19)}Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date()
          .toISOString()
          .slice(0, 19)}Z</dcterms:modified></cp:coreProperties>`,
      ),
    },
    {
      name: 'docProps/app.xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>优品生物 OA</Application></Properties>`,
      ),
    },
  ];
  return zipStore(files);
}

/** 触发浏览器下载 */
export function downloadXlsx(bytes: Uint8Array, filename: string): void {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
