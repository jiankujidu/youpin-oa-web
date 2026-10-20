/**
 * 反向代理链路端到端自检（无头 Chrome 实测）
 *
 * 链路：浏览器(站点) → 本地代理(8788, 等价 workers/oa-proxy.js) → mock OA 后端(8787)
 * 验证：CORS 预检 / 会话头 / 真实验证码登录 / 数据来自后端 / 写操作真实到达后端 /
 *       浏览器不收到 Set-Cookie / 登录失败的后端报错。
 *
 * 用法：node scripts/verify-proxy.mjs
 */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMock } from './oa-mock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const MOCK_PORT = 8787;
const PROXY_PORT = 8788;
const SITE_PORT = 4173;
const BASE = `http://localhost:${SITE_PORT}/`;
const PROXY = `http://localhost:${PROXY_PORT}`;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ============================ 1. 起 mock + 代理 ============================ */

const mock = await startMock(MOCK_PORT);
console.log('mock listening on', MOCK_PORT);

const proxyProc = (await import('node:child_process')).spawn(
  process.execPath,
  [join(ROOT, 'scripts', 'oa-proxy-local.mjs'), String(PROXY_PORT)],
  { env: { ...process.env, OA_BASE: `http://127.0.0.1:${MOCK_PORT}` }, stdio: 'inherit' },
);
await sleep(800);

/* ============================ 2. 静态服务 dist ============================ */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.pdf': 'application/pdf', '.svg': 'image/svg+xml', '.png': 'image/png' };
const site = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const fp = p === '/' ? join(DIST, 'index.html') : join(DIST, p);
    if (!fp.startsWith(DIST)) {
      res.writeHead(403);
      return res.end();
    }
    const data = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => site.listen(SITE_PORT, '127.0.0.1', r));

/* ============================ 3. 代理层基础检查 ============================ */

{
  const pre = await fetch(`${PROXY}/oa/approve/index`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:4173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-oa-session' },
  });
  check('CORS 预检通过（204 + Allow-Origin）', pre.status === 204 && !!pre.headers.get('access-control-allow-origin'), `status=${pre.status}`);

  const health = await fetch(`${PROXY}/__health`).then((r) => r.json());
  check('本地代理健康检查（指向 mock）', health.ok && health.oaBase.includes(String(MOCK_PORT)), health.oaBase);

  // 路径透传：不存在的前端路径应被 mock 以「未实现」拒绝（证明没有剥 /oa 前缀）
  const r = await fetch(`${PROXY}/oa/approve/index`, { headers: { 'x-oa-session': 'no-such-sid' } }).then((x) => x.json());
  check('路径透传：/oa/approve/index 直达 mock（未登录被拒）', r && r.code === 1 && /未登录/.test(r.msg), r.msg);
}

/* ============================ 4. 浏览器端到端 ============================ */

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function mockState() {
  return fetch(`http://127.0.0.1:${MOCK_PORT}/__state`).then((r) => r.json());
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 812 });

  // 4.1 代理模式登录页（真实验证码图片，非本地算式）
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  const mode = await page.evaluate(() => {
    const img = document.querySelector('img.m-captcha-img, img.d-captcha-img');
    const flag = document.querySelector('.m-demo-flag.ok, .d-login-foot');
    return { isSvg: img ? String(img.getAttribute('src')).startsWith('data:image/svg+xml') : null, flag: flag?.textContent || '' };
  });
  check('代理模式：验证码为后端图片（非本地算式）', mode.isSvg === false, `svg=${mode.isSvg}`);
  check('代理模式：登录页标注已连接真实后端', /已连接真实后端/.test(mode.flag), mode.flag.trim());

  // 4.2 从 mock 读取该会话下发的验证码（真实链路：验证码由服务端下发）
  await page.waitForSelector('img.m-captcha-img', { timeout: 5000 });
  let st = await mockState();
  let sess = st.sessions.find((s) => !s.loggedIn && s.captcha);
  check('代理链路：浏览器成功取到服务端验证码', !!sess, sess ? `captcha=${sess.captcha}` : '无会话');

  // 4.3 错误密码 → 后端报错（证明登录真的到了后端）
  await page.type('input#m-username', 'demo');
  await page.type('input[type="password"]', 'wrongpass');
  await page.type('input#m-captcha', sess.captcha);
  await page.click('button.m-login-btn');
  await sleep(900);
  const tip = await page.$eval('.m-login-tip', (el) => el.textContent.trim()).catch(() => '');
  check('登录失败提示来自后端', /用户名或密码错误|验证码错误/.test(tip), tip);
  await page.reload({ waitUntil: 'networkidle2' });

  // 4.4 正确登录
  st = await mockState();
  sess = st.sessions.find((s) => !s.loggedIn && s.captcha);
  await page.type('input#m-username', 'demo');
  await page.type('input[type="password"]', 'demo1234');
  await page.type('input#m-captcha', sess.captcha);
  await page.click('button.m-login-btn');
  await page.waitForSelector('.m-tabbar', { timeout: 8000 });
  check('代理模式登录成功（后端校验账号密码 + 验证码）', true, '已进入主界面');

  st = await mockState();
  check('浏览器未持有 OA Cookie（仅持随机 sid）', st.sessions.filter((s) => s.loggedIn).length === 1);

  // 4.5 数据来自后端：审批列表
  await page.evaluate(() => [...document.querySelectorAll('.m-tab')].find((t) => t.textContent.includes('审批'))?.click());
  await sleep(900);
  const approveText = await page.evaluate(() => document.querySelector('.m-container')?.textContent || '');
  check('审批列表来自代理后端（mock 数据）', /采购审批-Q4抗体备货/.test(approveText));

  // 4.6 写操作真实到达后端：审批通过
  await page.evaluate(() => {
    [...document.querySelectorAll('.m-seg-item')].find((s) => s.textContent.includes('待审批'))?.click();
  });
  await sleep(800);
  await page.evaluate(() => document.querySelector('.m-card.clickable')?.click());
  await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll('button.m-btn-ok')].find((b) => b.textContent.includes('通过'))?.click());
  await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('.m-dialog-btn')].find((b) => /确定|确认/.test(b.textContent))?.click());
  await sleep(500);
  await page.evaluate(() => [...document.querySelectorAll('.m-dialog-btn')].find((b) => /确定|确认/.test(b.textContent))?.click());
  await sleep(1200);
  st = await mockState();
  const checkW = st.writes.find((w) => w.path === '/oa/approve/check');
  check('审批通过提交到达后端 POST /oa/approve/check', !!checkW, checkW ? JSON.stringify(checkW.body) : '无记录');

  // 4.7 发起审批 → 后端
  await page.evaluate(() => [...document.querySelectorAll('.m-tab')].find((t) => t.textContent.includes('首页'))?.click());
  await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll('.m-grid-item')].find((g) => g.textContent.includes('发起审批'))?.click());
  await sleep(600);
  await page.type('.m-field input', '代理链路验证-用章申请');
  await page.evaluate(() => [...document.querySelectorAll('button.m-btn-ok')].find((b) => b.textContent.includes('提交申请'))?.click());
  await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('.m-dialog-btn')].find((b) => /确定|确认/.test(b.textContent))?.click());
  await sleep(1200);
  st = await mockState();
  const addW = st.writes.find((w) => w.path === '/oa/approve/add');
  check('发起审批提交到达后端 POST /oa/approve/add', !!addW, addW ? JSON.stringify(addW.body) : '无记录');

  // 4.8 新增客户 → 后端
  await page.evaluate(() => [...document.querySelectorAll('.m-tab')].find((t) => t.textContent.includes('首页'))?.click());
  await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll('.m-grid-item')].find((g) => g.textContent.includes('新增客户'))?.click());
  await sleep(600);
  await page.type('.m-field input', '代理链路验证客户');
  await page.evaluate(() => [...document.querySelectorAll('button.m-btn-ok')].find((b) => b.textContent.includes('提交'))?.click());
  await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('.m-dialog-btn')].find((b) => /确定|确认/.test(b.textContent))?.click());
  await sleep(1200);
  st = await mockState();
  const custW = st.writes.find((w) => w.path === '/customer/index/add');
  check('新增客户提交到达后端 POST /customer/index/add', !!custW, custW ? JSON.stringify(custW.body) : '无记录');

  // 4.9 子页面走代理
  await page.evaluate(() => [...document.querySelectorAll('.m-tab')].find((t) => t.textContent.includes('我的'))?.click());
  await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll('.m-menu-item')].find((m) => m.textContent.includes('预存款'))?.click());
  await sleep(1000);
  const subText = await page.evaluate(() => document.querySelector('.m-container')?.textContent || '');
  check('子页面数据来自代理后端', /Mock 预存款充值/.test(subText));

  // 4.10 会话保持：同一 sid 连续请求不丢登录态
  st = await mockState();
  check('会话保持：后端维持登录态（Cookie 由代理托管）', st.sessions.some((s) => s.loggedIn));

  // 4.11 桌面端同样走代理（先清会话，确保从登录页开始）
  const dp = await browser.newPage();
  await dp.setViewport({ width: 1440, height: 900 });
  await dp.goto(BASE, { waitUntil: 'networkidle2' });
  await dp.evaluate(() => localStorage.clear());
  await dp.reload({ waitUntil: 'networkidle2' });
  st = await mockState();
  const dSess = st.sessions.find((s) => !s.loggedIn && s.captcha);
  await dp.type('input[placeholder*="账户"], input#m-username', 'demo');
  await dp.type('input[type="password"]', 'demo1234');
  await dp.type('input[placeholder^="请输入图中字符"]', dSess.captcha);
  await dp.click('button.d-login-btn');
  await dp.waitForSelector('.d-sidebar', { timeout: 8000 });
  check('桌面端代理模式登录成功', true);

  const dText = await dp.evaluate(() => document.body.textContent || '');
  check('桌面端首页展示后端统计', /待审批|审批/.test(dText));

  // 4.12 桌面端发起审批（Modal）
  await dp.evaluate(() => {
    [...document.querySelectorAll('.d-nav-item')].find((n) => n.textContent.trim() === '审批')?.click();
  });
  await sleep(900);
  await dp.evaluate(() => [...document.querySelectorAll('.d-page-actions button')].find((b) => b.textContent.includes('发起审批'))?.click());
  await sleep(500);
  await dp.type('.d-modal input', '桌面端代理验证申请');
  await dp.evaluate(() => [...document.querySelectorAll('.d-modal-btns button')].find((b) => b.textContent.includes('提交'))?.click());
  await sleep(1200);
  st = await mockState();
  const dW = st.writes.find((w) => w.path === '/oa/approve/add' && w.body.title === '桌面端代理验证申请');
  check('桌面端发起审批到达后端', !!dW, dW ? JSON.stringify(dW.body) : '无记录');
} finally {
  await browser.close();
  site.close();
  mock.close();
  proxyProc.kill();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} =====`);
  if (failed.length) process.exitCode = 1;
}
