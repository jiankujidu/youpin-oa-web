/**
 * 桌面端首页 — 三栏工作台（与手机端首页宫格是两套独立设计）
 * 左：快捷审批 + 办公入口 ｜ 中：统计 + 待办 ｜ 右：公告 + 消息
 */
import { useEffect, useState } from 'react';
import { fetchApproves, fetchHomeStats, fetchMessages, fetchNotes } from '../core/api';
import type { ApproveItem, Message, Note } from '../core/types';
import { fmtTime } from '../core/util';
import { Empty, Loading } from './ui';

const QUICK: [string, string][] = [
  ['请假', '🏖'], ['出差', '✈'], ['外出', '🏃'], ['加班', '⏰'],
  ['采购', '🛒'], ['维修', '🔧'], ['用章', '🔏'], ['用车', '🚗'],
];

const ENTRIES: [string, string, string][] = [
  ['product', '🧪', '产品管理'],
  ['files', '📁', '附件管理'],
  ['note', '📢', '企业公告'],
  ['article', '💬', '问答知识'],
  ['mail', '📇', '通讯录'],
  ['sample', '🧫', '样本管理'],
  ['school', '🏫', '校展管理'],
  ['after', '🔨', '售后管理'],
];

export default function DesktopHome({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const [stats, setStats] = useState({ pendingApprove: 0, myCustomer: 0, monthOrder: 0, monthAmount: '0.00', unreadMsg: 0 });
  const [pending, setPending] = useState<ApproveItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchHomeStats(), fetchApproves(1), fetchNotes(), fetchMessages()]).then(
      ([s, ap, no, ms]) => {
        if (!alive) return;
        setStats(s);
        setPending(ap.slice(0, 6));
        setNotes(no.slice(0, 5));
        setMsgs(ms.slice(0, 5));
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <Loading />;

  return (
    <div>
      <div className="d-page-head">
        <span className="d-page-title">工作台</span>
        <span className="d-page-sub">今日概览与常用入口</span>
        <span className="d-page-actions">
          <button className="d-btn d-btn-primary" onClick={() => onNavigate('files')}>
            上传文件
          </button>
        </span>
      </div>

      {/* ===== 统计卡（4 栏）===== */}
      <div className="d-stat-grid">
        <div className="d-stat">
          <div className="d-stat-num">{stats.pendingApprove}</div>
          <div className="d-stat-label">待我审批</div>
        </div>
        <div className="d-stat">
          <div className="d-stat-num">{stats.myCustomer}</div>
          <div className="d-stat-label">我的客户</div>
        </div>
        <div className="d-stat">
          <div className="d-stat-num">{stats.monthOrder}</div>
          <div className="d-stat-label">本月订单</div>
        </div>
        <div className="d-stat">
          <div className="d-stat-num">¥ {stats.monthAmount}</div>
          <div className="d-stat-label">本月金额</div>
        </div>
      </div>

      {/* ===== 三栏 ===== */}
      <div className="d-cols-3">
        {/* 左栏：快捷审批 + 办公入口 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="d-col-panel">
            <div className="d-list-head">快捷审批</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, padding: 10 }}>
              {QUICK.map(([name, icon]) => (
                <div
                  key={name}
                  className="d-nav-item"
                  style={{ flexDirection: 'column', gap: 4, padding: '10px 4px', fontSize: 12 }}
                  onClick={() => onNavigate('approve')}
                >
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="d-col-panel">
            <div className="d-list-head">办公入口</div>
            <div style={{ padding: 6 }}>
              {ENTRIES.map(([key, icon, name]) => (
                <div key={key} className="d-nav-item" onClick={() => onNavigate(key)}>
                  <span className="d-nav-ico">{icon}</span>
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 中栏：待办 + 客户 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="d-col-panel">
            <div className="d-list-head">
              <span>待我审批</span>
              <button
                className="d-btn d-btn-ghost d-btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => onNavigate('approve')}
              >
                查看全部
              </button>
            </div>
            {pending.length === 0 ? (
              <Empty text="暂无待审" />
            ) : (
              pending.map((it) => (
                <div key={it.id} className="d-list-row" onClick={() => onNavigate('approve')}>
                  <div className="d-row-main">
                    <div className="d-row-title">{it.title}</div>
                    <div className="d-row-sub">
                      {it.type_name} · {it.admin_name} · {fmtTime(it.create_time)}
                    </div>
                  </div>
                  <span className="d-tag d-tag-pending">待审批</span>
                </div>
              ))
            )}
          </div>

          <div className="d-col-panel">
            <div className="d-list-head">
              <span>说明</span>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div className="d-card-line">
                本页为桌面端独立布局：左侧导航 + 中间待办 + 右侧信息流，最大宽度 1200px。
                手机端（≤768px）会渲染另一套视图（顶栏 + 单列 + 底部 Tab），两者组件完全分离。
              </div>
              <div className="d-card-line" style={{ marginTop: 8 }}>
                上传走真实对象存储并返回公网链接，转发调用系统分享面板（Web Share API）。
              </div>
            </div>
          </div>
        </div>

        {/* 右栏：公告 + 消息 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="d-col-panel">
            <div className="d-list-head">企业公告</div>
            {notes.map((n) => (
              <div key={n.id} className="d-list-row" onClick={() => onNavigate('note')}>
                <div className="d-row-main">
                  <div className="d-row-title">{n.title}</div>
                  <div className="d-row-sub">
                    {n.admin_name} · {fmtTime(n.create_time)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="d-col-panel">
            <div className="d-list-head">
              <span>最新消息</span>
              <button
                className="d-btn d-btn-ghost d-btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => onNavigate('message')}
              >
                全部
              </button>
            </div>
            {msgs.map((m) => (
              <div key={m.id} className="d-list-row" onClick={() => onNavigate('message')}>
                <div className="d-row-main">
                  <div className="d-row-title">{m.title}</div>
                  <div className="d-row-sub">
                    {m.from_name} · {fmtTime(m.create_time)}
                  </div>
                </div>
                {!m.is_read ? <span className="d-tag d-tag-pending">未读</span> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
