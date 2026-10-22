/**
 * 从 origin-snapshot 自动生成「原站页面表格规格」→ src/core/pageSpecs.ts
 *
 * 提取每个页面的：
 *   - url      ：主列表数据接口（锚定 table.render 之后的 url: '...'）
 *   - cols     ：列定义（field / title / width / minWidth / align，跳过 checkbox & 纯工具列）
 *   - toolbar  ：工具栏 lay-event
 *   - rowOps   ：行内 lay-event
 *
 * 产物被桌面端通用真实表格（DesktopTable）消费，用来 1:1 渲染原站的列。
 */
import fs from 'node:fs';
import path from 'node:path';

const SNAP = path.join(process.cwd(), 'origin-snapshot');
const OUT = path.join(process.cwd(), 'src', 'core', 'pageSpecs.ts');

/** 菜单 key → 快照文件（与 verify-columns.mjs 的 PAGE_MAP 保持一致） */
const PAGE_MAP = {
  files: 'files.html',
  note: 'note.html',
  approve: 'approve.html',
  'finance-advance': 'advancedeposit.html',
  deduction: 'deduction.html',
  'deduction-checked': 'deduction-checked.html',
  margin: 'margindeposit.html',
  'invoice-my': 'invoice-apply.html',
  'invoice-handle': 'invoice-handle.html',
  'finance-income': 'income-invoice.html',
  'finance-order': 'orderapply-apply.html',
  'orderapply-handle': 'orderapply-handle.html',
  customer: 'customer.html',
  'customer-sea': 'customer-sea.html',
  'customer-trash': 'customer-trash.html',
  contact: 'contact.html',
  chance: 'chance.html',
  trace: 'trace.html',
  'order-my': 'order-apply.html',
  'order-handle': 'order-handle.html',
  sample: 'sample.html',
  school: 'schoolexhibition.html',
  'school-handle': 'schoolexhibition-handle.html',
  article: 'article.html',
  after: 'aftersale.html',
  product: 'product.html',
};

/** 取主列表 cols 块原文（锚定 table.render，兼容换行/制表符） */
function colsBlock(html) {
  const anchor = /table\.render\s*\(/.exec(html);
  const from = anchor ? anchor.index : 0;
  const m = /cols:\s*\[\s*\[/.exec(html.slice(from));
  if (!m) return null;
  const start = html.indexOf('[', from + m.index);
  let depth = 0;
  let i = start;
  for (; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  return html.slice(start, i + 1);
}

/** 解析 cols 块里的列（去掉块注释 /*...*Ⳃ/ 与行注释 //，跳过 checkbox & 工具列） */
function parseCols(block) {
  if (!block) return [];
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, ''); // 块注释列（原站临时停用的列）
  const cols = [];
  // 逐列对象：{...} 可能嵌套，用简单括号配对切分
  const objs = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) objs.push(clean.slice(start, i + 1));
    }
  }
  for (const o of objs) {
    const lineStart = clean.lastIndexOf('\n', clean.indexOf(o)) + 1;
    const prefix = clean.slice(lineStart, clean.indexOf(o));
    if (prefix.includes('//')) continue; // 行注释列
    if (/\btype\s*:\s*'(checkbox|radio|numbers|space)'/.test(o)) continue;
    const field = /\bfield\s*:\s*'([^']+)'/.exec(o);
    const title = /\btitle\s*:\s*'([^']+)'/.exec(o);
    if (!field || !title) continue;
    const width = /\bwidth\s*:\s*(\d+)/.exec(o);
    const minWidth = /\bminWidth\s*:\s*(\d+)/.exec(o);
    const align = /\balign\s*:\s*'([^']+)'/.exec(o);
    const fixed = /\bfixed\s*:\s*'([^']+)'/.exec(o);
    // 工具列（toolbar: '...' 或 field: 'right'）单独处理
    if (/\btoolbar\s*:\s*'/.test(o) || field[1] === 'right') {
      cols.push({ field: '__ops', title: title[1], width: width ? Number(width[1]) : undefined, align: 'center', fixed: fixed ? fixed[1] : undefined });
      continue;
    }
    cols.push({
      field: field[1],
      title: title[1],
      width: width ? Number(width[1]) : undefined,
      minWidth: minWidth ? Number(minWidth[1]) : undefined,
      align: align ? align[1] : undefined,
    });
  }
  return cols;
}

/** 主列表接口 url（table.render 之后第一个 url: '...'） */
function listUrl(html) {
  const anchor = /table\.render\s*\(/.exec(html);
  const from = anchor ? anchor.index : 0;
  const m = /url\s*:\s*"([^"]+)"|url\s*:\s*'([^']+)'/.exec(html.slice(from));
  return m ? m[1] || m[2] : '';
}

function events(html) {
  return [...new Set([...html.matchAll(/lay-event="([^"]+)"/g)].map((m) => m[1]))];
}

const specs = {};
for (const [key, file] of Object.entries(PAGE_MAP)) {
  const p = path.join(SNAP, file);
  if (!fs.existsSync(p)) continue;
  const html = fs.readFileSync(p, 'utf8');
  const cols = parseCols(colsBlock(html));
  const evs = events(html);
  // 行内操作：出现在表格 templet 里的 lay-event（通常是 view/edit/del/...）
  const ROW_KNOWN = new Set(['view', 'edit', 'del', 'remove', 'delete', 'detail', 'check', 'approve', 'reject', 'back', 'restore', 'print', 'download', 'copy', 'visit', 'classification', 'get', 'distribute', 'recall', 'pay', 'invoice', 'recv']);
  specs[key] = {
    file,
    url: listUrl(html),
    cols,
    rowOps: evs.filter((e) => ROW_KNOWN.has(e)),
    toolbar: evs.filter((e) => !ROW_KNOWN.has(e)),
  };
  console.log(
    `${key.padEnd(20)} cols=${String(cols.length).padStart(2)} url=${specs[key].url.padEnd(34)} rowOps=${specs[key].rowOps.join(',')}`,
  );
}

const body = Object.entries(specs)
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  .join('\n');

const out = `/**
 * ★ 自动生成（scripts/gen-page-specs.mjs），请勿手改。
 * 来源：origin-snapshot/*.html 中 layui pageTable 的 cols / url / lay-event。
 *
 * 桌面端通用真实表格按这里渲染，保证列与原站 1:1。
 * 每次重新抓取原站页面后重跑：node scripts/gen-page-specs.mjs
 */

export interface SpecCol {
  field: string;
  title: string;
  width?: number;
  minWidth?: number;
  align?: string;
  fixed?: string;
}

export interface PageSpec {
  file: string;
  url: string;
  cols: SpecCol[];
  rowOps: string[];
  toolbar: string[];
}

export const PAGE_SPECS: Record<string, PageSpec> = {
${body}
};

export function pageSpec(key: string): PageSpec | null {
  return PAGE_SPECS[key] || null;
}
`;

fs.writeFileSync(OUT, out, 'utf8');
console.log('\n已写入', OUT, '共', Object.keys(specs).length, '页');
