/**
 * 功能对标无头验证：逐页检查原站操作按钮是否落地、页面是否 0 JS 报错。
 * 用法：node verify-parity.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const BASE = process.argv[2] || 'https://youpin-oa.pages.dev/';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = '9746';

const edge = spawn(EDGE, [
  `--user-data-dir=C:/Users/Administrator/WorkBuddy/2026-10-20-05-59-01/.tmp-parity-${Date.now()}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox', '--headless=new', '--disable-gpu', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const b = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

/**
 * 按层级路径点侧栏菜单：gotoMenu(['财务管理', '发票管理', '我申请的'])
 *
 * DOM 结构（DesktopApp.renderNode）：每个分组是一个 wrapper div，里面
 *   <div class="d-nav-item d-nav-parent">分组名▾</div>   ← 分组头
 *   <div class="d-nav-item">客户列表</div>              ← 平级项（分组头的兄弟）
 *   <div class="d-nav-item d-nav-sub">我申请的</div>    ← 二级子项
 * 子项与分组头是**兄弟**关系（同在 wrapper 内），不是后代。
 * 因此祖先链校验改为：候选元素的第 (i-1-j) 层祖先 wrapper 的**直接子级**
 * 必须包含文字匹配 path[j] 的 .d-nav-parent。
 * 每级单独一次 evaluate（等 React 重渲染）；分组默认展开，只在收起（箭头 ▸）时才点开。
 */
async function clickNavLevel(path, i) {
  return p.evaluate(
    ({ path, i }) => {
      // 分组标题 textContent 带 ▾/▸ 箭头，比较前剥掉
      const norm = (s) => s.replace(/[▾▸\s]+/g, '');
      const exact = (e, t) => norm(e.textContent) === norm(t);
      const want = path[i];
      const last = i === path.length - 1;
      const sel = last ? '.d-nav-item' : '.d-nav-item.d-nav-parent';
      const cands = [...document.querySelectorAll(sel)].filter((e) => exact(e, want));
      for (const el of cands) {
        // 祖先 wrapper 链（从近到远）：chain[0]=直接父 wrapper …
        const chain = [];
        let cur = el.parentElement;
        while (cur && cur !== document.body) {
          chain.push(cur);
          cur = cur.parentElement;
        }
        let ok = true;
        for (let j = i - 1; j >= 0; j--) {
          const wrapper = chain[i - 1 - j];
          // wrapper 的直接子级分组头（不是后代，避免误配嵌套分组）
          const head = wrapper && wrapper.querySelector(':scope > .d-nav-parent');
          if (!head || !exact(head, path[j])) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        if (!last) {
          const arrow = el.querySelector('.d-nav-arrow');
          if (arrow && arrow.textContent.trim() === '▸') el.click();
          return true;
        }
        el.click();
        return true;
      }
      return false;
    },
    { path, i },
  );
}

async function gotoMenu(path) {
  for (let i = 0; i < path.length; i++) {
    await clickNavLevel(path, i);
    await sleep(400);
  }
  await sleep(5600);
}

/** 采集当前页可见按钮文案 + 行内 gg-xs（含「更多 ▾」下拉内的项） */
async function probe(name, expect) {
  // 先点开首行「更多 ▾」下拉（React 异步渲染，需等菜单出现再采集）
  const clicked = await p.evaluate(() => {
    const more = [...document.querySelectorAll('.gg-xs.ghost')].find((e) => e.textContent.includes('更多'));
    if (more) { more.click(); return true; }
    return false;
  });
  if (clicked) {
    for (let i = 0; i < 20; i++) {
      await sleep(100);
      const has = await p.evaluate(() => !!document.querySelector('.pc-ops-menu'));
      if (has) break;
    }
  }
  const r = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.pc-btn')].map((x) => x.textContent.trim());
    const xs = [...document.querySelectorAll('.gg-xs')].map((x) => x.textContent.trim());
    const menu = document.querySelector('.pc-ops-menu');
    if (menu) for (const item of menu.querySelectorAll('.pc-ops-menu-item')) xs.push(item.textContent.trim());
    const title = document.querySelector('.pc-title')?.textContent?.trim() || '(none)';
    return { btns: [...new Set(btns)], xs: [...new Set(xs)], rows: document.querySelectorAll('.pc-table tbody tr').length, title };
  });
  const all = [...r.btns, ...r.xs].join('|');
  const miss = expect.filter((e) => !all.includes(e));
  log(`[${miss.length ? 'MISS' : ' OK '}] ${name}（页标题: ${r.title}）  表格行=${r.rows} 按钮=${r.btns.length} 行操作=${r.xs.length}`);
  if (miss.length) log('        缺失:', miss.join(' / '));
  return miss.length;
}

await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(3000);

let totalMiss = 0;

await gotoMenu(['客户列表']);
totalMiss += await probe('客户列表', ['＋ 添加客户', '导入名单', '转移全部', '避开名单', '导出', '预览', '移入公海', '走访', '分类', '编辑', '删除']);

await gotoMenu(['客户管理', '公海客户']);
totalMiss += await probe('公海客户', ['获取', '分配', '编辑', '删除']);

await gotoMenu(['客户管理', '废弃客户']);
totalMiss += await probe('废弃客户', ['恢复', '彻底删除']);

await gotoMenu(['产品管理', '产品列表']);
totalMiss += await probe('产品列表', ['导出', '批量说明书', '模糊', '复制', '说明书']);

await gotoMenu(['办公审批', '我发起的']);
totalMiss += await probe('审批-我发起的', ['＋ 发起审批', '重新申请', '删除', '通用审批', '采购']);

await gotoMenu(['客户管理', '订单管理', '我处理的']);
totalMiss += await probe('订单处理', ['导出', '添加发票', '添加到账', '物流', '代检进度', '销售协议']);

await gotoMenu(['客户管理', '样本管理']);
totalMiss += await probe('样本管理', ['导出', '导出状态数据', '退回', '责任人', '测试盒责任人']);

await gotoMenu(['财务管理', '发票管理', '我申请的']);
totalMiss += await probe('发票-我申请的', ['导出', '子单', '编辑']);

await gotoMenu(['企业公告', '公告列表']);
totalMiss += await probe('公告列表', ['＋ 新增公告', '编辑', '删除']);

await gotoMenu(['售前售后问答', '售前售后查询']);
totalMiss += await probe('问答知识', ['导出', '＋ 新增问答', '编辑', '删除']);

await gotoMenu(['基础数据', '附件管理']);
totalMiss += await probe('附件管理', ['批量下载', '打包转发', '打开', '转发', '下载']);

log(`\n[D] 合计缺失项: ${totalMiss}`);
log('[D] JS错误:', errs.length, errs.slice(0, 3));

await b.disconnect();
process.exit(0);
