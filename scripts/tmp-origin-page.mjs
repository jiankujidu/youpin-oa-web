/** 临时：dump 原站快照页面的「页签 / 筛选栏 / 工具栏按钮 / 列表接口」结构摘要 */
import fs from 'node:fs';
import path from 'node:path';

const SNAP = path.join(process.cwd(), 'origin-snapshot');
const files = process.argv.slice(2);

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

for (const f of files) {
  const html = fs.readFileSync(path.join(SNAP, f), 'utf8');
  console.log('='.repeat(72));
  console.log('PAGE', f, `(${html.length} bytes)`);

  // 1) 页签
  const tabs = [...html.matchAll(/<ul[^>]*class="[^"]*layui-tab-title[^"]*"[^>]*>([\s\S]*?)<\/ul>/g)]
    .map((m) => [...m[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((x) => stripTags(x[1])))
    .flat();
  console.log('\n-- TABS:', tabs.length ? tabs.join(' | ') : '(无)');

  // 2) 筛选栏：labeL + 控件
  const formItems = [...html.matchAll(/<div[^>]*class="[^"]*layui-form-item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*layui-form-item|<\/form>|<div[^>]*class="[^"]*layui-table)/g)]
    .map((m) => m[1]);
  const filters = [];
  for (const it of formItems) {
    const label = /<label[^>]*>([\s\S]*?)<\/label>/.exec(it);
    const name = /name="([\w\[\]]+)"/.exec(it);
    const ph = /placeholder="([^"]*)"/.exec(it);
    const kind = /<select/.test(it) ? 'select' : /<input[^>]*type="text"/.test(it) ? 'text' : /<input/.test(it) ? 'input' : '?';
    if (label || name) {
      filters.push(`${stripTags(label ? label[1] : '')}${name ? `[${name[1]}]` : ''}${ph ? `(${ph[1]})` : ''}:${kind}`);
    }
  }
  console.log('\n-- FILTERS(' + filters.length + '):', filters.join(' | ') || '(无)');

  // 3) 工具栏按钮
  const btns = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => stripTags(m[1]));
  const links = [...html.matchAll(/<a[^>]*class="[^"]*(layui-btn|toolbar)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[2]));
  console.log('\n-- BUTTONS:', [...new Set([...btns, ...links])].filter(Boolean).join(' | ') || '(无)');

  // 4) 列表接口
  const urls = [...new Set([...html.matchAll(/url\s*:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]))];
  console.log('\n-- URLS:', urls.join(' | ') || '(无)');
}
