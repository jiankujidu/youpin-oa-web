import fs from 'node:fs';
import { parsePrices } from '../src/core/priceParse';

const lines = fs.readFileSync('.tmp/products.jsonl', 'utf8').split('\n').filter(Boolean);
const norm = (s: string) =>
  String(s || '').replace(/&nbsp;/g, ' ').replace(/\d+(\.\d+)?/g, 'N').replace(/\s+/g, '').slice(0, 70);

let total = 0;
let ok = 0;
let noPrice = 0;   // 有规格但原站未标价               // 至少解出一个 >0 的价
const failByPattern = new Map<string, { n: number; sample: string; id: any; goods_no: string; cate: any }>();
const okPatterns = new Set<string>();

for (const l of lines) {
  let o: any;
  try { o = JSON.parse(l); } catch { continue; }
  const pd = o.price_desc || '';
  total++;
  const r = parsePrices(pd);
  const hasPrice = r.some((x: any) => (x.dir || 0) > 0 || (x.dist || 0) > 0);
  const hasSpec = r.length > 0;
  const p = norm(pd) || '(空)';
  if (hasPrice) { ok++; okPatterns.add(p); }
  else if (hasSpec) { noPrice++; }
  else {
    const e = failByPattern.get(p) || { n: 0, sample: pd, id: o.id, goods_no: o.goods_no, cate: o.cate_id };
    e.n++;
    failByPattern.set(p, e);
  }
}

const fails = [...failByPattern.entries()].sort((a, b) => b[1].n - a[1].n);
console.log(`总条数 ${total}`);
console.log(`解析出价格 ${ok} 条 = ${((ok / total) * 100).toFixed(2)}%`);
console.log(`无价格 ${total - ok} 条 = ${(((total - ok) / total) * 100).toFixed(2)}%`);
console.log(`\n已覆盖模式 ${okPatterns.size} 种 / 失败模式 ${fails.length} 种\n`);
console.log('失败模式 Top 40（按条数）:');
for (const [p, e] of fails.slice(0, 40)) {
  console.log(`  ${String(e.n).padStart(6)}  ${p}`);
  console.log(`          样例[${e.id}] ${JSON.stringify((e.sample || '').slice(0, 110))}`);
}
fs.writeFileSync('.tmp/fail-patterns.json', JSON.stringify(fails.map(([p, e]) => ({ pattern: p, n: e.n, sample: e.sample, id: e.id, goods_no: e.goods_no, cate: e.cate })), null, 1), 'utf8');
