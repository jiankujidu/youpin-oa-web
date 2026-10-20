/** 桌面端通用 UI 原子组件（Toast / 模态 / 空态），样式来自 desktop.css */
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
