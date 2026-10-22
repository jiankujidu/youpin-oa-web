/**
 * 桌面端应用壳（>768px）— 1:1 对齐 oa.upingbio.com 的 PC 后台框架页
 *
 * 结构完全照抄原站 /home/index/index（layui 后台框架）：
 *   - 顶栏 50px：左（侧边伸缩 / 清空缓存 / 前台首页）+ 右（刷新 / 全屏 / 主题 / 锁屏 / 消息中心 / 头像）
 *   - 侧栏 180px 白底（layui-side-white）：logo 区 49px + 多级菜单（42px 项高、二级 44px / 三级 58px 缩进）
 *   - 页签栏 42px：多页签可关闭，选中顶部 3px #1A75FF；右键菜单（关闭当前/其它/全部）
 *   - 内容区：.p-page 18px 15px 0；页签保活（与原站 iframe 多页签行为一致）
 *
 * 菜单树、分组名、菜单名全部取自原站框架页真实菜单树；数据经 /oa-proxy 调原站同路径接口。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { toast } from '../core/util';
import { ToastHost } from './ui';

type PageKey = string;

/** 菜单节点：与原站一致地嵌套二级/三级（如「财务管理 › 发票管理 › 我申请的」） */
interface MenuNode {
  key?: string;
  label: string;
  icon?: string;
  children?: MenuNode[];
}

/** ★ 与原站侧栏完全一致的菜单树（含二级父节点与顺序、三级嵌套） */
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
        ],
      },
      { key: 'finance-income', label: '到账管理(发票)', icon: 'receipt' },
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
      { key: 'article', label: '售前售后查询', icon: 'article' },
      {
        label: '售后管理',
        icon: 'after',
        children: [{ key: 'after', label: '我申请的' }],
      },
    ],
  },
  {
    group: '售前售后问答',
    icon: 'article',
    items: [{ key: 'ai', label: 'AI问答', icon: 'robot' }],
  },
  {
    group: '产品管理',
    icon: 'product',
    items: [{ key: 'product', label: '产品列表', icon: 'product' }],
  },
];

/** 顶栏固定入口（原站顶栏：消息中心 / 通讯录） */
const EXTRA_PAGES: MenuNode[] = [{ key: 'mail', label: '通讯录', icon: 'mail' }];

/** 免登录：默认会话（后端会话由代理维持，界面无需账号密码） */
const AUTO_SESSION = { username: 'auto', displayName: '陈美龙', loginAt: Date.now() };

/** 是否为「内置固定页面」（非按 SUB_PAGES 注册表渲染的通用列表页） */
const BUILTIN = new Set([
  'home', 'approve', 'customer', 'customer-sea', 'customer-trash', 'product', 'files',
  'note', 'article', 'message', 'mail', 'profile', 'password', 'ai',
]);

/** 页面 key → 标题（遍历菜单树 + 顶栏入口 + 固定页） */
function resolveTitle(page: PageKey): string {
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
  if (page === 'home') return '工作台';
  if (page === 'profile') return '基本资料';
  if (page === 'password') return '修改密码';
  if (page === 'message') return '消息中心';
  return '工作台';
}

/** 页签项 */
interface Tab {
  key: PageKey;
  title: string;
}

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
  /** 多页签（原站 layui tab：每开一页一个页签，可关闭，保活） */
  const [tabs, setTabs] = useState<Tab[]>([{ key: 'home', title: '工作台' }]);
  const [active, setActive] = useState<PageKey>('home');
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState<string>(() => getDisplayName() || AUTO_SESSION.displayName);
  /** 侧栏分组折叠（默认全部展开，与原站一致） */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  /** 侧边伸缩（原站顶栏第一个按钮） */
  const [mini, setMini] = useState(false);
  /** 页签右键菜单 */
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; key: PageKey } | null>(null);
  const tabMenuRef = useRef<HTMLDivElement>(null);

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

  /** 打开页签：已存在则激活，否则新增（原站 tab-a 行为） */
  const openTab = useCallback((key: PageKey) => {
    setTabs((ts) => (ts.some((t) => t.key === key) ? ts : [...ts, { key, title: resolveTitle(key) }]));
    setActive(key);
  }, []);

  const closeTab = useCallback((key: PageKey) => {
    setTabs((ts) => {
      const idx = ts.findIndex((t) => t.key === key);
      const next = ts.filter((t) => t.key !== key);
      if (!next.length) return [{ key: 'home', title: '工作台' }];
      setActive((cur) => (cur === key ? next[Math.min(idx, next.length - 1)].key : cur));
      return next;
    });
  }, []);

  const closeOthers = useCallback((key: PageKey) => {
    setTabs((ts) => ts.filter((t) => t.key === key || t.key === 'home'));
    setActive(key);
  }, []);

  const closeAll = useCallback(() => {
    setTabs([{ key: 'home', title: '工作台' }]);
    setActive('home');
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    clearOaSession();
    setMenuOpen(false);
    closeAll();
  }, [closeAll]);

  /** 清空缓存（原站 gg-event=cache 调 /api/index/cache_clear；前端清界面缓存即可） */
  const handleCache = useCallback(() => {
    try {
      window.localStorage.removeItem('yp_oa_cache_v');
    } catch { /* ignore */ }
    toast('缓存已清空');
  }, []);

  /** 全屏切换（原站 gg-event=screen） */
  const toggleScreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }, []);

  /** 锁屏（原站跳 /home/login/lock.html；此处为遮罩锁屏态） */
  const [locked, setLocked] = useState(false);

  /**
   * 桌面端键盘可达性：菜单项可 Tab 聚焦，Enter / Space 激活
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

  /** 页签右键菜单：点击其它处关闭 */
  useEffect(() => {
    if (!tabMenu) return;
    const close = () => setTabMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [tabMenu]);

  /** 桌面端快捷键：`/` 聚焦当前页搜索框 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing) return;
      const el =
        document.querySelector<HTMLInputElement>('.pc-toolbar input.pc-input') ||
        document.querySelector<HTMLInputElement>('.pc-toolbar input');
      if (el) {
        e.preventDefault();
        el.focus();
        el.select?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** 渲染单个菜单节点（可展开二级/三级） */
  const renderNode = (node: MenuNode, depth = 0) => {
    if (node.children) {
      const open = !collapsed[node.label];
      const activeGroup =
        node.children.some((c) => c.key === active) || node.children.some((c) => c.children?.some((x) => x.key === active));
      return (
        <div key={'g-' + node.label}>
          <div
            className={`d-nav-item d-nav-parent${activeGroup ? ' on' : ''}`}
            onClick={() => setCollapsed((c) => ({ ...c, [node.label]: !c[node.label] }))}
            title={mini ? node.label : undefined}
            {...keyProps(() => setCollapsed((c) => ({ ...c, [node.label]: !c[node.label] })))}
          >
            <span className="d-nav-ico">
              <Icon name={node.icon || 'grid'} size={16} />
            </span>
            <span>{node.label}</span>
            <span className="d-nav-arrow">{open ? '▾' : '▸'}</span>
          </div>
          {open ? (
            <div className="d-nav-child">
              {node.children.map((c) => (c.children ? renderNode(c, depth + 1) : renderNode(c, depth + 1)))}
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <div
        key={node.key}
        className={`d-nav-item${depth > 0 ? ' d-nav-sub' : ''}${active === node.key ? ' active' : ''}`}
        onClick={() => openTab(node.key as string)}
        title={mini ? node.label : undefined}
        {...keyProps(() => openTab(node.key as string))}
      >
        {depth === 0 ? (
          <span className="d-nav-ico">
            <Icon name={node.icon || 'grid'} size={16} />
          </span>
        ) : null}
        <span>{node.label}</span>
        {node.key === 'message' && unread > 0 ? <span className="d-nav-badge">{unread}</span> : null}
      </div>
    );
  };

  /** 渲染某个页签对应的页面内容（保活：隐藏不卸载，与原站 iframe 行为一致） */
  const renderPage = (page: PageKey) => {
    switch (page) {
      case 'home':
        return <DesktopHome onNavigate={openTab} userName={name} />;
      case 'approve':
        return <DesktopApprove />;
      case 'customer':
        return <DesktopCustomer initialType={1} />;
      case 'customer-sea':
        return <DesktopCustomer initialType={2} />;
      case 'customer-trash':
        return <DesktopCustomer initialType={3} />;
      case 'product':
        return <DesktopProduct />;
      case 'files':
        return <DesktopFiles />;
      case 'note':
        return <DesktopNote />;
      case 'article':
        return <DesktopArticle />;
      case 'message':
        return <DesktopMessage />;
      case 'mail':
        return <DesktopMail />;
      case 'ai':
        return <DesktopAi />;
      case 'profile':
        return <DesktopProfile />;
      case 'password':
        return <DesktopPassword />;
      default:
        return <DesktopSub pageKey={page} />;
    }
  };

  return (
    <div className={`d-root${mini ? ' mini' : ''}`}>
      {/* ===== 侧边栏（原站 layui-side-white：白底 180px）===== */}
      <aside className="d-sidebar">
        <div className="d-brand" onClick={() => openTab('home')} title="优品OA">
          <span className="d-brand-logo">
            <img src="/oa/login_logo.png" alt="优品OA" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span>优品OA</span>
          </span>
        </div>
        <nav className="d-nav">
          {MENU.map((g) => {
            /* 与原站一致：分组名与唯一子项同名时（工作台）显示为单级，否则「分组 › 子项」两级 */
            const node: MenuNode =
              g.items.length === 1 && !g.items[0].children && g.items[0].label === g.group
                ? { key: g.items[0].key, label: g.group, icon: g.icon }
                : { label: g.group, icon: g.icon, children: g.items };
            return renderNode(node);
          })}
          {EXTRA_PAGES.map((it) => renderNode(it))}
        </nav>
      </aside>

      {/* ===== 主区 ===== */}
      <div className="d-main">
        {/* 顶栏（原站 layui-header 50px：左 伸缩/清缓存/前台首页，右 刷新/全屏/主题/锁屏/消息/头像） */}
        <header className="d-topbar">
          <div className="d-topbar-left">
            <span className="d-icon-btn" title="侧边伸缩" onClick={() => setMini((v) => !v)}>
              <Icon name="grid" size={18} />
            </span>
            <span className="d-icon-btn" title="清空缓存" onClick={handleCache}>
              <Icon name="refresh" size={18} />
            </span>
            <span className="d-icon-btn" title="前台首页" onClick={onSwitchView}>
              <Icon name="monitor" size={18} />
            </span>
          </div>
          <div className="d-topbar-right">
            <span className="d-icon-btn" title="刷新页面" onClick={() => openTab(active)}>
              <Icon name="refresh" size={18} />
            </span>
            <span className="d-icon-btn" title="切换全屏" onClick={toggleScreen}>
              <Icon name="monitor" size={18} />
            </span>
            <span className="d-icon-btn" title="切换主题" onClick={() => toast('主题切换为原站功能，当前固定原站默认主题')}>
              <Icon name="settings" size={18} />
            </span>
            <span className="d-icon-btn" title="锁屏" onClick={() => setLocked(true)}>
              <Icon name="lock" size={18} />
            </span>
            <span className="d-icon-btn" title="消息中心" onClick={() => openTab('message')}>
              <Icon name="bell" size={18} />
              {unread > 0 ? <span className="d-badge">{unread}</span> : null}
            </span>
            <div className="d-user" onClick={() => setMenuOpen((v) => !v)}>
              <span className="d-avatar">{name.slice(0, 1)}</span>
              <cite className="d-user-name">{name}</cite>
            </div>
          </div>
          {menuOpen ? (
            <div className="d-user-menu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); openTab('profile'); }}>
                基本资料
              </div>
              <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); openTab('password'); }}>
                修改密码
              </div>
              <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); onSwitchView(); }}>
                手机版
              </div>
              {isForced ? (
                <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); onResetView(); }}>
                  恢复自动判定
                </div>
              ) : null}
              <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); handleLogout(); }}>
                退出
              </div>
            </div>
          ) : null}
        </header>

        {/* ===== 页签栏（原站 layui-tab 42px：多页签可关闭、选中顶部 3px 蓝、右键菜单） ===== */}
        <div className="d-page-tabs">
          {tabs.map((t) => (
            <span
              key={t.key}
              className={`d-page-tab${t.key === active ? ' on' : ''}`}
              onClick={() => setActive(t.key)}
              onContextMenu={(e) => {
                e.preventDefault();
                setTabMenu({ x: e.clientX, y: e.clientY, key: t.key });
              }}
              title={t.title}
            >
              {t.title}
              {t.key !== 'home' ? (
                <i
                  className="d-page-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.key);
                  }}
                >
                  ✕
                </i>
              ) : null}
            </span>
          ))}
        </div>

        {/* 页签右键菜单（原站：关闭当前 / 关闭其它 / 关闭全部） */}
        {tabMenu ? (
          <div
            ref={tabMenuRef}
            className="d-user-menu"
            style={{ top: tabMenu.y + 2, left: tabMenu.x, right: 'auto', position: 'fixed', minWidth: 96 }}
          >
            <div className="d-user-menu-item" onClick={() => { if (tabMenu.key !== 'home') closeTab(tabMenu.key); setTabMenu(null); }}>
              关闭当前
            </div>
            <div className="d-user-menu-item" onClick={() => { closeOthers(tabMenu.key); setTabMenu(null); }}>
              关闭其它
            </div>
            <div className="d-user-menu-item" onClick={() => { closeAll(); setTabMenu(null); }}>
              关闭全部
            </div>
          </div>
        ) : null}

        {/* ===== 内容区：所有已打开页签保活渲染（隐藏不卸载） ===== */}
        <main className="d-content">
          <div className="d-wrap">
            {tabs.map((t) => (
              <div key={t.key} style={t.key === active ? undefined : { display: 'none' }}>
                {renderPage(t.key)}
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* 锁屏遮罩（原站 /home/login/lock.html 的对应功能） */}
      {locked ? (
        <div className="d-mask" onClick={() => setLocked(false)} style={{ zIndex: 90, cursor: 'pointer' }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div className="d-avatar" style={{ width: 64, height: 64, fontSize: 26, margin: '0 auto 12px' }}>{name.slice(0, 1)}</div>
            <div style={{ fontSize: 18, marginBottom: 8 }}>{name}</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>已锁屏 · 点击任意处解锁</div>
          </div>
        </div>
      ) : null}

      <ToastHost />
    </div>
  );
}
