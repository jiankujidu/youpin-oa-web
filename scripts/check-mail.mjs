import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT='9797';
const BASE=process.env.BASE||'https://web.jk93.qzz.io/';
const edge=spawn(EDGE,[`--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-mail-${PORT}`,`--remote-debugging-port=${PORT}`,'--no-sandbox','--headless=new','--disable-gpu','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,2500));
const b=await puppeteer.connect({browserURL:`http://127.0.0.1:${PORT}`,defaultViewport:{width:1600,height:900}});
const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
await p.goto(BASE,{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,6000));
for (const label of ['通讯录','客户列表','产品列表']) {
  await p.evaluate((t)=>{const el=[...document.querySelectorAll('.d-nav-item')].find(e=>e.textContent.trim()===t);el&&el.click();},label);
  await new Promise(r=>setTimeout(r,11000));
  const info=await p.evaluate(()=>({rows:document.querySelectorAll('.pc-table tbody tr').length,pager:document.querySelector('.pc-pager-info')?.textContent?.trim(),first:[...(document.querySelectorAll('.pc-table tbody tr')[0]?.querySelectorAll('td')||[])].slice(0,5).map(t=>t.textContent.trim().slice(0,16)).join(' | ')}));
  console.log(label,'→',JSON.stringify(info));
}
console.log('JS错误:',errs.join(' ; ')||'无');
await b.disconnect();edge.kill();
