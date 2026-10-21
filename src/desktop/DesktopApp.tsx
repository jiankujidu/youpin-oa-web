/**
 * 桌面端应用壳（>768px）— 1:1 对齐 oa.upingbio.com 的 PC 后台
 *
 * 菜单结构、分组名、菜单名全部取自原站后台框架页（/home/index/index）的真实菜单树：
 *   基础数据 / 企业公告 / 办公审批 / 财务管理 / 客户管理 / 售前售后问答 / 产品管理
 * 每个菜单项点击后，经 /oa-proxy 调原站**同路径的真实接口**取数（见 core/biz.ts 注册表）。
 *
 * 免登录：默认会话直接生效（后端会话由代理以固定 PHPSESSID 维持），打开即是后台。
 */
import { useCallback, useEffect, useState } from 'react';
import '../desktop/desktop.css';
import './pc.css';
import { clearSession, getDisplayName, getSession, setDisplayName, setSession } from '../core/session';
import { clearOaSession, fetchHomeStats, fetchMyName } from '../core/api';
import DesktopHome from './DesktopHome';
import DesktopApprove from './DesktopApprove';
import DesktopCustomer from './DesktopCustomer';
import DesktopFiles from './DesktopFiles';
import DesktopProduct from './DesktopProduct';
import { DesktopArticle, DesktopMail, DesktopMessage, DesktopNote } from './DesktopContent';
import { DesktopPassword, DesktopProfile, DesktopSub } from './DesktopSub';
import { DesktopAi } from './DesktopAi';
import { Icon } from '../core/icons';
import { ToastHost } from './ui';

type PageKey = string;

/** 菜单节点：可与原站一致地嵌套二级（如「财务管理 › 发票管理 › 我申请的」） */
interface MenuNode {
  key?: string;
  label: string;
  icon?: string;
  children?: MenuNode[];
}

/** ★ 与原站侧栏完全一致的菜单树（含二级父节点与顺序） */
const MENU: { group: string; icon: string; items: MenuNode[] }[] = [
  {
    group: '工作台',
    icon: 'home',
    items: [{ key: 'home', label: '工作台', icon: 'home' }],
  },
  {
    group: '基础数据',
    icon: 'file',
    items: [{ key: 'files', label: '附件管理', icon: 'file' }],
  },
  {
    group: '企业公告',
    icon: 'note',
    items: [{ key: 'note', label: '公告列表', icon: 'note' }],
  },
  {
    group: '办公审批',
    icon: 'approve',
    items: [{ key: 'approve', label: '我发起的', icon: 'approve' }],
  },
  {
    group: '财务管理',
    icon: 'finance',
    items: [
      { key: 'finance-advance', label: '预存款管理', icon: 'wallet' },
      {
        label: '抵扣券管理',
        icon: 'deduction',
        children: [
          { key: 'deduction', label: '我申请的' },
          { key: 'deduction-checked', label: '抵扣(管理专用)' },
        ],
      },
      {
        label: '保证金管理',
        icon: 'margin',
        children: [{ key: 'margin', label: '我申请的' }],
      },
      {
        label: '发票管理',
        icon: 'invoice',
        children: [
          { key: 'invoice-my', label: '我申请的' },
          { key: 'invoice-handle', label: '我处理的' },
          { key: 'finance-income', label: '到账管理(发票)' },
        ],
      },
      {
        label: '到账管理(订单)',
        icon: 'receipt',
        children: [
          { key: 'finance-order', label: '我申请的' },
          { key: 'orderapply-handle', label: '我处理的' },
        ],
      },
    ],
  },
  {
    group: '客户管理',
    icon: 'customer',
    items: [
      { key: 'customer', label: '客户列表', icon: 'customer' },
      { key: 'customer-sea', label: '公海客户', icon: 'customer' },
      { key: 'customer-trash', label: '废弃客户', icon: 'customer' },
      { key: 'contact', label: '客户联系人', icon: 'contact' },
      { key: 'chance', label: '销售机会', icon: 'chance' },
      { key: 'trace', label: '跟进记录', icon: 'trace' },
      {
        label: '订单管理',
        icon: 'order',
        children: [
          { key: 'order-my', label: '我申请的' },
          { key: 'order-handle', label: '我处理的' },
        ],
      },
      { key: 'sample', label: '样本管理', icon: 'sample' },
      {
        label: '校展管理',
        icon: 'school',
        children: [
          { key: 'school', label: '校展预名单' },
          { key: 'school-handle', label: '我处理的' },
        ],
      },
    ],
  },
  {
    group: '售前售后问答',
    icon: 'article',
    items: [
      { key: 'article', label: '售前售后查询', icon: 'article' },
      {
        label: '售后管理',
        icon: 'after',
        children: [{ key: 'after', label: '我申请的' }],
      },
      { key: 'ai', label: 'AI问答', icon: 'robot' },
    ],
  },
  {
    group: '产品管理',
    icon: 'product',
    items: [{ key: 'product', label: '产品列表', icon: 'product' }],
  },
];

/** 顶栏固定入口（原站顶栏：消息中心 / 锁屏 / 个人设置） */
const EXTRA_PAGES: MenuNode[] = [
  { key: 'message', label: '消息中心', icon: 'message' },
  { key: 'mail', label: '通讯录', icon: 'mail' },
];

/** 免登录：默认会话（后端会话由代理维持，界面无需账号密码） */
const AUTO_SESSION = { username: 'auto', displayName: '陈美龙', loginAt: Date.now() };

/** 是否为「内置固定页面」（非按 SUB_PAGES 注册表渲染的通用列表页） */
const BUILTIN = new Set([
  'home', 'approve', 'customer', 'customer-sea', 'customer-trash', 'product', 'files',
  'note', 'article', 'message', 'mail', 'profile', 'password', 'ai',
]);

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
  const [session] = useState(() => getSession() || AUTO_SESSION);
  const [page, setPage] = useState<PageKey>('home');
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState<string>(() => getDisplayName() || AUTO_SESSION.displayName);
  /** 侧边栏分组折叠（默认全部展开，与原站一致；长分组可手动收起） */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  /** 侧栏迷你模式（原站顶栏汉堡按钮） */
  const [mini, setMini] = useState(false);

  useEffect(() => {
    setSession({ ...AUTO_SESSION, loginAt: Date.now() });
    setDisplayName(AUTO_SESSION.displayName);
  }, []);

  useEffect(() => {
    // 真实后端登录人姓名（解析后台资料页）
    fetchMyName().then((n) => {
      if (n) {
        setName(n);
        setDisplayName(n);
      }
    });
    const tick = () => fetchHomeStats().then((s) => setUnread(s.unreadMsg));
    tick();
    const timer = window.setInterval(tick, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    clearOaSession();
    setMenuOpen(false);
    setPage('home');
  }, []);

  /**
   * 桌面端键盘可达性：菜单项可 Tab 聚焦，Enter / Space 激活
   * （手机端无键盘，此能力只在桌面树提供）
   */
  const keyProps = (fn: () => void) => ({
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        fn();
      }
    },
  });

  /** 渲染单个菜单节点（可展开二级） */
  const renderNode = (node: MenuNode, depth = 0) => {
    if (node.children) {
      const open = !collapsed[node.label];
      const active = node.children.some((c) => c.key === page) || node.children.some((c) => c.children?.some((x) => x.key === page));
      return (
        <div key={'g-' + node.label}>
          <div
            className={`d-nav-item d-nav-parent${active ? ' on' : ''}`}
            onClick={() => setCollapsed((c) => ({ ...c, [node.label]: !c[node.label] }))}
            title={mini ? node.label : undefined}
            {...keyProps(() => setCollapsed((c) => ({ ...c, [node.label]: !c[node.label] })))}
          >
            <span className="d-nav-ico">
              <Icon name={node.icon || 'grid'} size={17} />
            </span>
            <span>{node.label}</span>
            <span className="d-nav-arrow">{open ? '▾' : '▸'}</span>
          </div>
          {open
            ? node.children.map((c) =>
                c.children ? (
                  renderNode(c, depth + 1)
                ) : (
                  <div
                    key={c.key}
                    className={`d-nav-item d-nav-sub${page === c.key ? ' active' : ''}`}
                    onClick={() => setPage(c.key as string)}
                    title={mini ? c.label : undefined}
                    {...keyProps(() => setPage(c.key as string))}
                  >
                    <span>{c.label}</span>
                  </div>
                ),
              )
            : null}
        </div>
      );
    }
    return (
      <div
        key={node.key}
        className={`d-nav-item${page === node.key ? ' active' : ''}`}
        onClick={() => setPage(node.key as string)}
        title={mini ? node.label : undefined}
        {...keyProps(() => setPage(node.key as string))}
      >
        <span className="d-nav-ico">
          <Icon name={node.icon || 'grid'} size={17} />
        </span>
        <span>{node.label}</span>
        {node.key === 'message' && unread > 0 ? <span className="d-nav-badge">{unread}</span> : null}
      </div>
    );
  };

  /**
   * 桌面端快捷键：`/` 聚焦当前页搜索框（在输入框内输入时不拦截）
   * ——桌面端习惯（如 GitHub / Jira 的搜索快捷键），手机端不涉及
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing) return;
      const el =
        document.querySelector<HTMLInputElement>('.pc-toolbar input.pc-input') ||
        document.querySelector<HTMLInputElement>('.pc-toolbar input') ||
        document.querySelector<HTMLInputElement>('.d-search input');
      if (el) {
        e.preventDefault();
        el.focus();
        el.select?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** 当前页面标题（用于内容区顶部标签条） */
  const pageTitle = (() => {
    for (const g of MENU) {
      for (const it of g.items) {
        if (it.key === page) return it.label;
        for (const c of it.children || []) {
          if (c.key === page) return c.label;
        }
      }
    }
    const ex = EXTRA_PAGES.find((x) => x.key === page);
    if (ex) return ex.label;
    return page === 'home' ? '工作台' : page === 'profile' ? '个人资料' : page === 'password' ? '修改密码' : '工作台';
  })();

  return (
    <div className={`d-root${mini ? ' mini' : ''}`}>
      {/* ===== 侧边栏（与原站菜单树一致）===== */}
      <aside className="d-sidebar">
        <div className="d-brand" onClick={() => setPage('home')}>
          <span className="d-brand-logo">
            <img src="/oa/login_logo.png" alt="优品生物" />
            <span className="d-brand-name">
              优品生物<em>UpingBio</em>
            </span>
          </span>
        </div>
        <nav className="d-nav">
          {MENU.map((g) => {
            /* 与原站一致：分组名与唯一子项同名时（工作台）显示为单级，否则显示「分组 › 子项」两级 */
            const node: MenuNode =
              g.items.length === 1 && !g.items[0].children && g.items[0].label === g.group
                ? { key: g.items[0].key, label: g.group, icon: g.icon }
                : { label: g.group, icon: g.icon, children: g.items };
            return renderNode(node);
          })}
          <div className="d-nav-sep" />
          {EXTRA_PAGES.map((it) => renderNode(it))}
        </nav>
      </aside>

      {/* ===== 主区 ===== */}
      <div className="d-main">
        <header className="d-topbar">
          <span className="d-icon-btn" title="收起 / 展开侧栏" onClick={() => setMini((v) => !v)}>
            <Icon name="grid" size={17} />
          </span>
          <span className="d-icon-btn" title="皮肤">
            <Icon name="monitor" size={17} />
          </span>
          <span className="d-icon-btn" title="语言">
            <Icon name="location" size={17} />
          </span>
          <div className="d-topbar-right">
            <span className="d-icon-btn" title="刷新" onClick={() => location.reload()}>
              <Icon name="refresh" size={17} />
            </span>
            <span
              className="d-icon-btn"
              title="全屏"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen();
              }}
            >
              <Icon name="monitor" size={17} />
            </span>
            <span className="d-icon-btn" title="个人设置" onClick={() => setPage('profile')}>
              <Icon name="settings" size={17} />
            </span>
            <span className="d-icon-btn" title="锁屏" onClick={handleLogout}>
              <Icon name="lock" size={17} />
            </span>
            <span className="d-icon-btn" title="消息中心" onClick={() => setPage('message')}>
              <Icon name="bell" size={17} />
              {unread > 0 ? <span className="d-badge">{unread}</span> : null}
            </span>
            <div className="d-user" onClick={() => setMenuOpen((v) => !v)}>
              <span className="d-avatar">{name.slice(0, 1)}</span>
              <span className="d-user-name">{name}</span>
              <Icon name="chevronDown" size={13} />
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
              <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); onSwitchView(); }}>
                <Icon name="phone" size={15} /> 手机版
              </div>
              {isForced ? (
                <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); onResetView(); }}>
                  <Icon name="refresh" size={15} /> 恢复自动判定
                </div>
              ) : null}
              <div className="d-user-menu-item danger" onClick={handleLogout}>
                <Icon name="logout" size={15} /> 退出登录
              </div>
            </div>
          ) : null}
        </header>

        {/* ===== 内容区：页面标签条 + 页面 ===== */}
        <main className="d-content">
          <div className="d-page-tabs">
            <span className="d-page-tab on">
              <i style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-primary)', display: 'inline-block' }} />
              {pageTitle}
            </span>
          </div>
          <div className="d-wrap">
            {page === 'home' ? <DesktopHome onNavigate={setPage} userName={name} /> : null}
            {page === 'approve' ? <DesktopApprove /> : null}
            {page === 'customer' ? <DesktopCustomer initialType={1} /> : null}
            {page === 'customer-sea' ? <DesktopCustomer initialType={2} /> : null}
            {page === 'customer-trash' ? <DesktopCustomer initialType={3} /> : null}
            {page === 'product' ? <DesktopProduct /> : null}
            {page === 'files' ? <DesktopFiles /> : null}
            {page === 'note' ? <DesktopNote /> : null}
            {page === 'article' ? <DesktopArticle /> : null}
            {page === 'message' ? <DesktopMessage /> : null}
            {page === 'mail' ? <DesktopMail /> : null}
            {page === 'ai' ? <DesktopAi /> : null}
            {page === 'profile' ? <DesktopProfile /> : null}
            {page === 'password' ? <DesktopPassword /> : null}
            {!BUILTIN.has(page) ? <DesktopSub pageKey={page} /> : null}
          </div>
        </main>
      </div>

      <ToastHost />
    </div>
  );
}
