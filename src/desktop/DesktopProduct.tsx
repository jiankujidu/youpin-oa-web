/**
 * 产品中心 › 产品列表（/product/index/list）
 * PC 后台统一版式：工具栏 + 数据表格 + 分页 + 详情弹层（说明书 预览/收藏/转发）
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProductCateOptions, fetchProductPage, productDelete, productSave, type ProductFilter } from '../core/api';
import { absOaUrl, fixContentHtml, signedOssToProxy } from '../core/fileurl';
import { editLocal, localAdded, mergeLocal } from '../core/localOps';
import { type EditField } from '../core/opsFields';
import { addDocToFolder, createFolder, getFolders } from '../core/session';
import { shareFile, shareFilesAsZip } from '../core/share';
import type { FavFolder, Product } from '../core/types';
import { downloadCsv, fmtTime, plain, sanitizeName, toast } from '../core/util';
import { ConfirmDialog, EditModal, Modal } from './ui';
import { DataTable, PageHead, Panel, StatusTag, type Column } from './pc';

/** 产品编辑 / 复制 表单字段（对齐原站 /product/index/add 主要可填项） */
const PRODUCT_FIELDS: EditField[] = [
  { key: 'title', label: '产品标题', type: 'text' },
  { key: 'species', label: '种属', type: 'text' },
  { key: 'application', label: '应用', type: 'text' },
  { key: 'cate_title', label: '产品分类', type: 'text' },
  { key: 'gene_name', label: '基因名称', type: 'text' },
  { key: 'methodology', label: '方法学', type: 'text' },
  { key: 'expression_system', label: '表达系统', type: 'text' },
  { key: 'brand', label: '品牌', type: 'text' },
  { key: 'content', label: '备注/说明', type: 'textarea' },
];

/** 价格明细展示行 */
type PriceLine = { spec: string; price: string };

/** 去掉规格串里的「规格」字样，收敛连续分隔符，控制长度 */
function cleanSpec(raw: string): string {
  const c = raw
    .replace(/规格/g, '')
    .replace(/[\s:：\-]{2,}/g, '：')
    .replace(/^[\s:：\-]+|[\s:：\-]+$/g, '')
    .slice(0, 12);
  return c || '规格';
}

/**
 * 价格明细 → 结构化行。兼容三种原站格式：
 *  A「睿信目录价：规格：96T：2800元/48T：2000元;仑昌硕目录价：…」（分号分品牌、斜杠分规格）
 *  B「规格：96T-目录价：4000元/经销价：2000元,规格：48T-…」（逗号分规格）
 *  C「100UL;2230;53ul;1560」（规格;价格 交替，无「元」）
 */
function priceLines(s?: string): PriceLine[] {
  if (!s) return [];
  const segs = s.split(/[;,/]/).map((x) => x.trim()).filter(Boolean);
  const out: PriceLine[] = [];
  for (const seg of segs) {
    const m = /^([\u4e00-\u9fa5A-Za-z0-9.+\- :：]{0,14}?)[-:：]?\s*(?:目录价|经销价)?\s*[:：]?\s*([\d.]+)\s*元?$/.exec(seg);
    // 规格段为空且不带「元」的纯数字（格式 C 的价格位）不在此解析，走下面的配对逻辑
    if (m && /\d/.test(m[2]) && (m[1] || /元/.test(seg))) {
      let spec = cleanSpec(m[1]);
      if (spec === '规格') {
        // 首部被「目录价/经销价」吃掉时用价格类型词兜底，如「经销价 ¥2000」
        const t = /(目录价|经销价|单价)/.exec(seg);
        if (t) spec = t[1];
      }
      out.push({ spec, price: m[2] });
    }
  }
  if (out.length) return out;
  const pairs: PriceLine[] = [];
  for (let i = 0; i + 1 < segs.length; i += 2) pairs.push({ spec: cleanSpec(segs[i]), price: segs[i + 1] });
  return pairs;
}

/** CSV 用：完整价格文本 */
function fmtPrice(s?: string): string {
  const lines = priceLines(s);
  if (!lines.length) return s ? s.replace(/\n+/g, ' ').slice(0, 60) : '—';
  return lines.map((l) => `${l.spec} ¥${l.price}`).join(' / ');
}

/** 价格明细单元格：最多 2 行 + 「共 N 项」，悬停显示全文 */
function PriceCell({ desc }: { desc?: string }) {
  const lines = priceLines(desc);
  if (!lines.length) return <span style={{ color: 'var(--c-text-4)' }}>—</span>;
  const shown = lines.slice(0, 1);
  const rest = lines.length - shown.length;
  const full = lines.map((l) => `${l.spec} ¥${l.price}`).join('\n');
  return (
    <span className="pc-price-cell" title={full}>
      {shown.map((l, i) => (
        <span className="pc-price-row" key={i}>
          <span className="pc-price-spec">{l.spec}</span>
          <span className="pc-price-num">{l.price}</span>
        </span>
      ))}
      {rest > 0 ? <span className="pc-price-more">共 {lines.length} 项规格</span> : null}
    </span>
  );
}

/** 说明书地址：优先稳定端点 pc_goods_no_url（get_oss_file?id=，经代理不过期）；签名直链永远 403，转代理 /oss/ */
function docUrl(g: { goods_no_url?: string; pc_goods_no_url?: string }): string {
  return absOaUrl(g.pc_goods_no_url || '') || signedOssToProxy(g.goods_no_url || '');
}

/** CSV 导出列（与表格列一致，属性/阅读权限导出中文标签） */
const CSV_COLS = [
  { key: 'no', title: '产品货号' },
  { key: 'title', title: '产品标题' },
  { key: 'cate', title: '分类' },
  { key: 'price', title: '价格明细' },
  { key: 'species', title: '种属' },
  { key: 'app', title: '应用' },
  { key: 'gene', title: '基因名称' },
  { key: 'alias', title: '其他别称' },
  { key: 'mw', title: '分子量' },
  { key: 'source', title: '来源' },
  { key: 'scope', title: '定量/定性' },
  { key: 'speciesEng', title: '种属英文名称' },
  { key: 'method', title: '方法学' },
  { key: 'concentration', title: '浓度点' },
  { key: 'eng', title: '英文名称' },
  { key: 'tag', title: 'Tag' },
  { key: 'expr', title: '表达系统' },
  { key: 'productCode', title: '产品代码' },
  { key: 'attr', title: '属性' },
  { key: 'dl', title: '下载量' },
  { key: 'share', title: '阅读权限范围' },
];

function csvRow(r: any) {
  return {
    no: String(r.goods_no || '').split(';')[0] || '',
    title: plain(r.title || ''),
    cate: r.cate_title || '',
    price: fmtPrice(r.price_desc),
    species: r.species || '',
    app: r.application || '',
    gene: r.gene_name || '',
    alias: r.other_name || '',
    mw: r.da || '',
    source: r.source || '',
    scope: r.scope || '',
    speciesEng: r.species_eng_name || '',
    method: r.methodology || '',
    concentration: r.concentration || '',
    eng: r.eng_name || '',
    tag: r.tag || '',
    expr: r.expression_system || '',
    productCode: r.product_code || '',
    attr: (() => { const t = String(r.type ?? ''); return t === '1' ? '精华' : t === '2' ? '热门' : t === '3' ? '推荐' : '暂无'; })(),
    dl: r.down_load_num ?? 0,
    share: (() => { const v = String(r.is_share ?? ''); return v === '1' ? '所有人' : v === '2' ? '部门' : v === '3' ? '部分人员' : '私有'; })(),
  };
}

export default function DesktopProduct() {
  const [list, setList] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  /** 分类筛选用 cate_id（服务端参数）；种属/应用直接传值 */
  const [cateId, setCateId] = useState('');
  const [speciesF, setSpeciesF] = useState('');
  const [appF, setAppF] = useState('');
  const [cateOpts, setCateOpts] = useState<{ id: string; title: string }[]>([]);
  const [cur, setCur] = useState<Product | null>(null);
  const [folders, setFolders] = useState<FavFolder[]>([]);
  const [saving, setSaving] = useState<{ name: string; url: string; productId: string } | null>(null);
  const [newName, setNewName] = useState('');
  /** 勾选的产品（对齐原站批量说明书 / getCheckData） */
  const [checked, setChecked] = useState<string[]>([]);
  /** 模糊搜索（对齐原站「模糊」开关） */
  const [fuzzy, setFuzzy] = useState(false);
  /** 批量说明书结果弹窗 */
  const [batch, setBatch] = useState(false);
  /** 新增 / 编辑产品弹窗（真实提交 POST /product/index/add） */
  const [editing, setEditing] = useState<Product | null>(null);
  /** 编辑弹窗形态：edit=编辑既有 / copy=复制为新品 / new=添加产品 */
  const [editKind, setEditKind] = useState<'edit' | 'copy' | 'new'>('edit');
  /** 删除确认 */
  const [confirmDel, setConfirmDel] = useState<Product | null>(null);
  /** 本地层版本号（复制/编辑后刷新合并行） */
  const [localVer, setLocalVer] = useState(0);

  /** 逐页载入（后端 12 万+ 条，一次拉完会超时）；筛选走服务端参数（严格按原站接口） */
  const load = useCallback(
    (kw: string, p: number, append: boolean, filter?: ProductFilter) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);
      fetchProductPage(kw, p, 50, filter)
        .then(({ rows, total }) => {
          setList((prev) => (append ? [...prev, ...rows] : rows));
          setTotal(total);
          setLoading(false);
          setLoadingMore(false);
        })
        .catch((e: unknown) => {
          setLoading(false);
          setLoadingMore(false);
          toast('产品列表加载失败：' + (e instanceof Error ? e.message : '网络异常'));
        });
    },
    [],
  );

  const activeFilter = useMemo<ProductFilter | undefined>(() => {
    if (!cateId && !speciesF && !appF) return undefined;
    return { cateId: cateId || undefined, species: speciesF || undefined, application: appF || undefined };
  }, [cateId, speciesF, appF]);

  useEffect(() => {
    setPage(1);
    load(query, 1, false, activeFilter);
  }, [query, activeFilter, load]);
  useEffect(() => setFolders(getFolders()), []);

  /** 分类映射（cate_id → 分类名，后台拉取并缓存）；种属/应用选项取自当前页数据 */
  useEffect(() => {
    fetchProductCateOptions().then((opts) => {
      if (opts.length) setCateOpts(opts);
    });
  }, []);
  const opts = useMemo(() => {
    const uniq = (get: (p: Product) => string | undefined) =>
      [...new Set(list.map(get).filter((v): v is string => !!v))].sort();
    return {
      cate: cateOpts.length ? cateOpts.map((c) => c.title) : uniq((p) => p.cate_title),
      species: uniq((p) => p.species),
      app: uniq((p) => p.application),
    };
  }, [list, cateOpts]);

  /** 载入行即展示行（筛选已由服务端完成；本地复制的产品仍合并显示） */
  const rows = list;

  /** OA 行 + 本地新增/编辑合并（复制出来的产品在本地层） */
  const displayRows = useMemo(
    () => [...mergeLocal('product', []), ...rows] as Product[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ['product', rows, localVer],
  );

  const localCount = useMemo(() => localAdded('product').length, [localVer]);

  /** 勾选行的产品 */
  const checkedRows = useMemo(
    () => (displayRows as any[]).filter((p) => checked.includes(String(p.id ?? ''))),
    [displayRows, checked],
  );

  /** 勾选（或全部已载入）产品的说明书清单 */
  const batchDocs = useMemo(() => {
    const base = checkedRows.length ? checkedRows : (displayRows as any[]);
    const out: { no: string; title: string; url: string; name: string }[] = [];
    for (const p of base.slice(0, 100)) {
      for (const g of p.goods_no_list || []) {
        const url = docUrl(g);
        if (!url) continue;
        out.push({
          no: g.goods_no,
          title: plain(p.title || ''),
          url,
          name: `${sanitizeName(g.goods_no)}-${sanitizeName(plain(p.title || ''))}.pdf`,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedRows, displayRows, localVer]);

  /** 复制产品（打开编辑弹窗，去掉 id 即「另存为新品」真实提交原站） */
  function copyProduct(p: Product) {
    const { id: _drop, ...rest } = p as any;
    setEditKind('copy');
    setEditing({ ...rest, title: `${plain(p.title || '')}（副本）` } as Product);
  }

  /** 添加产品（原站「+ 添加产品」，真实 POST /product/index/add） */
  function addProduct() {
    setEditKind('new');
    setEditing({ id: '', title: '', goods_no: '', species: '', application: '', cate_title: '', create_time: '' } as Product);
  }

  /** 导出勾选行（对齐原站「导出选中行数据(N)」） */
  function exportCheckedCsv() {
    if (!checkedRows.length) return toast('请先勾选要导出的产品');
    const cols = CSV_COLS;
    const rows = checkedRows.slice(0, 5000).map((r) => csvRow(r));
    downloadCsv(`产品列表-选中-${new Date().toISOString().slice(0, 10)}`, cols, rows);
    toast(`已导出 ${rows.length} 个选中产品为 CSV`);
  }

  /** 导出当前产品为 CSV（对齐原站「导出」） */
  function exportCsv() {
    const csvRows = (checkedRows.length ? checkedRows : (displayRows as any[])).slice(0, 5000).map(csvRow);
    downloadCsv(`产品列表-${new Date().toISOString().slice(0, 10)}`, CSV_COLS, csvRows);
    toast(`已导出 ${csvRows.length} 个产品为 CSV`);
  }

  async function shareDoc(name: string, url: string) {
    if (!url) {
      toast('该说明书暂无可访问地址');
      return;
    }
    const r = await shareFile({ url, name });
    if (r.ok) toast(r.via === 'clipboard' ? '已复制链接' : r.via === 'download' ? '已下载' : '已调起分享');
    else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
  }

  /** 与原站一致：货号/说明书(左冻结) / 状态 / 分类 / 价格 / 标题 / 种属 / 应用 / 基因名 / 别称 / 分子量 / 来源 / 定量定性 / 种属英文名 / 方法学 / 浓度点 / 英文名 / Tag / 表达系统 / 产品代码 / 属性 / 下载量 / 阅读权限范围 / 更新时间 / 操作(右冻结) */
  const cols: Column<Product>[] = [
    {
      key: '_check',
      title: '',
      width: 40,
      freeze: 'left',
      head: (
        <input
          type="checkbox"
          className="pc-check"
          title="全选"
          checked={displayRows.length > 0 && checked.length === displayRows.length}
          onChange={(e) => setChecked(e.target.checked ? (displayRows as any[]).map((p) => String(p.id ?? '')) : [])}
        />
      ),
      render: (r) => (
        <input
          type="checkbox"
          className="pc-check"
          checked={checked.includes(String(r.id ?? ''))}
          onChange={() =>
            setChecked((prev) =>
              prev.includes(String(r.id ?? '')) ? prev.filter((x) => x !== String(r.id ?? '')) : [...prev, String(r.id ?? '')],
            )
          }
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      key: 'no',
      title: '产品货号/说明书',
      width: 300,
      freeze: 'left',
      render: (r) => {
        // 原站 templet：逐行列出 goods_no_list 每个变体——
        // 有说明书 → 蓝色货号 + 预览(红) + 下载；无 → 红色货号 + 两个「暂无说明书」提示
        const list = ((r as any).goods_no_list || []) as { goods_no?: string; goods_no_url?: string; pc_goods_no_url?: string }[];
        if (!list.length) {
          return <span className="pc-td-strong">{String(r.goods_no || '').split(';')[0] || '—'}</span>;
        }
        return (
          <span className="pc-goods-cell">
            {list.map((g, i) => {
              const no = g.goods_no || '';
              const has = !!(g.goods_no_url || g.pc_goods_no_url);
              const url = docUrl(g as any);
              return (
                <span className="pc-goods-row" key={i}>
                  <span className={has ? 'pc-c-blue' : 'pc-c-red'}>{no}</span>
                  {has && url ? (
                    <>
                      <span
                        className="gg-xs red"
                        title="在线查看"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(url, '_blank', 'noopener');
                        }}
                      >
                        预览
                      </span>
                      <span
                        className="gg-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          void shareDoc(`${sanitizeName(no)}-${sanitizeName(plain(r.title || ''))}.pdf`, url);
                        }}
                      >
                        下载
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="gg-xs red" onClick={(e) => { e.stopPropagation(); toast('暂无说明书'); }}>
                        预览
                      </span>
                      <span className="gg-xs" onClick={(e) => { e.stopPropagation(); toast('暂无说明书'); }}>
                        下载
                      </span>
                    </>
                  )}
                </span>
              );
            })}
          </span>
        );
      },
    },
    {
      key: 'status',
      title: '状态',
      width: 66,
      render: (r) => {
        // 原站 #status 模板：status==1 → 绿色「有货」，否则红色「下架」
        // 计算样式：纯色文字无底色无边框，字号 16px（.layui-icon 默认字号）
        const s = String((r as any).status ?? '');
        const on = s === '1' || s === '已上架' || s === '在售';
        return on ? (
          <span className="pc-c-green" style={{ fontSize: 16 }}>有货</span>
        ) : (
          <span className="pc-c-red" style={{ fontSize: 16 }}>下架</span>
        );
      },
    },
    { key: 'cate', title: '分类', width: 150, render: (r) => <span className="pc-cell-1 pc-td-sub" title={r.cate_title}>{r.cate_title || '—'}</span> },
    { key: 'price', title: '价格明细', width: 200, render: (r) => <PriceCell desc={r.price_desc} /> },
    { key: 'title', title: '产品标题', width: 250, render: (r) => <span className="pc-td-strong pc-cell-2" title={plain(r.title)}>{plain(r.title)}</span> },
    { key: 'species', title: '种属', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={r.species}>{r.species || '—'}</span> },
    { key: 'app', title: '应用', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={r.application}>{r.application || '—'}</span> },
    { key: 'gene', title: '基因名称', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).gene_name}>{(r as any).gene_name || '—'}</span> },
    { key: 'alias', title: '其他别称', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).other_name}>{(r as any).other_name || '—'}</span> },
    { key: 'mw', title: '分子量', width: 100, render: (r) => (
        <span className="pc-cell-1 pc-td-sub" title={(r as any).da}>
          {(r as any).da || '—'}
        </span>
      ) },
    { key: 'source', title: '来源', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).source}>{(r as any).source || '—'}</span> },
    { key: 'scope', title: '定量/定性', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).scope}>{(r as any).scope || '—'}</span> },
    { key: 'speciesEng', title: '种属英文名称', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).species_eng_name}>{(r as any).species_eng_name || '—'}</span> },
    { key: 'method', title: '方法学', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).methodology}>{(r as any).methodology || '—'}</span> },
    { key: 'concentration', title: '浓度点', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).concentration}>{(r as any).concentration || '—'}</span> },
    { key: 'eng', title: '英文名称', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).eng_name}>{(r as any).eng_name || '—'}</span> },
    { key: 'tag', title: 'Tag', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).tag}>{(r as any).tag || '—'}</span> },
    { key: 'expr', title: '表达系统', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).expression_system}>{(r as any).expression_system || '—'}</span> },
    { key: 'productCode', title: '产品代码', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).product_code}>{(r as any).product_code || '—'}</span> },
    { key: 'attr', title: '属性', width: 80, render: (r) => {
        // 原站 templet：0/其它→暂无(绿)、1→精华(蓝)、2→热门(黄)、3→推荐(红)
        const t = String((r as any).type ?? '');
        if (t === '1') return <span className="pc-c-blue">精华</span>;
        if (t === '2') return <span className="pc-c-yellow">热门</span>;
        if (t === '3') return <span className="pc-c-red">推荐</span>;
        return <span className="pc-c-green">暂无</span>;
      } },
    { key: 'dl', title: '下载量', width: 80, align: 'center', render: (r) => String(r.down_load_num ?? 0) },
    { key: 'share', title: '阅读权限范围', width: 100, render: (r) => {
        // 原站 templet：0→私有(绿)、1→所有人(蓝)、2→部门(黄)、3→部分人员(红)
        const v = String((r as any).is_share ?? '');
        if (v === '1') return <span className="pc-c-blue">所有人</span>;
        if (v === '2') return <span className="pc-c-yellow">部门</span>;
        if (v === '3') return <span className="pc-c-red">部分人员</span>;
        return <span className="pc-c-green">私有</span>;
      } },
    {
      key: 'op',
      title: '操作',
      width: 150,
      fixed: true,
      freeze: 'right',
      render: (r) => {
        const isLocal = String((r as any).id ?? '').startsWith('local-');
        return (
          <span className="pc-ops">
            {/* 原站 #barDemo：复制 / 编辑 / 删除（layui-btn-group，说明书入口在货号列的预览/下载里） */}
            <span
              className="gg-xs"
              onClick={(e) => {
                e.stopPropagation();
                copyProduct(r);
              }}
            >
              复制
            </span>
            {!isLocal ? (
              <span
                className="gg-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditKind('edit');
                  setEditing(r as Product);
                }}
              >
                编辑
              </span>
            ) : null}
            {!isLocal ? (
              <span
                className="gg-xs red"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDel(r as Product);
                }}
              >
                删除
              </span>
            ) : null}
            {isLocal ? (
              <span className="gg-xs green" onClick={() => setCur(r)}>
                本地
              </span>
            ) : null}
          </span>
        );
      },
    },
  ];

  const docs = (cur?.goods_no_list || []).map((g) => ({
    no: g.goods_no,
    url: docUrl(g),
    name: `${sanitizeName(g.goods_no)}-${sanitizeName(plain(cur?.title || ''))}.pdf`,
  }));

  return (
    <div>
      <PageHead
        title="产品列表"
        crumb={['产品中心', '产品列表']}
        desc={`共 ${total || rows.length} 个产品 · 已载入 ${list.length} 个${localCount ? ` · 本地新增 ${localCount} 个` : ''}${checked.length ? ` · 已勾选 ${checked.length} 个` : ''}`}
        actions={
          <>
            {/* 原站 #toolbarDemo 顺序：添加产品 / 批量导入… / 批量下架 / 批量上架 / 导出产品(csv) /
                导出选中行数据(N) / 清空选中 / 批量生成UP说明书 / 导入(异步)&UP说明书…
                批量导入系需文件上传通道，暂未接；其余按原站标签与顺序复刻。 */}
            <button className="pc-btn" onClick={addProduct}>
              + 添加产品
            </button>
            <button className="pc-btn pc-btn-ghost" onClick={exportCsv}>
              导出产品(csv)
            </button>
            <button className="pc-btn pc-btn-ghost" onClick={exportCheckedCsv}>
              导出选中行数据({checkedRows.length})
            </button>
            {checked.length ? (
              <button className="pc-btn pc-btn-ghost" onClick={() => setChecked([])}>
                清空选中
              </button>
            ) : null}
            <button className="pc-btn" onClick={() => setBatch(true)}>
              批量生成UP说明书
            </button>
            <button className="pc-btn pc-btn-ghost" onClick={() => load(query, 1, false)}>
              刷新
            </button>
            <button
              className="pc-btn pc-btn-ghost"
              onClick={() => {
                setFuzzy((f) => !f);
                toast(fuzzy ? '已切换为精确搜索' : '已切换为模糊搜索（关键词分词匹配）');
              }}
            >
              模糊：{fuzzy ? '开' : '关'}
            </button>
            {list.length < total ? (
              <button
                className="pc-btn"
                disabled={loadingMore}
                onClick={() => {
                  const p = page + 1;
                  setPage(p);
                  load(query, p, true, activeFilter);
                }}
              >
                {loadingMore ? '载入中…' : `载入更多（${list.length}/${total}）`}
              </button>
            ) : null}
          </>
        }
      />

      <Panel bodyPad={false}>
        <div style={{ padding: '14px 16px' }}>
          <div className="pc-toolbar">
            <input
              className="pc-input"
              style={{ width: 280 }}
              placeholder="搜索产品名称 / 货号"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setQuery(keyword);
              }}
            />
            {(
              [
                ['全部种属', speciesF, setSpeciesF, opts.species, 150],
                ['全部应用', appF, setAppF, opts.app, 170],
              ] as [string, string, (v: string) => void, string[], number][]
            ).map(([label, val, set, values, w]) => (
              <select
                key={label}
                className="pc-input"
                style={{ width: w }}
                value={val}
                onChange={(e) => set(e.target.value)}
              >
                <option value="">{label}</option>
                {values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ))}
            <select
              className="pc-input"
              style={{ width: 210 }}
              value={cateId}
              onChange={(e) => {
                const id = e.target.value;
                setCateId(id);
              }}
            >
              <option value="">全部分类</option>
              {cateOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button className="pc-btn" onClick={() => setQuery(keyword)}>
              查询
            </button>
            {(query || cateId || speciesF || appF) && (
              <button
                className="pc-btn pc-btn-ghost"
                onClick={() => {
                  setKeyword('');
                  setQuery('');
                  setCateId('');
                  setSpeciesF('');
                  setAppF('');
                }}
              >
                重置
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable
            columns={cols}
            rows={displayRows}
            rowKey={(r) => String(r.id)}
            onRowClick={setCur}
            loading={loading}
            pageSize={20}
            totalText={total ? `已载入 ${list.length} / 共 ${total} 个` : undefined}
          />
        </div>
      </Panel>

      {/* ===== 批量说明书（对齐原站 批量说明书 / 批量产品+说明书） ===== */}
      {batch ? (
        <Modal
          title="批量说明书"
          onClose={() => setBatch(false)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => setBatch(false)}>
                关闭
              </button>
              {batchDocs.length ? (
                <button
                  className="pc-btn"
                  onClick={() => {
                    void shareFilesAsZip(
                      batchDocs.map((d) => ({ name: d.name, url: d.url })),
                      '批量说明书',
                    ).then((r) => {
                      if (r.ok) toast(r.via === 'download' ? '已下载 zip' : '已调起系统分享');
                      else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
                    });
                  }}
                >
                  打包转发（{batchDocs.length}）
                </button>
              ) : null}
            </>
          }
        >
          <div style={{ fontSize: 12.5, color: '#e8862a', background: '#fff7ec', border: '1px solid #ffd9a8', borderRadius: 6, padding: '7px 10px', marginBottom: 12 }}>
            {checkedRows.length ? `已勾选 ${checkedRows.length} 个产品` : '未勾选，默认取当前已载入产品（最多 100 个）'}；说明文书签在本地生成，不提交原站。
          </div>
          {batchDocs.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--c-text-4)' }}>这些产品暂无可访问的说明书</div>
          ) : (
            <div style={{ maxHeight: 400, overflow: 'auto', border: '1px solid var(--c-border)', borderRadius: 6 }}>
              <table className="pc-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>序号</th>
                    <th>货号</th>
                    <th>产品</th>
                    <th style={{ width: 170 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {batchDocs.map((d, i) => (
                    <tr key={`${d.no}-${i}`}>
                      <td className="pc-col-idx">{i + 1}</td>
                      <td>{d.no}</td>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</td>
                      <td>
                        <span className="pc-link" onClick={() => window.open(d.url, '_blank', 'noopener')}>
                          预览
                        </span>
                        <span className="pc-link" onClick={() => void shareDoc(d.name, d.url)}>
                          转发
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      ) : null}

      {/* ===== 产品详情 + 说明书 ===== */}
      {cur ? (
        <Modal
          title={plain(cur.title)}
          onClose={() => setCur(null)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => setCur(null)}>
                关闭
              </button>
              {docs.filter((d) => d.url).length ? (
                <button
                  className="pc-btn"
                  onClick={() => {
                    void shareFilesAsZip(
                      docs.filter((d) => d.url).map((d) => ({ name: d.name, url: d.url })),
                      plain(cur.title),
                    ).then((r) => {
                      if (r.ok) toast(r.via === 'download' ? '已下载 zip' : '已调起系统分享');
                      else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
                    });
                  }}
                >
                  打包转发说明书
                </button>
              ) : null}
            </>
          }
        >
          <dl className="pc-kv">
            {(
              [
                ['产品编号', cur.id],
                ['货号', cur.goods_no],
                ['产品分类', cur.cate_title],
                ['规格 / 价格', fmtPrice(cur.price_desc)],
                ['物种', cur.species],
                ['应用', cur.application],
                ['方法学', cur.methodology],
                ['表达系统', cur.expression_system],
                ['浓度', cur.concentration],
                ['关键词', cur.keywords],
                ['下载数', String(cur.down_load_num ?? 0)],
                ['更新时间', fmtTime((cur as any).update_time || (cur as any).create_time)],
              ] as [string, string | undefined][])
              .filter(([, v]) => v !== undefined && v !== null && v !== '')
              .map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>

          <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            说明书（{docs.length}）
          </div>
          {docs.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--c-text-4)' }}>该产品暂无说明书</div>
          ) : (
            docs.map((d) => (
              <div
                key={d.no}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 0',
                  borderTop: '1px solid var(--c-border)',
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.no}</span>
                {d.url ? (
                  <>
                    <span className="pc-link" onClick={() => window.open(d.url, '_blank', 'noopener')}>
                      预览
                    </span>
                    <span className="pc-link" onClick={() => setSaving({ name: d.name, url: d.url, productId: String(cur.id) })}>
                      收藏
                    </span>
                    <span className="pc-link" onClick={() => void shareDoc(d.name, d.url)}>
                      转发
                    </span>
                  </>
                ) : (
                  <StatusTag tone="info">未提供文件</StatusTag>
                )}
              </div>
            ))
          )}

          {cur.content ? (
            <>
              <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>产品详情</div>
              <div
                className="ai-doc-body"
                dangerouslySetInnerHTML={{ __html: fixContentHtml(cur.content) }}
              />
            </>
          ) : null}
        </Modal>
      ) : null}

      {/* ===== 收藏到文件夹 ===== */}
      {saving ? (
        <Modal
          title="收藏说明书"
          onClose={() => setSaving(null)}
          footer={
            <button
              className="pc-btn"
              onClick={() => {
                const n = newName.trim();
                if (!n) {
                  toast('请输入文件夹名称');
                  return;
                }
                const f = createFolder(n);
                setFolders(getFolders());
                addDocToFolder(f.id, saving.name, saving.url, saving.productId);
                setNewName('');
                setSaving(null);
                toast('已收藏');
              }}
            >
              新建并收藏
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {folders.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--c-text-3)', padding: '8px 0' }}>暂无文件夹</div>
            ) : (
              folders.map((f) => (
                <div
                  key={f.id}
                  className="pc-list-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    addDocToFolder(f.id, saving.name, saving.url, saving.productId);
                    setFolders(getFolders());
                    setSaving(null);
                    toast('已收藏');
                  }}
                >
                  {f.name}（{f.docs.length}）
                </div>
              ))
            )}
          </div>
          <input
            className="pc-input"
            style={{ width: '100%' }}
            placeholder="新文件夹名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </Modal>
      ) : null}

      {/* 新增 / 编辑 / 复制 产品（原站 POST /product/index/add，带 id 即编辑，无 id 即新建/复制） */}
      {editing ? (
        <EditModal
          title={editKind === 'edit' ? '编辑产品' : editKind === 'copy' ? '复制为新品' : '添加产品'}
          fields={PRODUCT_FIELDS}
          value={editing}
          onSave={async (v) => {
            const id = String((editing as any).id || '');
            const res = await productSave({
              id,
              title: String((v as any).title || editing.title || ''),
              species: String((v as any).species ?? ''),
              application: String((v as any).application ?? ''),
              cate_title: String((v as any).cate_title ?? ''),
              gene_name: String((v as any).gene_name ?? ''),
              methodology: String((v as any).methodology ?? ''),
              expression_system: String((v as any).expression_system ?? ''),
              brand: String((v as any).brand ?? ''),
              content: String((v as any).content ?? ''),
            });
            if (!res.ok) return toast(res.msg || '保存失败');
            if (id) editLocal('product', { ...editing, ...v });
            setLocalVer((n) => n + 1);
            setEditing(null);
            toast(
              editKind === 'edit'
                ? '已保存（原站已更新）'
                : editKind === 'copy'
                  ? '已复制为新品（原站已同步）'
                  : '已添加（原站已同步）',
            );
            load(query, 1, false, activeFilter);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {confirmDel ? (
        <ConfirmDialog
          title="删除确认"
          text={`确认删除产品「${plain(String((confirmDel as any).title || (confirmDel as any).id || ''))}」？将同步从 OA 原站删除。`}
          onOk={async () => {
            const res = await productDelete(String((confirmDel as any).id));
            if (!res.ok) return toast(res.msg || '删除失败');
            setConfirmDel(null);
            toast('已删除（原站已同步）');
            load(query, 1, false, activeFilter);
          }}
          onClose={() => setConfirmDel(null)}
        />
      ) : null}
    </div>
  );
}
