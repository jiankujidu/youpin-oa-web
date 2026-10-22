/** 临时：dump 原站快照里某个页面的表格列定义（cols 块原文 + 解析后的 field/title） */
import fs from 'node:fs';
import path from 'node:path';

const SNAP = path.join(process.cwd(), 'origin-snapshot');
const files = process.argv.slice(2);
for (const f of files) {
  const html = fs.readFileSync(path.join(SNAP, f), 'utf8');
  // 主列表在 `layui.pageTable = table.render({ ... cols: [\n [ //表头` —— 中间有换行/制表符，必须宽松匹配
  const anchor = /table\.render\s*\(/.exec(html);
  const searchFrom = anchor ? anchor.index : 0;
  const m = /cols:\s*\[\s*\[/.exec(html.slice(searchFrom));
  if (m) m.index += searchFrom;
  console.log('='.repeat(70));
  console.log(f, m ? 'FOUND cols' : 'NO cols block');
  if (!m) {
    // 没有 cols 时看看是否有 table.render / table.init
    const t = /table\.(render|init)\s*\(\s*\{/.exec(html);
    console.log('  table.render/init:', t ? t[0] : 'none');
    continue;
  }
  const i = m ? html.indexOf('[', m.index) : -1;
  if (i < 0) continue;
  let depth = 0;
  let j = i;
  for (; j < html.length; j++) {
    if (html[j] === '[') depth++;
    else if (html[j] === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  const block = html.slice(i, j + 1);
  console.log(block.slice(0, 4000));
}
