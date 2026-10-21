/**
 * 手机端「工作台」— 对齐原 app 办公入口的「工作台」：统计看板 + 快捷入口
 */
import { useEffect, useState } from 'react';
import { fetchHomeStats } from '../core/api';

export default function MobileWorkbench({ onOpenSub }: { onOpenSub: (key: string) => void }) {
  const [stats, setStats] = useState({ pendingApprove: 0, myCustomer: 0, monthOrder: 0, monthAmount: '0.00', unreadMsg: 0 });
  const [when, setWhen] = useState('');

  useEffect(() => {
    fetchHomeStats()
      .then((s) => setStats(s))
      .catch(() => {});
    const d = new Date();
    const p2 = (n: number) => (n < 10 ? '0' + n : '' + n);
    setWhen(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`);
  }, []);

  const cards: [string, string, string][] = [
    [String(stats.pendingApprove), '待审审批', 'approve'],
    [String(stats.myCustomer), '我的客户', 'customer'],
    [String(stats.monthOrder), '本月订单', 'order-my'],
    [`¥${stats.monthAmount}`, '本月金额', 'finance-order'],
  ];
  const quick: [string, string][] = [
    ['审批', 'approve'],
    ['客户', 'customer'],
    ['产品', 'product'],
    ['公告', 'note'],
    ['问答', 'article'],
    ['通讯录', 'mail'],
  ];

  return (
    <div>
      <div className="m-section-title">数据概览</div>
      <div className="m-stat-row" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        {cards.map(([num, label, key]) => (
          <div key={key} className="m-stat-card clickable" onClick={() => onOpenSub(key)}>
            <div className="m-stat-num">{num}</div>
            <div className="m-stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="m-section-title">快捷入口</div>
      <div className="m-grid">
        {quick.map(([name, key]) => (
          <div key={key} className="m-grid-item" onClick={() => onOpenSub(key)}>
            <span className="m-gi-icon" style={{ fontSize: 22 }}>›</span>
            <span className="m-gi-text">{name}</span>
          </div>
        ))}
      </div>

      <div className="m-card">
        <div className="m-card-line">最近更新：{when}</div>
        <div className="m-card-line">数据来自 OA 后端实时接口（免登录固定会话）。</div>
      </div>
    </div>
  );
}
