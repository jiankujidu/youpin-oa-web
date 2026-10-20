/** 手机端通用 UI 原子组件（Toast / Dialog / Sheet），样式全部来自 mobile.css */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { onToast } from '../core/util';
import { Icon } from '../core/icons';

/* ======================= Toast ======================= */

export function ToastHost() {
  const [msg, setMsg] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return onToast((m) => {
      setMsg(m);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMsg(''), 1900);
    });
  }, []);

  if (!msg) return null;
  return <div className="m-toast">{msg}</div>;
}

/* ======================= 确认对话框（替代 window.confirm） ======================= */

export function Dialog(props: {
  message: string;
  onOk: () => void;
  onCancel: () => void;
  okText?: string;
}) {
  return (
    <div className="m-dialog-mask" onClick={props.onCancel}>
      <div className="m-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="m-dialog-msg">{props.message}</div>
        <div className="m-dialog-btns">
          <button className="m-dialog-btn cancel" onClick={props.onCancel}>
            取消
          </button>
          <button className="m-dialog-btn ok" onClick={props.onOk}>
            {props.okText || '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= 输入对话框（替代 window.prompt） ======================= */

export function PromptDialog(props: {
  title: string;
  defaultValue?: string;
  placeholder?: string;
  onOk: (v: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(props.defaultValue || '');
  return (
    <div className="m-dialog-mask" onClick={props.onCancel}>
      <div className="m-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="m-dialog-msg" style={{ textAlign: 'left', marginBottom: 10 }}>
          {props.title}
        </div>
        <input
          className="m-field"
          style={{
            width: '100%',
            border: '1px solid var(--c-border)',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 'var(--f-14)',
            outline: 'none',
            minHeight: 44,
          }}
          value={v}
          placeholder={props.placeholder}
          onChange={(e) => setV(e.target.value)}
          autoFocus
        />
        <div className="m-dialog-btns" style={{ marginTop: 14 }}>
          <button className="m-dialog-btn cancel" onClick={props.onCancel}>
            取消
          </button>
          <button className="m-dialog-btn ok" onClick={() => props.onOk(v)}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= 底部面板 ======================= */

export function Sheet(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="m-mask" onClick={props.onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <span>{props.title}</span>
          <span className="m-sheet-close" onClick={props.onClose}>
            <Icon name="close" size={16} />
          </span>
        </div>
        <div className="m-sheet-body">{props.children}</div>
        {props.footer ? <div className="m-sheet-btns">{props.footer}</div> : null}
      </div>
    </div>
  );
}

/* ======================= 空态 / 加载态 ======================= */

export function Loading() {
  return <div className="m-loading">加载中…</div>;
}

export function Empty({ text = '暂无数据' }: { text?: string }) {
  return <div className="m-empty">{text}</div>;
}

/* ======================= 页面级「返回」按钮 ======================= */

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="m-section-title">{children}</div>;
}
