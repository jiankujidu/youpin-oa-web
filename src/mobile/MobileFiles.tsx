/**
 * 手机端附件管理 — 复刻 app.js renderFilesPage()
 * ★ 核心场景：真实上传（选文件 / 拍照）+ 真实转发
 *
 * 原 APP：AndroidBridge.pickFiles → base64 → AndroidBridge.uploadFileBase64Async → /api/index/upload
 * 本实现：<input type="file"> / capture → File API → 第三方对象存储直传 → 公网 URL
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { addUploadedAttachment, fetchAttachments, removeUploadedAttachment } from '../core/api';
import { PROVIDER_HOWTO, PROVIDER_LABEL, configuredProviders } from '../core/config';
import { FILE_EXTS, fileTypeInfo, validateFile } from '../core/filetype';
import { openWithViewer, shareFile } from '../core/share';
import { UploadUnconfiguredError, activeProvider, isUploadConfigured, uploadFile } from '../core/upload';
import type { Attachment } from '../core/types';
import { downloadBlob, fmtSize, fmtTime, toast, urlToFile } from '../core/util';
import { Empty, Loading } from './ui';

interface UploadingItem {
  id: string;
  name: string;
  size: number;
  percent: number;
  error?: string;
}

export default function MobileFiles() {
  const [list, setList] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  const [unconfigured, setUnconfigured] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

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

  /** 真实上传：逐个发真实网络请求，带真实进度 */
  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setUnconfigured(false);

    const accepted: File[] = [];
    for (const f of files) {
      const err = validateFile(f);
      if (err) {
        toast(err);
        continue;
      }
      accepted.push(f);
    }
    if (!accepted.length) return;

    if (!isUploadConfigured()) {
      setUnconfigured(true);
      toast('未配置上传服务，无法上传');
      return;
    }

    const batch: UploadingItem[] = accepted.map((f, i) => ({
      id: `up_${Date.now()}_${i}`,
      name: f.name,
      size: f.size,
      percent: 0,
    }));
    setUploading((prev) => [...prev, ...batch]);

    for (let i = 0; i < accepted.length; i++) {
      const f = accepted[i];
      const id = batch[i].id;
      try {
        const res = await uploadFile(f, (p) => {
          setUploading((prev) => prev.map((x) => (x.id === id ? { ...x, percent: p.percent } : x)));
        });
        // 登记到附件列表（持久化元数据：名称 + 公网 URL，绝不存文件字节）
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
          toast('未配置上传服务');
          break;
        }
        setUploading((prev) => prev.map((x) => (x.id === id ? { ...x, error: err.message } : x)));
      }
    }
    load(query);
  }

  /** 真实转发 */
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

  async function doOpen(item: Attachment) {
    if (/\.(pdf)$/i.test(item.name)) {
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

  const provider = activeProvider();

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

      {/* ===== 上传入口（44px 点击区）===== */}
      <div className="m-files-up">
        <div className="m-att-btn m-att-btn-main" onClick={() => fileInput.current?.click()}>
          ＋ 上传文件
        </div>
        <div className="m-att-btn m-att-btn-ghost" onClick={() => cameraInput.current?.click()}>
          📷 拍照上传
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
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          void handleFiles(files);
        }}
      />

      {/* ===== 上传进度 ===== */}
      {uploading.map((u) => {
        const ft = fileTypeInfo(u.name);
        return (
          <div key={u.id} className="m-att-item" style={{ margin: '0 12px 10px' }}>
            <span className="m-att-ft" style={{ background: ft.c }}>
              {ft.t}
            </span>
            <div className="m-att-body">
              <div className="m-att-name">{u.name}</div>
              {u.error ? (
                <span className="m-att-st m-att-st-err">失败：{u.error}</span>
              ) : (
                <>
                  <span className="m-att-st m-att-st-up">上传中 {u.percent}%</span>
                  <div className="m-progress">
                    <div className="m-progress-bar" style={{ width: `${u.percent}%` }} />
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* ===== 未配置上传服务：明确降级，不假装成功 ===== */}
      {unconfigured || !isUploadConfigured() ? (
        <div className="m-notice warn-red">
          <b>上传服务未配置</b>
          上传需要配置一个前端可直接调用的第三方对象存储。当前已配置 0 个提供方。
          <div style={{ marginTop: 8 }}>
            在仓库根目录建 <code>.env.local</code> 并填入其一后重新构建：
          </div>
          <div style={{ marginTop: 6 }}>
            <code>VITE_CLOUDINARY_CLOUD</code> + <code>VITE_CLOUDINARY_PRESET</code>（Cloudinary）
          </div>
          <div>
            <code>VITE_UPLOADCARE_PUB_KEY</code>（Uploadcare）
          </div>
          <div>
            <code>VITE_R2_PRESIGN_URL</code>（Cloudflare R2，配合 workers/oa-proxy.js）
          </div>
          <div style={{ marginTop: 8 }}>
            获取途径：{PROVIDER_HOWTO.cloudinary}
          </div>
        </div>
      ) : (
        <div className="m-notice">
          <b>上传服务：{PROVIDER_LABEL[provider!]}</b>
          文件会真实上传到该服务，返回公网可访问链接，可直接转发给别人。
          转发已上传文件的功能不受影响。
        </div>
      )}

      {/* ===== 附件列表 ===== */}
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
                <button className="m-mini-btn m-mini-blue" onClick={() => void doOpen(it)}>
                  打开
                </button>
                <button className="m-mini-btn m-mini-green" onClick={() => void doShare(it)}>
                  转发
                </button>
                <button className="m-mini-btn m-mini-gray" onClick={() => void doDownload(it)}>
                  下载
                </button>
                <button
                  className="m-mini-btn m-mini-danger"
                  onClick={() => {
                    removeUploadedAttachment(it.id);
                    toast('已从本机列表移除');
                    load(query);
                  }}
                >
                  移除
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
