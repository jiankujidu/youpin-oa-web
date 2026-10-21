/**
 * 手机端附件管理 — 复刻 app.js renderFilesPage()
 *
 * 只读版（对齐"不要账号不要提交"）：
 *  - 列表来自真实 OA 文件库（/home/files/index）
 *  - 打开/下载/转发走稳定流式端点 get_oss_file.html?id=（经同源代理注入会话，永不过期）
 *  - 不做上传（原 OSS 签名直链 3.5 小时过期是此前"打开/下载全失效"的根因）
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchAttachments } from '../core/api';
import { fileTypeInfo } from '../core/filetype';
import { openWithViewer, shareFile } from '../core/share';
import type { Attachment } from '../core/types';
import { downloadBlob, fmtSize, fmtTime, toast, urlToFile } from '../core/util';
import { Empty, Loading } from './ui';

export default function MobileFiles() {
  const [list, setList] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback((kw: string) => {
    setLoading(true);
    fetchAttachments(kw)
      .then((rows) => {
        setList(rows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(query);
  }, [query, load]);

  /** 真实转发：系统分享 → 复制链接 → 下载兜底 */
  async function doShare(item: Attachment) {
    toast('正在准备转发…');
    const r = await shareFile({ url: item.url, name: item.name });
    if (r.ok) {
      toast(
        r.via === 'web-share-files'
          ? '已调起系统分享'
          : r.via === 'clipboard'
          ? '已复制可分享链接'
          : r.via === 'download'
          ? '已下载，请手动发送'
          : '已分享',
      );
    } else if (r.reason !== '已取消') {
      toast('转发失败：' + r.reason);
    }
  }

  function doOpen(item: Attachment) {
    if (/\.pdf$/i.test(item.name) || /\.pdf$/i.test(item.url)) {
      window.open(item.url, '_blank', 'noopener');
      return;
    }
    openWithViewer(item.url);
  }

  async function doDownload(item: Attachment) {
    try {
      const f = await urlToFile(item.url, item.name);
      downloadBlob(f, item.name);
      toast('已开始下载');
    } catch {
      window.open(item.url, '_blank', 'noopener');
    }
  }

  return (
    <div>
      <div className="m-search-bar">
        <input
          value={keyword}
          placeholder="搜索文件名"
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setQuery(keyword);
          }}
        />
        <span className="m-search-btn" onClick={() => setQuery(keyword)}>
          搜索
        </span>
      </div>

      {/* ===== 附件列表（OA 真实文件库）===== */}
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty text="暂无附件" />
      ) : (
        list.map((it) => {
          const ft = fileTypeInfo(it.name);
          return (
            <div key={it.id} className="m-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="m-att-ft" style={{ background: ft.c }}>
                  {ft.t}
                </span>
                <div className="m-att-body">
                  <div className="m-att-name">{it.name}</div>
                  <span className="m-att-st" style={{ color: '#8a8f99' }}>
                    {fmtSize(it.filesize)} · {it.fileext} · {fmtTime(it.create_time)}
                  </span>
                </div>
              </div>
              {it.admin_name ? (
                <div className="m-card-line" style={{ marginTop: 6 }}>
                  上传者：{it.admin_name}
                  {it.group_title ? `（${it.group_title}）` : ''}
                </div>
              ) : null}
              <div className="m-file-actions">
                <button className="m-mini-btn m-mini-blue" onClick={() => doOpen(it)}>
                  打开
                </button>
                <button className="m-mini-btn m-mini-green" onClick={() => void doShare(it)}>
                  转发
                </button>
                <button className="m-mini-btn m-mini-gray" onClick={() => void doDownload(it)}>
                  下载
                </button>
              </div>
            </div>
          );
        })
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}
