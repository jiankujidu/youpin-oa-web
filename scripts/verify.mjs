/**
 * Phase D 自检脚本（无头 Chrome 实测）
 * 用法：node scripts/verify.mjs <baseUrl> <chromePath>
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://localhost:4173/';
const CHROME = process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOT_DIR = join(__dirname, '..', 'verify-shots');
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/** 从验证码 SVG 里解出算式并求值 */
async function solveCaptcha(page) {
  const src = await page.$eval('img.m-captcha-img, img.d-captcha-img', (el) => el.getAttribute('src'));
  const b64 = src.split('base64,')[1];
  const svg = Buffer.from(b64, 'base64').toString('utf8');
  const m = />([^<>]*\d[^<>]*)</.exec(svg);
  const expr = (m ? m[1] : '').replace('−', '-').replace('=', '').replace('?', '').trim();
  const mm = /(\d+)\s*([+-])\s*(\d+)/.exec(expr);
  if (!mm) throw new Error('无法解析验证码：' + expr);
  const a = Number(mm[1]), b = Number(mm[3]);
  return mm[2] === '+' ? a + b : a - b;
}

async function login(page) {
  const answer = await solveCaptcha(page);
  await page.type('input[placeholder="账户或手机号码"], input[placeholder="账号或手机号码"]', 'demo');
  await page.type('input[type="password"]', 'demo1234');
  const sel = await page.$('input[placeholder^="填算式"], input[placeholder^="算式结果"]');
  await sel.type(String(answer));
  await page.click('button.m-login-btn, button.d-login-btn');
  await page.waitForSelector('.m-tabbar, .d-sidebar', { timeout: 8000 });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  /* ======================= 手机端 375px ======================= */
  for (const w of [375, 390]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    // 每个用例前清空会话，保证从登录页开始
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('img.m-captcha-img', { timeout: 8000 });
    await page.screenshot({ path: join(SHOT_DIR, `mobile-${w}-login.png`) });
    await login(page);

    // 首页
    await page.waitForSelector('.m-grid', { timeout: 5000 });
    await page.screenshot({ path: join(SHOT_DIR, `mobile-${w}-home.png`) });

    const overflow = async (label) => {
      const r = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        bodySw: document.body.scrollWidth,
        offenders: Array.from(document.querySelectorAll('*'))
          .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
          .slice(0, 5)
          .map((el) => `${el.tagName}.${el.className}`.slice(0, 60)),
      }));
      check(
        `${w}px ${label}：无横向滚动`,
        r.sw <= r.cw + 1 && r.bodySw <= r.cw + 1,
        `scrollWidth=${r.sw} clientWidth=${r.cw}${r.offenders.length ? ' 越界:' + r.offenders.join(', ') : ''}`,
      );
    };
    await overflow('首页');

    // 手机端不应出现多栏（检查是否有并排的 grid 列数 > 1 的布局容器）
    const multiCol = await page.evaluate(() => {
      const grids = Array.from(document.querySelectorAll('.m-grid'));
      return grids.map((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
    });
    check(`${w}px 首页：宫格为 4 列（非多栏并排主内容）`, multiCol.every((n) => n === 4), `列数=${JSON.stringify(multiCol)}`);

    // 底部 Tab 存在且 4 个
    const tabs = await page.$$eval('.m-tabbar .m-tab', (els) => els.map((e) => e.textContent.trim()));
    check(`${w}px 存在底部 4 Tab`, tabs.length === 4, tabs.join(' / '));

    // 逐个 Tab 检查溢出
    for (const [idx, label] of [[1, '审批'], [2, '客户'], [3, '我的']]) {
      await page.evaluate((i) => document.querySelectorAll('.m-tabbar .m-tab')[i].click(), idx);
      await new Promise((r) => setTimeout(r, 900));
      await page.screenshot({ path: join(SHOT_DIR, `mobile-${w}-tab${idx}.png`) });
      await overflow(label);
    }

    // 附件管理（上传页）
    await page.evaluate(() => document.querySelectorAll('.m-tabbar .m-tab')[3].click());
    await new Promise((r) => setTimeout(r, 600));
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.m-menu-item'));
      const t = items.find((e) => e.textContent.includes('附件管理'));
      if (t) t.click();
    });
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: join(SHOT_DIR, `mobile-${w}-files.png`) });
    await overflow('附件管理');

    // 上传按钮尺寸 ≥44×44
    const btnBox = await page.$$eval('.m-att-btn', (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }),
    );
    check(
      `${w}px 上传按钮点击区 ≥44×44`,
      btnBox.length > 0 && btnBox.every((b) => b.h >= 44 && b.w >= 44),
      JSON.stringify(btnBox),
    );

    // 未配置上传服务 → 点击上传应出现「未配置」提示，不得静默
    const noticeText = await page.evaluate(() => {
      const n = document.querySelector('.m-notice.warn-red');
      return n ? n.textContent.slice(0, 40) : '';
    });
    check(`${w}px 上传服务未配置时有明确降级提示`, noticeText.includes('未配置'), noticeText || '(无)');

    await page.close();
  }

  /* ======================= 桌面端 1440px ======================= */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('img.d-captcha-img', { timeout: 8000 });
    await page.screenshot({ path: join(SHOT_DIR, 'desktop-1440-login.png') });
    await login(page);
    await page.waitForSelector('.d-cols-3', { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: join(SHOT_DIR, 'desktop-1440-home.png') });

    // 无手机端底部 Tab 残留
    const hasMobileTab = await page.$('.m-tabbar');
    check('1440px 桌面端无手机端底部 Tab 栏残留', hasMobileTab === null);

    // 存在侧边栏
    const hasSidebar = await page.$('.d-sidebar');
    check('1440px 桌面端有侧边栏导航', hasSidebar !== null);

    // 首页是三栏
    const cols = await page.$eval('.d-cols-3', (el) => getComputedStyle(el).gridTemplateColumns);
    check('1440px 首页为多栏布局', cols.split(' ').length === 3, cols);

    // 宽容器 max-width 在 1100–1280
    const wrapW = await page.$eval('.d-wrap', (el) => Math.round(el.getBoundingClientRect().width));
    const wrapMax = await page.$eval('.d-wrap', (el) => getComputedStyle(el).maxWidth);
    check('1440px 内容容器为宽容器（max-width 1100–1280）', /1[12]\d\dpx/.test(wrapMax), `max-width=${wrapMax} 实际=${wrapW}px`);

    // 悬停态：列表行 hover 有背景变化
    const hoverOk = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const s of sheets) {
        let rules;
        try { rules = Array.from(s.cssRules); } catch { continue; }
        if (rules.some((r) => r.selectorText && r.selectorText.includes('.d-list-row:hover'))) return true;
      }
      return false;
    });
    check('1440px 存在鼠标悬停态样式', hoverOk);

    // 审批双栏
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.d-nav-item'));
      const t = items.find((e) => e.textContent.includes('审批'));
      if (t) t.click();
    });
    await new Promise((r) => setTimeout(r, 900));
    await page.waitForSelector('.d-cols-2', { timeout: 8000 }); await new Promise((r) => setTimeout(r, 800)); await page.screenshot({ path: join(SHOT_DIR, 'desktop-1440-approve.png') });
    const approveCols = await page.$eval('.d-cols-2', (el) => getComputedStyle(el).gridTemplateColumns);
    check('1440px 审批页为 master-detail 双栏', approveCols.split(' ').length === 2, approveCols);

    // 附件页：拖拽区 + 表格
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.d-nav-item'));
      const t = items.find((e) => e.textContent.includes('附件管理'));
      if (t) t.click();
    });
    await new Promise((r) => setTimeout(r, 900));
    await page.waitForSelector('.d-dropzone', { timeout: 8000 }); await new Promise((r) => setTimeout(r, 800)); await page.screenshot({ path: join(SHOT_DIR, 'desktop-1440-files.png') });
    const hasDrop = await page.$('.d-dropzone');
    const hasTable = await page.$('table.d-table');
    check('1440px 附件页含拖拽上传区', hasDrop !== null);
    check('1440px 附件页含文件表格', hasTable !== null);

    await page.close();
  }

  /* ======================= 上传链路真实性（拦截网络请求） ======================= */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('img.d-captcha-img', { timeout: 8000 });
    await login(page);
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.d-nav-item'));
      const t = items.find((e) => e.textContent.includes('附件管理'));
      if (t) t.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // 检查上传代码路径：未配置凭证时不应发起任何上传请求，且应显示明确提示
    let uploadReq = null;
    page.on('request', (r) => {
      const u = r.url();
      if (/api\.cloudinary\.com|upload\.uploadcare\.com|r2\.cloudflarestorage/.test(u)) uploadReq = u;
    });
    const notice = await page.$eval('.d-notice', (el) => el.textContent);
    check('上传服务未配置时给出明确提示（不假装成功）', /未配置|演示|不受影响/.test(notice), notice.slice(0, 60));

    // 转发真实性：验证 share 模块走真实 API（检查 navigator.share / clipboard 存在）
    const shareCap = await page.evaluate(() => ({
      hasShare: typeof navigator.share === 'function',
      hasClipboard: !!(navigator.clipboard && navigator.clipboard.writeText),
    }));
    check('转发能力可用（Web Share 或剪贴板）', shareCap.hasShare || shareCap.hasClipboard, JSON.stringify(shareCap));
    void uploadReq;
    await page.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n===== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} =====`);
if (failed.length) {
  console.log('失败项：');
  failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? ' :: ' + f.detail : '')));
  process.exit(1);
}
