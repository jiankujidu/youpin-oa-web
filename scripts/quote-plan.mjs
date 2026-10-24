#!/usr/bin/env node
/**
 * 报价方案生成器
 * ---------------------------------------------------------------------------
 * 输入：报价页「导出数据(JSON)」导出的收藏夹全量数据
 *   node scripts/quote-plan.mjs 报价数据_YYYY-MM-DD.json [输出目录]
 *
 * 产出（写到输出目录，默认 ./quote-plan-out/）：
 *   报价方案_YYYY-MM-DD.md    完整方案（逐项明细 + 价格来源 + 梯度报价 + 风险提示 + 待确认清单）
 *   报价方案_YYYY-MM-DD.xlsx  同一份数据（可直接编辑/存档；xlsx 生成器见 src/core/xlsx.ts，
 *                              此脚本用极简内嵌 xlsx 写入，避免依赖浏览器环境）
 *
 * 原则（用户原话）：
 *   - 逐项核实，不凭印象估算/编造价格
 *   - 缺失/不确定的数字一律标注 ⚠️ 进「待确认清单」，不自行假设
 *   - 所有数字可追溯：每个单价都能对回 原站 price_desc 原文
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const inFile = args[0];
if (!inFile) {
  console.error('用法: node scripts/quote-plan.mjs <导出的JSON文件> [输出目录]');
  console.error('（先在报价页点「导出数据(JSON)」拿到收藏夹数据）');
  process.exit(1);
}
if (!fs.existsSync(inFile)) {
  console.error(`找不到文件: ${inFile}`);
  process.exit(1);
}

let raw;
try {
  raw = JSON.parse(fs.readFileSync(inFile, 'utf8'));
} catch (e) {
  console.error('JSON 解析失败：' + e.message);
  process.exit(1);
}

const folders = Array.isArray(raw.folders) ? raw.folders : [];
const settings = raw.settings || {};
const outDir = args[1] || path.join(process.cwd(), 'quote-plan-out');
fs.mkdirSync(outDir, { recursive: true });

/* ---------------- 工具 ---------------- */
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n) => r2(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

/* ---------------- 价格解析（与 src/core/quoteStore.ts 的 parsePrices 同逻辑） ----------------
 * 为什么脚本里要再写一份：收藏夹数据存在浏览器 localStorage，脚本读的是导出的 JSON。
 * 旧版本存进去的条目 prices 可能为空（当时解析器不认抗体的无标签格式），
 * 因此这里「prices 为空但 priceRaw 有值」时，用原文重新解析，把老数据救回来。 */
const isNum = (x) => /^\d+(\.\d+)?$/.test(x);
const looksSpec = (x) => /\d/.test(x) && /[a-z]/i.test(x);
const UNIT_SRC = '(ul|μl|µl|ml|mg|ug|μg|µg|ng|g|kg|l|t\\b|tests?)';

function parseUnlabeled(s) {
  const out = [];
  const parts = s.split(/[;；,，\s]+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return out;
  // D) 交替序列：100UL;2230;53ul;1560;10ul;368
  if (parts.length >= 2 && parts.length % 2 === 0) {
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (!(i % 2 === 0 ? looksSpec(parts[i]) : isNum(parts[i]))) { ok = false; break; }
    }
    if (ok) {
      for (let i = 0; i < parts.length; i += 2) {
        out.push({ spec: parts[i], dir: parseFloat(parts[i + 1]) || 0, dist: 0 });
      }
      return out;
    }
  }
  // E) 斜杠配对：0.1/0.5/1mg;280/500/710;7折
  if (parts.length >= 2 && parts[0].includes('/') && parts[1].includes('/')) {
    const sr = parts[0].split('/').map((x) => x.trim()).filter(Boolean);
    const pr = parts[1].split('/').map((x) => x.trim()).filter(Boolean);
    if (sr.length === pr.length && pr.every(isNum)) {
      const um = sr[sr.length - 1].match(/^[\d.]+\s*([a-zμµ].*)$/i);
      const unit = um ? um[1] : '';
      sr.forEach((sp, i) => {
        const full = i === sr.length - 1 || looksSpec(sp) ? sp : `${sp}${unit}`;
        out.push({ spec: full, dir: parseFloat(pr[i]) || 0, dist: 0 });
      });
      return out;
    }
  }
  // F) 完全粘连：0.5mg2500经销商7折
  const scan = new RegExp(`([\\d.]+)\\s*${UNIT_SRC}\\s*(\\d+(?:\\.\\d+)?)`, 'gi');
  let m;
  while ((m = scan.exec(s))) {
    out.push({ spec: `${m[1]}${m[2] || ''}`.trim(), dir: parseFloat(m[3]) || 0, dist: 0 });
  }
  if (out.length) return out;
  if (parts.length === 2 && looksSpec(parts[0]) && isNum(parts[1])) {
    out.push({ spec: parts[0], dir: parseFloat(parts[1]) || 0, dist: 0 });
  }
  return out;
}

function parsePrices(desc) {
  const s = String(desc || '').replace(/&nbsp;/g, ' ').trim();
  if (!s) return [];
  const labeled = /规格|型号|包装|目录价|经销价|市场价|零售价|代理价|渠道价|批发价|价格|[:：]/.test(s);
  if (!labeled) return parseUnlabeled(s);
  const out = [];
  const parts = s.split(/[;；,，\r\n]+/).map((x) => x.trim()).filter(Boolean);
  for (const part of parts) {
    const segs = part.split(/[-—–/／|]+/).map((x) => x.trim()).filter(Boolean);
    let spec = '', dir = 0, dist = 0, other = 0;
    const flush = () => {
      if (!dir && !dist && other) { dir = other; dist = other; }
      if (spec || dir || dist) out.push({ spec: spec || '标准', dir, dist });
      spec = ''; dir = 0; dist = 0; other = 0;
    };
    for (const seg of segs) {
      const m = seg.match(/^([^:：]+)[:：]\s*(.*)$/);
      if (m) {
        const k = m[1].trim(), v = m[2].trim();
        const num = parseFloat(v.replace(/[^\d.\-]/g, '')) || 0;
        if (/规格|型号|包装/.test(k)) { flush(); spec = v.replace(/元/g, '').trim(); }
        else if (/目录|市场|标价|零售/.test(k)) dir = num;
        else if (/经销|代理|渠道|批发/.test(k)) dist = num;
        else if (/价/.test(k)) other = other || num;
        continue;
      }
      const km = seg.match(/^(目录价|经销价|市场价|零售价|代理价|渠道价|批发价|价格)\s*[（(]?\s*元?\s*[)）]?\s*([\d.]+)/);
      if (km) {
        const num = parseFloat(km[2]) || 0;
        if (/目录|市场|零售|标价/.test(km[1])) dir = num;
        else if (/经销|代理|渠道|批发/.test(km[1])) dist = num;
        else other = other || num;
        continue;
      }
      if (looksSpec(seg)) { flush(); spec = seg; }
    }
    flush();
  }
  return out;
}
/** 数量档位 → 折扣比例（示例梯度，仅当数量明确时给出；最终折扣以商务确认为准） */
function tierDiscount(qty) {
  const q = Number(qty) || 0;
  if (q >= 100) return { label: '≥100 盒', rate: 0.85 };
  if (q >= 50) return { label: '≥50 盒', rate: 0.9 };
  if (q >= 10) return { label: '≥10 盒', rate: 0.95 };
  return { label: '<10 盒', rate: 1 };
}

const rows = []; // 汇总行（跨收藏夹，含夹名）
const issues = []; // 待确认清单

function addIssue(folder, item, level, msg) {
  issues.push({
    folder: folder.name,
    goods_no: item.goods_no || '—',
    title: (item.title || '').slice(0, 30),
    level, // info | warn
    msg,
  });
}

let totalRows = 0;
let totalAmt = 0;
let totalOrigin = 0;
let totalDocsMissing = 0;

for (const f of folders) {
  const items = Array.isArray(f.items) ? f.items : [];
  for (const it of items) {
    totalRows++;
    // prices 为空（旧版存储的条目）时，用原站原文重新解析，把老数据救回来
    let prices = Array.isArray(it.prices) ? it.prices : [];
    const rawDesc = String(it.priceRaw ?? '').trim();
    if (!prices.length && rawDesc) prices = parsePrices(rawDesc);
    const spec = prices[it.specIndex] || prices[0] || null;
    const hasDir = !!(spec && spec.dir > 0);
    const hasDist = !!(spec && spec.dist > 0);
    const qty = Number(it.qty) || 0;
    const custom = it.priceType === 'custom' ? Number(it.custom) : 0;
    const isCustom = it.priceType === 'custom' && custom > 0;
    const wantsDist = it.priceType === 'dist';
    const basis = isCustom
      ? '自定义'
      : wantsDist
        ? hasDist
          ? '经销价'
          : '目录价(回退)'
        : hasDir
          ? '目录价'
          : hasDist
            ? '经销价'
            : '未知';
    const unit = isCustom ? custom : wantsDist ? (hasDist ? spec.dist : spec.dir || 0) : spec?.dir || spec?.dist || 0;
    const basisFlag = !isCustom && (basis === '未知' || (unit === 0 && !custom)) ? ' ⚠️' : '';
    const lineAmt = r2(unit * qty);
    const origin = r2(unit * qty); // 无行级折扣时原价=小计
    totalAmt = r2(totalAmt + lineAmt);
    totalOrigin = r2(totalOrigin + origin);
    const docCount = Array.isArray(it.docs) ? it.docs.length : 0;
    if (docCount === 0) totalDocsMissing++;

    // 价格口径：原站无标签格式（抗体主流写法）只写一个价，无法区分目录价/经销价
    const raw = String(it.priceRaw ?? '').trim();
    const unlabeled = !!raw && !/规格|型号|包装|目录价|经销价|市场价|零售价|代理价|渠道价|批发价|价格|[:：]/.test(raw);

    // 问题检测
    if (!prices.length) addIssue(f, it, 'warn', '无价格数据（原站 price_desc 为空或解析失败）——单价未知，需人工补充');
    else {
      if (!hasDir && !hasDist) addIssue(f, it, 'warn', `规格「${spec?.spec || '标准'}」价格解析为 0/缺失——需回原站核实`);
    }
    if (unlabeled) {
      addIssue(
        f,
        it,
        'info',
        `原站价格无标签格式（如 "${raw.slice(0, 40)}"），现按目录价计价；` +
          `经销价未知，若报经销价需商务提供该货号经销价（原站数据里没有）`,
      );
    }
    if (isCustom) addIssue(f, it, 'info', `采用自定义单价 ¥${money(custom)}（来源：销售手动录入，未经原站价格核对）——需在报价单备注中说明`);
    if (it.priceType !== 'custom' && !unit) addIssue(f, it, 'warn', `单价=0（规格「${spec?.spec || '标准'}」${hasDist ? '经销价' : hasDir ? '目录价' : '价格'}缺失）`);
    if (!qty || qty <= 0) addIssue(f, it, 'warn', '数量未填（按 0 计）——需确认订购数量');
    if (!it.unit || !String(it.unit).trim()) addIssue(f, it, 'info', '计价单位未填——需确认（盒/瓶/板…）');
    if (!docCount) addIssue(f, it, 'info', '无说明书快照（原站该货号未挂说明书，或收集夹添加时较早未存）');
    if (prices.length > 1 && !spec) addIssue(f, it, 'warn', '多规格但选中规格索引越界');

    rows.push({
      folder: f.name,
      goods_no: it.goods_no || '—',
      title: it.title || '—',
      cate: it.cate || '',
      spec: spec?.spec || (prices.length ? '' : '—'),
      basis,
      dir: hasDir ? spec.dir : 0,
      dist: hasDist ? spec.dist : 0,
      custom,
      unit,
      qty,
      unit2: it.unit || '—',
      line: lineAmt,
      origin,
      tier: tierDiscount(qty),
      tierAmt: r2(unit * qty * tierDiscount(qty).rate),
      docs: docCount,
      note: it.note || '',
      basisFlag,
      raw,
      unlabeled,
    });
  }
}

/* ---------------- 汇总 ---------------- */
const byFolder = folders.map((f) => {
  const r = rows.filter((x) => x.folder === f.name);
  return {
    name: f.name,
    count: r.length,
    amt: r2(r.reduce((s, x) => s + x.line, 0)),
  };
});

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const stampD = new Date().toISOString().slice(0, 10);

console.log(`✓ 读取 ${inFile}`);
console.log(`  收藏夹 ${folders.length} 个 · 产品 ${totalRows} 条`);
console.log(`  待确认项 ${issues.filter((i) => i.level === 'warn').length} 个（⚠）· 提示 ${issues.filter((i) => i.level === 'info').length} 个（ℹ）`);

/* ---------------- Markdown 报告 ---------------- */
const L = [];
const md = (s = '') => L.push(s);
md('# 报价方案（逐项核实版）');
md('');
md(`- **数据来源**：${path.basename(inFile)}（报价页「导出数据(JSON)」，${raw._exportedAt || '时间未知'}）`);
md(`- **生成时间**：${new Date().toLocaleString('zh-CN')}`);
md(`- **客户**：${settings.customer || '（未填写，待确认）'}　**销售**：${settings.seller || '（未填写）'}`);
md(`- **报价口径**：${settings.mode === 'dealer' ? '经销价（经销商）' : '目录价（终端客户）'}`);
md(`- **产品总数**：${totalRows} 条　**涉及金额**：¥${money(totalAmt)}（按各行当前数量与取价口径）`);
md('');
md('> 说明：本方案所有单价均取自收藏夹条目内保存的**原站价格快照**（加入收藏夹时解析自 `price_desc` 字段），');
md('> 不是现场重新抓取。若原站价格已变动，请以「按货号回原站核实」为准。');
md('> 带 ⚠️ 的项为**必须人工确认**的缺口；带 ℹ️ 的项为提示性信息。所有数字可在导出 JSON 中逐项追溯。');
md('');

md('## 一、价格总览（按收藏夹）');
md('');
md('| 收藏夹 | 产品数 | 小计金额 |');
md('| --- | ---: | ---: |');
for (const b of byFolder) {
  md(`| ${b.name} | ${b.count} | ¥${money(b.amt)} |`);
}
md(`| **合计** | **${totalRows}** | **¥${money(totalAmt)}** |`);
md('');

md('## 二、产品清单与逐项价格明细');
md('');
md('| # | 收藏夹 | 货号 | 产品名称 | 规格 | 取价口径 | 单价 | 数量 | 计价单位 | 小计 | 说明书 | 原站原始价格串 |');
md('| ---: | --- | --- | --- | --- | --- | ---: | ---: | --- | ---: | :---: | --- |');
rows.forEach((x, i) => {
  const u = x.custom ? `¥${money(x.custom)}*` : `¥${money(x.unit)}`;
  const flag = x.basisFlag || '';
  md(
    `| ${i + 1} | ${x.folder} | ${x.goods_no} | ${x.title} | ${x.spec || '—'} | ${x.basis}${flag} | ${u} | ${x.qty || '—'} | ${x.unit2} | ¥${money(x.line)} | ${x.docs ? '✓' : '—'} | ${x.raw ? `\`${x.raw}\`` : '—'} |`,
  );
});
md('');
md('（`*` = 自定义单价，销售录入；⚠️ = 价格口径不确定，见待确认清单）');
md('');

md('### 价格来源说明（取价口径 → 计算方式）');
md('');
md('| 口径 | 计算方式 | 数据来源 |');
md('| --- | --- | --- |');
md('| 目录价 | 单价 = 原站 price_desc 中该规格的「目录价/市场/零售价」 | 加入收藏夹时的价格快照（解析自原站 `/product/index/list` 返回的 price_desc 字段） |');
md('| 经销价 | 单价 = 原站 price_desc 中该规格的「经销价/代理价」 | 同上；无经销价时回退目录价并标注「(回退)」 |');
md('| 自定义 | 单价 = 销售手填 custom 字段 | **未经原站核对**，须备注说明 |');
md('| 行小计 | 单价 × 数量（行级折扣为 100% 时即原金额） | — |');
md('| 目录价(回退) | 本行按经销价计价，但原站该规格无经销价 → 回退目录价 | 原站 price_desc 缺失，需商务确认 |');
md('');
md('**原站 `price_desc` 的多种格式**（本方案已逐一实测覆盖）：');
md('');
md('| 格式 | 样例 | 出现在 |');
md('| --- | --- | --- |');
md('| A 带标签·分号 | `规格:10mg-目录价:200元-经销价:300元;…` | 部分旧品 |');
md('| B 带标签·斜杠 | `规格：96T-目录价：3000元/经销价：1200元,…` | ELISA 现行主流 |');
md('| C 单一价 | `规格:10mg-价格:200元` | 部分旧品 |');
md('| D 无标签·交替序列 | `100UL;2230;53ul;1560;10ul;368` | **抗体主流**（一抗/兔单抗/内参抗体） |');
md('| E 无标签·斜杠配对 | `0.1/0.5/1mg;280/500/710;7折` | 二抗部分 |');
md('| F 无标签·完全粘连 | `0.5mg2500经销商7折` | 抗体对部分 |');
md('| G 标签+斜杠嵌套 | `规格：53UL-目录价（元）1340元-规格/100UL-…` | 一抗（没验证图） |');
md('');
md('> ⚠️ **重要**：D/E/F 三种无标签格式的原站数据**只提供一个价格**，无法区分目录价与经销价。');
md('> 本方案统一按**目录价**计入，并把这些行列入下方待确认清单的 ℹ️ 项——');
md('> 若要报经销价，必须由商务提供该货号经销价（原站数据里没有，我不做推算）。');
md('');

const unlabeledCount = rows.filter((x) => x.unlabeled).length;
if (unlabeledCount) {
  md(`> 本次共 **${unlabeledCount} 行** 属于无标签格式（原站只给单一价），详见待确认清单。`);
  md('');
}

md('## 三、梯度报价模拟（按数量档位，示例）');
md('');
md('> 档位仅为数量→折扣的**示例映射**（<10盒 1 折 / ≥10盒 95 折 / ≥50盒 9 折 / ≥100盒 85 折），');
md('> 实际折扣需商务按客户级别与数量谈判确定。金额 = 单价 × 数量 × 档位系数。');
md('');
md('| 档位 | 涉及行数 | 档位金额合计 |');
md('| --- | ---: | ---: |');
const tiers = new Map();
for (const x of rows) {
  const t = x.tier.label;
  const e = tiers.get(t) || { n: 0, amt: 0 };
  e.n++;
  e.amt = r2(e.amt + x.tierAmt);
  tiers.set(t, e);
}
for (const [label, e] of tiers) {
  md(`| ${label} | ${e.n} | ¥${money(e.amt)} |`);
}
md('');

md('## 四、总价汇总');
md('');
md('| 项目 | 金额 |');
md('| --- | ---: |');
md(`| 原价合计（单价×数量） | ¥${money(totalOrigin)} |`);
md(`| 当前口径合计 | ¥${money(totalAmt)} |`);
const tr = Number(settings.taxRate) || 0;
if (tr > 0) {
  md(`| 税额（${tr}%） | ¥${money(r2(totalAmt * (tr / 100)))} |`);
  md(`| **含税总计** | **¥${money(r2(totalAmt * (1 + tr / 100)))}** |`);
} else {
  md(`| 税率 | 0%（未设，如需含税请补充税率） |`);
}
md('');

md('## 五、关键假设与风险提示');
md('');
md('- **假设 1**：收藏夹价格快照截至收集夹添加/刷新时点；原站调价后以实时接口为准。');
md('- **假设 2**：「数量」为各条目当前填写值，未填写按 0 计并从待确认清单列出——**总价仅在数量补全后才成立**。');
md('- **假设 3**：梯度折扣为示例映射，非公司既有政策；正式报价前必须经商务/负责人确认折扣表。');
md('- **风险 1**：' + issues.filter((i) => i.level === 'warn').length + ' 个价格/数量缺口（⚠️），逐项见「六、待确认清单」。');
md('- **风险 2**：' + totalDocsMissing + ' 个货号无说明书快照，随报价单附 PDF 时需现场从原站补下。');
md('- **风险 3**：静态资源域名 static.upingbio.cn 证书 2026-10-24 过期（已知外部故障），说明书下载走 /oss/ 兜底通道；若原站仍 526/403 则该项无法附上。');
md('');

md('## 六、待确认清单');
md('');
md('### ⚠️ 必须确认（影响总价/报价成立）');
md('');
const warns = issues.filter((i) => i.level === 'warn');
if (warns.length) {
  warns.forEach((x, i) => {
    md(`${i + 1}. **${x.goods_no}**（${x.title}，夹：${x.folder}）— ${x.msg}`);
  });
} else {
  md('（无 ⚠️ 项——价格与数量均齐备）');
}
md('');
md('### ℹ️ 提示（不阻塞报价，但建议补齐）');
md('');
const infos = issues.filter((i) => i.level === 'info');
if (infos.length) {
  infos.forEach((x, i) => {
    md(`${i + 1}. ${x.goods_no}（夹：${x.folder}）— ${x.msg}`);
  });
} else {
  md('（无）');
}
md('');

const mdPath = path.join(outDir, `报价方案_${stampD}.md`);
fs.writeFileSync(mdPath, L.join('\n'), 'utf8');
console.log(`✓ 已生成 Markdown: ${mdPath}`);

/* ---------------- XLSX 输出（极简内嵌：ZIP + worksheet，无外部依赖） ---------------- */
function escXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function colName(c) {
  let s = '';
  c++;
  while (c) {
    const r = (c - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

/** 用 jszip（仓库既有依赖）打包 xlsx，避免手搓 ZIP 的边界问题 */
async function buildXlsxSheets(sheets) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const sheetNames = sheets.map((s, i) =>
    `<sheet name="${escXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
  );
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames.join('')}</sheets></workbook>`;
  const relsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/workbook" Target="xl/workbook.xml"/>` +
    sheets
      .map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="xl/worksheets/sheet${i + 1}.xml"/>`)
      .join('') +
    `</Relationships>`;
  const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('') +
    `</Relationships>`;
  const ctXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.workbook+xml"/>` +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    `</Types>`;

  zip.file('[Content_Types].xml', ctXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', wbRelsXml);
  sheets.forEach((sh, i) => {
    const grid = sh.rows;
    const rowsXml = grid
      .map((row, ri) => {
        const cells = row
          .map((v, ci) => {
            const ref = `${colName(ci + 1)}${ri + 1}`;
            if (v === '' || v === null || v === undefined) return `<c r="${ref}"/>`;
            if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
            return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(String(v))}</t></is></c>`;
          })
          .join('');
        return `<row r="${ri + 1}">${cells}</row>`;
      })
      .join('');
    const cols = (sh.widths || [])
      .map((w, i2) => `<col min="${i2 + 1}" max="${i2 + 1}" width="${Math.round(w)}" customWidth="1"/>`)
      .join('');
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rowsXml}</sheetData></worksheet>`;
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, xml);
  });

  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/* ---- 明细表 + 汇总 + 待确认 三个 sheet ---- */
const detailSheet = {
  name: '明细',
  widths: [6, 14, 16, 32, 12, 12, 12, 8, 10, 14, 8],
  rows: [
    ['收藏夹', '货号', '产品名称', '规格', '取价口径', '单价(¥)', '数量', '计价单位', '小计(¥)', '说明书', '备注', '原站原始价格串(溯源)'],
    ...rows.map((x) => [
      x.folder,
      x.goods_no,
      x.title,
      x.spec || '',
      x.basis + (x.custom ? '(自定义)' : ''),
      x.custom ? x.custom : x.unit,
      x.qty,
      x.unit2,
      x.line,
      x.docs ? '✓' : '',
      x.note,
      x.raw || '',
    ]),
  ],
};
const summarySheet = {
  name: '汇总',
  widths: [16, 10, 14, 40],
  rows: [
    ['项目', '值', '', '说明'],
    ['产品总数', totalRows, '', ''],
    ['涉及金额(¥)', totalAmt, '', '按各行当前数量与取价口径'],
    ...(Number(settings.taxRate) > 0
      ? [['税率(%)', settings.taxRate, '', '含税'], ['含税总计(¥)', r2(totalAmt * (1 + Number(settings.taxRate) / 100)), '', '']]
      : [['税率', 0, '', '未设']]),
    ['⚠️待确认项', issues.filter((i) => i.level === 'warn').length, '', '影响报价成立'],
    ['ℹ️提示项', issues.filter((i) => i.level === 'info').length, '', '建议补齐'],
    [],
    ['--- 按收藏夹 ---', '', '', ''],
    ...byFolder.map((b) => [b.name, b.count, b.amt, '']),
  ],
};
const issueSheet = {
  name: '待确认',
  widths: [14, 16, 30, 6, 46],
  rows: [
    ['收藏夹', '货号', '产品名', '级别', '问题'],
    ...issues.map((x) => [x.folder, x.goods_no, x.title, x.level === 'warn' ? '⚠️' : 'ℹ️', x.msg]),
  ],
};

const main = async () => {
  const xlsxBytes = await buildXlsxSheets([detailSheet, summarySheet, issueSheet]);
  const xlsxPath = path.join(outDir, `报价方案_${stampD}.xlsx`);
  fs.writeFileSync(xlsxPath, xlsxBytes);
  console.log(`✓ 已生成 Excel: ${xlsxPath} (${xlsxBytes.length} bytes)`);
  console.log('');
  console.log('下一步：把「⚠️待确认清单」里的项补全后重新导出 JSON 再生成；或直接在 Excel 明细 sheet 改数字。');
};
void main();
