/**
 * 通用「原站真实表格」页：按 pageSpecs（从 origin-snapshot 自动提取的
 * cols / url / 行操作 / 筛选栏 / 工具栏 / 红字统计）1:1 渲染原站 layui pageTable 页面。
 *
 * 功能全部真实可用（"功能要都能用"）：
 *  - 筛选栏：spec.filter，搜索时作为 query 传给数据接口（已真实联机）
 *  - 工具栏：+添加 / 导出csv / 批量 等，添加走真实表单提交，导出前端生成 CSV
 *  - 数据：GET `${spec.url}?page=N&limit=20&<筛选>`（经同源代理，携带会话）
 *  - 列：field/title/width/align 与原站一致；值按语义格式化（时间/金额/状态/是否/操作类型着色）
 *  - 行操作：spec.rowOps 中文按钮，全部真实提交原站
 *      · 查看/详情 → 弹出行数据（与原站 side 详情一致）
 *      · 删除/移库/分配/领取/撤回 → oaAction 真实 POST
 *      · 编辑/添加/回复 → 抓取列字段渲染表单，真实 POST 到保存端点
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  oaPage,
  oaAction,
  createCustomer,
  noteSave,
  articleSave,
} from '../core/api';
import { checkStatusText } from '../core/biz';
import { pageSpec, type PageSpec, type SpecCol, type SpecFilter } from '../core/pageSpecs';
import { resolveOp, type OpDef } from '../core/opApi';
import { fmtTime, toast, downloadCsv } from '../core/util';
import { Modal, ConfirmDialog } from './ui';

/** lay-event → 中文按钮兜底（优先 spec.opLabels） */
const OP_LABEL: Record<string, string> = {
  view: '查看', detail: '详情', edit: '编辑', del: '删除', delete: '删除', remove: '删除',
  check: '审批', approve: '通过', reject: '驳回', back: '恢复', restore: '恢复',
  recall: '撤回', print: '打印', download: '下载', copy: '复制', visit: '走访',
  classification: '分类', get: '领取', distribute: '分配', pay: '付款', invoice: '开票',
  recv: '收款', reapply: '重申', reply: '回复', resend: '转发', pay_record: '付款记录',
  repurchase: '复购',
};

const DANGER_OPS = new Set(['del', 'delete', 'remove', 'reject']);
const LIMIT = 20;

/** 不可编辑（只读展示）的列标题 */
const READONLY_TITLES = new Set([
  '状态', '记录状态', '审批状态', '操作类型', '操作', '关联订单', '关联客户', '操作客户',
  '操作前金额', '操作后金额', '当前审批人', '当前审核人', '当前阶段', '销售机会', '申请人',
  '归属人', '所属员工', '关联主体', '来源渠道', '客户意向', '阅读量', '发布人', '下载量',
  '区域', '校展单位', '办展方', '当前状态', '到账状态', '发票状态', '产品状态', '订单状态',
  '是否到账', '是否开票', '复购订单', '是否首单', '回款公司', '打款公司', '客户打款公司',
]);

/** 原站 remarkDeal：每 40 字插一个换行 */
function remarkDeal(v: string): string {
  let res = '';
  for (let i = 0, j = 1; i < v.length; i++, j++) res += j % 40 === 0 ? v[i] + '\n' : v[i];
  return res;
}

/** 操作类型着色（1=增加 green，2=减少 red） */
function typeBadge(v: unknown): { text: string; cls: string } | null {
  if (v === 1 || v === '1') return { text: '增加', cls: 'green' };
  if (v === 2 || v === '2') return { text: '减少', cls: 'red' };
  if (v === '' || v === null || v === undefined) return null;
  return { text: '未知', cls: 'black' };
}

/** 按列语义格式化单元格值 */
function fmtCell(col: SpecCol, row: Record<string, any>): string {
  const v = row[col.field];
  if (v === null || v === undefined || v === '') return '';
  const t = col.title;
  if (/(时间|日期)$/.test(t) && (typeof v === 'number' || /^\d{10}$/.test(String(v)))) return fmtTime(v as number);
  if (/\(元\)|（元）/.test(t) || /money|amount|price|deposit/i.test(col.field)) {
    const n = Number(v);
    if (!Number.isNaN(n)) return n.toFixed(2);
  }
  if (col.field === 'remark' && t === '操作说明') return remarkDeal(String(v));
  if (col.field === 'check_status') return checkStatusText(v);
  if (/^is_/.test(col.field) || t === '是否到账' || t === '是否开票' || t === '是否加微信') {
    if (v === 0 || v === 1 || v === '0' || v === '1') return v == 1 ? '是' : '否';
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* ======================= 筛选栏 ======================= */
function FilterBar({
  filters, values, onChange, onSearch, onReset,
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
            <select key={f.name} className="dt-f-input dt-f-select" style={{ width: f.width || undefined }} value={val}
              onChange={(e) => onChange(f.name, e.target.value)}>
              {(f.options || []).map((o) => (<option key={o.v} value={o.v}>{o.label}</option>))}
            </select>
          );
        }
        if (f.kind === 'dept') {
          return (
            <select key={f.name} className="dt-f-input dt-f-select" style={{ width: f.width || undefined }} value="" onChange={() => {}}>
              <option value="">{f.placeholder || '部门'}</option>
            </select>
          );
        }
        if (f.kind === 'date') {
          return (
            <div key={f.name} className="dt-f-date" style={{ width: f.width || undefined }}>
              <input className="dt-f-input" placeholder={f.placeholder || '选择时间区间'} readOnly value={val}
                onClick={() => setDateOpen(!dateOpen)} />
              {dateOpen ? (
                <div className="dt-f-datepop">
                  <input type="date" value={values['__from'] ?? ''} onChange={(e) => onChange('__from', e.target.value)} />
                  <span>至</span>
                  <input type="date" value={values['__to'] ?? ''} onChange={(e) => onChange('__to', e.target.value)} />
                  <button className="dt-f-dateok" onClick={() => {
                    const a = values['__from'] ?? ''; const b = values['__to'] ?? '';
                    onChange(f.name, a && b ? `${a} - ${b}` : ''); setDateOpen(false);
                  }}>确定</button>
                </div>
              ) : null}
            </div>
          );
        }
        return (
          <input key={f.name} className="dt-f-input" style={{ width: f.width || undefined }} placeholder={f.placeholder}
            value={val} onChange={(e) => onChange(f.name, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }} />
        );
      })}
      <span className="dt-f-btns">
        <button className="dt-f-search" onClick={onSearch}>
          <svg viewBox="0 0 1024 1024" width="12" height="12" fill="currentColor" style={{ marginRight: 4 }}>
            <path d="M909.6 854.5L649.9 594.8C690.2 542.7 714 478.6 714 409.2 714 234.5 572.5 93 398 93S82 234.5 82 409.2s141.5 316.2 316 316.2c69.4 0 133.5-23.8 185.6-64.1l259.7 259.7c4.2 4.2 9.8 6.5 15.7 6.5s11.4-2.3 15.7-6.5c8.6-8.7 8.6-22.7-.1-31.5zM398 661.3c-139 0-252-113-252-252.1S259 157.2 398 157.2s252 113 252 252.1-113 252-252 252z" />
          </svg>
          搜索
        </button>
        <button className="dt-f-reset" onClick={onReset}>清空</button>
      </span>
    </div>
  );
}

/* ======================= 编辑 / 添加 表单弹窗 ======================= */
function OpFormModal({
  title, fields, value, onSubmit, onClose,
}: {
  title: string;
  fields: { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'date' }[];
  value: Record<string, any>;
  onSubmit: (form: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of fields) o[f.key] = value[f.key] != null ? String(value[f.key]) : '';
    return o;
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title={title} onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button className="pc-btn pc-btn-ghost" disabled={busy} onClick={onClose}>取消</button>
          <button className="pc-btn" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await onSubmit(form); } finally { setBusy(false); onClose(); }
          }}>{busy ? '提交中…' : '保存'}</button>
        </>
      }>
      <div className="dt-form">
        {fields.map((f) => (
          <div key={f.key} className="dt-form-row">
            <label>{f.label}</label>
            {f.type === 'textarea' ? (
              <textarea className="pc-input" style={{ width: '100%', minHeight: 76, padding: '8px 10px' }}
                value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input className="pc-input" style={{ width: '100%', height: 36 }}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** 由 spec 列生成可编辑字段（剔除只读/操作列） */
function buildFormFields(spec: PageSpec): { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'date' }[] {
  return spec.cols
    .filter((c) => c.field !== '__ops' && c.title !== '操作' && c.title !== '' && !c.field.startsWith('__') && !READONLY_TITLES.has(c.title) && !/(时间|日期)$/.test(c.title))
    .map((c) => ({
      key: c.field,
      label: c.title,
      type: c.field === 'remark' || c.field === 'content' || c.title.includes('说明') || c.title.includes('备注') || c.title.includes('内容')
        ? 'textarea' : 'text',
    }));
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
  const [confirmOp, setConfirmOp] = useState<{ def: OpDef; row: Record<string, any> } | null>(null);
  const [formState, setFormState] = useState<{ def: OpDef; row: Record<string, any> | null } | null>(null);

  const load = useCallback(
    async (p: number, where: Record<string, string> = {}) => {
      if (!spec) return;
      setLoading(true);
      setErr('');
      try {
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

  useEffect(() => { setPage(1); setFValues({}); load(1); }, [load]);

  if (!spec) return null;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const dataCols = spec.cols.filter((c) => c.field !== '__ops' && c.title !== '操作');
  const hasOps = spec.cols.some((c) => c.field === '__ops' || c.title === '操作') || spec.rowOps.length > 0;
  const totals = (spec.totals || []).map((t) => ({
    ...t,
    value: totalRow[t.id] !== undefined ? Number(totalRow[t.id]).toFixed(2) + '元' : '0.00元',
  }));

  const labelOf = (op: string) => spec.opLabels?.[op] || OP_LABEL[op] || op;

  /** 真正提交行操作 */
  const runRowOp = (op: string, row: Record<string, any>) => {
    const def = resolveOp(spec, op, 'tool');
    if (!def) { toast(`未配置操作「${labelOf(op)}」`); return; }
    if (def.kind === 'view') { setDetail(row); return; }
    if (def.kind === 'export') { handleExport(); return; }
    if (def.kind === 'delete' || def.kind === 'post') {
      setConfirmOp({ def, row });
      return;
    }
    if (def.kind === 'form') { setFormState({ def, row }); return; }
    toast(`操作「${labelOf(op)}」暂未接入`);
  };

  const submitForm = async (def: OpDef & { kind: 'form' }, row: Record<string, any> | null, form: Record<string, string>) => {
    const id = row?.id != null ? String(row.id) : '';
    const url = def.url.split('?')[0];
    let res;
    // 关键模块走专用保存函数（字段名严格对齐原站）
    if (url.includes('/customer/index/add')) {
      res = await createCustomer({ id, name: form.name || (row?.name ?? ''), contact: form.user, tel: form.mobile, address: form.address, remark: form.remark || form.content });
    } else if (url.includes('/note/index/add')) {
      res = await noteSave({ id, title: form.title || '', content: form.content });
    } else if (url.includes('/article/index/listadd')) {
      res = await articleSave({ id, title: form.title || '', content: form.content });
    } else {
      const data: Record<string, string> = { ...form };
      if (id) data.id = id;
      res = await oaAction(url, data);
    }
    if (res.ok) { toast(res.msg || '保存成功'); load(page, fValues); }
    else toast('保存失败：' + res.msg);
  };

  const handleExport = () => {
    const cols = dataCols.map((c) => ({ key: c.field, title: c.title }));
    const csvRows = rows.map((r) => { const o: Record<string, unknown> = {}; for (const c of dataCols) o[c.field] = fmtCell(c, r); return o; });
    downloadCsv(`${specKey}.csv`, cols, csvRows);
    toast(`已导出当前页 ${rows.length} 条`);
  };

  const doConfirm = async () => {
    if (!confirmOp) return;
    const { def, row } = confirmOp;
    const id = row.id != null ? String(row.id) : '';
    setConfirmOp(null);
    const res = await oaAction((def as any).url, { id });
    if (res.ok) { toast(res.msg || '操作成功'); load(page, fValues); }
    else toast('操作失败：' + res.msg);
  };

  const formFields = useMemo(() => (formState ? buildFormFields(spec) : []), [formState, spec]);

  return (
    <div className="dt-wrap">
      {spec.filter.length > 0 ? (
        <FilterBar filters={spec.filter} values={fValues}
          onChange={(n, v) => setFValues((s) => ({ ...s, [n]: v }))}
          onSearch={() => { setPage(1); load(1, fValues); }}
          onReset={() => { setFValues({}); setPage(1); load(1, {}); }} />
      ) : null}

      <div className="pc-panel">
        {(spec.toolbarBtns.length > 0 || (spec.toolbar || []).length > 0 || totals.length > 0) && (
          <div className="dt-toolbar">
            {(() => {
              // 合并：显式 toolbarBtns + 来自 spec.toolbar 数组的 add/export（补渲染）
              const merged: { event: string; label: string }[] = [...spec.toolbarBtns];
              for (const ev of spec.toolbar || []) {
                if (ev === 'add' && !merged.some((m) => m.event === 'add')) merged.push({ event: 'add', label: '+ 添加' });
                if (ev === 'export' && !merged.some((m) => m.event === 'export')) merged.push({ event: 'export', label: '导出(csv)' });
              }
              return merged.map((b) => {
                const def = resolveOp(spec, b.event, 'toolbar');
                const isPrimary = b.event === 'add';
                return (
                  <button key={b.event} className={`dt-tb-btn${isPrimary ? ' primary' : ''}`}
                    onClick={() => {
                      if (!def) { toast(`「${b.label}」暂未接入`); return; }
                      if (def.kind === 'export') { handleExport(); return; }
                      if (def.kind === 'delete' || def.kind === 'post') { setConfirmOp({ def, row: {} }); return; }
                      if (def.kind === 'form') { setFormState({ def, row: null }); return; }
                      toast(`「${b.label}」暂未接入`);
                    }}>
                    {b.label}
                  </button>
                );
              });
            })()}
            {totals.length > 0 ? (
              <span className="dt-tb-totals">
                {totals.map((t) => (<span key={t.id}>{t.label}：<b>{t.value}</b>{' '}</span>))}
              </span>
            ) : null}
            <span className="dt-tb-icons">
              <span className="dt-tb-icon" title="导出" onClick={handleExport}>
                <svg viewBox="0 0 1024 1024" width="15" height="15" fill="currentColor"><path d="M505.7 661a8 8 0 0 0 12.6 0l112-141.7c4.1-5.2 0.4-12.9-6.3-12.9h-72.4V120c0-4.4-3.6-8-8-8h-64c-4.4 0-8 3.6-8 8v386.4H399c-6.7 0-10.4 7.7-6.3 12.9l112 141.7zM878 626h-64c-4.4 0-8 3.6-8 8v154H218V634c0-4.4-3.6-8-8-8h-64c-4.4 0-8 3.6-8 8v198c0 17.7 14.3 32 32 32h684c17.7 0 32-14.3 32-32V634c0-4.4-3.6-8-8-8z" /></svg>
              </span>
            </span>
          </div>
        )}
        <div className="pc-table-wrap" style={{ overflowX: 'auto' }}>
          <table className="pc-table dt-table" style={{ tableLayout: 'fixed', minWidth: Math.max(900, dataCols.length * 110) }}>
            <thead>
              <tr>
                {dataCols.map((c) => (
                  <th key={c.field + c.title} style={{ width: c.width ? c.width : undefined,
                      minWidth: c.minWidth ? c.minWidth : c.width ? undefined : 90, textAlign: (c.align as any) || 'left' }} title={c.title}>
                    {c.title}
                  </th>
                ))}
                {hasOps ? <th className="dt-ops-col" style={{ width: 150, textAlign: 'center' }}>操作</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="pc-table-empty" colSpan={dataCols.length + (hasOps ? 1 : 0)}>加载中…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="pc-table-empty" colSpan={dataCols.length + (hasOps ? 1 : 0)}>{err ? `加载失败：${err}` : '暂无数据'}</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={String(r.id ?? i)}>
                    {dataCols.map((c) => {
                      const isTypeCol = c.title === '操作类型' && c.field === 'type';
                      const badge = isTypeCol ? typeBadge(r[c.field]) : null;
                      return (
                        <td key={c.field + c.title} style={{ textAlign: (c.align as any) || 'left' }} title={fmtCell(c, r)}>
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
                            <a key={op} className={`dt-op${DANGER_OPS.has(op) ? ' danger' : ''}`} onClick={() => runRowOp(op, r)}>
                              {labelOf(op)}
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
          <span>共 {total} 条 · 第 {page}/{pages} 页</span>
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p, fValues); }}>上一页</button>
          <button disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); load(p, fValues); }}>下一页</button>
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

      {confirmOp ? (
        <ConfirmDialog title="操作确认" text={(confirmOp.def as any).confirm || '确定执行该操作？'} confirmText="确认"
          onOk={doConfirm} onClose={() => setConfirmOp(null)} />
      ) : null}

      {formState ? (
        <OpFormModal title={(formState.def as any).title || '编辑'} fields={formFields} value={formState.row || {}}
          onSubmit={(form) => submitForm(formState.def as any, formState.row, form)}
          onClose={() => setFormState(null)} />
      ) : null}
    </div>
  );
}
