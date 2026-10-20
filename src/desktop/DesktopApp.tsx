/**
 * 桌面端应用壳（>768px）
 * 布局：左侧边栏导航（240px）+ 顶栏（60px）+ 内容区（max-width 1200px，多栏）
 * ★ 桌面端**没有**手机端底部 Tab 栏——导航全部在侧边栏
 */
import { useCallback, useEffect, useState } from 'react';
import '../desktop/desktop.css';
import './pc.css';
import { clearSession, getDisplayName, getSession, setDisplayName, setSession } from '../core/session';
import { clearOaSession } from '../core/api';
import { fetchHomeStats } from '../core/api';
import type { Session } from '../core/types';
import DesktopLogin from './DesktopLogin';
import DesktopHome from './DesktopHome';
import DesktopApprove from './DesktopApprove';
import DesktopCustomer from './DesktopCustomer';
import DesktopFiles from './DesktopFiles';
import DesktopProduct from './DesktopProduct';
import { DesktopArticle, DesktopMail, DesktopMessage, DesktopNote } from './DesktopContent';
import { DesktopPassword, DesktopProfile, DesktopSub } from './DesktopSub';
import { Icon } from '../core/icons';
import { ToastHost } from './ui';

type PageKey =
  | 'home' | 'approve' | 'customer' | 'product' | 'files'
  | 'note' | 'article' | 'message' | 'mail'
  | string;

const NAV: { group: string; items: [PageKey, string][] }[] = [
  {
    group: '工作台',
    items: [
      ['home', '首页'],
      ['approve', '审批'],
      ['customer', '客户'],
      ['product', '产品管理'],
      ['files', '附件管理'],
    ],
  },
  {
    group: '办公',
    items: [
      ['note', '企业公告'],
      ['article', '问答知识'],
      ['message', '消息中心'],
      ['mail', '通讯录'],
    ],
  },
  {
    group: '客户业务',
    items: [
      ['contact', '客户联系人'],
      ['chance', '销售机会'],
      ['trace', '跟进记录'],
      ['order-my', '我的订单'],
      ['order-handle', '订单处理'],
      ['sample', '样本管理'],
      ['school', '校展管理'],
      ['after', '售后管理'],
    ],
  },
  {
    group: '财务',
    items: [
      ['finance-advance', '预存款'],
      ['deduction', '抵扣券（我申请的）'],
      ['deduction-checked', '抵扣券（管理专用）'],
      ['margin', '保证金'],
      ['invoice-my', '发票申请'],
      ['invoice-handle', '发票处理'],
      ['finance-income', '到账（发票）'],
      ['finance-order', '到账（订单）'],
      ['orderapply-handle', '到账处理'],
    ],
  },
];

/** 侧边栏图标（与手机端共用同一套线性 SVG，非 emoji） */
const NAV_ICON: Record<string, string> = {
  home: 'home',
  approve: 'approve',
  customer: 'customer',
  product: 'product',
  files: 'file',
  note: 'note',
  article: 'article',
  message: 'message',
  mail: 'mail',
  contact: 'contact',
  chance: 'chance',
  trace: 'trace',
  'order-my': 'order',
  'order-handle': 'settings',
  sample: 'sample',
  school: 'school',
  after: 'after',
  'finance-advance': 'wallet',
  deduction: 'deduction',
  'deduction-checked': 'deduction',
  margin: 'margin',
  'invoice-my': 'invoice',
  'invoice-handle': 'invoice',
  'finance-income': 'finance',
  'finance-order': 'finance',
  'orderapply-handle': 'receipt',
};

export default function DesktopApp({
  breakpoint,
  onSwitchView,
  onResetView,
  isForced,
}: {
  breakpoint: number;
  onSwitchView: () => void;
  onResetView: () => void;
  isForced: boolean;
}) {
  const [session, setSessionState] = useState<Session | null>(() => getSession());
  const [page, setPage] = useState<PageKey>('home');
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  /** 侧边栏分组折叠（默认收起长分组，避免菜单过长） */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ 客户业务: true, 财务: true });

  useEffect(() => {
    if (!session) return;
    const tick = () => fetchHomeStats().then((s) => setUnread(s.unreadMsg));
    tick();
    const timer = window.setInterval(tick, 15000);
    return () => window.clearInterval(timer);
  }, [session]);

  const handleLogin = useCallback((s: Session) => {
    setSession(s);
    setDisplayName(s.displayName);
    setSessionState(s);
    setPage('home');
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    clearOaSession();
    setSessionState(null);
    setMenuOpen(false);
    setPage('home');
  }, []);

  if (!session) {
    return (
      <>
        <DesktopLogin onSuccess={handleLogin} />
        <ToastHost />
      </>
    );
  }

  const name = getDisplayName() || session.displayName;

  return (
    <div className="d-root">
      {/* ===== 侧边栏（桌面级导航）===== */}
      <aside className="d-sidebar">
        <div className="d-brand">
          <span className="d-brand-logo">
            优品<span>OA</span>
          </span>
          <span className="d-brand-sub">网页版</span>
        </div>
        <nav className="d-nav">
          {NAV.map((g) => {
            const isCollapsed = !!collapsed[g.group];
            const activeInGroup = g.items.some(([k]) => k === page);
            const open = isCollapsed && !activeInGroup ? false : true;
            return (
              <div key={g.group}>
                <div
                  className={`d-nav-group${open ? '' : ' collapsed'}`}
                  onClick={() => setCollapsed((c) => ({ ...c, [g.group]: !c[g.group] }))}
                >
                  {g.group}
                </div>
                {open
                  ? g.items.map(([key, label]) => (
                      <div
                        key={key}
                        className={`d-nav-item${page === key ? ' active' : ''}`}
                        onClick={() => setPage(key)}
                      >
                        <span className="d-nav-ico">
                          <Icon name={NAV_ICON[key] || 'grid'} size={18} />
                        </span>
                        <span>{label}</span>
                        {key === 'message' && unread > 0 ? (
                          <span className="d-nav-badge">{unread}</span>
                        ) : null}
                      </div>
                    ))
                  : null}
              </div>
            );
          })}
        </nav>
        <div className="d-sidebar-foot">
          优品OA 网页版
          <br />
          双端独立视图 · 桌面端 {breakpoint}px 以上
        </div>
      </aside>

      {/* ===== 主区 ===== */}
      <div className="d-main">
        <header className="d-topbar">
          <div className="d-search">
            <span className="d-search-ico">
              <Icon name="search" size={16} />
            </span>
            <input placeholder="搜索审批 / 客户 / 产品 / 附件" />
          </div>
          <div className="d-topbar-right">
            {isForced ? (
              <button className="d-btn d-btn-ghost d-btn-sm" onClick={onResetView}>
                恢复自动判定
              </button>
            ) : null}
            <button className="d-btn d-btn-ghost d-btn-sm" onClick={onSwitchView}>
              <Icon name="phone" size={15} /> 手机版
            </button>
            <span className="d-icon-btn" onClick={() => setPage('message')} title="消息">
              <Icon name="bell" size={18} />
              {unread > 0 ? <span className="d-badge">{unread}</span> : null}
            </span>
            <div className="d-user" onClick={() => setMenuOpen((v) => !v)}>
              <span className="d-avatar">{name.slice(0, 1)}</span>
              <span className="d-user-name">{name}</span>
              <span style={{ fontSize: 11, color: 'var(--c-text-4)' }}>▾</span>
            </div>
          </div>
          {menuOpen ? (
            <div className="d-user-menu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); setPage('profile'); }}>
                <Icon name="user" size={15} /> 基本资料
              </div>
              <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); setPage('password'); }}>
                <Icon name="lock" size={15} /> 修改密码
              </div>
              <div className="d-user-menu-item danger" onClick={handleLogout}>
                <Icon name="logout" size={15} /> 退出登录
              </div>
            </div>
          ) : null}
        </header>

        <main className="d-content">
          <div className="d-wrap">
            {page === 'home' ? <DesktopHome onNavigate={setPage} /> : null}
            {page === 'approve' ? <DesktopApprove /> : null}
            {page === 'customer' ? <DesktopCustomer /> : null}
            {page === 'product' ? <DesktopProduct /> : null}
            {page === 'files' ? <DesktopFiles /> : null}
            {page === 'note' ? <DesktopNote /> : null}
            {page === 'article' ? <DesktopArticle /> : null}
            {page === 'message' ? <DesktopMessage /> : null}
            {page === 'mail' ? <DesktopMail /> : null}
            {page === 'profile' ? <DesktopProfile /> : null}
            {page === 'password' ? <DesktopPassword /> : null}
            {!['home', 'approve', 'customer', 'product', 'files', 'note', 'article', 'message', 'mail', 'profile', 'password'].includes(page) ? (
              <DesktopSub pageKey={page} />
            ) : null}
          </div>
        </main>
      </div>

      <ToastHost />
    </div>
  );
}
