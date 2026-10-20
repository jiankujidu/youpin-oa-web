/** 批量探测原站各列表接口的字段结构（输出每页首行字段与列名） */
const BASE = 'https://oa.upingbio.com';
const SID = process.argv[2];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const PATHS = [
  'home/files/index',
  'note/index/index',
  'oa/approve/index',
  'finance/advancedepositlog/index',
  'finance/deductionlog/index',
  'finance/deductionlog/checkedlist',
  'finance/margindepositlog/index',
  'finance/invoice/index',
  'finance/invoice/list',
  'finance/income/index',
  'finance/orderapply/index',
  'finance/orderapply/list',
  'customer/index/index',
  'customer/index/sea',
  'customer/index/trash',
  'customer/contact/index',
  'customer/chance/index',
  'customer/trace/index',
  'customer/order/index',
  'customer/order/list',
  'customer/sample/index',
  'customer/schoolexhibition/index',
  'customer/schoolexhibition/list',
  'article/index/index',
  'customer/aftersalesservice/index',
  'product/index/list',
  'message/index/inbox',
];

async function probe(p) {
  const url = `${BASE}/${p}?page=1&limit=2`;
  try {
    const res = await fetch(url, {
      headers: { Cookie: `PHPSESSID=${SID}`, 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE}/` },
    });
    const text = await res.text();
    let j = null;
    try { j = JSON.parse(text); } catch { return { path: p, err: `HTTP ${res.status} non-json: ${text.slice(0, 80)}` }; }
    if (j.code !== 0) return { path: p, err: `code=${j.code} msg=${j.msg}` };
    const d = j.data;
    const rows = Array.isArray(d) ? d : (d && d.list) || [];
    const total = d && d.total !== undefined ? d.total : rows.length;
    return { path: p, total, sample: rows[0] || null, count: rows.length };
  } catch (e) {
    return { path: p, err: e.message };
  }
}

for (const p of PATHS) {
  const r = await probe(p);
  if (r.err) console.log(`### ${p}\n  !! ${r.err}\n`);
  else {
    console.log(`### ${p}  (total=${r.total})`);
    console.log('  keys:', r.sample ? Object.keys(r.sample).join(',') : '(empty)');
    console.log('  sample:', r.sample ? JSON.stringify(r.sample).slice(0, 700) : '(empty)');
    console.log();
  }
}
