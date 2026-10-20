/**
 * 手机端首页 — 复刻 app.js renderHome()
 * 结构顺序：快捷审批宫格 → 办公入口宫格 → 我的待办卡片
 */
import { useEffect, useState } from 'react';
import { fetchHomeStats } from '../core/api';

/** 快捷审批 8 项（APPROVE_TYPES，app.js） */
const QUICK_APPROVE: [number, string, string][] = [
  [1, '请假', '🏖'],
  [2, '出差', '✈'],
  [3, '外出', '🏃'],
  [4, '加班', '⏰'],
  [15, '采购', '🛒'],
  [7, '维修', '🔧'],
  [9, '用章', '🔏'],
  [10, '用车', '🚗'],
];

/** 办公入口（对齐 app.js 的 entries 顺序与图标） */
const ENTRIES: { key: string; icon: string; name: string; kind: 'sub' | 'tab' }[] = [
  { key: 'note', icon: '📢', name: '企业公告', kind: 'sub' },
  { key: 'article', icon: '💬', name: '问答知识', kind: 'sub' },
  { key: 'product', icon: '🧪', name: '产品管理', kind: 'sub' },
  { key: 'files', icon: '📁', name: '附件管理', kind: 'sub' },
  { key: 'message', icon: '✉️', name: '消息中心', kind: 'sub' },
  { key: 'mail', icon: '📇', name: '通讯录', kind: 'sub' },
  { key: 'approve', icon: '📝', name: '发起审批', kind: 'tab' },
  { key: 'customer', icon: '👥', name: '客户列表', kind: 'tab' },
  { key: 'order-my', icon: '📦', name: '我的订单', kind: 'sub' },
  { key: 'sample', icon: '🧫', name: '样本管理', kind: 'sub' },
  { key: 'school', icon: '🏫', name: '校展管理', kind: 'sub' },
  { key: 'after', icon: '🔨', name: '售后管理', kind: 'sub' },
  { key: 'contact', icon: '👤', name: '客户联系人', kind: 'sub' },
  { key: 'chance', icon: '🎯', name: '销售机会', kind: 'sub' },
  { key: 'trace', icon: '📝', name: '跟进记录', kind: 'sub' },
  { key: 'customer-add', icon: '➕', name: '新增客户', kind: 'sub' },
];

export default function MobileHome({
  onOpenSub,
  onSwitchTab,
}: {
  onOpenSub: (key: string) => void;
  onSwitchTab: (tab: 'home' | 'approve' | 'customer' | 'mine') => void;
}) {
  const [stats, setStats] = useState({ pendingApprove: 0, myCustomer: 0, monthOrder: 0, monthAmount: '0.00', unreadMsg: 0 });

  useEffect(() => {
    let alive = true;
    fetchHomeStats().then((s) => {
      if (alive) setStats(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      {/* ===== 快捷审批（4 列宫格）===== */}
      <div className="m-section-title">快捷审批</div>
      <div className="m-grid">
        {QUICK_APPROVE.map(([, name, icon]) => (
          <div
            key={name}
            className="m-grid-item"
            onClick={() => onSwitchTab('approve')}
          >
            <span className="m-gi-icon">{icon}</span>
            <span className="m-gi-text">{name}</span>
          </div>
        ))}
      </div>

      {/* ===== 办公入口（4 列宫格）===== */}
      <div className="m-section-title">办公入口</div>
      <div className="m-grid">
        {ENTRIES.map((e) => (
          <div
            key={e.key}
            className="m-grid-item"
            onClick={() => (e.kind === 'tab' ? onSwitchTab(e.key as 'approve' | 'customer') : onOpenSub(e.key))}
          >
            <span className="m-gi-icon">{e.icon}</span>
            <span className="m-gi-text">{e.name}</span>
          </div>
        ))}
      </div>

      {/* ===== 我的待办 ===== */}
      <div className="m-section-title">我的待办</div>
      <div className="m-stat-row">
        <div className="m-stat-card">
          <div className="m-stat-num">{stats.pendingApprove}</div>
          <div className="m-stat-label">待审审批</div>
        </div>
        <div className="m-stat-card">
          <div className="m-stat-num">{stats.myCustomer}</div>
          <div className="m-stat-label">我的客户</div>
        </div>
        <div className="m-stat-card">
          <div className="m-stat-num">{stats.monthOrder}</div>
          <div className="m-stat-label">本月订单</div>
        </div>
      </div>
      <div className="m-card clickable" onClick={() => onSwitchTab('approve')}>
        <div className="m-card-title">待审审批</div>
        <div className="m-card-line">点击查看我发起的与待我处理的审批</div>
      </div>
      <div className="m-card clickable" onClick={() => onSwitchTab('customer')}>
        <div className="m-card-title">客户跟进</div>
        <div className="m-card-line">客户列表 · 公海 · 联系人 · 订单 · 样本</div>
      </div>
    </div>
  );
}
