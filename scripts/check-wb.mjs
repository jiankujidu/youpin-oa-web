import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT='9803';
const edge=spawn(EDGE,[`--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-wb-${PORT}-${Date.now()}`,`--remote-debugging-port=${PORT}`,'--no-sandbox','--headless=new','--disable-gpu','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,2500));
const b=await puppeteer.connect({browserURL:`http://127.0.0.1:${PORT}`,defaultViewport:{width:390,height:844,isMobile:true,hasTouch:true}});
const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.goto('https://youpin-oa.pages.dev/',{waitUntil:'domcontentloaded',timeout:60000});
await new Promise(r=>setTimeout(r,5000));
// 打开工作台
await p.evaluate(()=>{[...document.querySelectorAll('.m-grid-item .m-gi-text')].find(e=>e.textContent.trim()==='工作台')?.click();});
await new Promise(r=>setTimeout(r,4000));
const wb=await p.evaluate(()=>{const c=document.querySelector('.m-container');return c?c.innerText.replace(/\s+/g,' ').slice(0,300):'';});
console.log('WORKBENCH:',wb);
// 首页待办
await p.evaluate(()=>{[...document.querySelectorAll('.m-tab')].find(e=>e.textContent.trim()==='首页')?.click();});
await new Promise(r=>setTimeout(r,4000));
const home=await p.evaluate(()=>{const c=document.querySelector('.m-container');return c?c.innerText.replace(/\s+/g,' ').slice(0,400):'';});
console.log('HOME:',home);
console.log('JS错误:',errs.length);
await b.disconnect();edge.kill();
