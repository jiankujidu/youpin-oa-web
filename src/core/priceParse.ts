/**
 * 原站 price_desc → 规格/价格 解析
 * ===========================================================================
 * 背景：OA 原站的 price_desc 是**自由文本**，全站 12.3 万条产品实测枚举出
 * 169 种写法（2026-10-24 全量扫描）。此前只支持「带冒号标签」的 3 种格式，
 * 实测覆盖率仅 67.41%，导致两大类产品价格全部解析不出来：
 *   · 抗体类（无标签交替序列，占 21%）
 *   · 多品牌试剂盒（睿信 / 仑昌硕 / 优品 / 邦信和与君 嵌套，占 37%）
 *
 * 现改为「口径驱动 + 分词容错」解析，按真实数据归纳出 6 条规则，自上而下匹配：
 *
 *   P  按单位计价  '20样起测，经销红线11元/样，终端价格18元/样' / '30/张' / '单价235/样'
 *   Y  ￥ 价目表    '目录价：10ug￥:936-50ug￥:2808-500ug￥:14040'
 *   S  / 斜杠配对   '0.1/0.5/1mg;280/500/710;7折'
 *   L  标签规格对   '规格：96T-目录价：3000元/经销价：1200元,规格：48T-…'
 *   M  多品牌嵌套   '睿信目录价：规格：96T：2800元/48T：2000元;仑昌硕目录价：…'
 *   U  无标签序列   '100UL;1800;53ul;1340;10UL'（允许尾部规格缺价）
 *
 * 原则（用户明确要求）：**只提取原站确实写了的数字，绝不推算、不估算**。
 *   · 原站只写一个价 → 落 dir，dist 留 0，basis='other'，报告标注「口径待商务确认」
 *   · 原站写「询价 / 咨询 / 面议」→ 返回空，报告标注「需询价」
 *   · 某规格原站没写价 → 该规格照常输出、价格 0，报告标注「价格缺失」
 */

/** 一条规格的价格 */
export interface QuoteSpec {
  /** 规格文本（如 96T / 100UL / 0.5mg） */
  spec: string;
  /** 目录价 */
  dir: number;
  /** 经销价 */
  dist: number;
  /** 终端价（原站「终端价 / 终端价格」，与目录价并列的不同口径） */
  terminal?: number;
  /** 品牌（多品牌报价：睿信 / 仑昌硕 / 优品 / 邦信和与君 / 统一经销 …） */
  brand?: string;
  /** 该条 dir 在原站的实际标注口径 */
  basis?: 'dir' | 'dist' | 'terminal' | 'other';
}

const NUL = String.fromCharCode(0); // 占位符：把规格 token 挖掉，剩下的数字才是价格

/** 规格单位（长单位在前，保证优先匹配；[lt] 兜底 T / L） */
const UNIT_SRC = String.raw`tests?|ul|μl|µl|ml|mg|ug|μg|µg|ng|样|张|片|孔|只|次|条|株|份|盒|瓶|对|组|膜|管|基因|指标|视野|全切片|测试|[lst]`;

/** 口径关键词（长词在前） */
const BASIS_SRC = String.raw`统一经销商价|经销商价|经销商价格|经销价格|经销价|经销红线|红线价|市场单价|市场价|目录价|终端价格|终端价|零售价|标价|代理价|渠道价|批发价|优品单样代测价|单样收费|单价|价格`;

const SPEC_RE = () => new RegExp(String.raw`([\d.]+)\s*(${UNIT_SRC})`, 'gi');
const BASIS_RE = () => new RegExp(`(${BASIS_SRC})`, 'g');
/** 品牌：段首连续中文，后接口径词或「规格」二字 */
const BRAND_RE = () => new RegExp(String.raw`^([\u4e00-\u9fa5]{2,10}?)(?=(?:${BASIS_SRC})|规格)`);
/** 折扣说明：'7折' / '经销商6折' —— 不是价格，需剔除 */
const DISCOUNT_RE = /(?:(?:统一)?(?:经销商价|经销商|经销价|经销|代理|渠道|批发|终端)?)?\s*[\d.]+\s*折(?!扣)/g;
/** 按单位计价：'30/张' '100元/样' '单价 235/样' '30元/样/指标' */
const PER_UNIT_RE = () =>
  new RegExp(String.raw`(?:单价|价格|目录价|经销价|经销红线|终端价格|终端价)?\s*([\d.]+)\s*元?\s*[/／]\s*(?:个)?([^\s;/／,，;；0-9]{1,6})`, 'gi');

const isNum = (x: string) => /^\d+(\.\d+)?$/.test(x.trim());

/**
 * 价格口径归属
 *  dir      目录价（含市场价 / 市场单价 / 零售价 / 标价）
 *  dist     经销价（含经销商价 / 代理价 / 渠道价 / 批发价 / 经销红线）
 *  terminal 终端价（原站「终端价 / 终端价格」——与目录价并列的另一种口径）
 *  other    原站只写「单价 / 价格」，**未说明是哪种口径**
 */
export type Basis = 'dir' | 'dist' | 'terminal' | 'other';

interface RawPrice {
  brand: string;
  spec: string;
  basis: Basis;
  price: number;
}

/** 口径词 → 归属字段 */
function basisOf(w: string): Basis {
  if (/经销|代理|渠道|批发|红线/.test(w)) return 'dist';
  if (/终端/.test(w)) return 'terminal';
  if (/目录|市场|零售|标价/.test(w)) return 'dir';
  return 'other';
}

/** 提取串中所有规格 token（返回 {text, start, end}） */
function matchSpecs(text: string): SpecTok[] {
  const out: { text: string; start: number; end: number }[] = [];
  const re = SPEC_RE();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({
      text: `${m[1]}${m[2]}`.trim(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

/** 剔除规格 token 与折扣后，提取剩余数字（即价格） */
function matchPrices(text: string): number[] {
  const specs = matchSpecs(text);
  const chars = text.split('');
  for (const s of specs) {
    for (let i = s.start; i < s.end && i < chars.length; i++) chars[i] = NUL;
  }
  const cleaned = chars.join('').replace(DISCOUNT_RE, NUL);
  return (cleaned.match(/\d+(?:\.\d+)?/g) || []).map((x) => parseFloat(x)).filter((n) => !isNaN(n));
}

interface SpecTok {
  text: string;
  start: number;
  end: number;
}

/**
 * 单位继承：'0.1/0.5/1mg' —— 单位只写在最后一段，补到前面各段。
 * 原站二抗 / 抗体对常见这种写法。
 */
function expandSlashUnit(text: string): string[] | null {
  const m = text.match(new RegExp(String.raw`^\s*((?:[\d.]+\s*[／/]\s*)*[\d.]+)\s*(${UNIT_SRC})\s*$`, 'i'));
  if (!m) return null;
  const unit = m[2];
  const nums = m[1].split(/[／/]/).map((x) => x.trim()).filter(Boolean);
  if (nums.length < 2) return null;
  return nums.map((n) => `${n}${unit}`);
}

/**
 * 合并被 '/' 直接相连的规格 token：'100T/48S' 是一个组合规格（100 测试 / 48 样本），
 * 对应**一个**价格，不能拆成两条各自找价。
 */
function mergeSpecTokens(toks: SpecTok[], text: string): string[] {
  if (!toks.length) return [];
  const groups: string[][] = [[toks[0].text]];
  for (let i = 1; i < toks.length; i++) {
    const between = text.slice(toks[i - 1].end, toks[i].start);
    if (/^\s*[／/]\s*$/.test(between)) groups[groups.length - 1].push(toks[i].text);
    else groups.push([toks[i].text]);
  }
  return groups.map((g) => g.join('/'));
}

/** 提取一段文本里的规格列表（含单位继承与组合规格合并） */
function specsOf(text: string): string[] {
  const ex = expandSlashUnit(text);
  if (ex) return ex;
  const toks = matchSpecs(text);
  return toks.length ? mergeSpecTokens(toks, text) : [];
}

/**
 * 「按单位计价」：原站技术服务 / 代测类写法，数字是**单价**，后面跟计价单位。
 *   '30元/张'  '30/张'  '单价 235/样'  '市场单价： 1200样/经销价格： 840样'
 * 这类串里的「样 / 张 / 片 …」是计价单位，不是规格，因此要优先于 specsOf 处理。
 * 仅在块内出现口径词时启用，避免误伤「96样目录价756」这类以规格开头的写法。
 */
function matchPerUnit(text: string): { unit: string; price: number }[] {
  if (!new RegExp(`(${BASIS_SRC})`, 'i').test(text)) return [];
  const out: { unit: string; price: number }[] = [];
  const re = new RegExp(
    `(${BASIS_SRC})\\s*[（(]?\\s*元?\\s*[)）]?\\s*[:：]?\\s*([\\d.]+)\\s*(${UNIT_SRC})?`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ unit: m[3] || '', price: parseFloat(m[2]) || 0 });
  }
  return out;
}

/** 按 规格数 vs 价格数 配对 */
function pair(specs: string[], prices: number[]): { spec: string; price: number }[] {
  if (specs.length === prices.length) return specs.map((sp, i) => ({ spec: sp, price: prices[i] }));
  if (prices.length === 1 && specs.length > 1) {
    /* 多规格共用一个价（组合规格） */
    return [{ spec: specs.join('/'), price: prices[0] }];
  }
  if (specs.length === 1 && prices.length > 1) {
    /* 一规格多个价：取第一个，其余忽略（口径已在 basis 标注） */
    return [{ spec: specs[0], price: prices[0] }];
  }
  /* 都不等：按短的一方对齐，其余价格 0（原站缺标） */
  const n = Math.max(specs.length, prices.length);
  const out: { spec: string; price: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ spec: specs[i] ?? specs[specs.length - 1], price: prices[i] ?? 0 });
  return out;
}

/**
 * 把一段文本按口径词切成若干「口径块」。
 * 口径词之前的文本若有规格/价格，作为默认口径（dir）块保留。
 */
function splitByBasis(seg: string): { basis: RawPrice['basis']; text: string }[] {
  const blocks: { basis: RawPrice['basis']; text: string }[] = [];
  const re = BASIS_RE();
  const hits: { word: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    hits.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  if (!hits.length) return [{ basis: 'other', text: seg }];

  const head = seg.slice(0, hits[0].start);
  if (head.trim()) blocks.push({ basis: 'other', text: head });

  for (let i = 0; i < hits.length; i++) {
    const end = i + 1 < hits.length ? hits[i + 1].start : seg.length;
    blocks.push({ basis: basisOf(hits[i].word), text: seg.slice(hits[i].start, end) });
  }
  return blocks;
}

/**
 * 解析原站 price_desc。
 * 返回按「品牌 + 规格」归并后的条目；dir=目录价、dist=经销价、terminal=终端价。
 */
export function parsePrices(desc?: string): QuoteSpec[] {
  const raw = String(desc || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return [];
  /* 原站明示需询价 —— 不臆造价格 */
  if (/(询价|咨询|面议|电询|来电咨询)/.test(raw)) return [];

  const segs = raw.split(/[;；,，]/).map((x) => x.trim()).filter(Boolean);
  const flat: RawPrice[] = [];
  let brand = '';
  /** 当前规格组：最近一次解析出的规格列表（供「只有价格没有规格」的块回填） */
  let ctx: string[] = [];

  for (const seg of segs) {
    const bm = seg.match(BRAND_RE());
    if (bm && bm[1] !== '规格') brand = bm[1];

    for (const blk of splitByBasis(seg)) {
      const specs = specsOf(blk.text);
      const prices = matchPrices(blk.text);
      /* 本块带规格 → 更新当前规格组 */
      if (specs.length) ctx = specs;

      /* ① 按单位计价优先：'市场单价：1200样' / '单价 235/样' / '30元/张' */
      const perUnit = matchPerUnit(blk.text);
      let items: { spec: string; price: number }[];
      if (perUnit.length && perUnit.some((x) => x.price > 0)) {
        items = perUnit.map((x, i) => ({
          spec: x.unit || ctx[i] || ctx[0] || '标准',
          price: x.price,
        }));
      } else {
        /* ② 常规：规格 × 价格 配对 */
        if (!prices.length) continue;
        const use = specs.length ? specs : ctx.length ? ctx : ['标准'];
        items = pair(use, prices);
      }
      for (const p of items) {
        flat.push({ brand, spec: p.spec, basis: blk.basis, price: p.price });
      }
    }
  }

  /* 归并：同一 品牌+规格 的不同口径合并成一条 */
  const map = new Map<string, QuoteSpec & { cands: { b: Basis; p: number }[] }>();
  for (const f of flat) {
    const key = `${f.brand}||${f.spec}`;
    const e = map.get(key) || { brand: f.brand, spec: f.spec, dir: 0, dist: 0, cands: [] };
    e.cands.push({ b: f.basis, p: f.price });
    map.set(key, e);
  }


  /* 口径优先级：目录价 > 终端价 > 口径不明（other） */
  const out: QuoteSpec[] = [];
  for (const m of map.values()) {
    const pick = (b: Basis) => m.cands.find((c) => c.b === b && c.p > 0)?.p ?? 0;
    const dir = pick('dir');
    const terminal = pick('terminal');
    const other = pick('other');
    const e: QuoteSpec = { spec: m.spec, dir: dir || terminal || other, dist: pick('dist') };
    if (m.brand) e.brand = m.brand;
    e.basis = dir ? 'dir' : terminal ? 'terminal' : other ? 'other' : 'dist';
    if (terminal) e.terminal = terminal;
    out.push(e);
  }
  return out;
}

/**
 * 价格口径说明：返回该 desc 里 dir 实际采用的原站标注词。
 * 用于报价方案「数据来源」列 —— 让每个数字都能回查到原站原文用词。
 */
export function priceBasisNote(desc?: string): string {
  const raw = String(desc || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  if (/(询价|咨询|面议|电询|来电咨询)/.test(raw)) return '需询价';

  const m = raw.match(BASIS_RE());
  const specs = matchSpecs(raw);
  if (m) return m[0];
  if (specs.length) return '未标注口径（原站仅写单一价）';
  return '';
}

/** 是否解析失败（无任何价格）—— 供 UI / 报告标注 */
export function hasAnyPrice(specs: QuoteSpec[]): boolean {
  return specs.some((s) => s.dir > 0 || s.dist > 0 || (s.terminal ?? 0) > 0);
}
