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
  /** 冻结列（横向滚动时保持可见）：left=贴左缘，right=贴右缘。原站 layui fixed:'left'/'right' */
  freeze?: 'left' | 'right';
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
  onPageSizeChange,
  /** 自定义分页文案（如「已载入 100 / 共 1006 条」，用于逐页载入的超大列表） */
  totalText,
  /**
   * 行勾选（无复选框列方案）：整表最左侧不占列宽，
   * 鼠标移到行上时行首浮出一个圆点即可勾选；Ctrl/⌘ + 点击行亦可切换。
   * 用于产品列表等超宽表——省掉复选框列把首屏宽度让给业务列。
   */
  rowSelect,
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
  /** 每页条数变更（服务端分页时生效；原站 layui 分页条「20 条/页 ▾」） */
  onPageSizeChange?: (size: number) => void;
  totalText?: string;
  rowSelect?: {
    isSel: (row: T) => boolean;
    onToggle: (row: T, index: number) => void;
    onAll: (on: boolean) => void;
    allOn: boolean;
    selCount: number;
  };
}) {
  const [innerPage, setInnerPage] = useState(1);
  const [jumpTo, setJumpTo] = useState('');

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
    const declared = flexTotal + reserved; // 各列声明 px 宽度之和
    const nCol = columns.length + (indexCol ? 1 : 0);
    // 声明白名单宽度（不缩放）：宽表溢出时用它，配合 wrap 的 overflow-x:auto 横向滚动
    const outDeclared = new Array<number>(nCol).fill(MIN_COL);
    flexIdx.forEach((ci, k) => { outDeclared[ci + (indexCol ? 1 : 0)] = flexRaw[k]; });
    columns.forEach((c, i) => {
      if (c.fixed) outDeclared[i + (indexCol ? 1 : 0)] = px0(c.width) || MIN_COL;
    });

    /* 容器装得下声明宽度 → 按比例铺满 100%（原站窄表同样铺满）；
       装不下（如产品 26 列）→ 保留声明宽度，表格溢出由 wrap 横向滚动。
       早期版本无条件归一化，导致宽表所有列被按比例压扁、表头文字竖排。 */
    if (!(avail > 0 && declared <= avail)) {
      return { px: outDeclared, pct: null as string[] | null, min: declared };
    }
    const pool = Math.max(120, avail - reserved);
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
    const out = new Array<number>(nCol).fill(MIN_COL);
    flexIdx.forEach((ci, k) => {
      out[ci + (indexCol ? 1 : 0)] = px[k];
    });
    columns.forEach((c, i) => {
      if (c.fixed) out[i + (indexCol ? 1 : 0)] = px0(c.width) || MIN_COL;
    });
    const sum = out.reduce((s, w) => s + w, 0);
    return { px: out, pct: out.map((p) => ((p / sum) * 100).toFixed(4) + '%'), min: 0 };
  }, [columns, indexCol, avail]);
  const colStyle = (i: number) =>
    widths.pct ? { width: widths.pct[i] } : { width: widths.px[i] + 'px' };

  /* ---- 冻结列偏移：左冻结按列序累加 left，右冻结从右往左累加 right ---- */
  const allCols = indexCol ? [{ key: '__idx', title: '序号', render: () => null, freeze: undefined as 'left' | 'right' | undefined }, ...columns] : columns;
  const nAll = allCols.length;
  const frz = useMemo(() => {
    const left = new Array<number>(nAll).fill(-1);
    const right = new Array<number>(nAll).fill(-1);
    let acc = 0;
    for (let i = 0; i < nAll; i++) {
      if (allCols[i].freeze === 'left') { left[i] = acc; acc += widths.px[i] || 0; }
    }
    acc = 0;
    for (let i = nAll - 1; i >= 0; i--) {
      if (allCols[i].freeze === 'right') { right[i] = acc; acc += widths.px[i] || 0; }
    }
    return { left, right };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nAll, widths, columns, indexCol]);
  const frzStyle = (i: number): React.CSSProperties | undefined => {
    if (frz.left[i] >= 0) return { position: 'sticky', left: frz.left[i], zIndex: 2 };
    if (frz.right[i] >= 0) return { position: 'sticky', right: frz.right[i], zIndex: 2 };
    return undefined;
  };

  const server = typeof pageProp === 'number' && !!onPageChange;
  const setPage = (p: number) => (server ? onPageChange!(p) : setInnerPage(p));
  const page = server ? pageProp : innerPage;
  const total = server ? (totalProp ?? rows.length) : rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, pages);
  const slice = server ? rows : rows.slice((cur - 1) * pageSize, cur * pageSize);

  return (
    <div className="pc-table-wrap" ref={wrapRef}>
      <table className="pc-table" style={widths.min ? { minWidth: widths.min + 'px' } : undefined}>
        <colgroup>
          {indexCol ? <col style={colStyle(0)} /> : null}
          {columns.map((c, i) => (
            <col key={c.key} style={colStyle(i + (indexCol ? 1 : 0))} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {indexCol ? <th style={frzStyle(0)}>序号</th> : null}
            {columns.map((c, i) => (
              <th key={c.key} style={{ textAlign: c.align || 'left', ...frzStyle(i + (indexCol ? 1 : 0)) }}>
                {/* 勾选 UI 由调用方在业务列内绘制（产品页即「货号列复选框」），
                    这里不再叠 absolute 圆点——圆点会压住货号文字且不显眼。 */}
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
                className={rowSelect && rowSelect.isSel(r) ? 'pc-row-sel' : undefined}
                onClick={(e) => {
                  // Ctrl/⌘ + 点击行 = 切换勾选（不打开详情）
                  if (rowSelect && (e.ctrlKey || e.metaKey)) {
                    rowSelect.onToggle(r, (cur - 1) * pageSize + i);
                    return;
                  }
                  onRowClick?.(r);
                }}
                style={onRowClick || rowSelect ? { cursor: 'pointer' } : undefined}
              >
                {indexCol ? <td className="pc-col-idx">{(cur - 1) * pageSize + i + 1}</td> : null}
                {columns.map((c, ci) => {
                  const raw = c.render(r, (cur - 1) * pageSize + i);
                  // 裸文本单元格统一收敛为「单行 + 省略 + 悬停全文」：
                  // 列宽自适应后若放任换行，行高会被撑到 100px+，首屏可见行数骤降
                  const cell =
                    typeof raw === 'string' || typeof raw === 'number' ? (
                      <span className="pc-cell-1" title={String(raw)}>
                        {raw}
                      </span>
                    ) : (
                      raw
                    );
                  return (
                    <td key={c.key} style={{ textAlign: c.align || 'left', ...frzStyle(ci + (indexCol ? 1 : 0)) }}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {total > 0 ? (
        <div className="pc-pager">
          {/* 原站 layui 分页条：‹ 1 2 3 … 6184 › | 到第 [ ] 页 确定 | 共 N 条 M 条/页 ▾ */}
          <span className="pc-pager-btns">
            <button className="pc-pg" disabled={cur <= 1} onClick={() => setPage(cur - 1)} title="上一页">
              ‹
            </button>
            {pageList(cur, pages).map((p, i) =>
              p === '…' ? (
                <span className="pc-pg-ell" key={`e${i}`}>
                  …
                </span>
              ) : (
                <button
                  key={p}
                  className={`pc-pg${p === cur ? ' pc-pg-cur' : ''}`}
                  onClick={() => setPage(p as number)}
                >
                  {p}
                </button>
              ),
            )}
            <button className="pc-pg" disabled={cur >= pages} onClick={() => setPage(cur + 1)} title="下一页">
              ›
            </button>
          </span>
          {pages > 1 ? (
            <span className="pc-pager-jump">
              到第
              <input
                className="pc-pg-input"
                value={jumpTo}
                onChange={(e) => setJumpTo(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const p = Math.min(pages, Math.max(1, Number(jumpTo) || 1));
                    setJumpTo('');
                    setPage(p);
                  }
                }}
              />
              页
              <button
                className="pc-pg"
                onClick={() => {
                  const p = Math.min(pages, Math.max(1, Number(jumpTo) || 1));
                  setJumpTo('');
                  setPage(p);
                }}
              >
                确定
              </button>
            </span>
          ) : null}
          <span className="pc-pager-info">
            {totalText || `共 ${total} 条`}
            {onPageSizeChange ? (
              <>
                {' '}
                <select
                  className="pc-pg-select"
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                >
                  {[10, 20, 30, 40, 50].map((n) => (
                    <option key={n} value={n}>
                      {n} 条/页
                    </option>
                  ))}
                </select>
              </>
            ) : (
              ` · 每页 ${pageSize} 条`
            )}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** 原站 layui 页码序列：当前页附近 ±2，首末页固定，中间用 … 省略 */
function pageList(cur: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const from = Math.max(2, cur - 2);
  const to = Math.min(pages - 1, cur + 2);
  if (from > 2) out.push('…');
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push('…');
  out.push(pages);
  return out;
}
