/**
 * 打包只出一份说明书 —— 链路逐段诊断
 *
 * 逐货号统计三段结果：
 *   A 能否从原站列表接口拿到说明书文件 id（pc_goods_no_url / goods_no_url）
 *   B 通道1 /oss/<path> 能否取到真 PDF
 *   C 通道2 get_oss_file?id=N 能否取到真 PDF
 * 输出成功率与失败原因分布，定位到底卡在解析还是下载。
 */
import fs from 'node:fs';

const PROXY = process.argv[2] || 'https://youpin-oa.pages.dev/oa-proxy';
const N = Number(process.argv[3] || 30);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const H = { 'X-Requested-With': 'XMLHttpRequest' };

const lines = fs.readFileSync('.tmp/products.jsonl', 'utf8').split('\n').filter(Boolean);
// 均匀抽样，尽量覆盖不同分类
const step = Math.max(1, Math.floor(lines.length / N));
const picks = [];
for (let i = 0; i < lines.length && picks.length < N; i += step) {
  const o = JSON.parse(lines[i]);
  const no = String(o.goods_no || '').split(/[;；]/)[0].trim();
  if (no) picks.push({ no, cate: o.cate_id, title: o.title });
}

async function getList(no) {
  for (let a = 0; a < 2; a++) {
    try {
      const r = await fetch(`${PROXY}/product/index/list?keywords=${encodeURIComponent(no)}&limit=10&page=1`, { headers: H });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return (j.data || []).map(mapRemoteRowLike);
    } catch {
      await sleep(700);
    }
  }
  return [];
}

/** 只取我们关心的字段（跟前端 mapRemoteRow 一致的关键部分） */
function mapRemoteRowLike(it) {
  const list = it.goods_no_list || [];
  return {
    id: it.id,
    goods_no: it.goods_no,
    title: it.title,
    goods_no_list: list.map((g) => ({
      goods_no: g.goods_no,
      pc_goods_no_url: g.pc_goods_no_url,
      goods_no_url: g.goods_no_url,
      goods_no_desc: g.goods_no_desc,
    })),
  };
}

function docsOfRow(p, no) {
  const out = [];
  for (const g of p.goods_no_list || []) {
    const gno = String(g.goods_no || '').trim();
    if (!gno) continue;
    const raw = String(g.pc_goods_no_url || g.goods_no_url || '');
    const id = raw.match(/[?&]id=(\d+)/)?.[1] || '';
    const ossPath = String(g.goods_no_url || '').match(
      /^(?:https?:)?\/\/static\.upingbio\.cn\/oa\/([^?#]+)/i,
    )?.[1];
    if (gno === no) out.push({ no: gno, id: id || undefined, ossPath, fileName: g.goods_no_desc || undefined });
  }
  return out;
}

async function tryFetch(url) {
  try {
    const r = await fetch(url);
    if (r.status === 526) return { ok: false, reason: '526 证书过期' };
    if (!r.ok) return { ok: false, reason: 'HTTP ' + r.status };
    const b = Buffer.from(await r.arrayBuffer());
    if (!b.length) return { ok: false, reason: '空文件' };
    const head = b.slice(0, 5).toString('latin1');
    if (head !== '%PDF-') return { ok: false, reason: '非PDF: ' + b.slice(0, 60).toString('utf8').replace(/\s+/g, ' ').slice(0, 50) };
    return { ok: true, size: b.length };
  } catch (e) {
    return { ok: false, reason: 'fetch异常 ' + String(e).slice(0, 40) };
  }
}

const rows = [];
const reasons = new Map();
const bump = (k) => reasons.set(k, (reasons.get(k) || 0) + 1);

for (const p of picks) {
  const list = await getList(p.no);
  const m = list.find((x) => String(x.goods_no || '').split(/[;；]/)[0] === p.no) || list[0];
  let docs = [];
  if (m) docs = m.goods_no_list ? docsOfRow(m, p.no) : [];
  if (!docs.length && m) {
    // 兜底：该产品下只有一份说明书时直接用
    const all = (m.goods_no_list || [])
      .map((g) => {
        const raw = String(g.pc_goods_no_url || g.goods_no_url || '');
        const id = raw.match(/[?&]id=(\d+)/)?.[1] || '';
        const ossPath = String(g.goods_no_url || '').match(
          /^(?:https?:)?\/\/static\.upingbio\.cn\/oa\/([^?#]+)/i,
        )?.[1];
        return { no: String(g.goods_no || '').trim(), id: id || undefined, ossPath, fileName: g.goods_no_desc };
      })
      .filter((d) => d.no);
    if (all.length === 1) docs = all;
  }
  const r1 = docs[0];
  let ch1 = null;
  let ch2 = null;
  if (r1?.ossPath) ch1 = await tryFetch(`${PROXY}/oss/${r1.ossPath}`);
  if ((!ch1 || !ch1.ok) && r1?.id) ch2 = await tryFetch(`${PROXY}/api/index/get_oss_file.html?id=${r1.id}`);
  const ok = !!(ch1?.ok || ch2?.ok);
  const reason = ok ? '' : !r1 ? '原站查不到该货号(或列表无此产品)' : !r1.id && !r1.ossPath ? '原站未挂说明书文件' : `下载失败 ${ch1?.reason || ''} ${ch2?.reason || ''}`.trim();
  if (!ok) bump(reason);
  rows.push({ no: p.no, cate: p.cate, id: r1?.id || '', ossPath: r1?.ossPath || '', ok, reason, size: ch1?.ok ? ch1.size : ch2?.ok ? ch2.size : 0 });
  process.stdout.write(`\r已测 ${rows.length}/${picks.length}`);
}

const okN = rows.filter((r) => r.ok).length;
console.log(`\n\n样本 ${rows.length} 个货号：`);
console.log(`  拿到说明书文件 id      : ${rows.filter((r) => r.id || r.ossPath).length}`);
console.log(`  最终下载成功(真PDF)    : ${okN} = ${((okN / rows.length) * 100).toFixed(1)}%`);
console.log(`\n失败原因分布:`);
[...reasons.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
console.log(`\n明细:`);
rows.forEach((r) => console.log(`  ${r.ok ? 'OK  ' : 'MISS'} ${r.no}  id=${r.id || '-'} oss=${r.ossPath || '-'} ${r.reason}`));
fs.writeFileSync('.tmp-diag-pack.json', JSON.stringify({ okN, total: rows.length, reasons: [...reasons], rows }, null, 1));
