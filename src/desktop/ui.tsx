/** 桌面端通用 UI 原子组件（Toast / 模态 / 空态 / 编辑表单），样式来自 desktop.css */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EditField } from '../core/opsFields';
import { onToast } from '../core/util';

export function ToastHost() {
  const [msg, setMsg] = useState('');
  const timer = useRef<number | null>(null);
  useEffect(
    () =>
      onToast((m) => {
        setMsg(m);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setMsg(''), 2200);
      }),
    [],
  );
  if (!msg) return null;
  return <div className="d-toast">{msg}</div>;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // 桌面端习惯：Esc 关闭弹层
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="d-mask" onClick={onClose}>
      <div className="d-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="d-modal-title">{title}</div>
        {children}
        {footer ? <div className="d-modal-btns">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------- 文件「真预览 / 真下载」 ----------
 * 背景：OA 的 get_oss_file.html 是唯一会返回真实文件字节的端点，但它带
 *   Content-Disposition: attachment，直接 window.open 只会触发下载、看不到内容；
 *   而 down_oss_file.html 只返回一段明文直链（71 字节），点开是乱码文本。
 * 所以预览必须：fetch → Blob → URL.createObjectURL → iframe 内联渲染
 *   （objectURL 不带 attachment 头，浏览器内置 PDF 阅读器会直接显示）。
 * 下载则反过来：直接 <a href=get_oss_file download="xxx.pdf"> 落真实文件。
 */
function isInlineable(name: string): boolean {
  return /\.(pdf|png|jpe?g|gif|webp|bmp|svg|txt|csv)$/i.test(name || '');
}

/** 内嵌预览面板（拉流 → objectURL → iframe） */
export function DocPreviewPane({
  url,
  name,
  height = 620,
}: {
  url: string;
  name: string;
  height?: number | string;
}) {
  const [stat, setStat] = useState<'loading' | 'ok' | 'err'>('loading');
  const [src, setSrc] = useState('');
  const [msg, setMsg] = useState('');
  const [size, setSize] = useState(0);

  useEffect(() => {
    let alive = true;
    let obj = '';
    setStat('loading');
    setSrc('');
    (async () => {
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!blob.size) throw new Error('文件为空');
        obj = URL.createObjectURL(blob);
        if (!alive) {
          URL.revokeObjectURL(obj);
          return;
        }
        setSize(blob.size);
        setSrc(obj);
        setStat('ok');
      } catch (e) {
        if (alive) {
          setMsg(e instanceof Error ? e.message : String(e));
          setStat('err');
        }
      }
    })();
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [url]);

  if (stat === 'loading') {
    return (
      <div className="d-loading" style={{ height: 120 }}>
        正在加载文件…
      </div>
    );
  }
  if (stat === 'err') {
    return (
      <div className="d-empty" style={{ padding: '24px 0' }}>
        预览失败：{msg}
        <div style={{ marginTop: 10 }}>
          <a className="pc-btn pc-btn-sm pc-btn-cyan" href={url} download={name}>
            改为直接下载
          </a>
        </div>
      </div>
    );
  }
  if (!isInlineable(name)) {
    return (
      <div className="d-empty" style={{ padding: '24px 0' }}>
        该格式（{name.split('.').pop()}）浏览器无法直接预览，请下载后查看
        <div style={{ marginTop: 10 }}>
          <a className="pc-btn pc-btn-sm pc-btn-cyan" href={url} download={name}>
            下载文件
          </a>
        </div>
      </div>
    );
  }
  return <iframe className="doc-preview-frame" title={name} src={src} style={{ height }} />;
}

/** 全屏预览弹窗（iframe + 新标签页打开 / 下载 / 关闭） */
export function DocPreviewModal({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="d-mask doc-preview-mask" onClick={onClose}>
      <div className="d-modal d-modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="d-modal-title" title={name}>
          说明书预览 · {name}
        </div>
        <DocPreviewPane url={url} name={name} height="66vh" />
        <div className="d-modal-btns">
          <a className="pc-btn pc-btn-sm pc-btn-cyan" href={url} download={name}>
            下载
          </a>
          <button
            className="pc-btn pc-btn-sm pc-btn-ghost"
            onClick={() => window.open(url, '_blank', 'noopener')}
          >
            新标签页打开
          </button>
          <button className="pc-btn pc-btn-sm" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export function Loading() {
  return <div className="d-loading">加载中…</div>;
}

export function Empty({ text = '暂无数据' }: { text?: string }) {
  return <div className="d-empty">{text}</div>;
}

/* ==================== 编辑表单（本地操作，不提交原站） ==================== */

/**
 * 通用编辑弹窗：字段配置驱动。各页面 onSave 决定提交行为
 * （已真实化的模块走原站接口，见 core/api.ts；未接入的模块仍落本地层）。
 */
export function EditModal({
  title,
  fields,
  value,
  onSave,
  onClose,
}: {
  title: string;
  fields: EditField[];
  value: Record<string, any>;
  onSave: (v: Record<string, any>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, any>>(() => ({ ...value }));

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal title={title} onClose={onClose}
      footer={
        <>
          <button className="pc-btn pc-btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="pc-btn"
            onClick={() => {
              onSave(form);
              onClose();
            }}
          >
            保存
          </button>
        </>
      }
    >
      {fields.map((f) => (
        <div key={f.key} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: '#8a919f', marginBottom: 5 }}>{f.label}</div>
          {f.type === 'textarea' ? (
            <textarea
              className="pc-input"
              style={{ width: '100%', minHeight: 80, padding: '8px 10px' }}
              placeholder={f.placeholder}
              value={String(form[f.key] ?? '')}
              onChange={(e) => set(f.key, e.target.value)}
            />
          ) : f.type === 'select' ? (
            <select
              className="pc-input"
              style={{ width: '100%', height: 36 }}
              value={String(form[f.key] ?? '')}
              onChange={(e) => set(f.key, e.target.value)}
            >
              <option value="">请选择</option>
              {(f.options || []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="pc-input"
              style={{ width: '100%', height: 36 }}
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              placeholder={f.placeholder}
              value={String(form[f.key] ?? '')}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </Modal>
  );
}

/** 危险操作确认框 */
export function ConfirmDialog({
  title,
  text,
  confirmText = '确认删除',
  onOk,
  onClose,
}: {
  title: string;
  text: string;
  confirmText?: string;
  onOk: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="pc-btn pc-btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="pc-btn"
            style={{ background: '#e4564f' }}
            onClick={() => {
              onOk();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>{text}</div>
    </Modal>
  );
}
