/**
 * 附件管理 › 文件库（/home/files/index）
 * PC 后台统一版式：上传区 + 工具栏 + 数据表格 + 分页 + 转发弹层
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addUploadedAttachment, fetchAttachments, removeUploadedAttachment } from '../core/api';
import { PROVIDER_HOWTO, PROVIDER_LABEL } from '../core/config';
import { FILE_EXTS, fileTypeInfo, validateFile } from '../core/filetype';
import { copyText, openWithViewer, shareFile, shareFilesAsZip } from '../core/share';
import { UploadUnconfiguredError, activeProvider, isUploadConfigured, uploadFile } from '../core/upload';
import type { Attachment } from '../core/types';
import { downloadBlob, fmtSize, fmtTime, toast, urlToFile } from '../core/util';
import { Modal } from './ui';
import { DataTable, PageHead, Panel, StatusTag, type Column } from './pc';

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
  const [ext, setExt] = useState('');
  const [uploading, setUploading] = useState<UpItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [unconfigured, setUnconfigured] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [shareTarget, setShareTarget] = useState<Attachment | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const load = useCallback((kw: string) => {
    setLoading(true);
    fetchAttachments(kw)
      .then((rows) => {
        setList(rows);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setLoading(false);
        toast('文件库加载失败：' + (e instanceof Error ? e.message : '网络异常'));
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

  const exts = useMemo(() => {
    const s = new Set<string>();
    list.forEach((a) => a.fileext && s.add(a.fileext));
    return [...s].sort();
  }, [list]);

  const rows = useMemo(() => (ext ? list.filter((a) => a.fileext === ext) : list), [list, ext]);

  const cols: Column<Attachment>[] = [
    {
      key: 'ck',
      title: '',
      width: 44,
      render: (r) => (
        <input
          type="checkbox"
          checked={checked.has(r.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const s = new Set(checked);
            if (e.target.checked) s.add(r.id);
            else s.delete(r.id);
            setChecked(s);
          }}
        />
      ),
    },
    {
      key: 'name',
      title: '文件名',
      render: (r) => {
        const ft = fileTypeInfo(r.name);
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="d-ft" style={{ background: ft.c }}>
              {ft.t}
            </span>
            <span className="pc-td-strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.name}
            </span>
          </span>
        );
      },
    },
    { key: 'size', title: '大小', width: 100, align: 'right', render: (r) => fmtSize(r.filesize) },
    { key: 'group', title: '分组', width: 130, render: (r) => r.group_title || <StatusTag tone="info">未分组</StatusTag> },
    { key: 'admin', title: '上传者', width: 110, render: (r) => r.admin_name || '—' },
    { key: 'time', title: '上传时间', width: 160, render: (r) => fmtTime(r.create_time) },
    {
      key: 'op',
      title: '操作',
      width: 190,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 12 }}>
          <span className="pc-link" onClick={() => openWithViewer(r.url)}>
            打开
          </span>
          <span className="pc-link" onClick={() => setShareTarget(r)}>
            转发
          </span>
          <span
            className="pc-link"
            onClick={() => {
              void urlToFile(r.url, r.name)
                .then((f) => downloadBlob(f, r.name))
                .catch(() => window.open(r.url, '_blank', 'noopener'));
            }}
          >
            下载
          </span>
        </span>
      ),
    },
  ];

  async function shareZipChecked() {
    const items = rows.filter((x) => checked.has(x.id));
    if (!items.length) {
      toast('请先勾选要转发的文件');
      return;
    }
    toast('正在打包…');
    const r = await shareFilesAsZip(
      items.map((x) => ({ name: x.name, url: x.url })),
      '优品OA-转发',
    );
    if (r.ok) toast(r.via === 'download' ? '已下载 zip' : '已调起系统分享');
    else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
  }

  return (
    <div>
      <PageHead
        title="文件库"
        crumb={['日常办公', '文件库']}
        desc={`共 ${rows.length} 个文件`}
        actions={
          <>
            <button className="pc-btn pc-btn-ghost" onClick={() => void shareZipChecked()}>
              打包转发（{checked.size}）
            </button>
            <button className="pc-btn" onClick={() => fileInput.current?.click()}>
              ＋ 上传文件
            </button>
          </>
        }
      />

      {/* ===== 上传区 ===== */}
      <Panel>
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
          <div className="d-drop-ico">⬆</div>
          <div className="d-drop-title">把文件拖到这里，或点击选择文件</div>
          <div className="d-drop-sub">
            支持 {FILE_EXTS.length} 种格式（{FILE_EXTS.slice(0, 8).join(' / ')} …），单文件 ≤ 10MB
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

        {uploading.length ? (
          <div style={{ marginTop: 12 }}>
            {uploading.map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 13 }}>
                <span style={{ width: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                {u.error ? (
                  <span style={{ color: 'var(--c-danger)' }}>失败：{u.error}</span>
                ) : (
                  <>
                    <span className="d-up-bar" style={{ flex: 1 }}>
                      <i style={{ width: `${u.percent}%` }} />
                    </span>
                    <span style={{ width: 44, textAlign: 'right', color: 'var(--c-primary)' }}>{u.percent}%</span>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <div className="d-notice" style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.8 }}>
          {unconfigured || !isUploadConfigured() ? (
            <>
              <b>上传服务未配置：</b>上传需要一个前端可直接调用的第三方对象存储。在仓库根目录建 <code>.env.local</code> 填入以下任一后重新构建：
              <div>· <code>VITE_CLOUDINARY_CLOUD</code> + <code>VITE_CLOUDINARY_PRESET</code> — {PROVIDER_HOWTO.cloudinary}</div>
              <div>· <code>VITE_UPLOADCARE_PUB_KEY</code> — {PROVIDER_HOWTO.uploadcare}</div>
              <div>· <code>VITE_R2_PRESIGN_URL</code> — {PROVIDER_HOWTO.r2}</div>
              <div style={{ marginTop: 4, color: 'var(--c-text-3)' }}>列表中的文件来自 OA 真实文件库，浏览 / 下载 / 转发不受影响。</div>
            </>
          ) : (
            <>
              <b>上传服务：{PROVIDER_LABEL[provider!]}</b> — 文件会真实上传到该服务并返回公网链接，可直接转发。
            </>
          )}
        </div>
      </Panel>

      {/* ===== 文件表格 ===== */}
      <Panel bodyPad={false}>
        <div style={{ padding: '14px 16px' }}>
          <div className="pc-toolbar">
            <input
              className="pc-input"
              style={{ width: 280 }}
              placeholder="搜索文件名"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setQuery(keyword);
              }}
            />
            <select className="pc-input" style={{ width: 140 }} value={ext} onChange={(e) => setExt(e.target.value)}>
              <option value="">全部类型</option>
              {exts.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <button className="pc-btn" onClick={() => setQuery(keyword)}>
              查询
            </button>
            {(query || ext) && (
              <button
                className="pc-btn pc-btn-ghost"
                onClick={() => {
                  setKeyword('');
                  setQuery('');
                  setExt('');
                }}
              >
                重置
              </button>
            )}
            <button className="pc-btn pc-btn-ghost" onClick={() => load(query)}>
              刷新
            </button>
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={loading} pageSize={20} indexCol={false} />
        </div>
      </Panel>

      {/* ===== 转发弹层 ===== */}
      {shareTarget ? (
        <Modal
          title={`转发：${shareTarget.name}`}
          onClose={() => setShareTarget(null)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => setShareTarget(null)}>
                关闭
              </button>
              <button
                className="pc-btn"
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
          <div style={{ fontSize: 13, color: 'var(--c-text-2)' }}>公网可访问链接：</div>
          <div
            style={{
              marginTop: 8,
              padding: '10px 12px',
              background: '#f7f9fc',
              border: '1px solid var(--c-border)',
              borderRadius: 8,
              fontSize: 12,
              wordBreak: 'break-all',
            }}
          >
            {shareTarget.url || '（该文件暂无可访问地址）'}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <span
              className="pc-link"
              onClick={() => {
                void copyText(shareTarget.url).then((ok) => toast(ok ? '已复制链接' : '复制失败'));
              }}
            >
              复制链接
            </span>
            <span className="pc-link" onClick={() => window.open(shareTarget.url, '_blank', 'noopener')}>
              在浏览器打开
            </span>
            <span
              className="pc-link"
              onClick={() => {
                removeUploadedAttachment(shareTarget.id);
                toast('已从本机列表移除');
                setShareTarget(null);
                load(query);
              }}
            >
              从本机列表移除
            </span>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
