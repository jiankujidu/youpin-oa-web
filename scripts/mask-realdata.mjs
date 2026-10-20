/**
 * 脱敏 public/data/realdata.json 中的个人敏感信息（PII）。
 *
 * 规则（幂等，可重复执行；已含 * 的字段跳过）：
 *   - 中文姓名：保留首字，其余 *        许莹 → 许*      睿信售后 → 睿***
 *   - 手机号：  保留前3后4              13812345678 → 138****5678
 *   - 邮箱：    保留首字符与域名          zhangsan@xx.com → z***@xx.com
 *   - 地址：    保留前 4 字符             浙江省杭州市… → 浙江省*** 
 *   - 自由文本：扫描内嵌手机号并脱敏
 *
 * 用法：node scripts/mask-realdata.mjs [路径]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.argv[2] || join(ROOT, 'public/data/realdata.json');

const MOBILE_RE = /1[3-9]\d{9}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const stats = { name: 0, mobile: 0, email: 0, address: 0, text: 0, skipped: 0 };

/** 已脱敏（含 *）则跳过，保证幂等 */
function guard(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  if (v.includes('*')) {
    stats.skipped++;
    return v;
  }
  return v;
}

function maskName(v) {
  const s = guard(v);
  if (s === null) return v;
  stats.name++;
  return s[0] + '*'.repeat(Math.max(0, s.length - 1));
}

function maskMobileIn(v) {
  const s = guard(v);
  if (s === null) return v;
  const out = s.replace(MOBILE_RE, (m) => {
    stats.mobile++;
    return `${m.slice(0, 3)}****${m.slice(7)}`;
  });
  return out;
}

function maskEmail(v) {
  const s = guard(v);
  if (s === null) return v;
  const out = s.replace(EMAIL_RE, (m) => {
    stats.email++;
    const [u, d] = m.split('@');
    return `${u[0]}***@${d}`;
  });
  return out;
}

function maskAddress(v) {
  const s = guard(v);
  if (s === null) return v;
  stats.address++;
  return s.slice(0, 4) + '***';
}

function maskText(v) {
  const s = guard(v);
  if (s === null) return v;
  const out = s.replace(MOBILE_RE, (m) => {
    stats.text++;
    return `${m.slice(0, 3)}****${m.slice(7)}`;
  });
  return out;
}

/** 按字段名选择脱敏策略 */
const FIELD_RULES = [
  { fields: ['name', 'contact', 'from_name', 'to_name', 'admin_name', 'realname'], fn: maskName },
  { fields: ['tel', 'mobile', 'phone'], fn: maskMobileIn },
  { fields: ['email'], fn: maskEmail },
  { fields: ['address'], fn: maskAddress },
  { fields: ['content', 'remark', 'title'], fn: maskText },
];

function maskRow(row) {
  if (!row || typeof row !== 'object') return row;
  for (const [key, val] of Object.entries(row)) {
    if (typeof val !== 'string') continue;
    for (const rule of FIELD_RULES) {
      if (rule.fields.includes(key)) {
        row[key] = rule.fn(val);
        break;
      }
    }
  }
  return row;
}

const data = JSON.parse(readFileSync(FILE, 'utf8'));

for (const [key, val] of Object.entries(data)) {
  if (Array.isArray(val)) {
    for (const row of val) maskRow(row);
  } else if (val && typeof val === 'object') {
    maskRow(val);
  }
}

data.masked = true;
data.maskedAt = new Date().toISOString();

writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');

console.log('已脱敏:', FILE);
console.log('统计:', JSON.stringify(stats, null, 2));

/* 校验：全文件不应再出现完整手机号 */
const raw = readFileSync(FILE, 'utf8');
const leak = raw.match(/1[3-9]\d{9}/g);
if (leak) {
  console.error('❌ 仍存在完整手机号:', leak.slice(0, 5));
  process.exit(1);
}
console.log('✅ 校验通过：无完整手机号残留');
