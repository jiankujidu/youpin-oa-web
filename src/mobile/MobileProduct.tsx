/**
 * 手机端产品管理 — 复刻 app.js renderProductPage() / openProductDetail()
 * ★ 核心场景：说明书 预览 / 收藏 / 转发
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchProducts } from '../core/api';
import { absOaUrl, fixContentHtml, signedOssToProxy } from '../core/fileurl';
import { createFolder, addDocToFolder, getFolders } from '../core/session';
import { shareFile, shareFilesAsZip } from '../core/share';
import type { FavFolder, Product } from '../core/types';
import { fmtTime, plain, sanitizeName, toast } from '../core/util';
import { Empty, Loading, PromptDialog, Sheet } from './ui';

export default function MobileProduct() {
  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<Product | null>(null);

  const [folders, setFolders] = useState<FavFolder[]>([]);
  const [picker, setPicker] = useState<{ name: string; url: string; productId: string } | null>(null);
  const [newFolder, setNewFolder] = useState(false);

  const load = useCallback((kw: string) => {
    setLoading(true);
    fetchProducts(kw).then((rows) => {
      setList(rows);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load(query);
  }, [query, load]);

  useEffect(() => {
    setFolders(getFolders());
  }, []);

  /** 转发单份说明书（真实 Web Share / 剪贴板降级） */
  async function shareDoc(name: string, url: string) {
    if (!url) {
      toast('该说明书暂无可访问地址');
      return;
    }
    toast('正在准备转发…');
    const r = await shareFile({ url, name });
    if (r.ok) {
      toast(
        r.via === 'web-share-files' ? '已调起系统分享' :
        r.via === 'clipboard' ? '已复制可分享链接' :
        r.via === 'download' ? '已下载，请手动发送' : '已分享',
      );
    } else if (r.reason !== '已取消') {
      toast('转发失败：' + r.reason);
    }
  }

  function doSave(p: { name: string; url: string; productId: string }, folderId: string) {
    addDocToFolder(folderId, p.name, p.url, p.productId);
    setFolders(getFolders());
    setPicker(null);
    toast('已收藏');
  }

  /* ======================= 详情 ======================= */
  if (detail) {
    const rows: [string, string][] = [
      ['货号', detail.goods_no],
      ['报价', detail.price_desc || ''],
      ['规格', detail.specs || ''],
      ['单位', detail.unit || ''],
      ['品种', detail.species || ''],
      ['应用场景', detail.application || ''],
      ['品牌', detail.brand || ''],
      ['库存', detail.stock || ''],
    ];
    return (
      <div>
        <div className="m-detail-head">
          <div className="m-dh-title">{plain(detail.title)}</div>
          <div className="m-dh-sub">
            {detail.cate_title ? <span className="m-tag m-tag-pass">{detail.cate_title}</span> : null}
            {fmtTime((detail as any).update_time || detail.create_time)}
          </div>
        </div>

        <div className="m-detail-card">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div className="m-detail-row" key={k}>
                <span className="dl">{k}</span>
                <span className="dv">{v}</span>
              </div>
            ))}
        </div>

        {/* ===== 说明书：预览 / 收藏 / 转发 ===== */}
        {detail.goods_no_list?.length ? (
          <>
            <div className="m-section-title">说明书</div>
            <div className="m-card">
              {detail.goods_no_list.map((g, gi) => {
                // ★ 稳定端点优先；签名直链（永远 403）转代理 /oss/ 路径
                const url = absOaUrl(g.pc_goods_no_url || '') || signedOssToProxy(g.goods_no_url || '');
                const docName = `${sanitizeName(g.goods_no)}-${sanitizeName(detail.title)}.pdf`;
                return (
                  <div className="m-doc-row" key={gi}>
                    <span className="m-doc-name">{g.goods_no}</span>
                    <span className="m-doc-actions">
                      <button
                        className="m-mini-btn m-mini-blue"
                        onClick={() => window.open(url, '_blank', 'noopener')}
                      >
                        预览
                      </button>
                      <button
                        className="m-mini-btn"
                        onClick={() => setPicker({ name: docName, url, productId: detail.id })}
                      >
                        收藏
                      </button>
                      <button className="m-mini-btn m-mini-green" onClick={() => void shareDoc(docName, url)}>
                        转发
                      </button>
                    </span>
                  </div>
                );
              })}
              <div className="m-file-actions" style={{ marginTop: 10 }}>
                <button
                  className="m-mini-btn m-mini-green"
                  onClick={() => {
                    const items = (detail.goods_no_list || [])
                      .map((g) => ({
                        name: `${sanitizeName(g.goods_no)}-${sanitizeName(detail.title)}.pdf`,
                        url: absOaUrl(g.pc_goods_no_url || '') || signedOssToProxy(g.goods_no_url || ''),
                      }))
                      .filter((x) => x.url);
                    void shareFilesAsZip(items, detail.title).then((r) => {
                      if (r.ok) toast(r.via === 'download' ? '已下载 zip' : '已调起系统分享');
                      else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
                    });
                  }}
                >
                  打包转发全部
                </button>
              </div>
            </div>
          </>
        ) : null}

        {detail.content ? (
          <div
            className="m-detail-content"
            dangerouslySetInnerHTML={{ __html: fixContentHtml(detail.content) }}
          />
        ) : null}

        <div style={{ padding: '0 12px 20px' }}>
          <button
            className="m-btn"
            style={{ background: '#f0f2f5', color: '#666' }}
            onClick={() => setDetail(null)}
          >
            返回列表
          </button>
        </div>

        {/* 收藏夹选择面板 */}
        {picker ? (
          <Sheet
            title="收藏到文件夹"
            onClose={() => setPicker(null)}
            footer={
              <button
                className="m-mini-btn"
                onClick={() => setNewFolder(true)}
              >
                ＋ 新建文件夹
              </button>
            }
          >
            {folders.length === 0 ? (
              <div className="m-empty">暂无文件夹，请先新建</div>
            ) : (
              folders.map((f) => (
                <div key={f.id} className="m-sheet-item" onClick={() => doSave(picker, f.id)}>
                  {f.name}（{f.docs.length}）
                </div>
              ))
            )}
          </Sheet>
        ) : null}

        {newFolder ? (
          <PromptDialog
            title="新建文件夹"
            placeholder="文件夹名称"
            onCancel={() => setNewFolder(false)}
            onOk={(v) => {
              if (!v.trim()) {
                toast('请输入文件夹名称');
                return;
              }
              const f = createFolder(v.trim());
              setFolders(getFolders());
              setNewFolder(false);
              if (picker) doSave(picker, f.id);
            }}
          />
        ) : null}
      </div>
    );
  }

  /* ======================= 列表 ======================= */
  return (
    <div>
      <div className="m-search-bar">
        <input
          value={keyword}
          placeholder="搜索产品名称 / 货号"
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setQuery(keyword);
          }}
        />
        <span className="m-search-btn" onClick={() => setQuery(keyword)}>
          搜索
        </span>
      </div>

      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty text="暂无产品" />
      ) : (
        list.map((p) => (
          <div key={p.id} className="m-card clickable" onClick={() => setDetail(p)}>
            <div className="m-card-title">{plain(p.title)}</div>
            <div className="m-card-line">
              货号：{p.goods_no}
              {p.cate_title ? ` · ${p.cate_title}` : ''}
            </div>
            <div className="m-card-line">
              {p.price_desc || '—'} · {p.specs || '—'} · {p.stock || '—'}
            </div>
          </div>
        ))
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}
