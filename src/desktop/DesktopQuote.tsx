/**
 * 产品收藏夹 + 报价单（新增模块）
 * ---------------------------------------------------------------------------
 *  · 收藏夹：可命名，支持一级夹 + 子夹（两级），产品挂在任意一级
 *  · 加入方式：产品库搜索后「单独勾选」或「全部勾选（本页 / 全部结果）」批量加入
 *  · 报价：规格/单价（目录价·经销价·自定义）/ 数量 / 折扣 → 自动算金额，
 *          可存档、导出 CSV、打印正式报价单（A4）
 *  · 数据：localStorage（本模块为系统新增能力，OA 原站无对应接口）
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProductPage } from '../core/api';
import { getDisplayName } from '../core/session';
import {
  addProducts,
  createFolder,
  exportQuoteCsv,
  exportQuoteXlsx,
  EXTRA_COLS,
  getDocs,
  getFolders,
  lineAmount,
  money,
  moveItems,
  nextQuoteNo,
  quoteColumns,
  removeDoc,
  removeFolder,
  removeItems,
  renameFolder,
  rmbUpper,
  round2,
  saveDoc,
  subscribeQuote,
  sumQuote,
  uid,
  unitPrice,
  updateItem,
  type QuoteCol,
  type QuoteDoc,
  type QuoteFolder,
  type QuoteItem,
  type QuoteOpts,
  type QuoteSheetInfo,
} from '../core/quoteStore';
import type { Product } from '../core/types';
import { plain, toast } from '../core/util';
import './quote.css';

const KEY_SETTINGS = 'youpin_quote_settings_v1';

interface Settings {
  customer: string;
  contact: string;
  seller: string;
  validDays: number;
  priceType: 'dir' | 'dist';
  /** 客户类型：retail 终端客户（不体现经销价） / dealer 经销商（体现经销价并以经销价报价） */
  mode: 'retail' | 'dealer';
  discount: number;
  taxRate: number;
  note: string;
  includeSub: boolean;
  /** 报价单是否体现折扣列 */
  showDiscount: boolean;
  /** 附加属性列（分类/方法学/基因名称/分子量/来源） */
  extra: string[];
  /** 是否体现备注列 */
  showNote: boolean;
}

const DEF_SETTINGS: Settings = {
  customer: '',
  contact: '',
  seller: '',
  validDays: 30,
  priceType: 'dir',
  mode: 'retail',
  discount: 100,
  taxRate: 0,
  note: '1、本报价含税票；2、货期以合同为准；3、报价有效期内价格不变。',
  includeSub: true,
  showDiscount: false,
  extra: [],
  showNote: false,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS);
    if (raw) {
      const s = { ...DEF_SETTINGS, ...(JSON.parse(raw) as Settings) } as Settings;
      // 兼容旧存档：没有 mode 时按原 priceType 推导
      if (!s.mode) s.mode = s.priceType === 'dist' ? 'dealer' : 'retail';
      if (!Array.isArray(s.extra)) s.extra = [];
      return s;
    }
  } catch {
    /* noop */
  }
  const s = { ...DEF_SETTINGS, seller: getDisplayName() || '' };
  return s;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 历史报价单 → Excel 导出所需的抬头/汇总 */
function docSheetInfo(d: QuoteDoc): QuoteSheetInfo {
  const taxRate = Number(d.taxRate) || 0;
  const tax = round2(d.amount * (taxRate / 100));
  return {
    no: d.no,
    customer: d.customer,
    contact: d.contact,
    seller: d.seller,
    date: d.date,
    validDays: d.validDays,
    priceLabel: d.mode === 'dealer' ? '经销价（经销商）' : '目录价（终端客户）',
    taxRate,
    total: d.amount,
    tax,
    gross: round2(d.amount + tax),
    note: d.note,
  };
}

/** 历史报价单 → 输出选项（保存时的口径） */
function docOpts(d: QuoteDoc): QuoteOpts {
  return {
    mode: d.mode || (d.priceType === 'dist' ? 'dealer' : 'retail'),
    showDiscount: !!d.showDiscount,
    extra: d.extra || [],
    showNote: false,
  };
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + (Number(days) || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 明细表各列像素宽度（Excel 列宽另在 quoteColumns 里以字符数定义） */
const COL_PX: Record<string, number> = {
  idx: 46,
  goods_no: 132,
  title: 250,
  species: 88,
  application: 132,
  cate: 110,
  method: 100,
  gene: 100,
  mw: 90,
  source: 90,
  basis: 96,
  spec: 132,
  unit: 78,
  dir: 104,
  dist: 116,
  discount: 78,
  quote: 106,
  qty: 66,
  amount: 116,
  note: 140,
};

/** 行 = 收藏条目 + 所属夹（右侧表格按夹聚合展示） */
interface Row {
  folder: QuoteFolder;
  item: QuoteItem;
}

export default function DesktopQuote() {
  const [folders, setFolders] = useState<QuoteFolder[]>(() => getFolders());
  const [curId, setCurId] = useState<string>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<'edit' | 'preview' | 'history'>('edit');
  const [setting, setSetting] = useState<Settings>(() => loadSettings());
  const [newName, setNewName] = useState('');
  const [newSubOf, setNewSubOf] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [quoteNo, setQuoteNo] = useState<string>(() => nextQuoteNo());
  const [docs, setDocs] = useState(() => getDocs());

  /** 刷新（本地存储变更后统一走这里） */
  const refresh = useCallback(() => {
    setFolders(getFolders());
    setDocs(getDocs());
  }, []);

  useEffect(() => subscribeQuote(refresh), [refresh]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY_SETTINGS, JSON.stringify(setting));
    } catch {
      /* noop */
    }
  }, [setting]);

  /** 首次进入：没有收藏夹时建一个默认夹 */
  useEffect(() => {
    const list = getFolders();
    if (!list.length) {
      const f = createFolder('默认收藏夹');
      refresh();
      setCurId(f.id);
    } else if (!curId) {
      setCurId(list[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cur = folders.find((f) => f.id === curId) || null;

  /** 当前夹（可选含子夹）的全部条目 */
  const rows: Row[] = useMemo(() => {
    if (!cur) return [];
    const ids = new Set<string>([cur.id]);
    if (setting.includeSub) folders.forEach((f) => f.parentId === cur.id && ids.add(f.id));
    const out: Row[] = [];
    for (const f of folders) {
      if (!ids.has(f.id)) continue;
      for (const it of f.items) out.push({ folder: f, item: it });
    }
    return out;
  }, [folders, cur, setting.includeSub]);

  const sum = useMemo(() => sumQuote(rows.map((r) => r.item), setting.taxRate), [rows, setting.taxRate]);
  const selRows = rows.filter((r) => r.item.sel);

  /** 报价单输出选项（列集合 / 是否体现经销价 / 是否体现折扣） */
  const opts: QuoteOpts = useMemo(
    () => ({
      mode: setting.mode,
      showDiscount: setting.showDiscount,
      extra: setting.extra || [],
      showNote: setting.showNote,
    }),
    [setting.mode, setting.showDiscount, setting.extra, setting.showNote],
  );
  /** 明细表 / 预览 / Excel 共用的列 */
  const cols = useMemo(() => quoteColumns(opts), [opts]);

  /** 明细表列 = 报价单列 + 「取价」列（目录价/经销价/自定义，仅编辑用，不进报价单） */
  const editCols = useMemo(() => {
    const basis: QuoteCol = { key: 'basis', title: '取价', width: 100, kind: 'textC', get: () => '' };
    const out: QuoteCol[] = [];
    for (const c of cols) {
      if (c.key === 'dir') out.push(basis);
      out.push(c);
    }
    return out;
  }, [cols]);

  /** 属性缺失（旧条目没有种属/应用场景）的条数 */
  const missingAttrs = rows.filter((r) => !r.item.species && !r.item.application).length;

  /** 从原站产品库按货号回填种属/应用场景等属性 */
  async function fillAttrs() {
    const targets = rows.filter((r) => !r.item.application || !r.item.species);
    if (!targets.length) return toast('产品属性已齐全');
    toast(`正在补全 ${targets.length} 个产品的属性…`);
    let n = 0;
    for (const r of targets.slice(0, 60)) {
      try {
        const { rows: list } = await fetchProductPage(r.item.goods_no, 1, 5);
        const m =
          list.find((p) => (p.goods_no || '').split(/[;；]/)[0] === r.item.goods_no) || list[0];
        if (m) {
          const anyP = m as unknown as Record<string, unknown>;
          updateItem(r.folder.id, r.item.id, {
            species: m.species || r.item.species || '',
            application: m.application || r.item.application || '',
            method: m.methodology || r.item.method || '',
            gene: String(anyP.gene_name ?? r.item.gene ?? ''),
            mw: String(anyP.da ?? r.item.mw ?? ''),
            source: m.source || r.item.source || '',
          });
          n++;
        }
      } catch {
        /* 单条失败不影响整体 */
      }
    }
    refresh();
    toast(`已补全 ${n} 个产品的种属/应用场景等属性`);
  }

  /* ------------------------------ 收藏夹操作 ------------------------------ */
  function doCreateFolder(name: string, parentId: string | null) {
    const f = createFolder(name, parentId);
    refresh();
    setCurId(f.id);
    if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
    toast(parentId ? '已新建子收藏夹' : '已新建收藏夹');
  }

  function doRename(id: string, name: string) {
    renameFolder(id, name);
    refresh();
    setRenaming(null);
  }

  function doRemoveFolder(id: string) {
    const f = folders.find((x) => x.id === id);
    if (!f) return;
    if (!window.confirm(`删除收藏夹「${f.name}」？其下产品一并移除。`)) return;
    removeFolder(id);
    refresh();
    if (curId === id) setCurId('');
    toast('已删除');
  }

  /* ------------------------------ 条目操作 ------------------------------ */
  const patch = (row: Row, p: Partial<QuoteItem>) => {
    updateItem(row.folder.id, row.item.id, p);
    refresh();
  };

  function setAllSel(v: boolean) {
    rows.forEach((r) => updateItem(r.folder.id, r.item.id, { sel: v }));
    refresh();
  }

  /** 客户类型：终端客户（目录价，不体现经销价）/ 经销商（经销价，体现经销价列） */
  function applyMode(m: 'retail' | 'dealer') {
    const t: 'dir' | 'dist' = m === 'dealer' ? 'dist' : 'dir';
    setSetting((s) => ({ ...s, mode: m, priceType: t }));
    rows.forEach((r) => updateItem(r.folder.id, r.item.id, { priceType: t }));
    refresh();
  }

  function applyPriceType(t: 'dir' | 'dist') {
    setSetting((s) => ({ ...s, priceType: t }));
    rows.forEach((r) => updateItem(r.folder.id, r.item.id, { priceType: t }));
    refresh();
  }

  function applyDiscount(d: number) {
    setSetting((s) => ({ ...s, discount: d }));
    rows.forEach((r) => updateItem(r.folder.id, r.item.id, { discount: d }));
    refresh();
  }

  function removeRow(row: Row) {
    removeItems(row.folder.id, [row.item.id]);
    refresh();
  }

  /** 明细表单元格：属性列只读展示，价格/数量/单位等可就地编辑 */
  function renderCell(c: QuoteCol, r: Row, i: number) {
    const it = r.item;
    const spec = it.prices[it.specIndex] || it.prices[0];
    switch (c.key) {
      case 'idx':
        return i + 1;
      case 'goods_no':
        return (
          <span style={{ fontFamily: 'Consolas, Menlo, monospace', fontSize: 12.5 }}>{it.goods_no || '—'}</span>
        );
      case 'title':
        return (
          <div className="q-title-cell">
            <span className="t" title={it.title}>
              {it.title}
            </span>
            {it.cate ? <span className="s">{it.cate}</span> : null}
          </div>
        );
      case 'species':
      case 'application':
      case 'cate':
      case 'method':
      case 'gene':
      case 'mw':
      case 'source': {
        const v = String(c.get(it) || '');
        return (
          <span className="pc-cell-1" title={v}>
            {v || '—'}
          </span>
        );
      }
      case 'basis':
        return (
          <select
            className="q-sel"
            style={{ width: '100%' }}
            value={it.priceType}
            onChange={(e) => patch(r, { priceType: e.target.value as 'dir' | 'dist' | 'custom' })}
          >
            <option value="dir">目录价</option>
            <option value="dist">经销价</option>
            <option value="custom">自定义</option>
          </select>
        );
      case 'spec':
        return it.prices.length > 1 ? (
          <select
            className="q-sel"
            style={{ width: '100%' }}
            value={it.specIndex}
            onChange={(e) => patch(r, { specIndex: Number(e.target.value) })}
          >
            {it.prices.map((p, k) => (
              <option key={k} value={k}>
                {p.spec}
                {p.dir ? `（¥${money(p.dir)}）` : ''}
              </option>
            ))}
          </select>
        ) : (
          <span>{spec?.spec || '—'}</span>
        );
      case 'unit':
        return <input className="q-inp" value={it.unit} onChange={(e) => patch(r, { unit: e.target.value })} />;
      case 'dir':
        return spec?.dir ? money(spec.dir) : '—';
      case 'dist':
        return spec?.dist ? money(spec.dist) : '—';
      case 'discount':
        return (
          <input
            className="q-inp r"
            type="number"
            value={it.discount}
            onChange={(e) => patch(r, { discount: Number(e.target.value) || 0 })}
          />
        );
      case 'quote':
        return (
          <input
            className="q-inp r"
            type="number"
            value={it.priceType === 'custom' ? it.custom : unitPrice(it)}
            onChange={(e) => patch(r, { priceType: 'custom', custom: Number(e.target.value) || 0 })}
          />
        );
      case 'qty':
        return (
          <input
            className="q-inp r"
            type="number"
            min={0}
            value={it.qty}
            onChange={(e) => patch(r, { qty: Number(e.target.value) || 0 })}
          />
        );
      case 'amount':
        return <b>¥{money(lineAmount(it))}</b>;
      case 'note':
        return (
          <input
            className="q-inp"
            value={it.note}
            placeholder="选填"
            onChange={(e) => patch(r, { note: e.target.value })}
          />
        );
      default:
        return String(c.get(it) ?? '');
    }
  }

  function clearFolder() {
    if (!cur) return;
    if (!window.confirm(`清空「${cur.name}」下的全部产品？`)) return;
    removeItems(
      cur.id,
      cur.items.map((i) => i.id),
    );
    refresh();
    toast('已清空');
  }

  /* ------------------------------ 生成报价单 ------------------------------ */
  function saveQuote() {
    if (!selRows.length) return toast('请先勾选要报价的产品');
    const no = quoteNo || nextQuoteNo();
    const folderName = cur ? cur.name : '';
    saveDoc({
      id: uid(),
      no,
      customer: setting.customer,
      contact: setting.contact,
      seller: setting.seller,
      date: today(),
      validDays: setting.validDays,
      priceType: setting.priceType,
      mode: setting.mode,
      extra: setting.extra || [],
      showDiscount: setting.showDiscount,
      discount: setting.discount,
      taxRate: setting.taxRate,
      currency: 'CNY',
      note: setting.note,
      folderName,
      rows: selRows.map((r) => ({ ...r.item, sel: true })),
      amount: sum.total,
      create_time: Date.now(),
    });
    setQuoteNo(no);
    refresh();
    setTab('preview');
    toast('报价单已保存');
  }

  function newQuoteNo() {
    setQuoteNo(nextQuoteNo());
  }

  /** 导出/打印共用的抬头 + 汇总 */
  const sheetInfo: QuoteSheetInfo = {
    no: quoteNo,
    customer: setting.customer,
    contact: setting.contact,
    seller: setting.seller,
    date: today(),
    validDays: setting.validDays,
    priceLabel:
      setting.mode === 'dealer' ? '经销价（经销商）' : '目录价（终端客户）',
    taxRate: Number(setting.taxRate) || 0,
    total: sum.total,
    tax: sum.tax,
    gross: sum.gross,
    note: setting.note,
  };

  function exportExcel() {
    if (!selRows.length) return toast('请先勾选要报价的产品');
    exportQuoteXlsx(
      selRows.map((r) => r.item),
      sheetInfo,
      opts,
    );
    toast('已导出 Excel 报价单');
  }

  function exportCsv() {
    if (!selRows.length) return toast('请先勾选要报价的产品');
    exportQuoteCsv(
      selRows.map((r) => r.item),
      sheetInfo,
      opts,
    );
    toast('已导出 CSV');
  }

  function printSheet() {
    if (!selRows.length) return toast('请先勾选要报价的产品');
    setTab('preview');
    setTimeout(() => window.print(), 260);
  }

  /* ------------------------------ 渲染：收藏夹树 ------------------------------ */
  function renderNode(f: QuoteFolder, depth: number) {
    const kids = folders.filter((x) => x.parentId === f.id);
    const open = expanded[f.id] !== false;
    return (
      <div key={f.id}>
        <div
          className={`q-node${depth ? ' q-node-child' : ''}${curId === f.id ? ' on' : ''}`}
          onClick={() => setCurId(f.id)}
        >
          <span
            className="q-node-arrow"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((s) => ({ ...s, [f.id]: !open }));
            }}
          >
            {kids.length ? (open ? '▾' : '▸') : ''}
          </span>
          {renaming && renaming.id === f.id ? (
            <input
              className="q-name-input"
              autoFocus
              value={renaming.name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenaming({ id: f.id, name: e.target.value })}
              onBlur={() => doRename(f.id, renaming.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doRename(f.id, renaming.name);
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <span className="q-node-name" title={f.name} onDoubleClick={() => setRenaming({ id: f.id, name: f.name })}>
              {f.name}
            </span>
          )}
          <span className="q-node-count">{f.items.length}</span>
          <span className="q-node-ops">
            <span
              className="q-node-op"
              title="新建子收藏夹"
              onClick={(e) => {
                e.stopPropagation();
                setNewSubOf(f.id);
                setNewName('');
                setExpanded((s) => ({ ...s, [f.id]: true }));
              }}
            >
              ＋
            </span>
            <span
              className="q-node-op"
              title="重命名（也可双击名称）"
              onClick={(e) => {
                e.stopPropagation();
                setRenaming({ id: f.id, name: f.name });
              }}
            >
              ✎
            </span>
            <span
              className="q-node-op"
              title="删除收藏夹"
              onClick={(e) => {
                e.stopPropagation();
                doRemoveFolder(f.id);
              }}
            >
              ✕
            </span>
          </span>
        </div>
        {open
          ? kids.map((k) => renderNode(k, depth + 1))
          : null}
        {newSubOf === f.id ? (
          <div className="q-node q-node-child" style={{ cursor: 'default' }}>
            <span className="q-node-arrow">└</span>
            <input
              className="q-name-input"
              autoFocus
              placeholder="子收藏夹名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) doCreateFolder(newName, f.id);
                if (e.key === 'Enter') setNewSubOf(null);
                if (e.key === 'Escape') setNewSubOf(null);
              }}
              onBlur={() => {
                if (newName.trim()) doCreateFolder(newName, f.id);
                setNewSubOf(null);
              }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  /* ------------------------------ 渲染 ------------------------------ */
  return (
    <div>
      <div className="pc-head">
        <div>
          <div className="pc-crumb">
            <span>产品中心</span>
            <i className="pc-crumb-sep">/</i>
            <span>收藏夹与报价</span>
          </div>
          <div className="pc-title">产品报价</div>
          <div className="pc-desc">
            收藏夹 {folders.length} 个 · 当前夹 {rows.length} 个产品 · 已勾选 {selRows.length} 个 · 合计 ¥{money(sum.total)}
          </div>
        </div>
        <div className="pc-actions">
          <button className="pc-btn pc-btn-sm" onClick={() => setPickOpen(true)}>
            ＋ 添加产品
          </button>
          <button className="pc-btn pc-btn-sm pc-btn-blue" onClick={saveQuote}>
            生成报价单
          </button>
          <button className="pc-btn pc-btn-sm pc-btn-warm" onClick={exportCsv}>
            导出 CSV
          </button>
          <button className="pc-btn pc-btn-sm pc-btn-ghost" onClick={printSheet}>
            打印 / PDF
          </button>
        </div>
      </div>

      <div className="q-layout">
        {/* ---------------- 左：收藏夹树 ---------------- */}
        <aside className="q-tree">
          <div className="q-tree-head">
            <span>我的收藏夹</span>
            <span style={{ fontSize: 12, color: '#98a2b3' }}>双击可改名</span>
          </div>
          <div className="q-tree-body">
            {folders
              .filter((f) => !f.parentId)
              .map((f) => renderNode(f, 0))}
            {!folders.length ? <div className="q-empty">还没有收藏夹</div> : null}
          </div>
          <div className="q-tree-foot">
            <input
              className="pc-input"
              style={{ flex: 1, height: 30 }}
              placeholder="新收藏夹名称"
              value={newSubOf === null ? newName : ''}
              onChange={(e) => {
                setNewSubOf(null);
                setNewName(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  doCreateFolder(newName, null);
                  setNewName('');
                }
              }}
            />
            <button
              className="pc-btn pc-btn-sm"
              onClick={() => {
                if (!newName.trim()) return toast('请输入收藏夹名称');
                doCreateFolder(newName, null);
                setNewName('');
              }}
            >
              新建
            </button>
          </div>
        </aside>

        {/* ---------------- 右：主区 ---------------- */}
        <main className="q-main">
          <div className="q-card">
            <div className="q-tabs2">
              <div className={`q-tab2${tab === 'edit' ? ' on' : ''}`} onClick={() => setTab('edit')}>
                报价明细
              </div>
              <div className={`q-tab2${tab === 'preview' ? ' on' : ''}`} onClick={() => setTab('preview')}>
                报价单预览
              </div>
              <div className={`q-tab2${tab === 'history' ? ' on' : ''}`} onClick={() => setTab('history')}>
                历史报价单({docs.length})
              </div>
            </div>

            {/* ---------- 报价设置 ---------- */}
            <div className="q-form">
              <div className="q-field" style={{ width: 150 }}>
                <span>报价单号</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input className="q-inp" value={quoteNo} onChange={(e) => setQuoteNo(e.target.value)} />
                  <button className="pc-btn pc-btn-sm pc-btn-ghost" title="重新生成单号" onClick={newQuoteNo}>
                    ↻
                  </button>
                </div>
              </div>
              <div className="q-field" style={{ width: 170 }}>
                <span>客户名称</span>
                <input
                  className="q-inp"
                  placeholder="如：某某大学医学院"
                  value={setting.customer}
                  onChange={(e) => setSetting((s) => ({ ...s, customer: e.target.value }))}
                />
              </div>
              <div className="q-field" style={{ width: 120 }}>
                <span>联系人</span>
                <input
                  className="q-inp"
                  value={setting.contact}
                  onChange={(e) => setSetting((s) => ({ ...s, contact: e.target.value }))}
                />
              </div>
              <div className="q-field" style={{ width: 120 }}>
                <span>销售负责人</span>
                <input
                  className="q-inp"
                  value={setting.seller}
                  onChange={(e) => setSetting((s) => ({ ...s, seller: e.target.value }))}
                />
              </div>
              <div className="q-field" style={{ width: 110 }}>
                <span>有效期（天）</span>
                <input
                  className="q-inp r"
                  type="number"
                  value={setting.validDays}
                  onChange={(e) => setSetting((s) => ({ ...s, validDays: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="q-field" style={{ width: 196 }}>
                <span>客户类型（决定报价口径）</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className={`pc-btn pc-btn-sm${setting.mode === 'retail' ? '' : ' pc-btn-ghost'}`}
                    onClick={() => applyMode('retail')}
                  >
                    终端客户
                  </button>
                  <button
                    className={`pc-btn pc-btn-sm${setting.mode === 'dealer' ? '' : ' pc-btn-ghost'}`}
                    onClick={() => applyMode('dealer')}
                  >
                    经销商
                  </button>
                </div>
                <span style={{ fontSize: 11.5, color: '#98a2b3', lineHeight: 1.4 }}>
                  {setting.mode === 'dealer' ? '按经销价报价，报价单体现经销价' : '按目录价报价，不体现经销价'}
                </span>
              </div>
              <div className="q-field" style={{ width: 136 }}>
                <span>统一折扣（%）</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="q-inp r"
                    type="number"
                    value={setting.discount}
                    onChange={(e) => setSetting((s) => ({ ...s, discount: Number(e.target.value) || 0 }))}
                  />
                  <button className="pc-btn pc-btn-sm pc-btn-ghost" onClick={() => applyDiscount(setting.discount)}>
                    应用
                  </button>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, height: 22 }}>
                  <input
                    type="checkbox"
                    className="pc-check"
                    checked={setting.showDiscount}
                    onChange={(e) => setSetting((s) => ({ ...s, showDiscount: e.target.checked }))}
                  />
                  报价单显示折扣列
                </label>
              </div>
              <div className="q-field" style={{ width: 330 }}>
                <span>报价单附加列（种属、应用场景恒显示）</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5, height: 28 }}>
                  {EXTRA_COLS.map((c) => (
                    <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <input
                        type="checkbox"
                        className="pc-check"
                        checked={setting.extra.includes(c.key)}
                        onChange={(e) =>
                          setSetting((s) => ({
                            ...s,
                            extra: e.target.checked
                              ? [...(s.extra || []), c.key]
                              : (s.extra || []).filter((x) => x !== c.key),
                          }))
                        }
                      />
                      {c.title}
                    </label>
                  ))}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <input
                      type="checkbox"
                      className="pc-check"
                      checked={setting.showNote}
                      onChange={(e) => setSetting((s) => ({ ...s, showNote: e.target.checked }))}
                    />
                    备注
                  </label>
                </div>
              </div>
              <div className="q-field" style={{ width: 100 }}>
                <span>税率（%）</span>
                <input
                  className="q-inp r"
                  type="number"
                  value={setting.taxRate}
                  onChange={(e) => setSetting((s) => ({ ...s, taxRate: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="q-field" style={{ width: 180 }}>
                <span>统计范围</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, height: 28 }}>
                  <input
                    type="checkbox"
                    className="pc-check"
                    checked={setting.includeSub}
                    onChange={(e) => setSetting((s) => ({ ...s, includeSub: e.target.checked }))}
                  />
                  含子收藏夹产品
                </label>
              </div>
              <div className="q-field" style={{ flex: 1, minWidth: 220 }}>
                <span>报价备注</span>
                <input
                  className="q-inp"
                  value={setting.note}
                  onChange={(e) => setSetting((s) => ({ ...s, note: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* ---------- 明细 / 预览 / 历史 ---------- */}
          {tab === 'edit' ? (
            <div className="q-card">
              <div className="q-card-head">
                <span>
                  {cur ? cur.name : '未选择收藏夹'}
                  <span style={{ fontWeight: 400, color: '#98a2b3', marginLeft: 8 }}>
                    共 {rows.length} 个产品{setting.includeSub ? '（含子夹）' : ''}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <button className="pc-btn pc-btn-sm pc-btn-ghost" onClick={() => setPickOpen(true)}>
                    ＋ 添加产品
                  </button>
                  {missingAttrs ? (
                    <button
                      className="pc-btn pc-btn-sm pc-btn-ghost"
                      title="按货号回原站产品库补回种属 / 应用场景 / 方法学等属性"
                      onClick={() => void fillAttrs()}
                    >
                      ↻ 补全属性({missingAttrs})
                    </button>
                  ) : null}
                  <button className="pc-btn pc-btn-sm pc-btn-ghost" onClick={() => setAllSel(true)}>
                    全选
                  </button>
                  <button className="pc-btn pc-btn-sm pc-btn-ghost" onClick={() => setAllSel(false)}>
                    取消全选
                  </button>
                  <button className="pc-btn pc-btn-sm pc-btn-danger" onClick={clearFolder}>
                    清空本夹
                  </button>
                </span>
              </div>
              {rows.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="q-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>
                          <input
                            type="checkbox"
                            className="pc-check"
                            title="全选/取消全选"
                            checked={rows.length > 0 && selRows.length === rows.length}
                            onChange={(e) => setAllSel(e.target.checked)}
                          />
                        </th>
                        {editCols.map((c) => (
                          <th key={c.key} style={{ width: COL_PX[c.key] }}>
                            {c.title}
                          </th>
                        ))}
                        <th style={{ width: 90 }}>所属夹</th>
                        <th style={{ width: 70 }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const it = r.item;
                        return (
                          <tr key={it.id} className={it.sel ? '' : 'off'}>
                            <td>
                              <input
                                type="checkbox"
                                className="pc-check"
                                checked={it.sel}
                                onChange={(e) => patch(r, { sel: e.target.checked })}
                              />
                            </td>
                            {editCols.map((c) => (
                              <td
                                key={c.key}
                                className={c.kind === 'num' || c.kind === 'quote' || c.kind === 'int' ? 'q-num' : undefined}
                              >
                                {renderCell(c, r, i)}
                              </td>
                            ))}
                            <td style={{ fontSize: 12, color: '#8a919f' }}>{r.folder.name}</td>
                            <td>
                              <span style={{ display: 'flex', gap: 4 }}>
                                <button className="pc-xs-btn pc-xs-blue" title="移到其他收藏夹" onClick={() => moveRow(r)}>
                                  移动
                                </button>
                                <button className="pc-xs-btn pc-xs-danger" onClick={() => removeRow(r)}>
                                  移除
                                </button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="q-empty">
                  <div className="big">📁</div>
                  这个收藏夹还没有产品 —— 点右上角「＋ 添加产品」从产品库勾选加入
                </div>
              )}

              {/* 统计条 */}
              <div className="q-sum">
                <span className="q-sum-item">
                  产品数<b>{sum.count}</b>
                </span>
                <span className="q-sum-item">
                  原价合计<b>¥{money(sum.origin)}</b>
                </span>
                <span className="q-sum-item">
                  折后合计<b>¥{money(sum.total)}</b>
                </span>
                {setting.taxRate ? (
                  <span className="q-sum-item">
                    税额({setting.taxRate}%)<b>¥{money(sum.tax)}</b>
                  </span>
                ) : null}
                <span className="q-sum-item hl">
                  {setting.taxRate ? '含税总计' : '应付总计'}
                  <b>¥{money(setting.taxRate ? sum.gross : sum.total)}</b>
                </span>
                <span className="q-grow" />
                <span className="q-sum-item" style={{ maxWidth: 420 }}>
                  大写<b style={{ fontSize: 12.5 }}>{rmbUpper(setting.taxRate ? sum.gross : sum.total)}</b>
                </span>
              </div>
            </div>
          ) : null}

          {tab === 'preview' ? (
            <div className="q-card">
              <div className="q-card-head">
                <span>报价单预览</span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <button className="pc-btn pc-btn-sm pc-btn-ghost" onClick={() => window.print()}>
                    打印 / 存为 PDF
                  </button>
                  <button className="pc-btn pc-btn-sm pc-btn-green" onClick={exportExcel}>
                    导出 Excel 报价单
                  </button>
                  <button className="pc-btn pc-btn-sm pc-btn-warm" onClick={exportCsv}>
                    导出 CSV
                  </button>
                  <button className="pc-btn pc-btn-sm pc-btn-blue" onClick={saveQuote}>
                    保存报价单
                  </button>
                </span>
              </div>
              <div className="q-sheet">
                <div className="q-sheet-title">产 品 报 价 单</div>
                <div className="q-sheet-sub">优品生物 UpingBio · ELISA 试剂盒 / 抗体 / 重组蛋白</div>
                <div className="q-sheet-meta">
                  <div>
                    <span>报价单号：</span>
                    {quoteNo}
                  </div>
                  <div>
                    <span>客户名称：</span>
                    {setting.customer || '（未填写）'}
                  </div>
                  <div>
                    <span>联系人：</span>
                    {setting.contact || '—'}
                  </div>
                  <div>
                    <span>报价日期：</span>
                    {today()}
                  </div>
                  <div>
                    <span>有效期：</span>
                    {setting.validDays} 天（至 {addDays(setting.validDays)}）
                  </div>
                  <div>
                    <span>价格类型：</span>
                    {sheetInfo.priceLabel}
                  </div>
                  <div>
                    <span>销售负责人：</span>
                    {setting.seller || '—'}
                  </div>
                </div>
                <table>
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th key={c.key} className={c.kind === 'num' || c.kind === 'quote' || c.kind === 'int' ? 'r' : undefined}>
                          {c.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selRows.map((r, i) => (
                      <tr key={r.item.id}>
                        {cols.map((c) => {
                          const it = r.item;
                          const isNum = c.kind === 'num' || c.kind === 'quote' || c.kind === 'int';
                          if (c.key === 'idx') return <td key={c.key}>{i + 1}</td>;
                          if (c.key === 'amount') return <td key={c.key} className="r">{money(lineAmount(it))}</td>;
                          if (c.key === 'quote') return <td key={c.key} className="r">{money(unitPrice(it))}</td>;
                          if (c.key === 'dir' || c.key === 'dist') {
                            const v = Number(c.get(it)) || 0;
                            return <td key={c.key} className="r">{v ? money(v) : '—'}</td>;
                          }
                          const v = c.get(it);
                          return (
                            <td key={c.key} className={isNum ? 'r' : undefined}>
                              {v === '' || v === null || v === undefined ? '—' : v}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {!selRows.length ? (
                      <tr>
                        <td colSpan={cols.length} style={{ textAlign: 'center', color: '#98a2b3', padding: '18px 0' }}>
                          未勾选产品
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                <div className="q-sheet-total">
                  <div className="cap">
                    合计金额（小写）：<b>¥{money(setting.taxRate ? sum.gross : sum.total)}</b>
                    <br />
                    合计金额（大写）：<b>{rmbUpper(setting.taxRate ? sum.gross : sum.total)}</b>
                    {setting.taxRate ? (
                      <>
                        <br />
                        其中税额（{setting.taxRate}%）：<b>¥{money(sum.tax)}</b>
                      </>
                    ) : null}
                  </div>
                  <div className="cap" style={{ textAlign: 'right' }}>
                    备注：
                    <br />
                    {setting.note}
                  </div>
                </div>
                <div className="q-sheet-sign">
                  <span>报价方（盖章）：____________</span>
                  <span>客户确认：____________</span>
                  <span>日期：____ 年 __ 月 __ 日</span>
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'history' ? (
            <div className="q-card">
              <div className="q-card-head">
                <span>历史报价单</span>
                <span style={{ fontSize: 12, color: '#98a2b3' }}>最近 {docs.length} 条，点击可载入明细</span>
              </div>
              {docs.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="q-table">
                    <thead>
                      <tr>
                        <th style={{ width: 130 }}>报价单号</th>
                        <th style={{ width: 160 }}>客户</th>
                        <th style={{ width: 110 }}>日期</th>
                        <th style={{ width: 90 }}>产品数</th>
                        <th style={{ width: 120 }}>金额(元)</th>
                        <th style={{ width: 80 }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((d) => (
                        <tr key={d.id}>
                          <td>{d.no}</td>
                          <td>{d.customer || '—'}</td>
                          <td>{d.date}</td>
                          <td>{d.rows.length}</td>
                          <td className="q-num">¥{money(d.amount)}</td>
                          <td>
                            <span style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="pc-xs-btn pc-xs-blue"
                                onClick={() => {
                                  setQuoteNo(d.no);
                                  setSetting((s) => ({
                                    ...s,
                                    customer: d.customer,
                                    contact: d.contact,
                                    seller: d.seller,
                                    validDays: d.validDays,
                                    priceType: d.priceType,
                                    mode: d.mode || (d.priceType === 'dist' ? 'dealer' : 'retail'),
                                    extra: d.extra || [],
                                    showDiscount: !!d.showDiscount,
                                    taxRate: d.taxRate,
                                    note: d.note,
                                  }));
                                  setTab('preview');
                                  toast('已载入该报价单设置');
                                }}
                              >
                                查看
                              </button>
                              <button
                                className="pc-xs-btn pc-xs-green"
                                title="按该单保存时的口径导出 Excel"
                                onClick={() => {
                                  exportQuoteXlsx(d.rows, docSheetInfo(d), docOpts(d));
                                  toast('已导出 Excel 报价单');
                                }}
                              >
                                Excel
                              </button>
                              <button
                                className="pc-xs-btn pc-xs-danger"
                                onClick={() => {
                                  removeDoc(d.id);
                                  refresh();
                                }}
                              >
                                删除
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="q-empty">还没有保存过报价单</div>
              )}
            </div>
          ) : null}
        </main>
      </div>

      {pickOpen ? (
        <ProductPicker
          folders={folders}
          defaultFolderId={curId}
          onClose={() => {
            setPickOpen(false);
            refresh();
          }}
        />
      ) : null}
    </div>
  );

  /** 移动条目到其他收藏夹 */
  function moveRow(row: Row) {
    const targets = folders.filter((f) => f.id !== row.folder.id);
    if (!targets.length) return toast('没有其他收藏夹可移动');
    const names = targets.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
    const idx = window.prompt(`移动到哪个收藏夹？\n${names}\n请输入序号：`, '1');
    if (!idx) return;
    const t = targets[Number(idx) - 1];
    if (!t) return toast('序号无效');
    moveItems(row.folder.id, [row.item.id], t.id);
    refresh();
    toast(`已移动到「${t.name}」`);
  }
}

/* ============================================================================
   产品库选择器：搜索原站产品 → 单独勾选 / 全部勾选 → 加入指定收藏夹
   ============================================================================ */
function ProductPicker({
  folders,
  defaultFolderId,
  onClose,
}: {
  folders: QuoteFolder[];
  defaultFolderId: string;
  onClose: () => void;
}) {
  const [kw, setKw] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [target, setTarget] = useState<string>(defaultFolderId || folders[0]?.id || '');
  const [newFolder, setNewFolder] = useState('');
  const LIMIT = 20;

  const load = useCallback(
    async (p: number, q: string) => {
      setLoading(true);
      try {
        const res = await fetchProductPage(q, p, LIMIT);
        setRows(res.rows || []);
        setTotal(res.total || 0);
      } catch (e) {
        toast('加载失败：' + (e instanceof Error ? e.message : '网络异常'));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(1, '');
  }, [load]);

  useEffect(() => {
    void load(page, query);
  }, [page, query, load]);

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  function toggle(id: string) {
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  function selectPage() {
    const ids = rows.map((r) => String(r.id));
    setChecked((c) => Array.from(new Set([...c, ...ids])));
  }

  /** 全部勾选：把当前搜索结果前 200 条全部选中（避免一次拉爆接口） */
  async function selectAll() {
    const cap = Math.min(total, 200);
    const ids: string[] = [];
    setLoading(true);
    try {
      const needPages = Math.ceil(cap / LIMIT);
      for (let p = 1; p <= needPages; p++) {
        const res = await fetchProductPage(query, p, LIMIT);
        (res.rows || []).forEach((r) => ids.push(String(r.id)));
      }
      setChecked(Array.from(new Set(ids)));
      toast(`已勾选全部结果 ${ids.length} 条${total > 200 ? '（上限 200 条）' : ''}`);
    } finally {
      setLoading(false);
    }
  }

  async function doAdd() {
    if (!checked.length) return toast('请先勾选产品');
    let folderId = target;
    if (newFolder.trim()) {
      const f = createFolder(newFolder.trim(), null);
      folderId = f.id;
    }
    if (!folderId) return toast('请选择收藏夹');
    const picked = rows.filter((r) => checked.includes(String(r.id)));
    // 勾选的可能跨页：按 id 回捞缺失的产品（从第 1 页起找，最多 200 条）
    const pickedAll = new Map<string, Product>();
    picked.forEach((p) => pickedAll.set(String(p.id), p));
    const missing = checked.filter((id) => !pickedAll.has(id));
    if (missing.length) {
      setLoading(true);
      try {
        for (let p = 1; p <= Math.ceil(Math.min(total, 200) / LIMIT); p++) {
          const res = await fetchProductPage(query, p, LIMIT);
          (res.rows || []).forEach((r) => {
            if (checked.includes(String(r.id))) pickedAll.set(String(r.id), r);
          });
          if (pickedAll.size === checked.length) break;
        }
      } finally {
        setLoading(false);
      }
    }
    const list = Array.from(pickedAll.values());
    const { added, updated } = addProducts(folderId, list);
    toast(`已加入 ${added} 个产品${updated ? `，更新 ${updated} 个` : ''}`);
    setChecked([]);
    onClose();
  }

  return (
    <div className="q-mask" onClick={onClose}>
      <div className="q-modal" onClick={(e) => e.stopPropagation()}>
        <div className="q-modal-head">
          <span>从产品库添加到收藏夹</span>
          <span className="q-close" onClick={onClose}>
            ✕
          </span>
        </div>
        <div className="q-modal-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              className="pc-input"
              style={{ flex: 1, minWidth: 200, height: 32 }}
              placeholder="货号 / 产品标题 / 基因名称 / 别称"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  setQuery(kw);
                }
              }}
            />
            <button
              className="pc-btn pc-btn-sm"
              onClick={() => {
                setPage(1);
                setQuery(kw);
              }}
            >
              搜索
            </button>
            <button className="pc-btn pc-btn-sm pc-btn-ghost" onClick={selectPage}>
              全选本页({rows.length})
            </button>
            <button className="pc-btn pc-btn-sm pc-btn-ghost" onClick={selectAll}>
              全部勾选({total > 200 ? '前200' : total})
            </button>
            <button
              className="pc-btn pc-btn-sm pc-btn-ghost"
              onClick={() => {
                setChecked([]);
                setKw('');
                setQuery('');
                setPage(1);
              }}
            >
              清空
            </button>
            <span style={{ fontSize: 12.5, color: '#8a919f', lineHeight: '30px' }}>
              已勾选 {checked.length} 个 · 共 {total} 条
            </span>
          </div>

          <table className="q-pick-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    className="pc-check"
                    checked={rows.length > 0 && rows.every((r) => checked.includes(String(r.id)))}
                    onChange={(e) => (e.target.checked ? selectPage() : setChecked([]))}
                  />
                </th>
                <th style={{ width: 130 }}>货号</th>
                <th>产品名称</th>
                <th style={{ width: 150 }}>分类</th>
                <th style={{ width: 90 }}>种属</th>
                <th style={{ width: 200 }}>价格明细</th>
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '18px 0', color: '#98a2b3' }}>
                    加载中…
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((r) => (
                  <tr key={String(r.id)}>
                    <td>
                      <input
                        type="checkbox"
                        className="pc-check"
                        checked={checked.includes(String(r.id))}
                        onChange={() => toggle(String(r.id))}
                      />
                    </td>
                    <td>{String(r.goods_no || '').split(';')[0]}</td>
                    <td title={plain(r.title || '')} style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {plain(r.title || '')}
                    </td>
                    <td>{r.cate_title || '—'}</td>
                    <td>{r.species || '—'}</td>
                    <td style={{ color: '#16b777', fontSize: 12 }}>{String(r.price_desc || '').slice(0, 60)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '18px 0', color: '#98a2b3' }}>
                    未找到产品
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <button className="pc-btn pc-btn-sm pc-btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            <span style={{ fontSize: 12.5, color: '#6b7684' }}>
              第 {page} / {pages} 页
            </span>
            <button className="pc-btn pc-btn-sm pc-btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              下一页
            </button>
          </div>
        </div>

        <div className="q-modal-foot">
          <span style={{ fontSize: 12.5, color: '#6b7684' }}>加入收藏夹：</span>
          <select className="q-sel" style={{ height: 30, minWidth: 160 }} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">（新建下方名称的收藏夹）</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.parentId ? `　└ ${f.name}` : f.name}
              </option>
            ))}
          </select>
          <input
            className="q-inp"
            style={{ height: 30, width: 180 }}
            placeholder="或新建收藏夹名称"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
          />
          <span className="q-grow" />
          <button className="pc-btn pc-btn-sm pc-btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="pc-btn pc-btn-sm" onClick={doAdd} disabled={loading}>
            加入收藏夹({checked.length})
          </button>
        </div>
      </div>
    </div>
  );
}
