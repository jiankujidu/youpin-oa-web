import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT='9813';
const edge=spawn(EDGE,[`--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-oh-${PORT}-${Date.now()}`,`--remote-debugging-port=${PORT}`,'--no-sandbox','--headless=new','--disable-gpu','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,2500));
const b=await puppeteer.connect({browserURL:`http://127.0.0.1:${PORT}`,defaultViewport:{width:390,height:844,isMobile:true,hasTouch:true}});
const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,160)));
await p.goto('https://youpin-oa.pages.dev/',{waitUntil:'domcontentloaded',timeout:60000});
await new Promise(r=>setTimeout(r,5000));
await p.evaluate(()=>{[...document.querySelectorAll('.m-grid-item .m-gi-text')].find(e=>e.textContent.trim()==='订单处理')?.click();});
for(const t of [3000,6000,12000,20000]){
  await new Promise(r=>setTimeout(r,t));
  const info=await p.evaluate(()=>{
    const c=document.querySelector('.m-container');
    const cards=c?.querySelectorAll('.m-card').length||0;
    const loading=!!document.querySelector('.m-loading')||/加载中/.test(c?.innerText||'');
    return {cards,loading,txt:(c?.innerText||'').replace(/\s+/g,' ').slice(0,120)};
  });
  console.log(`t=${t}ms cards=${info.cards} loading=${info.loading} :: ${info.txt}`);
}
console.log('errs:',errs.join(';')||'无');
await b.disconnect();edge.kill();
