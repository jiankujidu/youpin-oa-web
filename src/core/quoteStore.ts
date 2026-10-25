/**
 * 产品收藏夹 + 报价单（本地数据层）
 * ---------------------------------------------------------------------------
 * 说明：OA 原站没有「产品收藏夹 / 报价单」模块，这是在本系统内新增的能力，
 * 数据落在浏览器 localStorage（按账号无关的全局键，多端各自独立），
 * 产品数据本身仍来自原站 /product/index/list 实时接口（加入收藏夹时快照）。
 */
import type { Product } from './types';
import { fetchProductPage } from './api';
import { buildXlsx, downloadXlsx, S, type XCell, type XRow } from './xlsx';
import { parsePrices, priceBasisNote, hasAnyPrice } from './priceParse';
import type { QuoteSpec, Basis } from './priceParse';

export type { QuoteSpec, Basis } from './priceParse';
export { parsePrices, priceBasisNote, hasAnyPrice } from './priceParse';

/** 价格解析结果：一个规格对应「目录价 / 经销价」 */

/**
 * 说明书快照（收藏夹条目自带，用于「批量下载说明书 / 打包收藏夹」）。
 * 只存 OA 文件 id 与文件名，**不存完整地址**——下载地址在下载时按当前代理前缀重建，
 * 这样换部署（pages.dev / 本机 / GitHub Pages）也不会因为快照里写死了旧域名而失效。
 */
export interface DocSnap {
  /** 货号 */
  no: string;
  /** OA 文件 id（get_oss_file?id=N） */
  id?: string;
  /** OSS 静态路径兜底（/oss/<年月>/<md5>.pdf） */
  ossPath?: string;
  /** 说明书文件名（含 .pdf） */
  fileName?: string;
}

/** 收藏夹里的一个产品条目（含报价参数） */
export interface QuoteItem {
  id: string;
  productId: string;
  goods_no: string;
  title: string;
  cate?: string;
  /** 种属 */
  species?: string;
  /** 应用场景（原站 application） */
  application?: string;
  /** 方法学 */
  method?: string;
  /** 基因名称 */
  gene?: string;
  /** 分子量 */
  mw?: string;
  /** 来源 */
  source?: string;
  /** 解析出的规格/价格列表（来自 price_desc） */
  prices: QuoteSpec[];
  /** 原站 price_desc 原文（价格溯源用——导出报价方案时可逐项核对来源） */
  priceRaw?: string;
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
  /** 说明书快照（批量下载 / 打包用） */
  docs?: DocSnap[];
  /**
   * 已经回原站查过、且原站**确实没有值**的属性字段。
   * ★ 原站 application 等字段常年为空，没有这个标记就会每次都以为"还缺"、
   *   「补全属性(N)」的计数永远降不下来、页面一直显示「—」。
   */
  attrsFetched?: string[];
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
  /** 客户类型：retail 终端 / dealer 经销商（决定历史单是否体现经销价） */
  mode?: 'retail' | 'dealer';
  /** 附加属性列 */
  extra?: string[];
  showDiscount?: boolean;
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

/**
 * ★ 条目自愈：解析能力升级后，旧收藏条目的 prices 还是**旧解析器**留下的空数组，
 *   页面就会显示「规格 — / 报价 0」。只要条目存了原站原文 priceRaw，这里就地重解析，
 *   不需要用户重新收藏一遍。
 */
const rehydrated = new Map<string, QuoteSpec[]>();

function rehydrate(it: QuoteItem): QuoteItem {
  if (it.prices && it.prices.length) return it;
  const raw = String(it.priceRaw || '');
  if (!raw.trim()) return it;
  const cached = rehydrated.get(it.id);
  const prices = cached ?? parsePrices(raw);
  if (!cached) rehydrated.set(it.id, prices);
  return prices.length ? { ...it, prices } : it;
}

export function getFolders(): QuoteFolder[] {
  const list = read<QuoteFolder[]>(KEY_FOLDERS, []);
  if (!Array.isArray(list)) return [];
  return list.map((f) => ({ ...f, items: (f.items || []).map(rehydrate) }));
}

/**
 * 回原站按货号重拉 price_desc，补齐「没有价格」的条目（更老的数据连 priceRaw 都没存）。
 *
 * ★ 分两段：先**并发只读**回原站取（不写库），再**串行**写库 ——
 *   updateItem 是 read-modify-write，并发写会互相覆盖。
 */
export async function refreshItemPrices(
  rows: { folderId: string; item: QuoteItem }[],
  onProgress?: (done: number, total: number, stage?: '刷新价格') => void,
): Promise<{ fixed: number; still: number }> {
  const targets = rows.filter((r) => !(r.item.prices && r.item.prices.length));
  if (!targets.length) return { fixed: 0, still: 0 };

  /* ---- 阶段 1：并发回原站取（只读） ---- */
  const got = new Array<{ desc: string; prices: QuoteSpec[]; unit?: string; docs?: DocSnap[] }>(
    targets.length,
  );
  let done = 0;
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;
      const t = targets[i];
      const own = String(t.item.priceRaw || '');
      if (own.trim()) {
        got[i] = { desc: own, prices: parsePrices(own) };
      } else if (t.item.goods_no) {
        let desc = '';
        let unit: string | undefined;
        let docs: DocSnap[] | undefined;
        try {
          const { rows: list } = await fetchProductPage(t.item.goods_no, 1, 10);
          // ★ 按货号变体匹配，避免多货号产品取错行（规格/属性对不上）
          const m = matchProduct(list, t.item.goods_no);
          if (m) {
            desc = String(m.price_desc ?? '');
            unit = m.unit || undefined;
            // ★ 顺带把说明书快照写回条目：下次打包不必再回原站查，
      //   既快又避免再次触发原站频控导致别的说明书下不下来。
            const all = docsOf(m);
            const hit = all.filter((d) => d.no === t.item.goods_no);
            docs = hit.length ? hit : all.length === 1 ? all : undefined;
          }
        } catch {
          /* 单条失败不影响整体 */
        }
        got[i] = { desc, prices: desc.trim() ? parsePrices(desc) : [], unit, docs };
      } else {
        got[i] = { desc: '', prices: [] };
      }
      done++;
      onProgress?.(done, targets.length, '刷新价格');
    }
  };
  // ★ 并发压到 2：原站列表接口有频控，并发高了会被限流
  await Promise.all([worker(), worker()]);

  /* ---- 阶段 2：串行写库 ---- */
  let fixed = 0;
  targets.forEach((t, i) => {
    const g = got[i];
    if (!g) return;
    const patch: Partial<QuoteItem> = { priceRaw: g.desc, prices: g.prices };
    if (g.unit) patch.unit = g.unit;
    if (g.docs && g.docs.length) patch.docs = g.docs;
    updateItem(t.folderId, t.item.id, patch);
    if (g.prices.length) fixed++;
  });
  return { fixed, still: targets.length - fixed };
}

/* ------------------------------ 属性自愈 ------------------------------ */

/**
 * 报价单里要体现的产品属性（用户定稿：「没有不体现，有的一定要体现」）。
 * 顺序即展示顺序，改名/加列改这里即可。
 */
export const QUOTE_ATTR_KEYS = [
  'species',
  'application',
  'method',
  'gene',
  'mw',
  'source',
] as const;

/** 条目还缺哪些属性（全齐返回空数组）
 *  ★ 已回原站确认过「原站就是没有」的字段不再算缺（force=true 时忽略该标记，强制重查） */
export function missingAttrKeys(it: QuoteItem, force = false): string[] {
  const fetched = new Set(force ? [] : it.attrsFetched || []);
  return QUOTE_ATTR_KEYS.filter((k) => !String(it[k] || '').trim() && !fetched.has(k));
}

/**
 * 在原站返回的产品列表里定位条目对应的产品。
 *
 * ★ 必须按「货号变体」匹配，不能只看 split(';')[0]：
 *   原站一个产品的 goods_no 常写成 'A;B;C'，而收藏条目存的是其中某一个变体货号。
 *   只看第一段会让 B/C 匹配不上，回落 list[0] 就可能取错产品（规格/属性对不上）。
 */
function matchProduct(list: Product[], goodsNo: string): Product | undefined {
  if (!list.length) return undefined;
  const no = String(goodsNo || '').trim();
  if (!no) return list[0];
  const exact = list.find((p) =>
    String(p.goods_no || '')
      .split(/[;；]/)
      .some((x) => x.trim() === no),
  );
  if (exact) return exact;
  const head = list.find((p) => String(p.goods_no || '').split(/[;；]/)[0].trim() === no);
  return head || list[0];
}

/** 产品行 → 只带「条目目前缺、且原站确实有值」的补丁 */
function attrPatchOf(p: Product, it: QuoteItem, force = false): Partial<QuoteItem> {
  const anyP = p as unknown as Record<string, unknown>;
  const miss = new Set(missingAttrKeys(it, force));
  const patch: Record<string, unknown> = {};
  const put = (k: (typeof QUOTE_ATTR_KEYS)[number], v: unknown) => {
    if (!miss.has(k)) return;
    const s = String(v ?? '').trim();
    if (s) patch[k] = s;
  };
  put('species', p.species);
  put('application', p.application);
  put('method', p.methodology);
  put('gene', anyP.gene_name);
  put('mw', anyP.da);
  put('source', p.source);

  // ★ 记下「已回原站查过」的字段：原站就是空的那些以后不再反复去查
  if (miss.size) {
    const done = new Set([...(it.attrsFetched || []), ...miss]);
    patch.attrsFetched = [...done];
  }

  // 顺带补齐价格原文 / 说明书快照（缺哪个补哪个，已有的一律不覆盖）
  if (!String(it.priceRaw || '').trim()) {
    const desc = String(anyP.price_desc ?? '');
    if (desc.trim()) {
      patch.priceRaw = desc;
      if (!(it.prices && it.prices.length)) patch.prices = parsePrices(desc);
    }
  }
  if (!(it.docs && it.docs.length)) {
    const all = docsOf(p);
    const hit = all.filter((d) => d.no === it.goods_no);
    const docs = hit.length ? hit : all.length === 1 ? all : [];
    if (docs.length) patch.docs = docs;
  }
  return patch as Partial<QuoteItem>;
}

/**
 * 回原站按货号补齐**产品属性**（种属/应用场景/方法学/基因名称/分子量/来源）。
 *
 * ★ 与 refreshItemPrices 同一套并发模型：先并发只读回原站取，再串行写库。
 *   只填「原本为空」的字段，不覆盖用户或原站已有的值。
 */
export async function refreshItemAttrs(
  rows: { folderId: string; item: QuoteItem }[],
  onProgress?: (done: number, total: number, stage?: '补全属性') => void,
  force = false,
): Promise<{ fixed: number; still: number }> {
  const targets = rows.filter(
    (r) => String(r.item.goods_no || '').trim() && missingAttrKeys(r.item, force).length,
  );
  if (!targets.length) return { fixed: 0, still: 0 };

  const got = new Array<Partial<QuoteItem> | null>(targets.length).fill(null);
  let done = 0;
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;
      const t = targets[i];
      try {
        const { rows: list } = await fetchProductPage(t.item.goods_no, 1, 10);
        const m = matchProduct(list, t.item.goods_no);
        if (m) got[i] = attrPatchOf(m, t.item, force);
      } catch {
        /* 单条失败不影响整体 */
      }
      done++;
      onProgress?.(done, targets.length, '补全属性');
    }
  };
  await Promise.all([worker(), worker()]);

  let fixed = 0;
  targets.forEach((t, i) => {
    const patch = got[i];
    if (!patch || !Object.keys(patch).length) return;
    updateItem(t.folderId, t.item.id, patch);
    fixed++;
  });
  return { fixed, still: targets.length - fixed };
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

/**
 * 产品行 → 说明书快照列表。
 * 数据源：原站列表接口返回的 `goods_no_list`（每个货号变体一条，含 pc_goods_no_url）。
 * 只取 OA 文件 id（get_oss_file?id=N）与文件名，不存完整地址。
 */
export function docsOf(p: Product): DocSnap[] {
  const list = ((p as unknown as Record<string, unknown>).goods_no_list || []) as Record<
    string,
    unknown
  >[];
  const out: DocSnap[] = [];
  for (const g of list) {
    const no = String(g.goods_no || '').trim();
    if (!no) continue;
    const raw = String(g.pc_goods_no_url || g.goods_no_url || '');
    const id = raw.match(/[?&]id=(\d+)/)?.[1] || '';
    // OSS 签名直链的静态路径（下载时走 /oss/ 兜底，签名本身永远 403）
    const ossPath = String(g.goods_no_url || '').match(
      /^(?:https?:)?\/\/static\.upingbio\.cn\/oa\/([^?#]+)/i,
    )?.[1];
    const desc = String(g.goods_no_desc || '').trim();
    out.push({ no, id: id || undefined, ossPath, fileName: desc || undefined });
  }
  return out;
}

/** 产品 → 收藏条目（快照，后续原站价格变动不影响已收藏条目） */
export function toItem(p: Product): QuoteItem {
  const first = (p.goods_no || '').split(/[;；]/)[0] || '';
  const anyP = p as unknown as Record<string, unknown>;
  const docs = docsOf(p);
  const own = docs.filter((d) => d.no === first);
  return {
    id: uid(),
    productId: String(p.id ?? ''),
    goods_no: first,
    title: stripHtml(p.title || ''),
    cate: p.cate_title || '',
    species: p.species || '',
    application: p.application || '',
    method: p.methodology || '',
    gene: String(anyP.gene_name || ''),
    mw: String(anyP.da || ''),
    source: p.source || '',
    prices: parsePrices(p.price_desc),
    priceRaw: String((p as unknown as Record<string, unknown>).price_desc ?? ''),
    specIndex: 0,
    priceType: 'dir',
    custom: 0,
    qty: 1,
    unit: p.unit || '盒',
    discount: 100,
    note: '',
    sel: true,
    docs: own.length ? own : docs.length === 1 ? docs : [],
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
        application: it.application,
        method: it.method,
        gene: it.gene,
        mw: it.mw,
        source: it.source,
        prices: it.prices,
        priceRaw: it.priceRaw,
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

/** 按「具体货号」批量加入收藏夹（同一产品的不同货号各为一条；同产品同货号去重不堆叠） */
export function addVariants(
  folderId: string,
  entries: { product: Product; goodsNo: string }[],
): { added: number; updated: number } {
  const list = getFolders();
  const f = list.find((x) => x.id === folderId);
  if (!f) return { added: 0, updated: 0 };
  let added = 0;
  let updated = 0;
  for (const { product, goodsNo } of entries) {
    const pid = String((product as unknown as Record<string, unknown>).id ?? '');
    const gno = goodsNo || ((product.goods_no || '').split(/[;；]/)[0] || '');
    const exist = f.items.find((it) => it.productId === pid && it.goods_no === gno);
    const base = toItem(product);
    // 说明书快照只留该货号对应的那条（一个产品挂多个公司货号时各挂各的说明书；
    //  该货号本来就没有说明书 → 空数组，属实，不借用别的货号的说明书）
    const doc = docsOf(product).find((d) => d.no === gno);
    if (exist) {
      Object.assign(exist, {
        goods_no: gno,
        title: base.title,
        cate: base.cate,
        species: base.species,
        application: base.application,
        method: base.method,
        gene: base.gene,
        mw: base.mw,
        source: base.source,
        prices: base.prices,
        priceRaw: base.priceRaw,
        specIndex: Math.min(exist.specIndex, Math.max(0, base.prices.length - 1)),
        docs: doc ? [doc] : [],
      });
      updated++;
    } else {
      base.goods_no = gno;
      base.docs = doc ? [doc] : [];
      f.items.push(base);
      added++;
    }
  }
  saveFolders(list);
  return { added, updated };
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

/** 纯数字（价格） */
function isNum(x: string): boolean {
  return /^\d+(\.\d+)?$/.test(x);
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

/** 报价单输出选项：决定列集合、是否体现经销价、是否体现折扣 */
export interface QuoteOpts {
  /** retail = 终端客户（不体现经销价，报价取目录价）；dealer = 经销商（体现经销价，报价取经销价） */
  mode: 'retail' | 'dealer';
  /** 是否输出折扣列（默认关闭） */
  showDiscount: boolean;
  /** 附加属性列：cate 分类 / method 方法学 / gene 基因名称 / mw 分子量 / source 来源 */
  extra: string[];
  /** 是否输出备注列 */
  showNote: boolean;
  /**
   * 本单**所有行都没有值**的属性列直接不出现（用户定稿：「没有不体现，有的一定要体现」）。
   * 由 effQuoteOpts 根据实际数据算出来，不手工指定。
   */
  skip?: string[];
}

export const DEF_QUOTE_OPTS: QuoteOpts = {
  mode: 'retail',
  showDiscount: false,
  extra: [],
  showNote: false,
};

/** 可选附加列定义 */
export const EXTRA_COLS: { key: string; title: string; width: number; get: (it: QuoteItem) => string }[] = [
  { key: 'cate', title: '分类', width: 12, get: (it) => it.cate || '' },
  { key: 'method', title: '方法学', width: 10, get: (it) => it.method || '' },
  { key: 'gene', title: '基因名称', width: 12, get: (it) => it.gene || '' },
  { key: 'mw', title: '分子量', width: 10, get: (it) => it.mw || '' },
  { key: 'source', title: '来源', width: 10, get: (it) => it.source || '' },
];

/** 报价单一列：明细表 / 预览 / Excel / CSV 共用同一套定义 */
export interface QuoteCol {
  key: string;
  title: string;
  /** Excel 列宽（字符） */
  width: number;
  /** 单元格形态：text 左 / textC 中 / num 金额 / int 整数 / quote 报价（黄底） */
  kind: 'text' | 'textC' | 'num' | 'int' | 'quote';
  get: (it: QuoteItem) => string | number;
}

/** 恒显示的属性列（种属 / 应用场景）—— 但整单全空时同样不出现 */
const ALWAYS_COLS: { key: string; title: string; width: number; kind: QuoteCol['kind']; get: (it: QuoteItem) => string }[] = [
  { key: 'species', title: '种属', width: 10, kind: 'textC', get: (it) => it.species || '' },
  { key: 'application', title: '应用场景', width: 16, kind: 'text', get: (it) => it.application || '' },
];

/** 按选项生成列（种属、应用场景随数据有无出现；经销价列随 mode 出现；折扣列随开关出现） */
export function quoteColumns(opts: QuoteOpts): QuoteCol[] {
  const o = { ...DEF_QUOTE_OPTS, ...(opts || {}) };
  const skip = new Set(o.skip || []);
  const cols: QuoteCol[] = [
    { key: 'idx', title: '序号', width: 5, kind: 'int', get: () => '' },
    { key: 'goods_no', title: '货号', width: 22, kind: 'text', get: (it) => it.goods_no || '' },
    { key: 'title', title: '产品名称', width: 34, kind: 'text', get: (it) => it.title || '' },
  ];
  for (const c of ALWAYS_COLS) {
    if (skip.has(c.key)) continue;
    cols.push({ key: c.key, title: c.title, width: c.width, kind: c.kind, get: c.get });
  }
  for (const k of o.extra || []) {
    const d = EXTRA_COLS.find((x) => x.key === k);
    if (d) cols.push({ key: d.key, title: d.title, width: d.width, kind: 'text', get: d.get });
  }
  cols.push(
    {
      key: 'spec',
      title: '规格',
      width: 12,
      kind: 'textC',
      // ★ 多品牌产品：规格前带品牌，否则同一个规格出现多行分不清是哪个品牌
      get: (it) => {
        const p = it.prices[it.specIndex] || it.prices[0];
        if (!p) return '';
        const sp = p.spec || '标准';
        return p.brand ? `${p.brand} / ${sp}` : sp;
      },
    },
    { key: 'unit', title: '计价方式', width: 9, kind: 'textC', get: (it) => it.unit || '' },
    { key: 'dir', title: '目录价', width: 12, kind: 'num', get: (it) => it.prices[it.specIndex]?.dir || 0 },
  );
  if (o.mode === 'dealer') {
    cols.push({ key: 'dist', title: '经销价(底价)', width: 13, kind: 'num', get: (it) => it.prices[it.specIndex]?.dist || 0 });
  }
  if (o.showDiscount) {
    cols.push({ key: 'discount', title: '折扣(%)', width: 9, kind: 'int', get: (it) => Number(it.discount) || 0 });
  }
  cols.push(
    { key: 'quote', title: '报价', width: 12, kind: 'quote', get: (it) => unitPrice(it) },
    { key: 'qty', title: '数量', width: 7, kind: 'int', get: (it) => Number(it.qty) || 0 },
    { key: 'amount', title: '小计', width: 13, kind: 'num', get: (it) => lineAmount(it) },
  );
  if (o.showNote) cols.push({ key: 'note', title: '备注', width: 18, kind: 'text', get: (it) => it.note || '' });
  return cols;
}

/**
 * 按「实际数据」收敛输出选项——用户原话：「没有不体现，有的一定要体现」。
 *
 * 用户在「报价单输出选项」里勾选的附加属性列（分类/方法学/基因名称/分子量/来源），
 * 如果本次勾选的产品里**没有任何一行**有值（原站该字段本就是空的），
 * 这一列在预览/Excel/CSV 里直接不出现；至少一行有值的列才保留，
 * 列内没有值的单元格留空（不填「—」占位）。备注列同理。
 */
export function effQuoteOpts(opts: QuoteOpts, items: QuoteItem[]): QuoteOpts {
  const picked = opts.extra || [];
  const extra = picked.filter((k) => {
    const d = EXTRA_COLS.find((x) => x.key === k);
    return d ? items.some((it) => String(d.get(it) ?? '').trim() !== '') : false;
  });
  const showNote = !!opts.showNote && items.some((it) => String(it.note || '').trim() !== '');
  // ★ 种属 / 应用场景：原站这一单里全都没有值 → 整列不出现（不留一列「—」）
  const skip = ALWAYS_COLS.filter(
    (c) => !items.some((it) => String(c.get(it) ?? '').trim() !== ''),
  ).map((c) => c.key);
  const sameSkip = JSON.stringify(skip) === JSON.stringify(opts.skip || []);
  if (extra.length === picked.length && showNote === !!opts.showNote && sameSkip) return opts;
  return { ...opts, extra, showNote, skip };
}

/** 报价单抬头 + 汇总（Excel / CSV 共用） */
export interface QuoteSheetInfo {
  no: string;
  customer: string;
  contact: string;
  seller: string;
  date: string;
  validDays: number;
  /** 价格类型文案，如「目录价（终端客户）」 */
  priceLabel: string;
  taxRate: number;
  total: number;
  tax: number;
  gross: number;
  note: string;
}

function csvCell(v: string | number): string {
  const s = String(v ?? '').replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

function fileName(meta: { no?: string; customer?: string }, ext: string): string {
  const no = (meta.no || '未命名').replace(/[\\/:*?"<>|\s]/g, '');
  const cus = (meta.customer || '未命名客户').replace(/[\\/:*?"<>|\s]/g, '');
  return `报价单_${cus}_${no}.${ext}`;
}

/** 报价明细导出 CSV（带 BOM，Excel 直接打开不乱码） */
export function exportQuoteCsv(rows: QuoteItem[], info: QuoteSheetInfo, opts: QuoteOpts): void {
  const cols = quoteColumns(opts);
  const lines: string[] = [];
  lines.push([csvCell('报价单号'), csvCell(info.no), csvCell('客户'), csvCell(info.customer)].join(','));
  lines.push([csvCell('联系人'), csvCell(info.contact), csvCell('销售'), csvCell(info.seller)].join(','));
  lines.push([csvCell('报价日期'), csvCell(info.date), csvCell('价格类型'), csvCell(info.priceLabel)].join(','));
  lines.push('');
  lines.push(cols.map((c) => csvCell(c.title)).join(','));
  rows.forEach((it, i) => {
    lines.push(
      cols.map((c) => csvCell(c.key === 'idx' ? i + 1 : c.get(it))).join(','),
    );
  });
  lines.push('');
  const pad = cols.length - 2;
  lines.push([...Array(pad).fill(''), csvCell('合计'), csvCell(round2(info.total))].join(','));
  if (info.taxRate) {
    lines.push([...Array(pad).fill(''), csvCell(`含税(${info.taxRate}%)`), csvCell(round2(info.gross))].join(','));
  }
  if (info.note) lines.push([csvCell('备注'), csvCell(info.note)].join(','));
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName(info, 'csv');
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

/** 报价单导出 Excel（.xlsx，按报价单模板排版：大标题 + 抬头 + 表头 + 明细 + 合计 + 备注 + 签章） */
export function exportQuoteXlsx(rows: QuoteItem[], info: QuoteSheetInfo, opts: QuoteOpts): void {
  const cols = quoteColumns(opts);
  const n = cols.length;
  const xr: XRow[] = [];
  const merges: [number, number, number, number][] = [];
  const seg = (i: number) => {
    // 把一行均分成 3 段用于抬头合并
    const a = Math.floor(n / 3);
    const b = Math.floor((n * 2) / 3);
    if (i === 0) return [1, a] as [number, number];
    if (i === 1) return [a + 1, b] as [number, number];
    return [b + 1, n] as [number, number];
  };
  const putMetaRow = (texts: string[]) => {
    const r = xr.length + 1;
    const cells: XCell[] = [];
    for (let c = 1; c <= n; c++) cells.push({ v: '' });
    texts.forEach((t, i) => {
      const [s, e] = seg(i);
      for (let c = s; c <= e; c++) cells[c - 1] = { v: c === s ? t : '', s: S.meta };
      if (e > s) merges.push([r, s, r, e]);
    });
    xr.push({ h: 20, cells });
  };

  /* 第 1 行：大标题 */
  xr.push({ h: 34, cells: [{ v: '优品生物 · 产品报价单', s: S.title }] });
  merges.push([1, 1, 1, n]);

  /* 第 2~3 行：抬头 */
  putMetaRow([
    `客户：${info.customer || '（未填写）'}`,
    `联系人：${info.contact || '—'}`,
    `销售负责人：${info.seller || '—'}`,
  ]);
  putMetaRow([
    `报价单号：${info.no}`,
    `报价日期：${info.date}`,
    `有效期：${info.validDays} 天（至 ${addDaysText(info.validDays)}）`,
  ]);
  putMetaRow([`价格类型：${info.priceLabel}`, `税率：${info.taxRate || 0}%`, `共 ${rows.length} 项`]);

  /* 空行 */
  xr.push({ h: 7, cells: [{ v: '' }] });

  /* 表头 */
  const headRow = xr.length + 1;
  xr.push({ h: 26, cells: cols.map((c) => ({ v: c.title, s: S.head })) });

  /* 明细 */
  rows.forEach((it, i) => {
    const z = i % 2 === 1;
    const st = (kind: QuoteCol['kind']): number => {
      if (kind === 'quote') return z ? S.zQuote : S.quote;
      if (kind === 'num') return z ? S.zNum : S.num;
      if (kind === 'int') return z ? S.zInt : S.int;
      if (kind === 'textC') return z ? S.zTextC : S.textC;
      return z ? S.zText : S.text;
    };
    xr.push({
      h: 22,
      cells: cols.map((c) => {
        const v = c.key === 'idx' ? i + 1 : c.get(it);
        return { v, s: st(c.kind) } as XCell;
      }),
    });
  });

  /* 合计：标签合并到「小计」列前一列 */
  const amountIdx = cols.findIndex((c) => c.key === 'amount') + 1; // 1-based
  const totalRow = xr.length + 1;
  const totalCells: XCell[] = [];
  for (let c = 1; c <= n; c++) {
    if (c === amountIdx) totalCells.push({ v: round2(info.total), s: S.totalN });
    else if (c < amountIdx) totalCells.push({ v: c === 1 ? `合计金额（大写）：${rmbUpper(info.total)}` : '', s: S.totalL });
    else totalCells.push({ v: '', s: S.totalL });
  }
  xr.push({ h: 28, cells: totalCells });
  for (let c = amountIdx + 1; c <= n; c++) totalCells[c - 1] = { v: '', s: S.totalL };
  if (amountIdx - 1 > 1) merges.push([totalRow, 1, totalRow, amountIdx - 1]);
  if (n > amountIdx) merges.push([totalRow, amountIdx + 1, totalRow, n]);

  if (info.taxRate) {
    const taxCells: XCell[] = [];
    for (let c = 1; c <= n; c++) {
      if (c === amountIdx) taxCells.push({ v: round2(info.gross), s: S.totalN });
      else if (c < amountIdx) taxCells.push({ v: c === 1 ? `含税总计（${info.taxRate}%）：${rmbUpper(info.gross)}` : '', s: S.totalL });
      else taxCells.push({ v: '', s: S.totalL });
    }
    const tr = xr.length + 1;
    xr.push({ h: 26, cells: taxCells });
    if (amountIdx - 1 > 1) merges.push([tr, 1, tr, amountIdx - 1]);
    if (n > amountIdx) merges.push([tr, amountIdx + 1, tr, n]);
  }

  /* 备注 */
  const noteRow = xr.length + 1;
  xr.push({ h: 30, cells: [{ v: `备注：${info.note || ''}`, s: S.note }] });
  merges.push([noteRow, 1, noteRow, n]);

  /* 签章行 */
  const signRow = xr.length + 1;
  xr.push({
    h: 26,
    cells: [{ v: '报价方（盖章）：优品生物　　　　客户确认：____________　　　　日期：____ 年 __ 月 __ 日', s: S.meta }],
  });
  merges.push([signRow, 1, signRow, n]);

  const bytes = buildXlsx(
    { cols: cols.map((c) => c.width), rows: xr, merges, freezeRow: headRow, landscape: n > 10 },
    `报价单 ${info.no}`,
  );
  downloadXlsx(bytes, fileName(info, 'xlsx'));
}

function addDaysText(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + (Number(days) || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
