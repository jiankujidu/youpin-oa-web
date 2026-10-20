/**
 * 产品中心 › 产品列表（/product/index/list）
 * PC 后台统一版式：工具栏 + 数据表格 + 分页 + 详情弹层（说明书 预览/收藏/转发）
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProducts } from '../core/api';
import { CONFIG } from '../core/config';
import { addDocToFolder, createFolder, getFolders } from '../core/session';
import { shareFile, shareFilesAsZip } from '../core/share';
import type { FavFolder, Product } from '../core/types';
import { fmtTime, plain, sanitizeName, toast } from '../core/util';
import { Modal } from './ui';
import { DataTable, PageHead, Panel, StatusTag, type Column } from './pc';

/** 「100UL;2230;53ul;1560;10ul;368」→「100UL ¥2230 / 53ul ¥1560」 */
function fmtPrice(s?: string): string {
  if (!s) return '—';
  if (/[元目录价经销]/.test(s)) return s.replace(/\n+/g, ' ').slice(0, 60);
  const parts = s.split(';').map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) out.push(`${parts[i]} ¥${parts[i + 1]}`);
  return out.length ? out.join(' / ') : s.slice(0, 60);
}

/** 说明书地址：优先 OSS 直链（协议相对补齐 https），否则走同源代理 */
function docUrl(g: { goods_no_url?: string; pc_goods_no_url?: string }): string {
  const a = g.goods_no_url || '';
  if (a) return a.startsWith('//') ? 'https:' + a : a;
  const b = g.pc_goods_no_url || '';
  return b ? `${CONFIG.oaProxy}${b}` : '';
}

export default function DesktopProduct() {
  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [cate, setCate] = useState('');
  const [cur, setCur] = useState<Product | null>(null);
  const [folders, setFolders] = useState<FavFolder[]>([]);
  const [saving, setSaving] = useState<{ name: string; url: string; productId: string } | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback((kw: string) => {
    setLoading(true);
    fetchProducts(kw)
      .then((rows) => {
        setList(rows);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setLoading(false);
        toast('产品列表加载失败：' + (e instanceof Error ? e.message : '网络异常'));
      });
  }, []);

  useEffect(() => {
    load(query);
  }, [query, load]);
  useEffect(() => setFolders(getFolders()), []);

  const cates = useMemo(() => {
    const s = new Set<string>();
    list.forEach((p) => p.cate_title && s.add(p.cate_title));
    return [...s].sort();
  }, [list]);

  const rows = useMemo(() => (cate ? list.filter((p) => p.cate_title === cate) : list), [list, cate]);

  async function shareDoc(name: string, url: string) {
    if (!url) {
      toast('该说明书暂无可访问地址');
      return;
    }
    const r = await shareFile({ url, name });
    if (r.ok) toast(r.via === 'clipboard' ? '已复制链接' : r.via === 'download' ? '已下载' : '已调起分享');
    else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
  }

  const cols: Column<Product>[] = [
    { key: 'title', title: '产品名称', render: (r) => <span className="pc-td-strong">{plain(r.title)}</span> },
    { key: 'no', title: '货号', width: 190, render: (r) => String(r.goods_no || '').split(';')[0] || '—' },
    { key: 'cate', title: '产品分类', width: 200, render: (r) => r.cate_title || '—' },
    { key: 'price', title: '规格 / 价格', width: 230, render: (r) => fmtPrice(r.price_desc) },
    { key: 'species', title: '物种', width: 130, render: (r) => r.species || '—' },
    { key: 'app', title: '应用', width: 150, render: (r) => r.application || '—' },
    { key: 'dl', title: '下载数', width: 80, align: 'center', render: (r) => String(r.down_load_num ?? 0) },
    { key: 'time', title: '更新时间', width: 150, render: (r) => fmtTime(r.create_time) },
    {
      key: 'op',
      title: '操作',
      width: 130,
      render: (r) => (
        <span className="pc-link" onClick={() => setCur(r)}>
          说明书 · 详情
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
        desc={`共 ${rows.length} 个产品`}
        actions={
          <button className="pc-btn pc-btn-ghost" onClick={() => load(query)}>
            刷新
          </button>
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
            <select className="pc-input" style={{ width: 220 }} value={cate} onChange={(e) => setCate(e.target.value)}>
              <option value="">全部分类</option>
              {cates.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
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
            rows={rows}
            rowKey={(r) => String(r.id)}
            onRowClick={setCur}
            loading={loading}
            pageSize={20}
          />
        </div>
      </Panel>

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
                ['更新时间', fmtTime(cur.create_time)],
              ] as [string, string | undefined][]
            )
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
                dangerouslySetInnerHTML={{ __html: cur.content }}
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
