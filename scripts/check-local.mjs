import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT=process.env.PORT||'9811';
const BASE=process.env.BASE||'https://web.jk93.qzz.io/';
const MOBILE=process.env.MOBILE==='1';
const edge=spawn(EDGE,[`--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-local-${PORT}-${Date.now()}`,`--remote-debugging-port=${PORT}`,'--no-sandbox','--headless=new','--disable-gpu','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,2500));
const b=await puppeteer.connect({browserURL:`http://127.0.0.1:${PORT}`,defaultViewport: MOBILE?{width:390,height:844,isMobile:true,hasTouch:true}:{width:1600,height:900}});
const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
await p.goto(BASE,{waitUntil:'domcontentloaded',timeout:60000});
await new Promise(r=>setTimeout(r,5000));
if(MOBILE){
  await p.evaluate(()=>{[...document.querySelectorAll('.m-grid-item .m-gi-text')].find(e=>e.textContent.trim()==='客户列表')?.click();});
  await new Promise(r=>setTimeout(r,5000));
} else {
  await p.evaluate(()=>{[...document.querySelectorAll('.d-nav-item')].find(e=>e.textContent.trim()==='客户列表')?.click();});
  await new Promise(r=>setTimeout(r,6000));
}
const info=await p.evaluate(()=>{
  const isM=!!document.querySelector('.m-root');
  const rows=document.querySelectorAll('.pc-table tbody tr, .m-card').length;
  const txt=(document.querySelector('.m-container')?.innerText||document.querySelector('.pc-main')?.innerText||'').replace(/\s+/g,' ').slice(0,120);
  return {isM,rows,txt};
});
console.log(MOBILE?'[MOBILE]':'[DESKTOP]',JSON.stringify(info),'errs:',errs.length);
await b.disconnect();edge.kill();
