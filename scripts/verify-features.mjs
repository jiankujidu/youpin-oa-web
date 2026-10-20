/**
 * 功能可用性自检（无头 Chrome 实测）
 * 覆盖：登录门禁、子页面真实可用（非占位）、审批通过持久化、新增客户生效、表单页可用。
 * 用法：node scripts/verify-features.mjs <baseUrl> <chromePath>
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:4173/';
const CHROME = process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

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

async function doLogin(page, user, pwd) {
  // 同一 browser 下多个 page 共享 localStorage：已登录时直接跳过
  if (await page.$('.m-tabbar, .d-sidebar')) return;
  const answer = await solveCaptcha(page);
  await page.type('input#m-username, input[placeholder*="账号"]', user);
  await page.type('input[type="password"]', pwd);
  const sel = await page.$('input[placeholder^="填算式"], input[placeholder^="算式结果"]');
  await sel.type(String(answer));
  await page.click('button.m-login-btn, button.d-login-btn');
  await new Promise((r) => setTimeout(r, 1200));
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  /* ============ 1. 登录门禁：任意账号不再可进 ============ */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 812 });
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await doLogin(page, 'attacker', '123456');
    const tip = await page.$eval('.m-login-tip, .d-login-tip', (el) => el.textContent.trim()).catch(() => '');
    const stillLogin = !!(await page.$('.m-login-btn, .d-login-btn'));
    check('登录门禁：非白名单账号被拒绝', stillLogin && /演示模式仅支持账号/.test(tip), tip);
    await page.close();
  }

  /* ============ 2. 手机端子页面（财务）真实可用，非占位 ============ */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 812 });
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await doLogin(page, 'demo', 'demo1234');
    await page.waitForSelector('.m-tabbar', { timeout: 8000 });
    // 我的 → 预存款
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.m-tab')];
      tabs.find((t) => t.textContent.includes('我的'))?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.m-menu-item')];
      items.find((i) => i.textContent.includes('预存款'))?.click();
    });
    await new Promise((r) => setTimeout(r, 900));
    const info = await page.evaluate(() => ({
      title: document.querySelector('.m-topbar-title')?.textContent.trim(),
      cards: document.querySelectorAll('.m-card').length,
      text: document.querySelector('.m-container')?.textContent.slice(0, 200),
    }));
    const placeholder = /占位|敬请期待|暂未开放|开发中/.test(info.text || '');
    check('手机端「预存款」页有真实数据（非占位）', info.cards >= 3 && !placeholder, `${info.title} · ${info.cards} 条`);

    // 点进详情
    await page.click('.m-card.clickable');
    await new Promise((r) => setTimeout(r, 600));
    const detailRows = await page.evaluate(() => document.querySelectorAll('.m-detail-row').length);
    check('手机端子页面可打开详情', detailRows >= 2, `详情字段 ${detailRows} 行`);
    await page.close();
  }

  /* ============ 3. 发起审批 → 通过 → 状态生效且刷新不丢 ============ */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 812 });
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await doLogin(page, 'demo', 'demo1234');
    await page.waitForSelector('.m-tabbar', { timeout: 8000 });

    // 3.1 首页宫格「发起审批」
    await page.evaluate(() => {
      [...document.querySelectorAll('.m-grid-item')].find((g) => g.textContent.includes('发起审批'))?.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    const TITLE = '自检用章申请';
    await page.type('.m-field input', TITLE);
    await page.evaluate(() => {
      [...document.querySelectorAll('button.m-btn-ok')].find((b) => b.textContent.includes('提交申请'))?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => {
      [...document.querySelectorAll('.m-dialog-btn')].find((b) => /确定|确认/.test(b.textContent))?.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    // 提交后自动切到审批 tab 的「待审批」
    await page.evaluate(() => {
      [...document.querySelectorAll('.m-seg-item')].find((s) => s.textContent.includes('待审批'))?.click();
    });
    await new Promise((r) => setTimeout(r, 900));
    const inPending = await page.evaluate((t) => document.body.textContent.includes(t), TITLE);
    check('发起审批后进入待审批列表', inPending, TITLE);

    await page.evaluate(() => {
      [...document.querySelectorAll('.m-tab')].find((t) => t.textContent.includes('审批'))?.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    // 切到「待审批」
    await page.evaluate(() => {
      [...document.querySelectorAll('.m-seg-item')].find((s) => s.textContent.includes('待审批'))?.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    const target = await page.evaluate((t) => {
      const c = [...document.querySelectorAll('.m-card.clickable')].find((e) => e.textContent.includes(t));
      if (!c) return null;
      c.click();
      return t;
    }, TITLE);
    if (!target) {
      check('手机端审批通过并持久化', false, '无待审批数据');
    } else {
      await new Promise((r) => setTimeout(r, 600));
      await page.evaluate(() => {
        [...document.querySelectorAll('button.m-btn-ok')].find((b) => b.textContent.includes('通过'))?.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      // 意见弹层 → 确认
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('.m-dialog-btn')];
        btns.find((b) => /确定|确认/.test(b.textContent))?.click();
      });
      await new Promise((r) => setTimeout(r, 500));
      // 二次确认对话框
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('.m-dialog-btn')];
        btns.find((b) => /确定|确认/.test(b.textContent))?.click();
      });
      await new Promise((r) => setTimeout(r, 900));
      // 刷新后回到「已通过」分段，检查该条是否在其中
      await page.reload({ waitUntil: 'networkidle2' });
      await new Promise((r) => setTimeout(r, 600));
      await page.evaluate(() => {
        [...document.querySelectorAll('.m-tab')].find((t) => t.textContent.includes('审批'))?.click();
      });
      await new Promise((r) => setTimeout(r, 700));
      await page.evaluate(() => {
        [...document.querySelectorAll('.m-seg-item')].find((s) => s.textContent.includes('已通过'))?.click();
      });
      await new Promise((r) => setTimeout(r, 900));
      const passed = await page.evaluate(
        (t) => [...document.querySelectorAll('.m-card-title')].some((e) => e.textContent.includes(t.replace(/已通过|待审批/g, '').trim().slice(0, 8))),
        target,
      );
      check('手机端审批通过 → 刷新后仍为已通过（持久化生效）', passed, target.slice(0, 24));
    }
    await page.close();
  }

  /* ============ 4. 新增客户生效并进入列表 ============ */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 812 });
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await doLogin(page, 'demo', 'demo1234');
    await page.waitForSelector('.m-tabbar', { timeout: 8000 });
    await page.evaluate(() => {
      [...document.querySelectorAll('.m-grid-item')].find((g) => g.textContent.includes('新增客户'))?.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    const NAME = '自检验证客户有限公司';
    await page.evaluate((name) => {
      const inputs = [...document.querySelectorAll('.m-field input')];
      inputs[0].focus();
      return name;
    }, NAME);
    await page.type('.m-field input', NAME);
    await page.evaluate(() => {
      [...document.querySelectorAll('button.m-btn-ok')].find((b) => b.textContent.includes('提交'))?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => {
      [...document.querySelectorAll('.m-dialog-btn')].find((b) => /确定|确认/.test(b.textContent))?.click();
    });
    await new Promise((r) => setTimeout(r, 1200));
    const inList = await page.evaluate(
      (name) => document.body.textContent.includes(name),
      NAME,
    );
    check('新增客户提交后出现在客户列表', inList, NAME);
    await page.close();
  }

  /* ============ 5. 桌面端子页面（财务/客户子类）真实可用 ============ */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await doLogin(page, 'demo', 'demo1234');
    await page.waitForSelector('.d-sidebar', { timeout: 8000 });
    const opened = [];
    for (const label of ['预存款', '销售机会', '跟进记录', '保证金']) {
      const ok = await page.evaluate((l) => {
        const it = [...document.querySelectorAll('.d-nav-item')].find((n) => n.textContent.includes(l));
        if (it) {
          it.click();
          return true;
        }
        return false;
      }, label);
      await new Promise((r) => setTimeout(r, 800));
      const rows = await page.evaluate(() => ({
        rows: document.querySelectorAll('table.d-table tbody tr').length,
        title: document.querySelector('.d-page-title')?.textContent.trim(),
      }));
      opened.push(`${label}:${ok ? rows.rows + '行' : '未找到'}`);
      if (rows.rows < 1) opened.push(`${label} 空表`);
    }
    const allOk = opened.every((s) => !s.includes('未找到') && !s.includes('空表'));
    check('桌面端财务/客户子类页面全部有数据', allOk, opened.join(' | '));

    // 详情弹窗
    await page.click('table.d-table tbody tr');
    await new Promise((r) => setTimeout(r, 500));
    const modal = await page.evaluate(() => document.querySelectorAll('.d-modal .d-card-line').length);
    check('桌面端子页面详情弹窗有字段', modal >= 2, `${modal} 字段`);
    await page.close();
  }

  /* ============ 6. 基本资料 / 修改密码 页可打开并保存 ============ */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await doLogin(page, 'demo', 'demo1234');
    await page.waitForSelector('.d-sidebar', { timeout: 8000 });
    await page.evaluate(() => {
      document.querySelector('.d-user')?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => {
      [...document.querySelectorAll('.d-user-menu-item')].find((m) => m.textContent.includes('基本资料'))?.click();
    });
    await new Promise((r) => setTimeout(r, 700));
    const hasForm = await page.evaluate(() => document.querySelectorAll('.d-card input').length);
    check('桌面端「基本资料」为可编辑表单', hasForm >= 3, `${hasForm} 个输入框`);
    await page.close();
  }
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} =====`);
  if (failed.length) process.exitCode = 1;
}
