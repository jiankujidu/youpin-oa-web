/**
 * 桌面端产品管理 — 左列表 / 右详情（说明书 预览 / 收藏 / 转发）
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchProducts } from '../core/api';
import { addDocToFolder, createFolder, getFolders } from '../core/session';
import { shareFile, shareFilesAsZip } from '../core/share';
import type { FavFolder, Product } from '../core/types';
import { fmtTime, plain, sanitizeName, toast } from '../core/util';
import { Empty, Loading, Modal } from './ui';

export default function DesktopProduct() {
  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [cur, setCur] = useState<Product | null>(null);
  const [folders, setFolders] = useState<FavFolder[]>([]);
  const [saving, setSaving] = useState<{ name: string; url: string; productId: string } | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback((kw: string) => {
    setLoading(true);
    fetchProducts(kw).then((rows) => {
      setList(rows);
      setLoading(false);
      setCur((prev) => (prev ? rows.find((r) => r.id === prev.id) || rows[0] || null : rows[0] || null));
    });
  }, []);

  useEffect(() => {
    load(query);
  }, [query, load]);
  useEffect(() => setFolders(getFolders()), []);

  async function shareDoc(name: string, url: string) {
    if (!url) {
      toast('该说明书暂无可访问地址');
      return;
    }
    const r = await shareFile({ url, name });
    if (r.ok) toast(r.via === 'clipboard' ? '已复制可分享链接' : r.via === 'download' ? '已下载' : '已调起分享');
    else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
  }

  return (
    <div>
      <div className="d-page-head">
        <span className="d-page-title">产品管理</span>
        <span className="d-page-sub">共 {list.length} 个产品</span>
        <span className="d-page-actions">
          <div className="d-search" style={{ maxWidth: 260 }}>
            <span className="d-search-ico">🔍</span>
            <input
              placeholder="产品名称 / 货号"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setQuery(keyword);
              }}
            />
          </div>
          <button className="d-btn d-btn-ghost" onClick={() => setQuery(keyword)}>
            搜索
          </button>
        </span>
      </div>

      <div className="d-cols-2">
        <div className="d-list">
          <div className="d-list-head">产品列表</div>
          {loading ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty text="暂无产品" />
          ) : (
            list.map((p) => (
              <div
                key={p.id}
                className={`d-list-row${cur?.id === p.id ? ' active' : ''}`}
                onClick={() => setCur(p)}
              >
                <div className="d-row-main">
                  <div className="d-row-title">{plain(p.title)}</div>
                  <div className="d-row-sub">
                    {p.goods_no} · {p.price_desc || '—'} · {p.specs || '—'}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {cur ? (
            <>
              <div className="d-card">
                <div className="d-card-title" style={{ fontSize: 16 }}>
                  {plain(cur.title)}
                </div>
                <div className="d-card-line">
                  {cur.cate_title} · {fmtTime(cur.create_time)}
                </div>
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px 16px' }}>
                  {(
                    [
                      ['货号', cur.goods_no], ['报价', cur.price_desc], ['规格', cur.specs], ['单位', cur.unit],
                      ['品种', cur.species], ['应用场景', cur.application], ['品牌', cur.brand], ['库存', cur.stock],
                    ] as [string, string | undefined][]
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} style={{ fontSize: 13, display: 'flex', gap: 8 }}>
                        <span style={{ color: 'var(--c-text-3)', width: 56, flex: 'none' }}>{k}</span>
                        <span style={{ color: 'var(--c-text)' }}>{v}</span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="d-card">
                <div className="d-card-title">说明书</div>
                {(cur.goods_no_list || []).map((g, gi) => {
                  const url = g.goods_no_url || g.pc_goods_no_url || '';
                  const docName = `${sanitizeName(g.goods_no)}-${sanitizeName(cur.title)}.pdf`;
                  return (
                    <div
                      key={gi}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--c-border-2)' }}
                    >
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{g.goods_no}</span>
                      <button className="d-btn d-btn-ghost d-btn-sm" onClick={() => window.open(url, '_blank', 'noopener')}>
                        预览
                      </button>
                      <button
                        className="d-btn d-btn-ghost d-btn-sm"
                        onClick={() => setSaving({ name: docName, url, productId: cur.id })}
                      >
                        收藏
                      </button>
                      <button className="d-btn d-btn-primary d-btn-sm" onClick={() => void shareDoc(docName, url)}>
                        转发
                      </button>
                    </div>
                  );
                })}
                <button
                  className="d-btn d-btn-ghost"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    const items = (cur.goods_no_list || [])
                      .map((g) => ({
                        name: `${sanitizeName(g.goods_no)}-${sanitizeName(cur.title)}.pdf`,
                        url: g.goods_no_url || g.pc_goods_no_url || '',
                      }))
                      .filter((x) => x.url);
                    void shareFilesAsZip(items, cur.title).then((r) => {
                      if (r.ok) toast(r.via === 'download' ? '已下载 zip' : '已调起系统分享');
                      else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
                    });
                  }}
                >
                  打包转发全部
                </button>
              </div>

              {cur.content ? (
                <div className="d-card">
                  <div className="d-card-title">产品详情</div>
                  <div
                    style={{ fontSize: 13, lineHeight: 1.9, color: 'var(--c-text-2)' }}
                    dangerouslySetInnerHTML={{ __html: cur.content }}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="d-card">
              <Empty text="请选择左侧产品" />
            </div>
          )}
        </div>
      </div>

      {saving ? (
        <Modal
          title="收藏到文件夹"
          onClose={() => setSaving(null)}
          footer={
            <button
              className="d-btn d-btn-primary"
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
                  className="d-nav-item"
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
            className="d-field"
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
