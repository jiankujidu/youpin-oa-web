import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT='9796';
const edge=spawn(EDGE,[`--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-wk-${PORT}`,`--remote-debugging-port=${PORT}`,'--no-sandbox','--headless=new','--disable-gpu','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,2500));
const b=await puppeteer.connect({browserURL:`http://127.0.0.1:${PORT}`});
const p=await b.newPage();
for (const u of ['https://youpin-oa-proxy.jiankujidu.workers.dev/__health','https://youpin-oa-proxy.jiankujidu.workers.dev/customer/index/index?limit=2']) {
  try { await p.goto(u,{waitUntil:'domcontentloaded',timeout:45000});
    const t=await p.evaluate(()=>document.body.innerText.slice(0,300));
    console.log('▶',u,'\n  →',t.replace(/\s+/g,' ').slice(0,300));
  } catch(e){ console.log('▶',u,'\n  → ERR',String(e).slice(0,120)); }
}
await b.disconnect();edge.kill();
