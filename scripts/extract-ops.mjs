// 提取每个快照里 table.on('tool'/'toolbar') 的真实操作端点（含 tool.delete / flow_check）
import fs from 'node:fs';
import path from 'node:path';

const dir = 'origin-snapshot';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));

function skipBlock(s, start) {
  let d = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') d++;
    else if (s[i] === '}') { d--; if (d === 0) return i; }
  }
  return s.length;
}

function findHandlers(html) {
  const out = { tool: {}, toolbar: {} };
  const re = /table\.on\(\s*'(tool|toolbar)\(([^)]*)\)'\s*,\s*function\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(html))) {
    const kind = m[1];
    const blockStart = m.index + m[0].length - 1;
    const blockEnd = skipBlock(html, blockStart);
    const body = html.slice(blockStart + 1, blockEnd);
    const evRe = /if\s*\(\s*(?:obj|data)\.event\s*===?\s*'([^']+)'\s*\)\s*\{/g;
    let em;
    while ((em = evRe.exec(body))) {
      const ev = em[1];
      const bs = em.index + em[0].length - 1;
      const be = skipBlock(body, bs);
      const blk = body.slice(bs + 1, be);
      const calls = [];
      const callRe = /(?:tool|oa|\$)\.(delete|post|get|side|ajax)\s*\(\s*(['"])([^'"]+)\2/g;
      let cm;
      while ((cm = callRe.exec(blk))) calls.push({ method: cm[1], url: cm[3] });
      // flow_check（勾股审批流）单独匹配
      const fc = /flow_check[^;]*?\{[^}]*?check\s*:\s*(\d+)[^}]*?\}/.exec(blk) || /tool\.post\(\s*['"]#?\/?(?:api\/index\/)?flow_check['"]/.exec(blk);
      if (fc) calls.push({ method: 'flow', url: '/api/index/flow_check' });
      if (calls.length) out[kind][ev] = (out[kind][ev] || []).concat(calls);
    }
  }
  return out;
}

const result = {};
for (const f of files) {
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  const h = findHandlers(html);
  if ((h.tool && Object.keys(h.tool).length) || (h.toolbar && Object.keys(h.toolbar).length)) result[f] = h;
}
fs.writeFileSync('scripts/ops-extract.json', JSON.stringify(result, null, 1));
for (const [f, h] of Object.entries(result)) {
  const tool = Object.entries(h.tool || {})
    .map(([e, c]) => `${e}->${c.map((x) => `${x.method}:${x.url.split('?')[0]}`).join('|')}`)
    .join('\n    ');
  const tb = Object.entries(h.toolbar || {})
    .map(([e, c]) => `${e}->${c.map((x) => `${x.method}:${x.url.split('?')[0]}`).join('|')}`)
    .join('\n    ');
  console.log(`\n## ${f}`);
  if (tool) console.log('  tool:\n    ' + tool);
  if (tb) console.log('  toolbar:\n    ' + tb);
}
