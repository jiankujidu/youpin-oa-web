/**
 * 手机端「我的」页 — 复刻 app.js renderMine()
 * 渐变头部（姓名 + 账号）+ 财务管理菜单 + 常用功能菜单 + 账号 + 版本号
 */
import { isUploadConfigured, activeProvider } from '../core/upload';
import { PROVIDER_LABEL } from '../core/config';
import type { Session } from '../core/types';
import { Dialog } from './ui';
import { useState } from 'react';

const FINANCE: [string, string][] = [
  ['预存款', 'finance-advance'],
  ['抵扣券（我申请的）', 'deduction'],
  ['抵扣券（管理专用）', 'deduction-checked'],
  ['保证金', 'margin'],
  ['发票（我申请的）', 'invoice-my'],
  ['发票（我处理的）', 'invoice-handle'],
  ['到账（发票）', 'finance-income'],
  ['到账（订单）', 'finance-order'],
  ['到账（订单·我处理的）', 'orderapply-handle'],
];

const COMMON: [string, string][] = [
  ['消息中心', 'message'],
  ['通讯录', 'mail'],
  ['我的审批', 'approve'],
];

export default function MobileMine({
  session,
  onOpenSub,
  onSwitchTab,
  onLogout,
}: {
  session: Session;
  onOpenSub: (key: string) => void;
  onSwitchTab: (tab: 'home' | 'approve' | 'customer' | 'mine') => void;
  onLogout: () => void;
}) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const configured = isUploadConfigured();
  const provider = activeProvider();

  return (
    <div>
      <div className="m-mine-head">
        <div className="name">{session.displayName}</div>
        <div className="uid">优品OA · 账号 {session.username}</div>
      </div>

      <div className="m-section-title">财务管理</div>
      {FINANCE.map(([label, key]) => (
        <div key={key} className="m-menu-item" onClick={() => onOpenSub(key)}>
          <span className="m-mi-left">{label}</span>
          <span className="m-mi-right">›</span>
        </div>
      ))}

      <div className="m-section-title">常用功能</div>
      {COMMON.map(([label, key]) => (
        <div
          key={key}
          className="m-menu-item"
          onClick={() => (key === 'approve' ? onSwitchTab('approve') : onOpenSub(key))}
        >
          <span className="m-mi-left">{label}</span>
          <span className="m-mi-right">›</span>
        </div>
      ))}
      <div className="m-menu-item" onClick={() => onOpenSub('profile')}>
        <span className="m-mi-left">基本资料</span>
        <span className="m-mi-right">›</span>
      </div>
      <div className="m-menu-item" onClick={() => onOpenSub('password')}>
        <span className="m-mi-left">修改密码</span>
        <span className="m-mi-right">›</span>
      </div>

      {/* 上传服务状态：明确展示，不静默 */}
      <div className="m-section-title">上传服务</div>
      <div className="m-menu-item" onClick={() => onOpenSub('files')}>
        <span className="m-mi-left">附件管理（上传 / 转发）</span>
        <span className="m-mi-right">›</span>
      </div>
      <div className={configured ? 'm-notice' : 'm-notice warn-red'}>
        <b>{configured ? `已配置：${PROVIDER_LABEL[provider!]}` : '未配置上传服务'}</b>
        {configured
          ? '文件将真实上传到该服务并返回公网可访问链接，可直接转发。'
          : '当前未配置任何上传服务，上传按钮会明确提示「未配置」而不会假装成功。配置方法见 README「上传服务凭证配置」。'}
      </div>

      <div className="m-section-title">账号</div>
      <div className="m-menu-item" onClick={() => onOpenSub('accounts')}>
        <span className="m-mi-left">账号管理（多账号切换）</span>
        <span className="m-mi-right">›</span>
      </div>
      <div className="m-menu-item" onClick={() => setConfirmLogout(true)}>
        <span className="m-mi-left" style={{ color: '#ff4d4f' }}>
          退出登录
        </span>
        <span className="m-mi-right">›</span>
      </div>

      <div className="m-app-ver">优品OA 移动端 v1.0</div>

      {confirmLogout ? (
        <Dialog
          message="确定退出登录？"
          onCancel={() => setConfirmLogout(false)}
          onOk={onLogout}
        />
      ) : null}
    </div>
  );
}
