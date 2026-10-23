/**
 * 产品收藏夹 + 报价单（本地数据层）
 * ---------------------------------------------------------------------------
 * 说明：OA 原站没有「产品收藏夹 / 报价单」模块，这是在本系统内新增的能力，
 * 数据落在浏览器 localStorage（按账号无关的全局键，多端各自独立），
 * 产品数据本身仍来自原站 /product/index/list 实时接口（加入收藏夹时快照）。
 */
import type { Product } from './types';

/** 价格解析结果：一个规格对应「目录价 / 经销价」 */
export interface QuoteSpec {
  spec: string;
  /** 目录价 */
  dir: number;
  /** 经销价 */
  dist: number;
}

/** 收藏夹里的一个产品条目（含报价参数） */
export interface QuoteItem {
  id: string;
  productId: string;
  goods_no: string;
  title: string;
  cate?: string;
  species?: string;
  /** 解析出的规格/价格列表（来自 price_desc） */
  prices: QuoteSpec[];
  /** 选择第几个规格 */
  specIndex: number;
  /** 计价方式：目录价 / 经销价 / 自定义 */
  priceType: 'dir' | 'dist' | 'custom';
  /** 自定义单价 */
  custom: number;
  qty: number;
  unit: string;
  /** 折扣（百分比，100 = 不打折，85 = 85 折） */
  discount: number;
  note: string;
  /** 是否纳入本次报价（可单独勾选） */
  sel: boolean;
  add_time: number;
}

/** 收藏夹：支持两级（顶级夹 + 子夹），产品挂在任意一级上 */
export interface QuoteFolder {
  id: string;
  name: string;
  parentId: string | null;
  items: QuoteItem[];
  create_time: number;
}

/** 已保存的报价单（快照，改价不影响历史单） */
export interface QuoteDoc {
  id: string;
  no: string;
  customer: string;
  contact: string;
  seller: string;
  date: string;
  validDays: number;
  priceType: 'dir' | 'dist';
  discount: number;
  taxRate: number;
  currency: string;
  note: string;
  folderName: string;
  rows: QuoteItem[];
  amount: number;
  create_time: number;
}

const KEY_FOLDERS = 'youpin_quote_folders_v1';
const KEY_DOCS = 'youpin_quote_docs_v1';
const KEY_SEQ = 'youpin_quote_seq_v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 忽略配额异常 */
  }
  emit();
}

/* ------------------------------ 变更订阅 ------------------------------ */
type Listener = () => void;
const listeners = new Set<Listener>();

/** 订阅收藏夹变更（产品页浮条 / 报价页同步刷新） */
export function subscribeQuote(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  listeners.forEach((f) => {
    try {
      f();
    } catch {
      /* noop */
    }
  });
  // 跨页签同步
  try {
    window.dispatchEvent(new CustomEvent('youpin-quote-change'));
  } catch {
    /* noop */
  }
}

/* ------------------------------ 收藏夹 CRUD ------------------------------ */
export function getFolders(): QuoteFolder[] {
  const list = read<QuoteFolder[]>(KEY_FOLDERS, []);
  return Array.isArray(list) ? list : [];
}

export function saveFolders(list: QuoteFolder[]): void {
  write(KEY_FOLDERS, list);
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createFolder(name: string, parentId: string | null = null): QuoteFolder {
  const f: QuoteFolder = {
    id: uid(),
    name: name.trim() || '未命名收藏夹',
    parentId,
    items: [],
    create_time: Date.now(),
  };
  const list = getFolders();
  list.push(f);
  saveFolders(list);
  return f;
}

export function renameFolder(id: string, name: string): void {
  const list = getFolders();
  const f = list.find((x) => x.id === id);
  if (!f) return;
  f.name = name.trim() || f.name;
  saveFolders(list);
}

/** 删除收藏夹（连带子夹） */
export function removeFolder(id: string): void {
  const list = getFolders();
  const dead = new Set<string>([id]);
  // 两级结构：收集直接子夹
  list.forEach((f) => {
    if (f.parentId && dead.has(f.parentId)) dead.add(f.id);
  });
  saveFolders(list.filter((f) => !dead.has(f.id)));
}

export function getFolder(id: string): QuoteFolder | undefined {
  return getFolders().find((f) => f.id === id);
}

/** 子夹列表 */
export function childFolders(parentId: string | null): QuoteFolder[] {
  return getFolders().filter((f) => (f.parentId || null) === parentId);
}

/* ------------------------------ 条目操作 ------------------------------ */

/** 产品 → 收藏条目（快照，后续原站价格变动不影响已收藏条目） */
export function toItem(p: Product): QuoteItem {
  const first = (p.goods_no || '').split(/[;；]/)[0] || '';
  return {
    id: uid(),
    productId: String(p.id ?? ''),
    goods_no: first,
    title: stripHtml(p.title || ''),
    cate: p.cate_title || '',
    species: p.species || '',
    prices: parsePrices(p.price_desc),
    specIndex: 0,
    priceType: 'dir',
    custom: 0,
    qty: 1,
    unit: p.unit || '盒',
    discount: 100,
    note: '',
    sel: true,
    add_time: Date.now(),
  };
}

/** 批量加入收藏夹（同货号重复则更新快照，不重复堆叠） */
export function addProducts(folderId: string, products: Product[]): { added: number; updated: number } {
  const list = getFolders();
  const f = list.find((x) => x.id === folderId);
  if (!f) return { added: 0, updated: 0 };
  let added = 0;
  let updated = 0;
  for (const p of products) {
    const pid = String(p.id ?? '');
    const exist = f.items.find((it) => it.productId === pid);
    if (exist) {
      // 刷新快照（保留数量/折扣等报价参数）
      const it = toItem(p);
      Object.assign(exist, {
        goods_no: it.goods_no,
        title: it.title,
        cate: it.cate,
        species: it.species,
        prices: it.prices,
        specIndex: Math.min(exist.specIndex, Math.max(0, it.prices.length - 1)),
      });
      updated++;
    } else {
      f.items.push(toItem(p));
      added++;
    }
  }
  saveFolders(list);
  return { added, updated };
}

export function updateItem(folderId: string, itemId: string, patch: Partial<QuoteItem>): void {
  const list = getFolders();
  const f = list.find((x) => x.id === folderId);
  if (!f) return;
  const it = f.items.find((x) => x.id === itemId);
  if (!it) return;
  Object.assign(it, patch);
  if (it.qty < 0) it.qty = 0;
  saveFolders(list);
}

export function removeItems(folderId: string, itemIds: string[]): void {
  const list = getFolders();
  const f = list.find((x) => x.id === folderId);
  if (!f) return;
  f.items = f.items.filter((it) => !itemIds.includes(it.id));
  saveFolders(list);
}

/** 把条目移动到另一个收藏夹 */
export function moveItems(fromId: string, itemIds: string[], toId: string): void {
  if (fromId === toId) return;
  const list = getFolders();
  const from = list.find((x) => x.id === fromId);
  const to = list.find((x) => x.id === toId);
  if (!from || !to) return;
  const moving = from.items.filter((it) => itemIds.includes(it.id));
  from.items = from.items.filter((it) => !itemIds.includes(it.id));
  for (const it of moving) {
    if (!to.items.some((x) => x.productId === it.productId)) to.items.push(it);
  }
  saveFolders(list);
}

/* ------------------------------ 价格解析 ------------------------------ */

/**
 * 解析原站 price_desc（同一字段存在多种历史格式）：
 *  A) 规格:10mg-目录价:200元-经销价:300元;规格:20mg-目录价:300元-经销价:400元
 *  B) 规格：96T-目录价：3000元/经销价：1200元,规格：48T-目录价：2400元/经销价：1000元
 *  C) 规格:10mg-价格:200元（只有单一价）
 */
export function parsePrices(desc?: string): QuoteSpec[] {
  const s = String(desc || '').replace(/&nbsp;/g, ' ').trim();
  if (!s) return [];
  const out: QuoteSpec[] = [];
  const parts = s.split(/[;；,，\r\n]+/).map((x) => x.trim()).filter(Boolean);
  for (const part of parts) {
    const segs = part.split(/[-—–/／|]+/).map((x) => x.trim()).filter(Boolean);
    let spec = '';
    let dir = 0;
    let dist = 0;
    let other = 0;
    for (const seg of segs) {
      const m = seg.match(/^([^:：]+)[:：]\s*(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      const v = m[2].trim();
      const num = parseFloat(v.replace(/[^\d.\-]/g, '')) || 0;
      if (/规格|型号|包装/.test(k)) {
        spec = v.replace(/元/g, '').trim();
      } else if (/目录|市场|标价|零售/.test(k)) {
        dir = num;
      } else if (/经销|代理|渠道|批发/.test(k)) {
        dist = num;
      } else if (/价/.test(k)) {
        other = other || num;
      }
    }
    if (!dir && !dist && other) {
      dir = other;
      dist = other;
    }
    if (spec || dir || dist) out.push({ spec: spec || '标准', dir, dist });
  }
  return out;
}

/** 单价：按计价方式取（目录价 / 经销价 / 自定义） */
export function unitPrice(it: QuoteItem): number {
  if (it.priceType === 'custom') return Number(it.custom) || 0;
  const p = it.prices[it.specIndex] || it.prices[0];
  if (!p) return 0;
  return it.priceType === 'dist' ? p.dist || p.dir : p.dir || p.dist;
}

/** 行金额：单价 × 数量 × 折扣（折扣为百分比，100 = 原价） */
export function lineAmount(it: QuoteItem): number {
  const d = Number(it.discount) || 0;
  return round2(unitPrice(it) * (Number(it.qty) || 0) * (d / 100));
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function money(n: number): string {
  const v = round2(n);
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 人民币大写（用于报价单合计） */
export function rmbUpper(n: number): string {
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟'];
  const big = ['', '万', '亿', '万亿'];
  const v = round2(Math.abs(n));
  if (v === 0) return '零元整';
  const fixed = v.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  let s = '';
  // 整数部分：按 4 位分组
  const groups: string[] = [];
  let rest = intPart;
  while (rest.length > 4) {
    groups.unshift(rest.slice(-4));
    rest = rest.slice(0, -4);
  }
  groups.unshift(rest);
  let zeroFlag = false;
  for (let g = 0; g < groups.length; g++) {
    const gi = groups.length - 1 - g; // 组序（0=个级）
    let seg = '';
    const num = groups[g];
    for (let i = 0; i < num.length; i++) {
      const d = Number(num[i]);
      const pos = num.length - 1 - i;
      if (d === 0) {
        zeroFlag = true;
      } else {
        if (zeroFlag && seg) seg += '零';
        zeroFlag = false;
        seg += digits[d] + units[pos];
      }
    }
    if (seg) s += seg + big[gi];
    else if (s && !s.endsWith('零')) s += '零';
  }
  s = s.replace(/零+$/, '') || '零';
  let out = s + '元';
  const jiao = Number(decPart[0]);
  const fen = Number(decPart[1]);
  if (jiao === 0 && fen === 0) {
    out += '整';
  } else {
    if (jiao) out += digits[jiao] + '角';
    else if (fen) out += '零';
    if (fen) out += digits[fen] + '分';
  }
  return (n < 0 ? '负' : '') + out;
}

/* ------------------------------ 报价单存档 ------------------------------ */
export function getDocs(): QuoteDoc[] {
  const list = read<QuoteDoc[]>(KEY_DOCS, []);
  return Array.isArray(list) ? list : [];
}

export function saveDoc(doc: QuoteDoc): void {
  const list = getDocs();
  list.unshift(doc);
  write(KEY_DOCS, list.slice(0, 200));
}

export function removeDoc(id: string): void {
  write(KEY_DOCS, getDocs().filter((d) => d.id !== id));
}

/** 报价单号：Q + 年月日 + 当日序号（3 位） */
export function nextQuoteNo(): string {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = (read<number>(KEY_SEQ, 0) || 0) + 1;
  write(KEY_SEQ, seq);
  return `Q${day}-${String(seq).padStart(3, '0')}`;
}

/* ------------------------------ 导出 ------------------------------ */
function csvCell(v: string | number): string {
  const s = String(v ?? '').replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

/** 报价明细导出 CSV（带 BOM，Excel 直接打开不乱码） */
export function exportQuoteCsv(rows: QuoteItem[], meta: Record<string, string>): void {
  const head = ['序号', '产品货号', '产品名称', '规格', '单位', '单价(元)', '数量', '折扣(%)', '金额(元)', '备注'];
  const lines: string[] = [];
  for (const [k, v] of Object.entries(meta)) lines.push([csvCell(k), csvCell(v)].join(','));
  lines.push('');
  lines.push(head.map(csvCell).join(','));
  rows.forEach((it, i) => {
    lines.push(
      [
        i + 1,
        it.goods_no,
        it.title,
        it.prices[it.specIndex]?.spec || '',
        it.unit,
        unitPrice(it),
        it.qty,
        it.discount,
        lineAmount(it),
        it.note,
      ]
        .map(csvCell)
        .join(','),
    );
  });
  const total = rows.reduce((s, it) => s + lineAmount(it), 0);
  const tax = Number(meta['税率(%)'] || 0) || 0;
  lines.push('');
  lines.push([csvCell(''), csvCell(''), csvCell(''), csvCell(''), csvCell(''), csvCell(''), csvCell(''), csvCell('合计'), csvCell(round2(total))].join(','));
  if (tax) {
    lines.push([csvCell(''), csvCell(''), csvCell(''), csvCell(''), csvCell(''), csvCell(''), csvCell(''), csvCell(`含税(${tax}%)`), csvCell(round2(total * (1 + tax / 100)))].join(','));
  }
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `报价单_${meta['报价单号'] || '未命名'}_${meta['客户名称'] || ''}.csv`.replace(/\s+/g, '');
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

/* ------------------------------ 工具 ------------------------------ */
export function stripHtml(s: string): string {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

/** 汇总：合计 / 折后 / 含税 */
export function sumQuote(rows: QuoteItem[], taxRate: number) {
  const list = rows.filter((r) => r.sel);
  const total = round2(list.reduce((s, it) => s + lineAmount(it), 0));
  const origin = round2(list.reduce((s, it) => s + unitPrice(it) * (Number(it.qty) || 0), 0));
  const tax = round2(total * ((Number(taxRate) || 0) / 100));
  return { total, origin, tax, gross: round2(total + tax), count: list.length };
}
