/**
 * 桌面端工作台 — 企业级 PC 控制台版式
 * 统计卡（4 栏）+ 待我审批表格 + 企业公告 / 最新消息 + 快捷入口
 */
import { useEffect, useState } from 'react';
import { fetchApproves, fetchHomeStats, fetchMessages, fetchNotes } from '../core/api';
import type { ApproveItem, Message, Note } from '../core/types';
import { fmtTime } from '../core/util';
import { DataTable, PageHead, Panel, StatCards, StatusTag, type Column } from './pc';
import { Icon } from '../core/icons';

const ENTRIES: [string, string, string][] = [
  ['product', 'product', '产品管理'],
  ['files', 'file', '附件管理'],
  ['note', 'note', '企业公告'],
  ['article', 'article', '问答知识'],
  ['mail', 'mail', '通讯录'],
  ['contact', 'contact', '客户联系人'],
  ['sample', 'sample', '样本管理'],
  ['after', 'after', '售后管理'],
];

export default function DesktopHome({ onNavigate }: { onNavigate: (page: string) => void }) {
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
        setPending(ap);
        setNotes(no.slice(0, 8));
        setMsgs(ms.slice(0, 8));
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const cols: Column<ApproveItem>[] = [
    {
      key: 'title',
      title: '审批事项',
      render: (r) => <span className="pc-td-strong">{r.title}</span>,
    },
    { key: 'type', title: '类型', width: 110, render: (r) => r.type_name || '—' },
    { key: 'admin', title: '申请人', width: 110, render: (r) => r.admin_name || '—' },
    { key: 'time', title: '提交时间', width: 160, render: (r) => fmtTime(r.create_time) },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: () => <StatusTag tone="wait">审批中</StatusTag>,
    },
    {
      key: 'op',
      title: '操作',
      width: 120,
      render: () => (
        <span>
          <span className="pc-link" onClick={() => onNavigate('approve')}>
            去审批
          </span>
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="工作台"
        crumb={['首页', '工作台']}
        desc="企业办公数据概览与待办事项"
        actions={
          <>
            <button className="pc-btn pc-btn-ghost" onClick={() => onNavigate('files')}>
              <Icon name="upload" size={14} /> 上传附件
            </button>
            <button className="pc-btn" onClick={() => onNavigate('approve')}>
              <Icon name="approve" size={14} /> 发起审批
            </button>
          </>
        }
      />

      <StatCards
        items={[
          { label: '待我审批', value: stats.pendingApprove, hint: '条待处理' },
          { label: '我的客户', value: stats.myCustomer, tone: 'ok', hint: '家合作客户' },
          { label: '本月订单', value: stats.monthOrder, tone: 'warn', hint: '笔' },
          { label: '本月金额', value: `¥ ${stats.monthAmount}`, tone: 'info', hint: '元' },
        ]}
      />

      <div className="pc-cols">
        <div>
          <Panel
            title="待我审批"
            extra={
              <button className="pc-btn pc-btn-ghost" onClick={() => onNavigate('approve')}>
                查看全部
              </button>
            }
            bodyPad={false}
          >
            <div style={{ padding: '4px 16px 12px' }}>
              <DataTable
                columns={cols}
                rows={pending}
                rowKey={(r) => r.id}
                pageSize={8}
                loading={loading}
                empty="暂无待我审批的事项"
              />
            </div>
          </Panel>

          <Panel title="快捷入口">
            <div className="pc-quick">
              {ENTRIES.map(([key, icon, name]) => (
                <div key={key} className="pc-quick-item" onClick={() => onNavigate(key)}>
                  <span className="pc-quick-ico">
                    <Icon name={icon} size={20} />
                  </span>
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div>
          <Panel
            title="企业公告"
            extra={
              <button className="pc-btn pc-btn-ghost" onClick={() => onNavigate('note')}>
                更多
              </button>
            }
            bodyPad={false}
          >
            {notes.length === 0 ? (
              <div className="pc-list-empty">暂无公告</div>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="pc-list-row" onClick={() => onNavigate('note')}>
                  <div className="pc-list-title">{n.title}</div>
                  <div className="pc-list-sub">
                    {n.admin_name} · {fmtTime(n.create_time)}
                  </div>
                </div>
              ))
            )}
          </Panel>

          <Panel
            title="最新消息"
            extra={
              <button className="pc-btn pc-btn-ghost" onClick={() => onNavigate('message')}>
                更多
              </button>
            }
            bodyPad={false}
          >
            {msgs.length === 0 ? (
              <div className="pc-list-empty">暂无消息</div>
            ) : (
              msgs.map((m) => (
                <div key={m.id} className="pc-list-row" onClick={() => onNavigate('message')}>
                  <div className="pc-list-title">
                    {m.title}
                    {!m.is_read ? <StatusTag tone="wait">未读</StatusTag> : null}
                  </div>
                  <div className="pc-list-sub">
                    {m.from_name} · {fmtTime(m.create_time)}
                  </div>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
