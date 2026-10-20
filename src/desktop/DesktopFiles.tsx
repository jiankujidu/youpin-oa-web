/**
 * 桌面端附件管理 — 拖拽上传区 + 文件表格（与手机端的两个 44px 按钮 + 卡片列表是两套独立设计）
 * ★ 真实上传 + 真实转发（同一套 core 逻辑，独立视图）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { addUploadedAttachment, fetchAttachments, removeUploadedAttachment } from '../core/api';
import { PROVIDER_HOWTO, PROVIDER_LABEL } from '../core/config';
import { FILE_EXTS, fileTypeInfo, validateFile } from '../core/filetype';
import { copyText, openWithViewer, shareFile, shareFilesAsZip } from '../core/share';
import { UploadUnconfiguredError, activeProvider, isUploadConfigured, uploadFile } from '../core/upload';
import type { Attachment } from '../core/types';
import { downloadBlob, fmtSize, fmtTime, toast, urlToFile } from '../core/util';
import { Empty, Loading, Modal } from './ui';

interface UpItem {
  id: string;
  name: string;
  percent: number;
  error?: string;
}

export default function DesktopFiles() {
  const [list, setList] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState<UpItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [unconfigured, setUnconfigured] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [shareTarget, setShareTarget] = useState<Attachment | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const load = useCallback((kw: string) => {
    setLoading(true);
    fetchAttachments(kw).then((rows) => {
      setList(rows);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load(query);
  }, [query, load]);

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setUnconfigured(false);

    const accepted = files.filter((f) => {
      const err = validateFile(f);
      if (err) toast(err);
      return !err;
    });
    if (!accepted.length) return;

    if (!isUploadConfigured()) {
      setUnconfigured(true);
      toast('未配置上传服务，无法上传');
      return;
    }

    const batch: UpItem[] = accepted.map((f, i) => ({ id: `du_${Date.now()}_${i}`, name: f.name, percent: 0 }));
    setUploading((prev) => [...prev, ...batch]);

    for (let i = 0; i < accepted.length; i++) {
      const f = accepted[i];
      const id = batch[i].id;
      try {
        const res = await uploadFile(f, (p) => {
          setUploading((prev) => prev.map((x) => (x.id === id ? { ...x, percent: p.percent } : x)));
        });
        addUploadedAttachment({
          url: res.url,
          name: res.name,
          size: res.size,
          ext: res.ext || f.name.split('.').pop()?.toLowerCase() || '',
        });
        toast(`已上传：${res.name}`);
        setUploading((prev) => prev.filter((x) => x.id !== id));
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (err instanceof UploadUnconfiguredError) {
          setUnconfigured(true);
          setUploading((prev) => prev.filter((x) => x.id !== id));
          break;
        }
        setUploading((prev) => prev.map((x) => (x.id === id ? { ...x, error: err.message } : x)));
      }
    }
    load(query);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void handleFiles(Array.from(e.dataTransfer.files));
  }

  const provider = activeProvider();
  const allChecked = list.length > 0 && checked.size === list.length;

  return (
    <div>
      <div className="d-page-head">
        <span className="d-page-title">附件管理</span>
        <span className="d-page-sub">共 {list.length} 个文件</span>
        <span className="d-page-actions">
          <button className="d-btn d-btn-ghost" onClick={() => void shareZipChecked()}>
            打包转发勾选（{checked.size}）
          </button>
          <button className="d-btn d-btn-primary" onClick={() => fileInput.current?.click()}>
            ＋ 上传文件
          </button>
        </span>
      </div>

      {/* ===== 拖拽上传区（桌面大热区）===== */}
      <div
        className={`d-dropzone${dragging ? ' dragging' : ''}`}
        onClick={() => fileInput.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current--;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <div className="d-drop-ico">📁</div>
        <div className="d-drop-title">把文件拖到这里，或点击选择文件</div>
        <div className="d-drop-sub">
          支持 {FILE_EXTS.length} 种格式（{FILE_EXTS.slice(0, 8).join(' / ')} …），单文件 ≤ 10MB
        </div>
        <div className="d-drop-btns">
          <span className="d-btn d-btn-ghost">选择文件</span>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={FILE_EXTS.map((e) => '.' + e).join(',')}
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          void handleFiles(files);
        }}
      />

      {/* ===== 上传进度 ===== */}
      {uploading.map((u) => (
        <div className="d-up-item" key={u.id} style={{ marginTop: 10 }}>
          <span className="d-ft" style={{ background: fileTypeInfo(u.name).c }}>
            {fileTypeInfo(u.name).t}
          </span>
          <span style={{ flex: 'none', width: 200, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {u.name}
          </span>
          {u.error ? (
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--c-danger)' }}>失败：{u.error}</span>
          ) : (
            <>
              <span className="d-up-bar">
                <i style={{ width: `${u.percent}%` }} />
              </span>
              <span style={{ flex: 'none', fontSize: 12.5, color: 'var(--c-primary)', width: 44, textAlign: 'right' }}>
                {u.percent}%
              </span>
            </>
          )}
        </div>
      ))}

      {/* ===== 上传服务状态（明确，不静默）===== */}
      {unconfigured || !isUploadConfigured() ? (
        <div className="d-notice danger" style={{ marginTop: 14 }}>
          <b>上传服务未配置</b>
          上传需要配置一个前端可直接调用的第三方对象存储，当前已配置 0 个提供方。
          <div style={{ marginTop: 6 }}>
            在仓库根目录建 <code>.env.local</code>，填入以下任一后重新构建：
          </div>
          <div style={{ marginTop: 4 }}>
            · <code>VITE_CLOUDINARY_CLOUD</code> + <code>VITE_CLOUDINARY_PRESET</code> — {PROVIDER_HOWTO.cloudinary}
          </div>
          <div>
            · <code>VITE_UPLOADCARE_PUB_KEY</code> — {PROVIDER_HOWTO.uploadcare}
          </div>
          <div>
            · <code>VITE_R2_PRESIGN_URL</code> — {PROVIDER_HOWTO.r2}
          </div>
        </div>
      ) : (
        <div className="d-notice" style={{ marginTop: 14 }}>
          <b>上传服务：{PROVIDER_LABEL[provider!]}</b>
          文件会真实上传到该服务并返回公网可访问链接，可直接转发。
        </div>
      )}

      {/* ===== 文件表格 ===== */}
      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="d-search" style={{ maxWidth: 320 }}>
          <span className="d-search-ico">🔍</span>
          <input
            placeholder="搜索文件名"
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
      </div>

      <div style={{ marginTop: 12, background: '#fff', border: '1px solid var(--c-border)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty text="暂无附件" />
        ) : (
          <table className="d-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => setChecked(e.target.checked ? new Set(list.map((x) => x.id)) : new Set())}
                  />
                </th>
                <th>文件名</th>
                <th style={{ width: 90 }}>大小</th>
                <th style={{ width: 150 }}>上传时间</th>
                <th style={{ width: 120 }}>上传者</th>
                <th style={{ width: 250 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((it) => {
                const ft = fileTypeInfo(it.name);
                return (
                  <tr key={it.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={checked.has(it.id)}
                        onChange={(e) => {
                          const s = new Set(checked);
                          if (e.target.checked) s.add(it.id);
                          else s.delete(it.id);
                          setChecked(s);
                        }}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="d-ft" style={{ background: ft.c }}>
                          {ft.t}
                        </span>
                        <span className="d-td-name">{it.name}</span>
                      </div>
                    </td>
                    <td>{fmtSize(it.filesize)}</td>
                    <td>{fmtTime(it.create_time)}</td>
                    <td>{it.admin_name || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="d-btn d-btn-ghost d-btn-sm" onClick={() => openWithViewer(it.url)}>
                          打开
                        </button>
                        <button className="d-btn d-btn-primary d-btn-sm" onClick={() => setShareTarget(it)}>
                          转发
                        </button>
                        <button
                          className="d-btn d-btn-ghost d-btn-sm"
                          onClick={() => {
                            void urlToFile(it.url, it.name)
                              .then((f) => downloadBlob(f, it.name))
                              .catch(() => window.open(it.url, '_blank', 'noopener'));
                          }}
                        >
                          下载
                        </button>
                        <button
                          className="d-btn d-btn-danger d-btn-sm"
                          onClick={() => {
                            removeUploadedAttachment(it.id);
                            toast('已从本机列表移除');
                            load(query);
                          }}
                        >
                          移除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ===== 转发面板（桌面端：复制链接 / 系统分享 / 打开）===== */}
      {shareTarget ? (
        <Modal
          title={`转发：${shareTarget.name}`}
          onClose={() => setShareTarget(null)}
          footer={
            <>
              <button className="d-btn d-btn-ghost" onClick={() => setShareTarget(null)}>
                关闭
              </button>
              <button
                className="d-btn d-btn-primary"
                onClick={() => {
                  void shareFile({ url: shareTarget.url, name: shareTarget.name }).then((r) => {
                    if (r.ok) {
                      toast(r.via === 'clipboard' ? '已复制链接' : r.via === 'download' ? '已下载' : '已调起分享');
                      setShareTarget(null);
                    } else if (r.reason !== '已取消') {
                      toast('转发失败：' + r.reason);
                    }
                  });
                }}
              >
                系统分享
              </button>
            </>
          }
        >
          <div style={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.8 }}>
            公网可访问链接（刷新后仍有效）：
          </div>
          <div
            style={{
              marginTop: 8, padding: '10px 12px', background: '#f7f9fc', border: '1px solid var(--c-border)',
              borderRadius: 8, fontSize: 12, wordBreak: 'break-all', color: 'var(--c-text)',
            }}
          >
            {shareTarget.url}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="d-btn d-btn-ghost d-btn-sm"
              onClick={() => {
                void copyText(shareTarget.url).then((ok) => toast(ok ? '已复制链接' : '复制失败'));
              }}
            >
              复制链接
            </button>
            <button
              className="d-btn d-btn-ghost d-btn-sm"
              onClick={() => window.open(shareTarget.url, '_blank', 'noopener')}
            >
              在浏览器打开
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--c-text-3)', lineHeight: 1.7 }}>
            桌面浏览器多数不支持 Web Share API，会自动降级为「复制链接」，你可以把链接发给对方；
            支持的系统（Windows 分享面板 / macOS 分享菜单）会直接调起分享。
          </div>
        </Modal>
      ) : null}
    </div>
  );

  async function shareZipChecked() {
    const items = list.filter((x) => checked.has(x.id));
    if (!items.length) {
      toast('请先勾选要转发的文件');
      return;
    }
    toast('正在打包…');
    const r = await shareFilesAsZip(items.map((x) => ({ name: x.name, url: x.url })), '优品OA-转发');
    if (r.ok) toast(r.via === 'download' ? '已下载 zip' : '已调起系统分享');
    else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
  }
}
