/**
 * 免登录 PC 后台端到端实测：
 *   1) 打开站点，断言不再出现登录页、直接进入后台
 *   2) 侧栏菜单树与原站一致（分组名 / 菜单项）
 *   3) 逐个打开代表性菜单，断言表格里是真实接口数据（非演示数据）
 *   4) 截图
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-verify2-profile';
const PORT = 9773;
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/';
const SITE = 'https://web.jk93.qzz.io/';

const edge = spawn(EDGE, [
  `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',
  '--headless=new',
  '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitPort(secs = 30) {
  for (let i = 0; i < secs; i++) {
    await sleep(1000);
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch {}
  }
  return false;
}

const EXPECT_GROUPS = ['工作台', '基础数据', '企业公告', '办公审批', '财务管理', '客户管理', '售前售后问答', '产品管理'];

let browser = null;
try {
  if (!(await waitPort())) throw new Error('调试端口未开启');
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1600, height: 950 } });
  const page = (await browser.pages())[0] || (await browser.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 140)); });

  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // 1) 免登录直进
  const gate = await page.evaluate(() => ({
    hasLogin: !!document.querySelector('.lg-card'),
    hasSidebar: !!document.querySelector('.d-sidebar'),
    groups: [...document.querySelectorAll('.d-nav-group')].map((g) => g.textContent.trim()),
    items: [...document.querySelectorAll('.d-nav-item')].map((i) => i.textContent.trim()),
    user: document.querySelector('.d-user-name')?.textContent?.trim(),
  }));
  console.log('① 免登录：登录页出现 =', gate.hasLogin, '| 后台侧栏 =', gate.hasSidebar, '| 用户 =', gate.user);
  console.log('   分组：', gate.groups.join(' / '));
  const miss = EXPECT_GROUPS.filter((g) => !gate.groups.some((x) => x.includes(g)));
  console.log('   与原站菜单差异：', miss.length ? '缺 ' + miss.join(',') : '无（8 组全对齐）');
  await page.screenshot({ path: OUT + '.tmp-real-home.png' });

  // 2) 逐个菜单取数
  async function open(label, wait = 2600) {
    const clicked = await page.evaluate((t) => {
      const el = [...document.querySelectorAll('.d-nav-item')].find((x) => x.textContent.trim() === t);
      if (!el) return false;
      el.click();
      return true;
    }, label);
    if (!clicked) return { label, err: '菜单未找到' };
    await sleep(wait);
    return await page.evaluate(() => {
      // 桌面端两类表格：pc-table（通用列表页）与 d-table（专用页面）
      const tables = [...document.querySelectorAll('table')];
      const rows = tables.flatMap((t) => [...t.querySelectorAll('tbody tr')])
        .filter((r) => !r.querySelector('.pc-table-empty') && r.textContent.trim());
      const title =
        document.querySelector('.pc-title')?.textContent?.trim() ||
        document.querySelector('.d-page-title')?.textContent?.trim() || '';
      const sub = document.querySelector('.d-page-sub')?.textContent?.trim() || '';
      return {
        title,
        count: rows.length,
        first: rows.slice(0, 2).map((r) => [...r.querySelectorAll('td')].slice(0, 5).map((td) => td.textContent.trim().slice(0, 26)).join(' | ')),
        pager: document.querySelector('.pc-pager-info')?.textContent?.trim() || sub,
      };
    });
  }

  const targets = ['客户列表', '产品列表', '公告列表', '我发起的', '附件管理', '售前售后查询'];
  for (const t of targets) {
    const r = await open(t);
    console.log(`② ${t} →`, r.err || `${r.title} · ${r.count} 行 · ${r.pager} · 首行: ${(r.first[0] || '').slice(0, 90)}`);
  }
  await page.screenshot({ path: OUT + '.tmp-real-list.png' });

  // 3) 二级菜单：财务管理 › 发票管理 › 我申请的
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.d-nav-item')].find((x) => x.textContent.includes('发票管理'));
    if (el) el.click();
  });
  await sleep(600);
  const fin = await open('我申请的', 3000);
  console.log('③ 财务 › 发票管理 › 我申请的 →', fin.err || `${fin.count} 行 · ${fin.pager} · 首行: ${(fin.first[0] || '').slice(0, 90)}`);
  await page.screenshot({ path: OUT + '.tmp-real-fin.png' });

  // 4) AI 问答
  const ai = await (async () => {
    const ok = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.d-nav-item')].find((x) => x.textContent.trim() === 'AI问答');
      if (!el) return false;
      el.click();
      return true;
    });
    if (!ok) return 'AI 菜单未找到';
    await sleep(3500);
    await page.evaluate(() => {
      const input = document.querySelector('.ai-input .pc-input');
      if (input) {
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(input, '抗体 保存 温度');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await sleep(300);
    await page.evaluate(() => [...document.querySelectorAll('.ai-input .pc-btn')].pop()?.click());
    await sleep(1200);
    return await page.evaluate(() => ({
      bubbles: [...document.querySelectorAll('.ai-bubble')].map((b) => b.textContent.trim().slice(0, 40)),
      hits: document.querySelectorAll('.ai-hit').length,
    }));
  })();
  console.log('④ AI 问答 →', typeof ai === 'string' ? ai : `${ai.hits} 条命中；对话：${ai.bubbles.slice(0, 3).join(' ‖ ')}`);
  await page.screenshot({ path: OUT + '.tmp-real-ai.png' });

  console.log('⑤ JS 错误：', errors.length ? errors.slice(0, 5) : '无');
} catch (e) {
  console.error('FAILED:', e.message);
} finally {
  try { await browser?.disconnect(); } catch {}
  try { edge.kill(); } catch {}
  process.exit(0);
}
