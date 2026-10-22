/**
 * 通用「原站真实表格」页：按 pageSpecs（从 origin-snapshot 自动提取的 cols/url/行操作）
 * 1:1 渲染原站 layui pageTable 的列与数据。
 *
 * - 数据：GET `${spec.url}?page=N&limit=20`（经同源代理，携带会话）
 * - 列：field/title/width/align 与原站一致；值按语义格式化（时间/金额/状态/是否）
 * - 行操作：spec.rowOps 映射中文按钮；「查看」弹整行详情，其余按本地模式规则提示
 *   （写操作绝不提交原站，见 localOps 规则）
 */
import { useCallback, useEffect, useState } from 'react';
import { oaPage } from '../core/api';
import { checkStatusText } from '../core/biz';
import { pageSpec, type SpecCol } from '../core/pageSpecs';
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

/** 按列语义格式化单元格值（与原站 templet 的常见形态一致） */
function fmtCell(col: SpecCol, row: Record<string, any>): string {
  const v = row[col.field];
  if (v === null || v === undefined || v === '') return '—';
  const t = col.title;
  // 数字时间戳 → 时间
  if (/(时间|日期)$/.test(t) && (typeof v === 'number' || /^\d{10}$/.test(String(v)))) return fmtTime(v as number);
  // 金额（原站列名带“(元)”或字段名含 money/amount/price）
  if (/\(元\)|（元）/.test(t) || /money|amount|price|deposit/i.test(col.field)) {
    const n = Number(v);
    if (!Number.isNaN(n)) return `¥ ${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  // 审批状态（勾股数字状态）
  if (col.field === 'check_status') return checkStatusText(v);
  // 是否类
  if (/^is_/.test(col.field) || t === '是否到账' || t === '是否开票' || t === '是否加微信') {
    if (v === 0 || v === 1 || v === '0' || v === '1') return v == 1 ? '是' : '否';
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function DesktopTable({ specKey }: { specKey: string }) {
  const spec = pageSpec(specKey);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState<Record<string, any> | null>(null);

  const load = useCallback(
    async (p: number) => {
      if (!spec) return;
      setLoading(true);
      setErr('');
      try {
        const { rows: r, total: t } = await oaPage(spec.url, { page: p, limit: LIMIT });
        setRows(r);
        setTotal(t);
      } catch (e) {
        setErr(String(e).slice(0, 120));
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [spec],
  );

  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);

  if (!spec) return null;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  // 操作列统一由 rowOps 渲染；spec 中偶发的同名数据列（field=right 等）不再重复渲染
  const dataCols = spec.cols.filter((c) => c.field !== '__ops' && c.title !== '操作');
  const hasOps = spec.cols.some((c) => c.field === '__ops' || c.title === '操作') || spec.rowOps.length > 0;

  const onOp = (op: string, row: Record<string, any>) => {
    if (op === 'view' || op === 'detail' || op === 'check') {
      setDetail(row);
      return;
    }
    // 写操作：本地模式规则——绝不提交原站
    toast(`「${OP_LABEL[op] || op}」为本地模式操作，不提交原站（本行：${String(row.name ?? row.id ?? '')}）`);
  };

  return (
    <div className="dt-wrap">
      <div className="pc-panel">
        <div className="pc-table-wrap" style={{ overflowX: 'auto' }}>
          <table
            className="pc-table dt-table"
            style={{ tableLayout: 'fixed', minWidth: Math.max(900, dataCols.length * 110) }}
          >
            <thead>
              <tr>
                {dataCols.map((c) => (
                  <th
                    key={c.field}
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
                {hasOps ? <th style={{ width: 150, textAlign: 'center' }}>操作</th> : null}
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
                    {dataCols.map((c) => (
                      <td
                        key={c.field}
                        style={{ textAlign: (c.align as any) || 'left' }}
                        title={fmtCell(c, r)}
                      >
                        <span className="pc-cell-1">{fmtCell(c, r)}</span>
                      </td>
                    ))}
                    {hasOps ? (
                      <td style={{ textAlign: 'center' }}>
                        <span className="dt-ops">
                          {spec.rowOps.map((op) => (
                            <a
                              key={op}
                              className={`dt-op${DANGER_OPS.has(op) ? ' danger' : ''}`}
                              onClick={() => onOp(op, r)}
                            >
                              {OP_LABEL[op] || op}
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
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }}>
            上一页
          </button>
          <button disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); load(p); }}>
            下一页
          </button>
        </div>
      </div>

      {detail ? (
        <Modal title="详情" onClose={() => setDetail(null)}>
          <div className="dt-detail">
            {dataCols.map((c) => (
              <div key={c.field} className="dt-detail-row">
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
