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
import { clearOaSession, fetchHomeStats, fetchMyProfile } from '../core/api';
import { CONFIG } from '../core/config';
import DesktopHome from './DesktopHome';
import DesktopApprove from './DesktopApprove';
import DesktopCustomer from './DesktopCustomer';
import DesktopFiles from './DesktopFiles';
import DesktopProduct from './DesktopProduct';
import DesktopQuote from './DesktopQuote';
import { DesktopArticle, DesktopMail, DesktopMessage, DesktopNote } from './DesktopContent';
import { DesktopPassword, DesktopProfile, DesktopSub } from './DesktopSub';
import DesktopTable from './DesktopTable';
import { pageSpec } from '../core/pageSpecs';
import { DesktopAccounts } from './DesktopAccounts';
import {
  getCurrentAccount,
  listAccounts,
  setCurrentAccount,
  subscribeAccounts,
  type OaAccount,
} from '../core/accounts';
import { DesktopAi } from './DesktopAi';
import { Icon } from '../core/icons';
import { toast } from '../core/util';
import { ToastHost } from './ui';

type PageKey = string;

/** 菜单节点：与原站一致地嵌套二级/三级（如「财务管理 › 发票管理 › 我处理的」）。
 *  icon 存原站 iconfont 类名（public/oa/iconfont/iconfont.css，与原站同一字体文件）。 */
interface MenuNode {
  key?: string;
  label: string;
  icon?: string;
  children?: MenuNode[];
}

/** ★ 与原站侧栏完全一致的菜单树（含二级父节点与顺序、三级嵌套；图标类名同原站） */
const MENU: { group: string; icon: string; items: MenuNode[] }[] = [
  {
    group: '工作台',
    icon: 'icon-xueshuguanli',
    items: [{ key: 'home', label: '工作台', icon: 'icon-xueshuguanli' }],
  },
  {
    group: '基础数据',
    icon: 'icon-hetongshezhi',
    items: [{ key: 'files', label: '附件管理', icon: 'icon-hetongshezhi' }],
  },
  {
    group: '企业公告',
    icon: 'icon-zhaoshengbaobiao',
    items: [{ key: 'note', label: '公告列表', icon: 'icon-zhaoshengbaobiao' }],
  },
  {
    group: '办公审批',
    icon: 'icon-shenpishezhi',
    items: [{ key: 'approve', label: '我发起的', icon: 'icon-shenpishezhi' }],
  },
  {
    group: '财务管理',
    icon: 'icon-yuangongtidian',
    items: [
      { key: 'finance-advance', label: '预存款管理', icon: 'icon-yuangongtidian' },
      {
        label: '抵扣券管理',
        icon: 'icon-yuangongtidian',
        children: [
          { key: 'deduction', label: '我申请的' },
          { key: 'deduction-checked', label: '抵扣(管理专用)' },
        ],
      },
      {
        label: '保证金管理',
        icon: 'icon-yuangongtidian',
        children: [{ key: 'margin', label: '我申请的' }],
      },
      {
        label: '发票管理',
        icon: 'icon-yuangongtidian',
        children: [
          { key: 'invoice-my', label: '我申请的' },
          { key: 'invoice-handle', label: '我处理的' },
        ],
      },
      { key: 'finance-income', label: '到账管理(发票)', icon: 'icon-yuangongtidian' },
      {
        label: '到账管理(订单)',
        icon: 'icon-yuangongtidian',
        children: [
          { key: 'finance-order', label: '我申请的' },
          { key: 'orderapply-handle', label: '我处理的' },
        ],
      },
    ],
  },
  {
    group: '客户管理',
    icon: 'icon-kehuguanli',
    items: [
      { key: 'customer', label: '客户列表', icon: 'icon-kehuguanli' },
      { key: 'customer-sea', label: '公海客户', icon: 'icon-kehuguanli' },
      { key: 'customer-trash', label: '废弃客户', icon: 'icon-kehuguanli' },
      { key: 'contact', label: '客户联系人', icon: 'icon-kehuguanli' },
      { key: 'chance', label: '销售机会', icon: 'icon-kehuguanli' },
      { key: 'trace', label: '跟进记录', icon: 'icon-kehuguanli' },
      {
        label: '订单管理',
        icon: 'icon-kehuguanli',
        children: [
          { key: 'order-my', label: '我申请的' },
          { key: 'order-handle', label: '我处理的' },
          { key: 'sample', label: '样本管理' },
        ],
      },
      {
        label: '校展管理',
        icon: 'icon-kehuguanli',
        children: [
          { key: 'school', label: '校展预名单' },
          { key: 'school-handle', label: '我处理的' },
        ],
      },
    ],
  },
  {
    group: '售前售后问答',
    icon: 'icon-kecheng',
    items: [
      { key: 'article', label: '售前售后查询', icon: 'icon-kecheng' },
      {
        label: '售后管理',
        icon: 'icon-kecheng',
        children: [{ key: 'after', label: '我申请的' }],
      },
      { key: 'ai', label: 'AI问答', icon: 'icon-kecheng' },
    ],
  },
  {
    group: '产品管理',
    icon: 'icon-chanpinshezhi',
    items: [
      { key: 'product', label: '产品列表', icon: 'icon-chanpinshezhi' },
      // 本系统新增：产品收藏夹 + 报价单（原站无此模块，数据存本机）
      { key: 'quote', label: '收藏夹与报价', icon: 'icon-chanpinshezhi' },
    ],
  },
];

/** 顶栏固定入口（原站顶栏：消息中心 / 通讯录） */
const EXTRA_PAGES: MenuNode[] = [{ key: 'mail', label: '通讯录', icon: 'icon-huamingce' }];

/** 免登录：默认会话（后端会话由代理维持，界面无需账号密码）。
 *  多账号体系：displayName 取当前选中账号标签；无账号时为固定会话模式（旧行为）。 */
const AUTO_SESSION = { username: 'auto', displayName: '', loginAt: Date.now() };

/** 是否为「内置固定页面」（非按 SUB_PAGES 注册表渲染的通用列表页） */
const BUILTIN = new Set([
  'home', 'approve', 'customer', 'customer-sea', 'customer-trash', 'product', 'quote', 'files',
  'note', 'article', 'message', 'mail', 'profile', 'password', 'ai', 'accounts',
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
  if (page === 'accounts') return '账号管理';
  return '工作台';
}

/** 页签项 */
interface Tab {
  key: PageKey;
  title: string;
}

export default function DesktopApp({
  breakpoint,
}: {
  breakpoint: number;
}) {
  const [session] = useState(() => getSession() || AUTO_SESSION);
  /** 多页签（原站 layui tab：每开一页一个页签，可关闭，保活） */
  const [tabs, setTabs] = useState<Tab[]>([{ key: 'home', title: '工作台' }]);
  const [active, setActive] = useState<PageKey>('home');
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  /** 多账号：当前账号 + 账号列表（顶栏账号 chip 与切换下拉用） */
  const [accounts, setAccounts] = useState<OaAccount[]>(() => listAccounts());
  const [currentAcc, setCurrentAcc] = useState<OaAccount | null>(() => getCurrentAccount());
  const [name, setName] = useState<string>(
    // 多账号模式：当前账号标签优先（可能是用户自定义备注）；
    // 无账号（固定会话旧模式）：沿用持久化的登录人名
    () => getCurrentAccount()?.label || getDisplayName() || 'OA用户',
  );
  /** 当前登录人头像（原站 /storage/avatars/...，经代理访问） */
  const [avatar, setAvatar] = useState('');
  /** 侧栏分组折叠：与原站 layui-nav-tree 行为一致 —— 默认全部收起，
   *   仅当前页所在链路自动展开（等价原站 layui-nav-itemed）；用户点过之后以点击态为准。 */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  /** 节点（含子孙）是否命中当前页 */
  const hasActiveDescendant = useCallback(
    (node: MenuNode): boolean =>
      !!node.children?.some((c) => c.key === active || hasActiveDescendant(c)),
    [active],
  );
  /** 节点是否展开：未点击过 → 仅当前页链路自动展开；点击过 → 用户态 */
  const isGroupOpen = (node: MenuNode): boolean => {
    const explicit = collapsed[node.label];
    if (explicit !== undefined) return explicit;
    return hasActiveDescendant(node);
  };
  /** 侧边伸缩（原站顶栏第一个按钮） */
  const [mini, setMini] = useState(false);
  /** 页签右键菜单 */
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; key: PageKey } | null>(null);
  const tabMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const acc = getCurrentAccount();
    setSession({ ...AUTO_SESSION, displayName: acc?.label || '', loginAt: Date.now() });
    if (acc?.label) {
      setDisplayName(acc.label);
      setName(acc.label);
    }
    // 账号增删/切换时同步顶栏
    return subscribeAccounts(() => {
      setAccounts(listAccounts());
      const cur = getCurrentAccount();
      setCurrentAcc(cur);
      if (cur?.label) setName(cur.label);
    });
  }, []);

  useEffect(() => {
    // 真实后端登录人资料（解析后台资料页，随当前账号会话取该账号的登录人头像与姓名）。
    // 多账号模式下顶栏 chip 仍以账号标签优先显示；取到真实姓名/头像后补充展示
    //（原站顶栏就是真实登录人「陈美龙」+ 头像，不是账号备注）。
    fetchMyProfile().then((p) => {
      if (p.name) {
        setName(p.name);
        setDisplayName(p.name);
      }
      if (p.avatar) setAvatar(p.avatar);
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
    // 多账号：退出 = 清除当前账号选择，回落「固定会话」免登录模式（旧行为）
    setCurrentAccount('');
    setMenuOpen(false);
    closeAll();
  }, [closeAll]);

  /** 切换账号（顶栏下拉）：写入选择后整页刷新，全站数据按新账号会话重取 */
  const switchAccount = useCallback((acc: OaAccount) => {
    if (acc.id === currentAcc?.id) {
      setMenuOpen(false);
      return;
    }
    setCurrentAccount(acc.id);
    setMenuOpen(false);
    toast(`已切换到账号「${acc.label}」，正在刷新数据…`);
    window.setTimeout(() => window.location.reload(), 600);
  }, [currentAcc]);

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

  /** 渲染单个菜单节点（可展开二级/三级；与原站一致：仅一级项带 iconfont 图标） */
  const renderNode = (node: MenuNode, depth = 0) => {
    if (node.children) {
      const open = isGroupOpen(node);
      const activeGroup = hasActiveDescendant(node);
      return (
        <div key={'g-' + node.label}>
          <div
            className={`d-nav-item d-nav-parent${activeGroup ? ' on' : ''}`}
            onClick={() => setCollapsed((c) => ({ ...c, [node.label]: !open }))}
            title={mini ? node.label : undefined}
            {...keyProps(() => setCollapsed((c) => ({ ...c, [node.label]: !open })))}
          >
            {depth === 0 ? (
              <span className="d-nav-ico">
                <i className={`iconfont ${node.icon || ''}`} />
              </span>
            ) : null}
            <span>{node.label}</span>
            <span className="d-nav-arrow">{open ? '▾' : '▸'}</span>
          </div>
          {open ? (
            <div className="d-nav-child">
              {node.children.map((c) => renderNode(c, depth + 1))}
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <div
        key={node.key}
        data-key={node.key}
        className={`d-nav-item${depth > 0 ? ' d-nav-sub' : ''}${active === node.key ? ' active' : ''}`}
        onClick={() => openTab(node.key as string)}
        title={mini ? node.label : undefined}
        {...keyProps(() => openTab(node.key as string))}
      >
        {depth === 0 ? (
          <span className="d-nav-ico">
            <i className={`iconfont ${node.icon || ''}`} />
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
        return <DesktopProduct onNavigate={openTab} />;
      case 'quote':
        return <DesktopQuote />;
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
      case 'accounts':
        return <DesktopAccounts />;
      default:
        // 有原站表格规格的页签 → 通用真实表格（列/接口/行操作 1:1 对齐原站）
        return pageSpec(page) ? <DesktopTable specKey={page} /> : <DesktopSub pageKey={page} />;
    }
  };

  return (
    <div className={`d-root${mini ? ' mini' : ''}`}>
      {/* ===== 侧边栏（原站 layui-side-white：白底 180px）===== */}
      <aside className="d-sidebar">
        <div className="d-brand" onClick={() => openTab('home')} title="优品OA">
          {/* 原站 layui-logo：syslogo.png 高 40px 居中（白底）。
              用相对路径：三入口部署（根路径 / 子路径 / Pages 函数同源）都能正确解析 */}
          <img
            src="oa/syslogo.png"
            alt="优品OA"
            className="d-brand-logo-img"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
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
        <header className="d-topbar">
          <div className="d-topbar-left">
            {/* 顶栏（原站 layui-header 50px：左 伸缩/清缓存，右 刷新/全屏/主题/锁屏/消息/头像） */}
            <span className="d-icon-btn" title="侧边伸缩" onClick={() => setMini((v) => !v)}>
              <Icon name="grid" size={18} />
            </span>
            <span className="d-icon-btn" title="清空缓存" onClick={handleCache}>
              <Icon name="refresh" size={18} />
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
            <div className="d-user" onClick={() => setMenuOpen((v) => !v)} title="当前账号（点击切换/管理）">
              {avatar ? (
                <img
                  className="d-avatar-img"
                  src={avatar.startsWith('/') ? `${CONFIG.oaProxy}${avatar}` : avatar}
                  alt={name || '头像'}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : null}
              <span className="d-avatar" style={avatar ? { display: 'none' } : undefined}>
                {(name || 'U').slice(0, 1)}
              </span>
              <cite className="d-user-name">{name || '未选择账号'}</cite>
              {accounts.length > 1 ? <i className="d-user-caret">▾</i> : null}
            </div>
          </div>
          {menuOpen ? (
            <div className="d-user-menu" onMouseLeave={() => setMenuOpen(false)}>
              {accounts.length > 1 ? (
                <>
                  <div className="d-user-menu-title">切换账号</div>
                  {accounts.map((a) => (
                    <div
                      key={a.id}
                      className={`d-user-menu-item${a.id === currentAcc?.id ? ' on' : ''}`}
                      onClick={() => switchAccount(a)}
                    >
                      <span className="d-avatar" style={{ width: 18, height: 18, fontSize: 10, marginRight: 8 }}>
                        {(a.label || 'U').slice(0, 1)}
                      </span>
                      {a.label}
                      {a.id === currentAcc?.id ? <i style={{ marginLeft: 'auto', color: 'var(--c-primary)' }}>✓</i> : null}
                    </div>
                  ))}
                  <div className="d-user-menu-split" />
                </>
              ) : null}
              <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); openTab('accounts'); }}>
                账号管理
              </div>
              <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); openTab('profile'); }}>
                基本资料
              </div>
              <div className="d-user-menu-item" onClick={() => { setMenuOpen(false); openTab('password'); }}>
                修改密码
              </div>
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
