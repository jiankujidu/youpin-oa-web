const fs = require('fs');
const RE_COLS = /cols:\s*\[\s*\[/;
const RE_PAIR = /field\s*:\s*'([^']+)'\s*,\s*(?:[^{}]*?)title\s*:\s*'([^']+)'/g;
for (const f of ['customer-sea.html', 'customer-trash.html']) {
  const html = fs.readFileSync('origin-snapshot/' + f, 'utf8');
  const anchor = /table\.render\s*\(/.exec(html);
  const from = anchor ? anchor.index : 0;
  const m = RE_COLS.exec(html.slice(from));
  const start = html.indexOf('[', from + m.index);
  let depth = 0, i = start;
  for (; i < html.length; i++) { if (html[i] === '[') depth++; else if (html[i] === ']') { depth--; if (!depth) break; } }
  const block = html.slice(start, i + 1);
  const pairs = [...block.matchAll(RE_PAIR)].map((x) => x[1] + '=' + x[2]);
  console.log('###', f);
  console.log(pairs.join(' | '));
}
