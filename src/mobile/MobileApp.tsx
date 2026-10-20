/**
 * 手机端应用壳（≤768px）
 * 结构严格对齐 app-source/index.html 的 #app-view：
 *   顶栏（标题 + 铃铛 + 桌面版）→ 页面容器 → 底部 4 Tab
 */
import { useCallback, useEffect, useState } from 'react';
import '../mobile/mobile.css';
import { setSession, getSession, clearSession, setDisplayName, getDisplayName } from '../core/session';
import { clearOaSession } from '../core/api';
import { fetchHomeStats } from '../core/api';
import type { Session } from '../core/types';
import MobileLogin from './MobileLogin';
import MobileHome from './MobileHome';
import MobileApprove from './MobileApprove';
import MobileCustomer from './MobileCustomer';
import MobileMine from './MobileMine';
import MobileFiles from './MobileFiles';
import MobileProduct from './MobileProduct';
import { MobileArticle, MobileMail, MobileMessage, MobileNote } from './MobileContent';
import { MobileApproveAdd, MobileCustomerAdd, MobilePassword, MobileProfile, MobileSub } from './MobileSub';
import { Icon } from '../core/icons';
import { ToastHost } from './ui';

type Tab = 'home' | 'approve' | 'customer' | 'mine';

const TITLES: Record<Tab, string> = { home: '首页', approve: '审批', customer: '客户', mine: '我的' };

const SUB_TITLES: Record<string, string> = {
  note: '企业公告',
  article: '问答知识',
  product: '产品管理',
  files: '附件管理',
  message: '消息中心',
  mail: '通讯录',
  profile: '基本资料',
  password: '修改密码',
  'approve-add': '发起审批',
  'finance-advance': '预存款',
  'finance-income': '到账（发票）',
  'finance-order': '到账（订单）',
  deduction: '抵扣券（我申请的）',
  'deduction-checked': '抵扣券（管理专用）',
  margin: '保证金',
  'invoice-my': '发票（我申请的）',
  'invoice-handle': '发票（我处理的）',
  'orderapply-handle': '到账（订单·我处理的）',
  contact: '客户联系人',
  chance: '销售机会',
  trace: '跟进记录',
  'order-my': '我的订单',
  'order-handle': '订单处理',
  sample: '样本管理',
  school: '校展管理',
  after: '售后管理',
  'customer-add': '新增客户',
};

export default function MobileApp({ onSwitchView }: { onSwitchView: () => void }) {
  const [session, setSessionState] = useState<Session | null>(() => getSession());
  const [tab, setTab] = useState<Tab>('home');
  const [sub, setSub] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!session) return;
    // 未读角标：前台轮询（限制 L-3：后台标签会被浏览器节流）
    const tick = () => {
      fetchHomeStats().then((s) => setUnread(s.unreadMsg));
    };
    tick();
    const timer = window.setInterval(tick, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session]);

  const handleLogin = useCallback((s: Session) => {
    setSession(s);
    setDisplayName(s.displayName);
    setSessionState(s);
    setTab('home');
    setSub(null);
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    clearOaSession();
    setSessionState(null);
    setSub(null);
    setTab('home');
  }, []);

  const switchTab = useCallback((t: Tab) => {
    setSub(null);
    setTab(t);
  }, []);

  const openSub = useCallback((key: string) => setSub(key), []);

  if (!session) {
    return (
      <div className="m-root">
        <MobileLogin onSuccess={handleLogin} />
        <ToastHost />
      </div>
    );
  }

  const title = sub ? SUB_TITLES[sub] || '功能' : TITLES[tab];
  const displayName = getDisplayName() || session.displayName;

  return (
    <div className="m-root">
      {/* ===== 顶栏 ===== */}
      <div className="m-topbar">
        {sub ? (
          <span className="m-topbar-back" onClick={() => setSub(null)}>
            ‹ 返回
          </span>
        ) : null}
        <span className="m-topbar-title">{title}</span>
        <span className="m-topbar-right">
          <span className="m-topbar-btn m-bell" onClick={() => openSub('message')}>
            <Icon name="bell" size={18} />
            {unread > 0 ? <span className="m-bell-badge">{unread}</span> : null}
          </span>
          <span className="m-topbar-btn" onClick={onSwitchView}>
            <Icon name="monitor" size={16} />
          </span>
        </span>
      </div>

      {/* ===== 页面容器 ===== */}
      <div className="m-container">
        {sub === 'note' ? <MobileNote /> : null}
        {sub === 'article' ? <MobileArticle /> : null}
        {sub === 'product' ? <MobileProduct /> : null}
        {sub === 'files' ? <MobileFiles /> : null}
        {sub === 'message' ? <MobileMessage /> : null}
        {sub === 'mail' ? <MobileMail /> : null}
        {sub === 'profile' ? <MobileProfile /> : null}
        {sub === 'password' ? <MobilePassword /> : null}
        {sub === 'customer-add' ? (
          <MobileCustomerAdd onDone={() => { setSub(null); switchTab('customer'); }} />
        ) : null}
        {sub === 'approve-add' ? (
          <MobileApproveAdd onDone={() => { setSub(null); switchTab('approve'); }} />
        ) : null}
        {sub && !['note', 'article', 'product', 'files', 'message', 'mail', 'profile', 'password', 'customer-add', 'approve-add'].includes(sub) ? (
          <MobileSub pageKey={sub} />
        ) : null}

        {!sub && tab === 'home' ? <MobileHome onOpenSub={openSub} onSwitchTab={switchTab} /> : null}
        {!sub && tab === 'approve' ? <MobileApprove /> : null}
        {!sub && tab === 'customer' ? <MobileCustomer onOpenSub={openSub} /> : null}
        {!sub && tab === 'mine' ? (
          <MobileMine
            session={{ ...session, displayName }}
            onOpenSub={openSub}
            onSwitchTab={switchTab}
            onLogout={handleLogout}
          />
        ) : null}
      </div>

      {/* ===== 底部 4 Tab ===== */}
      <div className="m-tabbar">
        {(
          [
            ['home', '首页', 'home'],
            ['approve', '审批', 'approve'],
            ['customer', '客户', 'customer'],
            ['mine', '我的', 'user'],
          ] as [Tab, string, string][]
        ).map(([key, label, icon]) => (
          <div
            key={key}
            className={`m-tab${!sub && tab === key ? ' active' : ''}`}
            onClick={() => switchTab(key)}
          >
            <span className="m-tab-icon">
              <Icon name={icon} size={22} />
            </span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <ToastHost />
    </div>
  );
}
