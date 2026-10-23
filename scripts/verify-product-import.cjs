// 用原站真实模板测试 multipart 上传链路（本地代理 8788 直连，避开沙箱出口代理）
const SID = '844affb982e3c939352619154584e3a5';
const BASE = 'http://127.0.0.1:8788';
const { writeFileSync } = require('node:fs');

async function post(url, file, name) {
  const fd = new FormData();
  fd.append('file', new Blob([file]), name);
  const r = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest', 'x-oa-sid': SID },
    body: fd,
  });
  const t = await r.text();
  return `HTTP ${r.status} ${t.slice(0, 170).replace(/\s+/g, ' ')}`;
}

(async () => {
  const tplUrl = BASE + '/static/home/file/' + encodeURIComponent('优品OA产品导入模板.xlsx');
  const r = await fetch(tplUrl, { headers: { 'x-oa-sid': SID } });
  const tpl = Buffer.from(await r.arrayBuffer());
  writeFileSync('.tmp-tpl.xlsx', tpl);
  console.log('template:', r.status, tpl.length, 'bytes, magic=', tpl.slice(0, 4).toString('hex'));
  const cases = [
    ['import type=1', '/api/import/import_product?type=1'],
    ['import type=2', '/api/import/import_product?type=2'],
    ['import_update', '/api/import/import_product_update'],
    ['import_under', '/api/import/import_product_under'],
    ['import_up', '/api/import/import_product_up'],
  ];
  for (const [label, url] of cases) {
    try {
      console.log(label, '=>', await post(url, tpl, '优品OA产品导入模板.xlsx'));
    } catch (e) {
      console.log(label, 'ERR', e.message);
    }
  }
})().catch((e) => console.error('FATAL', e));
