/**
 * 生成演示用静态资源：
 *   public/data/manual/<货号>.pdf  — 说明书（真实可渲染的 PDF，供 pdf.js / 浏览器内嵌预览）
 *   public/data/报价表.xlsx        — 报价表（真实 xlsx）
 *   public/favicon.svg
 * 运行：node scripts/gen-demo-assets.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANUAL_DIR = join(ROOT, 'public', 'data', 'manual');
mkdirSync(MANUAL_DIR, { recursive: true });
mkdirSync(join(ROOT, 'public', 'data'), { recursive: true });

/* ============================ 极简 PDF 生成 ============================ */

function makePdf(lines) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content =
    'BT /F1 18 Tf 60 780 Td (' + esc(lines[0]) + ') Tj ET\n' +
    'BT /F1 12 Tf 60 740 Td (' + esc(lines[1]) + ') Tj ET\n' +
    lines.slice(2)
      .map((l, i) => 'BT /F1 11 Tf 60 ' + (700 - i * 22) + ' Td (' + esc(l) + ') Tj ET')
      .join('\n') +
    '\n';

  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    pdf += String(o).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/* ============================ 产品清单（与 demoData.ts 一致） ============================ */

const PRODUCTS = [
  ['YP-Ab-12429', '科研原料 FGF-19 Rabbit pAb', '一抗', '¥ 2,380.00', '100μL', 'Rabbit'],
  ['YP-mAb-12429', '科研原料 FGF-19 Mouse mAb', '一抗', '¥ 3,180.00', '100μL', 'Mouse'],
  ['YP-rAb-18051', '科研原料 Notch1 Rabbit mAb', '一抗', '¥ 2,980.00', '100μL', 'Rabbit'],
  ['YP848536-H', '山羊抗小鼠 IgG(H+L) — HRP', '二抗', '¥ 860.00', '1mL', 'Goat'],
  ['YP848537-H', '山羊抗兔 IgG(H+L) — HRP', '二抗', '¥ 860.00', '1mL', 'Goat'],
  ['YPE800085', '山羊抗兔 IgG(H+L) Cy3 标记', '二抗', '¥ 1,260.00', '500μL', 'Goat'],
  ['YPE800104', '山羊抗兔 IgG(H+L) Cy5 标记', '二抗', '¥ 1,380.00', '500μL', 'Goat'],
  ['YP-Rec-0117', '重组人 FGF-19 蛋白', '重组蛋白', '¥ 4,600.00', '50μg', 'E.coli'],
];

let count = 0;
for (const [goodsNo, title, cate, price, specs, species] of PRODUCTS) {
  for (const suffix of ['', '-S']) {
    const no = goodsNo + suffix;
    const buf = makePdf([
      'Youpin Bio - Product Manual',
      `${title}${suffix ? ' (Short Version)' : ''}`,
      `Catalog No. : ${no}`,
      `Category    : ${cate}`,
      `Price       : ${price}`,
      `Specification: ${specs}`,
      `Species     : ${species}`,
      `Application : WB / IHC / IF / ELISA`,
      `Storage     : -20 C, avoid repeated freeze-thaw`,
      `Purity      : >= 95%`,
      '',
      'Wuhan Youpin Biological Technology Co., Ltd.',
    ]);
    writeFileSync(join(MANUAL_DIR, `${no}.pdf`), buf);
    count++;
  }
}
console.log(`生成说明书 PDF：${count} 个`);

/* ============================ 报价表 xlsx ============================ */

async function makeXlsx() {
  const zip = new JSZip();
  const rows = [
    ['货号', '产品名称', '规格', '单价(元)', '数量', '小计(元)'],
    ...PRODUCTS.map(([no, title, , price, specs]) => [
      no, title, specs, price.replace(/[^\d.]/g, ''), '1', price.replace(/[^\d.]/g, ''),
    ]),
  ];
  const sheetRows = rows
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">` +
        r
          .map((cell, ci) => {
            const col = String.fromCharCode(65 + ci);
            const isNum = ri > 0 && ci >= 3;
            return isNum
              ? `<c r="${col}${ri + 1}"><v>${cell}</v></c>`
              : `<c r="${col}${ri + 1}" t="inlineStr"><is><t>${cell}</t></is></c>`;
          })
          .join('') +
        `</row>`,
    )
    .join('');

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="报价表" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`);
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  );

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  writeFileSync(join(ROOT, 'public', 'data', '报价表.xlsx'), buf);
  console.log('生成报价表.xlsx');
}

/* ============================ favicon ============================ */

writeFileSync(
  join(ROOT, 'public', 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#1E6FFF"/>
  <text x="32" y="42" font-size="30" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-weight="700" fill="#ffffff" text-anchor="middle">优</text>
</svg>`,
);
console.log('生成 favicon.svg');

await makeXlsx();
console.log('完成');
