/**
 * 桌面端（PC 后台）通用组件 — 勾股OA 风格的后台版式件
 * 表格 / 分页 / 筛选 Tab / 工具栏 / 统计卡 / 状态徽章 / 页面头
 */
import { useMemo, useState } from 'react';

export interface Column<T> {
  key: string;
  title: string;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  render: (row: T, index: number) => React.ReactNode;
}

/** 页面头：面包屑 + 标题 + 右侧操作区 */
export function PageHead({
  title,
  crumb,
  desc,
  actions,
}: {
  title: string;
  crumb?: string[];
  desc?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="pc-head">
      <div>
        {crumb?.length ? (
          <div className="pc-crumb">
            {crumb.map((c, i) => (
              <span key={i}>
                {i > 0 ? <i className="pc-crumb-sep">/</i> : null}
                {c}
              </span>
            ))}
          </div>
        ) : null}
        <div className="pc-title">{title}</div>
        {desc ? <div className="pc-desc">{desc}</div> : null}
      </div>
      {actions ? <div className="pc-actions">{actions}</div> : null}
    </div>
  );
}

/** 面板（白底卡片） */
export function Panel({
  title,
  extra,
  children,
  bodyPad = true,
}: {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  bodyPad?: boolean;
}) {
  return (
    <div className="pc-panel">
      {title ? (
        <div className="pc-panel-head">
          <span className="pc-panel-title">{title}</span>
          {extra ? <span className="pc-panel-extra">{extra}</span> : null}
        </div>
      ) : null}
      <div className="pc-panel-body" style={bodyPad ? undefined : { padding: 0 }}>
        {children}
      </div>
    </div>
  );
}

/** 统计卡 */
export function StatCards({
  items,
}: {
  items: { label: string; value: React.ReactNode; tone?: string; hint?: string }[];
}) {
  return (
    <div className="pc-stat-grid">
      {items.map((it) => (
        <div key={it.label} className={`pc-stat${it.tone ? ' pc-stat-' + it.tone : ''}`}>
          <div className="pc-stat-value">{it.value}</div>
          <div className="pc-stat-label">{it.label}</div>
          {it.hint ? <div className="pc-stat-hint">{it.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

/** 筛选 Tab（勾股OA 列表页顶部的「全部 / 我创建的 / 待我审批 …」） */
export function FilterTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: string | number; label: string }[];
  value: string | number;
  onChange: (v: any) => void;
}) {
  return (
    <div className="pc-tabs">
      {tabs.map((t) => (
        <div
          key={t.key}
          className={`pc-tab${t.key === value ? ' on' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}

/** 状态徽章 */
export function StatusTag({ tone, children }: { tone?: 'ok' | 'no' | 'wait' | 'info' | '' ; children: React.ReactNode }) {
  return <span className={`pc-tag${tone ? ' pc-tag-' + tone : ''}`}>{children}</span>;
}

/** 数据表格 + 分页（桌面级：固定表头、斑马悬停、操作列、分页条） */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  pageSize = 20,
  empty = '暂无数据',
  loading = false,
  indexCol = true,
  page: pageProp,
  total: totalProp,
  onPageChange,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  empty?: string;
  loading?: boolean;
  indexCol?: boolean;
  /** 服务端分页：受控页码 + 后端总数 + 翻页回调（不传则前端分页） */
  page?: number;
  total?: number;
  onPageChange?: (page: number) => void;
}) {
  const [innerPage, setInnerPage] = useState(1);
  const server = typeof pageProp === 'number' && !!onPageChange;
  const setPage = (p: number) => (server ? onPageChange!(p) : setInnerPage(p));
  const page = server ? pageProp : innerPage;
  const total = server ? (totalProp ?? rows.length) : rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, pages);
  const slice = server ? rows : rows.slice((cur - 1) * pageSize, cur * pageSize);

  return (
    <div className="pc-table-wrap">
      <table className="pc-table">
        <colgroup>
          {indexCol ? <col style={{ width: 56 }} /> : null}
          {columns.map((c) => (
            <col key={c.key} style={{ width: typeof c.width === 'number' ? c.width + 'px' : c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {indexCol ? <th>序号</th> : null}
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align || 'left' }}>
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td className="pc-table-empty" colSpan={columns.length + (indexCol ? 1 : 0)}>
                加载中…
              </td>
            </tr>
          ) : slice.length === 0 ? (
            <tr>
              <td className="pc-table-empty" colSpan={columns.length + (indexCol ? 1 : 0)}>
                {empty}
              </td>
            </tr>
          ) : (
            slice.map((r, i) => (
              <tr
                key={rowKey(r, i)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {indexCol ? <td className="pc-col-idx">{(cur - 1) * pageSize + i + 1}</td> : null}
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align || 'left' }}>
                    {c.render(r, (cur - 1) * pageSize + i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {total > pageSize ? (
        <div className="pc-pager">
          <span className="pc-pager-info">
            共 {total} 条 · 每页 {pageSize} 条 · 第 {cur}/{pages} 页
          </span>
          <span className="pc-pager-btns">
            <button className="pc-pg" disabled={cur <= 1} onClick={() => setPage(1)}>
              首页
            </button>
            <button className="pc-pg" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>
              上一页
            </button>
            <button className="pc-pg" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>
              下一页
            </button>
            <button className="pc-pg" disabled={cur >= pages} onClick={() => setPage(pages)}>
              末页
            </button>
          </span>
        </div>
      ) : total > 0 ? (
        <div className="pc-pager">
          <span className="pc-pager-info">共 {total} 条</span>
        </div>
      ) : null}
    </div>
  );
}
