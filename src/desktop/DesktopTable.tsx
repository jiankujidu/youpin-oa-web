/**
 * 通用「原站真实表格」页：按 pageSpecs（从 origin-snapshot 自动提取的
 * cols / url / 行操作 / 筛选栏 / 工具栏 / 红字统计）1:1 渲染原站 layui pageTable 页面。
 *
 * - 筛选栏：spec.filter（date 区间 / select / dept 树 / text），搜索时作为 query 传给数据接口
 * - 工具栏：spec.toolbarBtns（+添加记录 / 导出csv 等）+ spec.totals（totalRow 红字统计）
 * - 数据：GET `${spec.url}?page=N&limit=20&<筛选>`（经同源代理，携带会话）
 * - 列：field/title/width/align 与原站一致；值按语义格式化（时间/金额/状态/是否/操作类型着色）
 * - 行操作：spec.rowOps 映射中文按钮；「查看」弹整行详情，其余按本地模式规则提示
 *   （写操作绝不提交原站，见 localOps 规则）
 */
import { useCallback, useEffect, useState } from 'react';
import { oaPage } from '../core/api';
import { checkStatusText } from '../core/biz';
import { pageSpec, type PageSpec, type SpecCol, type SpecFilter } from '../core/pageSpecs';
import { fmtTime, toast } from '../core/util';
import { Modal } from './ui';

/** lay-event → 中文按钮（对齐原站 templet 文案） */
const OP_LABEL: Record<string, string> = {
  view: '查看',
  detail: '详情',
  edit: '编辑',
  del: '删除',
  delete: '删除',
  remove: '删除',
  check: '审批',
  approve: '通过',
  reject: '驳回',
  back: '恢复',
  restore: '恢复',
  recall: '撤回',
  print: '打印',
  download: '下载',
  copy: '复制',
  visit: '走访',
  classification: '分类',
  get: '获取',
  distribute: '分配',
  pay: '付款',
  invoice: '开票',
  recv: '收款',
};

/** 危险操作集合（红色） */
const DANGER_OPS = new Set(['del', 'delete', 'remove', 'reject']);

const LIMIT = 20;

/** 原站 remarkDeal：每 40 字插一个换行 */
function remarkDeal(v: string): string {
  let res = '';
  for (let i = 0, j = 1; i < v.length; i++, j++) {
    res += j % 40 === 0 ? v[i] + '\n' : v[i];
  }
  return res;
}

/** 操作类型着色（原站 templet：1=增加 green，2=减少 red） */
function typeBadge(v: unknown): { text: string; cls: string } | null {
  if (v === 1 || v === '1') return { text: '增加', cls: 'green' };
  if (v === 2 || v === '2') return { text: '减少', cls: 'red' };
  if (v === '' || v === null || v === undefined) return null;
  return { text: '未知', cls: 'black' };
}

/** 按列语义格式化单元格值（与原站 templet 的常见形态一致） */
function fmtCell(col: SpecCol, row: Record<string, any>): string {
  const v = row[col.field];
  if (v === null || v === undefined || v === '') return '';
  const t = col.title;
  // 数字时间戳 → 时间
  if (/(时间|日期)$/.test(t) && (typeof v === 'number' || /^\d{10}$/.test(String(v)))) return fmtTime(v as number);
  // 金额（原站列名带“(元)”或字段名含 money/amount/price）——原站为裸数字（如 194.00 / 3500.00），无 ¥ 无千分位
  if (/\(元\)|（元）/.test(t) || /money|amount|price|deposit/i.test(col.field)) {
    const n = Number(v);
    if (!Number.isNaN(n)) return n.toFixed(2);
  }
  // 操作说明：原站 remarkDeal 40 字换行
  if (col.field === 'remark' && t === '操作说明') return remarkDeal(String(v));
  // 审批状态（勾股数字状态）
  if (col.field === 'check_status') return checkStatusText(v);
  // 是否类
  if (/^is_/.test(col.field) || t === '是否到账' || t === '是否开票' || t === '是否加微信') {
    if (v === 0 || v === 1 || v === '0' || v === '1') return v == 1 ? '是' : '否';
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* ======================= 筛选栏 ======================= */

function FilterBar({
  filters,
  values,
  onChange,
  onSearch,
  onReset,
}: {
  filters: SpecFilter[];
  values: Record<string, string>;
  onChange: (name: string, v: string) => void;
  onSearch: () => void;
  onReset: () => void;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  return (
    <div className="dt-filter">
      {filters.map((f) => {
        const val = values[f.name] ?? '';
        if (f.kind === 'select') {
          return (
            <select
              key={f.name}
              className="dt-f-input dt-f-select"
              style={{ width: f.width || undefined }}
              value={val}
              onChange={(e) => onChange(f.name, e.target.value)}
            >
              {(f.options || []).map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        }
        if (f.kind === 'dept') {
          return (
            <select
              key={f.name}
              className="dt-f-input dt-f-select"
              style={{ width: f.width || undefined }}
              value=""
              onChange={() => {}}
            >
              <option value="">{f.placeholder || '部门'}</option>
            </select>
          );
        }
        if (f.kind === 'date') {
          return (
            <div key={f.name} className="dt-f-date" style={{ width: f.width || undefined }}>
              <input
                className="dt-f-input"
                placeholder={f.placeholder || '选择时间区间'}
                readOnly
                value={val}
                onClick={() => setDateOpen(!dateOpen)}
              />
              {dateOpen ? (
                <div className="dt-f-datepop">
                  <input
                    type="date"
                    value={values['__from'] ?? ''}
                    onChange={(e) => onChange('__from', e.target.value)}
                  />
                  <span>至</span>
                  <input
                    type="date"
                    value={values['__to'] ?? ''}
                    onChange={(e) => onChange('__to', e.target.value)}
                  />
                  <button
                    className="dt-f-dateok"
                    onClick={() => {
                      const a = values['__from'] ?? '';
                      const b = values['__to'] ?? '';
                      onChange(f.name, a && b ? `${a} - ${b}` : '');
                      setDateOpen(false);
                    }}
                  >
                    确定
                  </button>
                </div>
              ) : null}
            </div>
          );
        }
        return (
          <input
            key={f.name}
            className="dt-f-input"
            style={{ width: f.width || undefined }}
            placeholder={f.placeholder}
            value={val}
            onChange={(e) => onChange(f.name, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch();
            }}
          />
        );
      })}
      <span className="dt-f-btns">
        <button className="dt-f-search" onClick={onSearch}>
          <svg viewBox="0 0 1024 1024" width="12" height="12" fill="currentColor" style={{ marginRight: 4 }}>
            <path d="M909.6 854.5L649.9 594.8C690.2 542.7 714 478.6 714 409.2 714 234.5 572.5 93 398 93S82 234.5 82 409.2s141.5 316.2 316 316.2c69.4 0 133.5-23.8 185.6-64.1l259.7 259.7c4.2 4.2 9.8 6.5 15.7 6.5s11.4-2.3 15.7-6.5c8.6-8.7 8.6-22.7-.1-31.5zM398 661.3c-139 0-252-113-252-252.1S259 157.2 398 157.2s252 113 252 252.1-113 252-252 252z" />
          </svg>
          搜索
        </button>
        <button className="dt-f-reset" onClick={onReset}>
          清空
        </button>
      </span>
    </div>
  );
}

/* ======================= 主组件 ======================= */

export default function DesktopTable({ specKey }: { specKey: string }) {
  const spec: PageSpec | null = pageSpec(specKey);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [totalRow, setTotalRow] = useState<Record<string, any>>({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [fValues, setFValues] = useState<Record<string, string>>({});

  const load = useCallback(
    async (p: number, where: Record<string, string> = {}) => {
      if (!spec) return;
      setLoading(true);
      setErr('');
      try {
        // 筛选值 → query（与原站 table.reload({where}) 同构）
        const whereClean: Record<string, string> = {};
        for (const f of spec.filter) {
          const v = where[f.name];
          if (v !== undefined && v !== '') whereClean[f.name] = v;
        }
        const { rows: r, total: t, totalRow: tr } = await oaPage(spec.url, { page: p, limit: LIMIT, ...whereClean });
        setRows(r);
        setTotal(t);
        setTotalRow(tr || {});
      } catch (e) {
        setErr(String(e).slice(0, 120));
        setRows([]);
        setTotal(0);
        setTotalRow({});
      } finally {
        setLoading(false);
      }
    },
    [spec],
  );

  useEffect(() => {
    setPage(1);
    setFValues({});
    load(1);
  }, [load]);

  if (!spec) return null;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  // 操作列统一由 rowOps 渲染；spec 中偶发的同名数据列（field=right 等）不再重复渲染
  const dataCols = spec.cols.filter((c) => c.field !== '__ops' && c.title !== '操作');
  const hasOps = spec.cols.some((c) => c.field === '__ops' || c.title === '操作') || spec.rowOps.length > 0;
  const totals = (spec.totals || []).map((t) => ({
    ...t,
    value: totalRow[t.id] !== undefined ? Number(totalRow[t.id]).toFixed(2) + '元' : '0.00元',
  }));

  const onOp = (op: string, row: Record<string, any>) => {
    if (op === 'view' || op === 'detail' || op === 'check') {
      setDetail(row);
      return;
    }
    // 写操作：本地模式规则——绝不提交原站
    toast(
      `「${spec.opLabels?.[op] || OP_LABEL[op] || op}」为本地模式操作，不提交原站（本行：${String(row.name ?? row.id ?? '')}）`,
    );
  };

  return (
    <div className="dt-wrap">
      {spec.filter.length > 0 ? (
        <FilterBar
          filters={spec.filter}
          values={fValues}
          onChange={(n, v) => setFValues((s) => ({ ...s, [n]: v }))}
          onSearch={() => {
            setPage(1);
            load(1, fValues);
          }}
          onReset={() => {
            setFValues({});
            setPage(1);
            load(1, {});
          }}
        />
      ) : null}

      <div className="pc-panel">
        {(spec.toolbarBtns.length > 0 || totals.length > 0) && (
          <div className="dt-toolbar">
            {spec.toolbarBtns.map((b) => (
              <button
                key={b.event}
                className={`dt-tb-btn${b.event === 'add' ? ' primary' : ''}`}
                onClick={() =>
                  toast(
                    b.event === 'export'
                      ? '导出为本地模式操作（不请求原站导出接口）'
                      : `「${b.label}」为本地模式操作，不提交原站`,
                  )
                }
              >
                {b.label}
              </button>
            ))}
            {totals.length > 0 ? (
              <span className="dt-tb-totals">
                {totals.map((t) => (
                  <span key={t.id}>
                    {t.label}：<b>{t.value}</b>{' '}
                  </span>
                ))}
              </span>
            ) : null}
            {/* 原站 is_excel 表头右侧工具小图标（导出/打印/帮助） */}
            <span className="dt-tb-icons">
              <span className="dt-tb-icon" title="导出" onClick={() => toast('导出为本地模式操作（不请求原站导出接口）')}>
                <svg viewBox="0 0 1024 1024" width="15" height="15" fill="currentColor"><path d="M505.7 661a8 8 0 0 0 12.6 0l112-141.7c4.1-5.2 0.4-12.9-6.3-12.9h-72.4V120c0-4.4-3.6-8-8-8h-64c-4.4 0-8 3.6-8 8v386.4H399c-6.7 0-10.4 7.7-6.3 12.9l112 141.7zM878 626h-64c-4.4 0-8 3.6-8 8v154H218V634c0-4.4-3.6-8-8-8h-64c-4.4 0-8 3.6-8 8v198c0 17.7 14.3 32 32 32h684c17.7 0 32-14.3 32-32V634c0-4.4-3.6-8-8-8z" /></svg>
              </span>
              <span className="dt-tb-icon" title="打印" onClick={() => toast('打印为本地模式操作')}>
                <svg viewBox="0 0 1024 1024" width="15" height="15" fill="currentColor"><path d="M820 436h-40c-4.4 0-8 3.6-8 8v40h-44V288c0-35.3-28.7-64-64-64H360c-35.3 0-64 28.7-64 64v196h-44v-40c0-4.4-3.6-8-8-8h-40c-4.4 0-8 3.6-8 8v332c0 17.7 14.3 32 32 32h60c4.4 0 8-3.6 8-8v-60h44v188c0 17.7 14.3 32 32 32h280c17.7 0 32-14.3 32-32V740h44v60c0 4.4 3.6 8 8 8h60c17.7 0 32-14.3 32-32V444c0-4.4-3.6-8-8-8zM368 288c0-4.4 3.6-8 8-8h272c4.4 0 8 3.6 8 8v196H368V288z" /></svg>
              </span>
              <span className="dt-tb-icon" title="列设置" onClick={() => toast('列设置为原站 layui 表格功能，本地模式未启用')}>
                <svg viewBox="0 0 1024 1024" width="15" height="15" fill="currentColor"><path d="M924.8 625.7l-65.5-56c3.1-19 4.7-38.4 4.7-57.8s-1.6-38.8-4.7-57.8l65.5-56c10.1-8.6 13.8-22.6 9.3-35.3l-0.4-1.2c-17.8-46.9-44.4-89.6-79-126.6l-0.9-0.9c-8.6-8.6-22.2-10.6-33.3-4.7l-71.3 39.5c-30.4-22.9-64.3-40.5-100.4-51.9l-11.5-76.9c-1.8-12.5-11.2-22.4-23.6-24.4l-1.3-0.2c-24.6-4.1-49.8-6.2-75.3-6.2s-50.7 2.1-75.3 6.2l-1.3 0.2c-12.4 2-21.8 11.9-23.6 24.4l-11.5 76.9c-36.1 11.4-70 29-100.4 51.9L212 174.1c-11.1-5.9-24.7-3.9-33.3 4.7l-0.9 0.9c-34.6 37-61.2 79.7-79 126.6l-0.4 1.2c-4.5 12.7-0.8 26.7 9.3 35.3l65.5 56c-3.1 19-4.7 38.4-4.7 57.8s1.6 38.8 4.7 57.8l-65.5 56c-10.1 8.6-13.8 22.6-9.3 35.3l0.4 1.2c17.8 46.9 44.4 89.6 79 126.6l0.9 0.9c8.6 8.6 22.2 10.6 33.3 4.7l71.3-39.5c30.4 22.9 64.3 40.5 100.4 51.9l11.5 76.9c1.8 12.5 11.2 22.4 23.6 24.4l1.3 0.2c24.6 4.1 49.8 6.2 75.3 6.2s50.7-2.1 75.3-6.2l1.3-0.2c12.4-2 21.8-11.9 23.6-24.4l11.5-76.9c36.1-11.4 70-29 100.4-51.9l71.3 39.5c11.1 5.9 24.7 3.9 33.3-4.7l0.9-0.9c34.6-37 61.2-79.7 79-126.6l0.4-1.2c4.5-12.7 0.8-26.7-9.3-35.3zM512 664c-84.1 0-152-67.9-152-152s67.9-152 152-152 152 67.9 152 152-67.9 152-152 152z" /></svg>
              </span>
            </span>
          </div>
        )}
        <div className="pc-table-wrap" style={{ overflowX: 'auto' }}>
          <table
            className="pc-table dt-table"
            style={{ tableLayout: 'fixed', minWidth: Math.max(900, dataCols.length * 110) }}
          >
            <thead>
              <tr>
                {dataCols.map((c) => (
                  <th
                    key={c.field + c.title}
                    style={{
                      width: c.width ? c.width : undefined,
                      minWidth: c.minWidth ? c.minWidth : c.width ? undefined : 90,
                      textAlign: (c.align as any) || 'left',
                    }}
                    title={c.title}
                  >
                    {c.title}
                  </th>
                ))}
                {hasOps ? <th className="dt-ops-col" style={{ width: 150, textAlign: 'center' }}>操作</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="pc-table-empty" colSpan={dataCols.length + (hasOps ? 1 : 0)}>
                    加载中…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="pc-table-empty" colSpan={dataCols.length + (hasOps ? 1 : 0)}>
                    {err ? `加载失败：${err}` : '暂无数据'}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={String(r.id ?? i)}>
                    {dataCols.map((c) => {
                      // 操作类型：原站 templet 带色（1=增加 green / 2=减少 red）
                      const isTypeCol = c.title === '操作类型' && c.field === 'type';
                      const badge = isTypeCol ? typeBadge(r[c.field]) : null;
                      return (
                        <td
                          key={c.field + c.title}
                          style={{ textAlign: (c.align as any) || 'left' }}
                          title={fmtCell(c, r)}
                        >
                          {badge ? (
                            <span className={`dt-badge ${badge.cls}`}>{badge.text}</span>
                          ) : (
                            <span className={c.field === 'remark' && c.title === '操作说明' ? 'dt-remark' : 'pc-cell-1'}>
                              {fmtCell(c, r)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {hasOps ? (
                      <td className="dt-ops-col" style={{ textAlign: 'center' }}>
                        <span className="dt-ops">
                          {spec.rowOps.map((op) => (
                            <a
                              key={op}
                              className={`dt-op${DANGER_OPS.has(op) ? ' danger' : ''}`}
                              onClick={() => onOp(op, r)}
                            >
                              {spec.opLabels?.[op] || OP_LABEL[op] || op}
                            </a>
                          ))}
                        </span>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="dt-pager">
          <span>
            共 {total} 条 · 第 {page}/{pages} 页
          </span>
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p, fValues); }}>
            上一页
          </button>
          <button disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); load(p, fValues); }}>
            下一页
          </button>
        </div>
      </div>

      {detail ? (
        <Modal title="详情" onClose={() => setDetail(null)}>
          <div className="dt-detail">
            {dataCols.map((c) => (
              <div key={c.field + c.title} className="dt-detail-row">
                <label>{c.title}</label>
                <span>{fmtCell(c, detail)}</span>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
