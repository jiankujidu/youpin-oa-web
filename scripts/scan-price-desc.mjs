import fs from 'node:fs';
const SID = '844affb982e3c939352619154584e3a5';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const H={ 'Cookie':`PHPSESSID=${SID}`, 'User-Agent':UA, 'Referer':'https://oa.upingbio.com/', 'X-Requested-With':'XMLHttpRequest' };
const HAVE = fs.existsSync('.tmp/products.jsonl') ? fs.readFileSync('.tmp/products.jsonl','utf8').trim().split('\n').filter(Boolean).length : 0;
const out = fs.createWriteStream('.tmp/products.jsonl', { flags: HAVE ? 'a' : 'w' });
let total=HAVE, pages= Math.floor(HAVE/1000);
async function get(page, retry=0){
  try{
    const r=await fetch(`https://oa.upingbio.com/product/index/list?limit=1000&page=${page}`,{headers:H});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  }catch(e){
    if(retry<3){ await new Promise(s=>setTimeout(s,800*(retry+1))); return get(page,retry+1); }
    throw e;
  }
}
const first= HAVE ? null : await get(1);
const count= first ? first.count : 124000;
const totalPages=Math.ceil(count/1000);
console.log(`总数 ${count}，共 ${totalPages} 页`);
const write=(d)=>{ for(const it of (d.data||[])){
  out.write(JSON.stringify({id:it.id,goods_no:it.goods_no,cate_id:it.cate_id,unit:it.unit,price_desc:it.price_desc,title:it.title})+"\n"); total++; } };
if(first) { write(first); pages=1; }
const CONC=6;
for(let p=pages+1;p<=totalPages;p+=CONC){
  const batch=[]; for(let i=0;i<CONC && p+i<=totalPages;i++) batch.push(p+i);
  const rs=await Promise.all(batch.map(x=>get(x)));
  for(const d of rs) write(d);
  pages+=CONC;
  process.stdout.write(`\r已抓 ${pages}/${totalPages} 页 · ${total} 条`);
}
out.end();
console.log(`\n完成：${total} 条 → .tmp/products.jsonl`);
