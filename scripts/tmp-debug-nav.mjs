import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const TARGET = process.argv[2] || 'note';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const edge = spawn(EDGE, [`--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-dbg`, '--remote-debugging-port=9812', '--no-sandbox', '--headless=new', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let browser;
  for (let i = 0; i < 30; i++) { try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9812', defaultViewport: { width: 1440, height: 900 } }); break; } catch { await sleep(500); } }
  const page = await browser.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 160)));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  for (let r = 0; r < 5; r++) { await page.evaluate(() => { document.querySelectorAll('.d-nav-parent').forEach((x) => { if (x.querySelector('.d-nav-arrow')?.textContent?.includes('▸')) x.click(); }); }); await sleep(300); }
  const keys = await page.evaluate(() => [...document.querySelectorAll('.d-nav-item')].map((x) => x.getAttribute('data-key')));
  console.log('nav keys:', JSON.stringify(keys));
  const clicked = await page.evaluate((k) => { const el = document.querySelector(`.d-nav-item[data-key="${k}"]`); if (el) { el.click(); return true; } return false; }, TARGET);
  console.log('clicked', TARGET, ':', clicked);
  await sleep(7000);
  const info = await page.evaluate(() => {
    const t = document.querySelector('.dt-table');
    return {
      hash: location.hash,
      dtExists: !!t,
      rows: t ? t.querySelectorAll('tbody tr').length : -1,
      wrapText: (document.querySelector('.dt-wrap')?.textContent || '').slice(0, 200),
      hasTable: !!document.querySelector('.pc-table'),
    };
  });
  console.log('info:', JSON.stringify(info));
  console.log('errors:', errs.slice(0, 6));
  await browser.disconnect(); edge.kill(); await sleep(300);
  try { require('node:fs').rmSync('C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-dbg', { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
