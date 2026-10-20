/**
 * 端到端验证「代理 + 真实 OA 账号」数据链路：
 *   启动本地 mock（模拟有状态会话 Worker + 最小 OA 后端）
 *   → Chrome 以 ?oa_proxy= 指向 mock
 *   → 代理模式登录页显示真实验证码图片
 *   → 用 demo/demo1234/1234 登录
 *   → 断言审批、客户、首页统计等拉到的是「真实数据」（来自 mock，非演示数据集）
 *
 * 运行前：npm run build，并把 dist 用静态服务器跑在 4173。
 *   node scripts/verify-realdata.mjs http://127.0.0.1:4173
 */
import { startMock } from './oa-mock.mjs';
import puppeteer from 'puppeteer-core';

const APP_BASE = process.argv[2] || 'http://127.0.0.1:4173';
const MOCK_PORT = Number(process.env.MOCK_PORT) || 8787;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const fails = [];
const ok = (c, m) => (c ? console.log('PASS', m) : (fails.push(m), console.log('FAIL', m)));

const server = await startMock(MOCK_PORT);
console.log('mock up on', MOCK_PORT);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [browser error]', m.text());
});

// 给所有打到 mock 的请求加 x-test-mode，使验证码固定为 1234
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  if (u.includes(`127.0.0.1:${MOCK_PORT}`)) {
    const h = new Map(Object.entries(req.headers()));
    h.set('x-test-mode', '1');
    req.continue({ headers: Object.fromEntries(h) });
  } else {
    req.continue();
  }
});

await page.setViewport({ width: 390, height: 844 });
await page.goto(`${APP_BASE}/?oa_proxy=http://127.0.0.1:${MOCK_PORT}`, { waitUntil: 'networkidle2' });

// 代理模式登录页：真实验证码图片应加载
await page.waitForSelector('img.m-captcha-img', { timeout: 10000 });
const capSrc = await page.$eval('img.m-captcha-img', (e) => e.getAttribute('src') || '');
ok(capSrc.startsWith('blob:'), '代理模式：真实验证码图片已加载（blob URL）');

// 登录
await page.type('#m-username', 'demo');
await page.type('#m-password', 'demo1234');
await page.type('#m-captcha', '1234');
await page.click('.m-login-btn');
try {
  await page.waitForSelector('.m-tabbar', { timeout: 10000 });
  ok(true, '登录成功并进入主界面（底部 Tab 出现）');
} catch (e) {
  const tip = await page.$eval('#m-captcha-tip, .m-login-tip', (el) => el.textContent).catch(() => '(无提示元素)');
  const body = await page.evaluate(() => document.body.innerText);
  console.log('  [登录失败诊断] tip=', tip);
  console.log('  [登录失败诊断] body=', body.slice(0, 300));
  ok(false, '登录成功并进入主界面');
}

// 切到审批 Tab，断言拉到真实数据
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.m-tab')].find((e) => e.textContent.includes('审批'));
  t && t.click();
});
await new Promise((r) => setTimeout(r, 1200));
let body = await page.evaluate(() => document.body.innerText);
ok(body.includes('【真实数据】采购审批-来自Mock后端'), '审批列表返回真实数据（来自 mock 后端）');

// 切到客户 Tab
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.m-tab')].find((e) => e.textContent.includes('客户'));
  t && t.click();
});
await new Promise((r) => setTimeout(r, 1200));
body = await page.evaluate(() => document.body.innerText);
ok(body.includes('【真实数据】上海优品生物 Mock 客户'), '客户列表返回真实数据（来自 mock 后端）');

await browser.close();
server.close();

console.log('\n==== 真实数据链路验证：', fails.length === 0 ? '全部通过 ✅' : `${fails.length} 项失败 ❌`, '====');
process.exit(fails.length === 0 ? 0 : 1);
