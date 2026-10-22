/**
 * 桌面端（PC 后台）通用组件 — 勾股OA 风格的后台版式件
 * 表格 / 分页 / 筛选 Tab / 工具栏 / 统计卡 / 状态徽章 / 页面头
 */
import { useEffect, useMemo, useRef, useState } from 'react';

export interface Column<T> {
  key: string;
  title: string;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  render: (row: T, index: number) => React.ReactNode;
  /** 自定义表头（如全选框） */
  head?: React.ReactNode;
  /** 固定宽列：不参与「按容器归一化」，始终按 width(px) 渲染（操作列用，避免按钮换行撑高行） */
  fixed?: boolean;
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
  indexCol = false, // 原站 layui 表格无序号列，1:1 对齐默认关闭（需要处显式传 true）
  page: pageProp,
  total: totalProp,
  onPageChange,
  /** 自定义分页文案（如「已载入 100 / 共 1006 条」，用于逐页载入的超大列表） */
  totalText,
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
  totalText?: string;
}) {
  const [innerPage, setInnerPage] = useState(1);

  /* ---- 自适应列宽：把各列声明的 px 宽度按容器实际宽度归一化，
         保证表格永远 100% 铺满容器（不再出现大幅横向滚动）。 ---- */
  const wrapRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setAvail(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const IDX_W = 46; // 序号列
  const AUTO_MIN = 120; // 未声明宽度列的保底宽度
  const MIN_COL = 44; // 缩放后的最小可读列宽
  const widths = useMemo(() => {
    const px0 = (w: number | string | undefined) =>
      typeof w === 'number' ? w : typeof w === 'string' && /^\d+(\.\d+)?px$/.test(w) ? parseFloat(w) : 0;
    // 固定宽列（操作列）：原样保留，不参与归一化
    const reserved = columns.reduce((s, c) => (c.fixed ? s + (px0(c.width) || MIN_COL) : s), 0);
    const flexIdx: number[] = [];
    const flexRaw: number[] = [];
    if (indexCol) { flexIdx.push(-1); flexRaw.push(IDX_W); }
    columns.forEach((c, i) => {
      if (c.fixed) return;
      flexIdx.push(i);
      flexRaw.push(px0(c.width) || AUTO_MIN);
    });
    const flexTotal = flexRaw.reduce((s, w) => s + w, 0);
    const pool = Math.max(120, (avail || flexTotal + reserved) - reserved);
    let px = flexRaw.map((w) => (w * pool) / flexTotal);
    // 兜底：任何列都不得窄于 MIN_COL，缺口由宽列按比例让出（迭代收敛）
    for (let it = 0; it < 6; it++) {
      const deficit = px.reduce((s, p) => s + Math.max(0, MIN_COL - p), 0);
      if (deficit <= 0.5) break;
      const flexSum = px.reduce((s, p) => (p > MIN_COL ? s + p : s), 0);
      if (flexSum - deficit <= 0) break;
      const k = (flexSum - deficit) / flexSum;
      px = px.map((p) => (p > MIN_COL ? p * k : MIN_COL));
    }
    // 映射回完整列序
    const out: number[] = new Array(columns.length + (indexCol ? 1 : 0)).fill(MIN_COL);
    flexIdx.forEach((ci, k) => {
      out[ci + (indexCol ? 1 : 0)] = px[k];
    });
    columns.forEach((c, i) => {
      if (c.fixed) out[i + (indexCol ? 1 : 0)] = px0(c.width) || MIN_COL;
    });
    const sum = out.reduce((s, w) => s + w, 0);
    return { px: out, pct: avail ? out.map((p) => ((p / sum) * 100).toFixed(4) + '%') : null as string[] | null };
  }, [columns, indexCol, avail]);
  const colStyle = (i: number) =>
    widths.pct ? { width: widths.pct[i] } : { width: widths.px[i] + 'px' };

  const server = typeof pageProp === 'number' && !!onPageChange;
  const setPage = (p: number) => (server ? onPageChange!(p) : setInnerPage(p));
  const page = server ? pageProp : innerPage;
  const total = server ? (totalProp ?? rows.length) : rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, pages);
  const slice = server ? rows : rows.slice((cur - 1) * pageSize, cur * pageSize);

  return (
    <div className="pc-table-wrap" ref={wrapRef}>
      <table className="pc-table">
        <colgroup>
          {indexCol ? <col style={colStyle(0)} /> : null}
          {columns.map((c, i) => (
            <col key={c.key} style={colStyle(i + (indexCol ? 1 : 0))} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {indexCol ? <th>序号</th> : null}
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align || 'left' }}>
                {c.head !== undefined ? c.head : c.title}
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
                {columns.map((c) => {
                  const raw = c.render(r, (cur - 1) * pageSize + i);
                  // 裸文本单元格统一收敛为「单行 + 省略 + 悬停全文」：
                  // 列宽自适应后若放任换行，行高会被撑到 100px+，首屏可见行数骤减
                  const cell =
                    typeof raw === 'string' || typeof raw === 'number' ? (
                      <span className="pc-cell-1" title={String(raw)}>
                        {raw}
                      </span>
                    ) : (
                      raw
                    );
                  return (
                    <td key={c.key} style={{ textAlign: c.align || 'left' }}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {total > pageSize ? (
        <div className="pc-pager">
          <span className="pc-pager-info">
            {totalText || `共 ${total} 条`} · 每页 {pageSize} 条 · 第 {cur}/{pages} 页
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
          <span className="pc-pager-info">{totalText || `共 ${total} 条`}</span>
        </div>
      ) : null}
    </div>
  );
}
