/**
 * 产品中心 › 产品列表（/product/index/list）
 * PC 后台统一版式：工具栏 + 数据表格 + 分页 + 详情弹层（说明书 预览/收藏/转发）
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProductPage } from '../core/api';
import { absOaUrl, fixContentHtml, signedOssToProxy } from '../core/fileurl';
import { addLocal, editLocal, localAdded, mergeLocal } from '../core/localOps';
import { addDocToFolder, createFolder, getFolders } from '../core/session';
import { shareFile, shareFilesAsZip } from '../core/share';
import type { FavFolder, Product } from '../core/types';
import { downloadCsv, fmtTime, plain, sanitizeName, toast } from '../core/util';
import { Modal } from './ui';
import { DataTable, PageHead, Panel, StatusTag, type Column } from './pc';

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
  const shown = lines.slice(0, 2);
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

export default function DesktopProduct() {
  const [list, setList] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [cate, setCate] = useState('');
  const [speciesF, setSpeciesF] = useState('');
  const [appF, setAppF] = useState('');
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
  /** 本地层版本号（复制/编辑后刷新合并行） */
  const [localVer, setLocalVer] = useState(0);

  /** 逐页载入（后端 12 万+ 条，一次拉完会超时） */
  const load = useCallback((kw: string, p: number, append: boolean) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    fetchProductPage(kw, p)
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
  }, []);

  useEffect(() => {
    setPage(1);
    load(query, 1, false);
  }, [query, load]);
  useEffect(() => setFolders(getFolders()), []);

  /** 筛选项取自真实数据（与原站下拉内容一致） */
  const opts = useMemo(() => {
    const uniq = (get: (p: Product) => string | undefined) =>
      [...new Set(list.map(get).filter((v): v is string => !!v))].sort();
    return {
      cate: uniq((p) => p.cate_title),
      species: uniq((p) => p.species),
      app: uniq((p) => p.application),
    };
  }, [list]);

  const rows = useMemo(
    () =>
      list.filter(
        (p) =>
          (!cate || p.cate_title === cate) &&
          (!speciesF || p.species === speciesF) &&
          (!appF || p.application === appF),
      ),
    [list, cate, speciesF, appF],
  );

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

  /** 复制产品（本地新增一条同字段记录，不提交原站） */
  function copyProduct(p: Product) {
    const { id: _drop, ...rest } = p as any;
    addLocal('product', { ...rest, title: `${plain(p.title || '')}（副本）`, op_copy: new Date().toISOString().slice(0, 10) });
    setLocalVer((n) => n + 1);
    toast('已复制到本地（未提交原站）');
  }

  /** 导出当前产品为 CSV（对齐原站「导出」） */
  function exportCsv() {
    const cols = [
      { key: 'id', title: '编号' },
      { key: 'no', title: '产品货号' },
      { key: 'title', title: '产品标题' },
      { key: 'cate', title: '产品分类' },
      { key: 'price', title: '价格明细' },
      { key: 'species', title: '种属' },
      { key: 'app', title: '应用' },
      { key: 'dl', title: '下载量' },
      { key: 'time', title: '更新时间' },
    ];
    const csvRows = (checkedRows.length ? checkedRows : (displayRows as any[])).slice(0, 5000).map((r) => ({
      id: r.id,
      no: String(r.goods_no || '').split(';')[0] || '',
      title: plain(r.title || ''),
      cate: r.cate_title || '',
      price: fmtPrice(r.price_desc),
      species: r.species || '',
      app: r.application || '',
      dl: r.down_load_num ?? 0,
      time: fmtTime(r.update_time || r.create_time),
    }));
    downloadCsv(`产品列表-${new Date().toISOString().slice(0, 10)}`, cols, csvRows);
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

  /** 与原站一致：编号 / 货号 / 状态 / 分类 / 价格 / 标题 / 种属 / 应用 / 基因名 / 别称 / 分子量 / 方法学 / 英文名 / Tag / 表达系统 / 下载量 / 更新时间 */
  const cols: Column<Product>[] = [
    {
      key: '_check',
      title: '',
      width: 40,
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
    { key: 'id', title: '编号', width: 80, render: (r) => <span className="pc-td-sub">{String(r.id ?? '—')}</span> },
    { key: 'no', title: '产品货号', width: 150, render: (r) => <span className="pc-td-strong">{String(r.goods_no || '').split(';')[0] || '—'}</span> },
    {
      key: 'status',
      title: '状态',
      width: 90,
      render: (r) => {
        const s = String((r as any).status ?? '');
        if (s === '1' || s === '已上架' || s === '在售') return <StatusTag tone="ok">上架</StatusTag>;
        if (s === '0' || s === '已下架') return <StatusTag tone="no">下架</StatusTag>;
        return <StatusTag tone="info">{s || '—'}</StatusTag>;
      },
    },
    { key: 'cate', title: '产品分类', width: 130, render: (r) => <span className="pc-cell-1 pc-td-sub" title={r.cate_title}>{r.cate_title || '—'}</span> },
    { key: 'price', title: '价格明细', width: 240, render: (r) => <PriceCell desc={r.price_desc} /> },
    { key: 'title', title: '产品标题', width: 340, render: (r) => <span className="pc-td-strong pc-cell-2" title={plain(r.title)}>{plain(r.title)}</span> },
    { key: 'species', title: '种属', width: 110, render: (r) => <span className="pc-cell-1 pc-td-sub" title={r.species}>{r.species || '—'}</span> },
    { key: 'app', title: '应用', width: 130, render: (r) => <span className="pc-cell-2 pc-td-sub" title={r.application}>{r.application || '—'}</span> },
    { key: 'gene', title: '基因名称', width: 110, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).gene_name}>{(r as any).gene_name || '—'}</span> },
    { key: 'alias', title: '其他别称', width: 170, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).other_name}>{(r as any).other_name || '—'}</span> },
    { key: 'mw', title: '分子量', width: 90, render: (r) => <span className="pc-cell-1 pc-td-sub">{(r as any).da || '—'}</span> },
    { key: 'method', title: '方法学', width: 100, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).methodology}>{(r as any).methodology || '—'}</span> },
    { key: 'eng', title: '英文名称', width: 150, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).eng_name}>{(r as any).eng_name || '—'}</span> },
    { key: 'tag', title: 'Tag', width: 90, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).tag}>{(r as any).tag || '—'}</span> },
    { key: 'expr', title: '表达系统', width: 110, render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).expression_system}>{(r as any).expression_system || '—'}</span> },
    { key: 'dl', title: '下载量', width: 80, align: 'center', render: (r) => String(r.down_load_num ?? 0) },
    { key: 'time', title: '更新时间', width: 150, render: (r) => fmtTime((r as any).update_time || (r as any).create_time) },
    {
      key: 'op',
      title: '操作',
      width: 190,
      render: (r) => (
        <span className="pc-ops">
          <span className="gg-xs blue" onClick={() => setCur(r)}>
            说明书
          </span>
          <span
            className="gg-xs purple"
            onClick={(e) => {
              e.stopPropagation();
              copyProduct(r);
            }}
          >
            复制
          </span>
          {String((r as any).id ?? '').startsWith('local-') ? (
            <span className="gg-xs green" onClick={() => setCur(r)}>
              本地
            </span>
          ) : null}
        </span>
      ),
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
            <button className="pc-btn pc-btn-ghost" onClick={() => load(query, 1, false)}>
              刷新
            </button>
            <button className="pc-btn pc-btn-ghost" onClick={exportCsv}>
              导出
            </button>
            <button className="pc-btn" onClick={() => setBatch(true)}>
              批量说明书
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
            {checked.length ? (
              <button className="pc-btn pc-btn-ghost" onClick={() => setChecked([])}>
                清空选中
              </button>
            ) : null}
            {list.length < total ? (
              <button
                className="pc-btn"
                disabled={loadingMore}
                onClick={() => {
                  const p = page + 1;
                  setPage(p);
                  load(query, p, true);
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
                ['全部分类', cate, setCate, opts.cate, 210],
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
            <button className="pc-btn" onClick={() => setQuery(keyword)}>
              查询
            </button>
            {(query || cate) && (
              <button
                className="pc-btn pc-btn-ghost"
                onClick={() => {
                  setKeyword('');
                  setQuery('');
                  setCate('');
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
    </div>
  );
}
