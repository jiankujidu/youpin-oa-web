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
  return (
    <div className="d-mask" onClick={onClose}>
      <div className="d-modal" onClick={(e) => e.stopPropagation()}>
        <div className="d-modal-title">{title}</div>
        {children}
        {footer ? <div className="d-modal-btns">{footer}</div> : null}
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
 * 通用编辑弹窗：字段配置驱动，只写 localStorage（见 core/localOps.ts）。
 * title 会带「本地」角标，让用户明确这不会提交到 OA。
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
            保存（本地）
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12, color: '#e8862a', background: '#fff7ec', border: '1px solid #ffd9a8', borderRadius: 6, padding: '7px 10px', marginBottom: 14 }}>
        本地操作模式：改动仅保存在本机浏览器，不会提交到 oa.upingbio.com。
      </div>
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
