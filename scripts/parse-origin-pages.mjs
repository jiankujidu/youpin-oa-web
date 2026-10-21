/** 解析原站页面 HTML：提取工具栏按钮 / 搜索表单字段 / 表格列 */
import fs from 'node:fs';

const FILES = [
  'customer_index_index',
  'product_index_list',
  'oa_approve_index',
  'note_index_index',
  'article_index_index',
  'home_files_index',
];

for (const f of FILES) {
  const p = '.tmp-p-' + f + '.html';
  if (!fs.existsSync(p)) continue;
  const h = fs.readFileSync(p, 'utf8');
  console.log('=========== ' + f);

  const btns = [...h.matchAll(/<(?:a|button)[^>]*class="[^"]*(?:layui-btn|gg-btn)[^"]*"[^>]*>([\s\S]{0,80}?)<\/(?:a|button)>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
  console.log(' BTNS:', [...new Set(btns)].slice(0, 30).join(' | '));

  const fields = [...h.matchAll(/<(?:input|select)[^>]*name="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  console.log(' FIELDS:', [...new Set(fields)].slice(0, 24).join(', '));

  const cols = [...h.matchAll(/field:\s*'([a-zA-Z_]+)'[\s\S]{0,120}?title:\s*'([^']+)'/g)].map((m) => m[1] + ':' + m[2]);
  if (cols.length) console.log(' COLS:', cols.slice(0, 24).join(' | '));

  const th = [...h.matchAll(/<th[^>]*>([\s\S]{0,40}?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  if (th.length) console.log(' TH:', th.slice(0, 24).join(' | '));

  // tab：页面内的筛选 tab
  const tabs = [...h.matchAll(/<li[^>]*class="[^"]*(?:layui-this|this)[^"]*"[^>]*>([\s\S]{0,40}?)<\/li>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  if (tabs.length) console.log(' TABS:', tabs.slice(0, 15).join(' | '));
}
