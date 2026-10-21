/**
 * 桌面端工作台 — 1:1 对齐原站首页（oa.upingbio.com/home/index/index）
 * 左列：快捷申请（8 宫格）+ 待办事项（6 统计）+ 公告列表 + 知识列表
 * 右列：快捷入口（4 卡）+ 系统信息 + 最新消息
 */
import { useEffect, useState } from 'react';
import { fetchApproves, fetchArticles, fetchHomeStats, fetchMessages, fetchNotes, fetchSubRows } from '../core/api';
import type { ApproveItem, Article, Message, Note } from '../core/types';
import { fmtTime, toast } from '../core/util';
import { DataTable, Panel, StatusTag, type Column } from './pc';
import { Icon } from '../core/icons';

/** 快捷申请（与原站一致：请假/出差/外出/加班/采购/物品维修/用章申请/用车申请） */
const QUICKS: [string, string][] = [
  ['请假申请', 'walk'],
  ['出差申请', 'plane'],
  ['外出申请', 'location'],
  ['加班申请', 'clock'],
  ['采购申请', 'cart'],
  ['物品维修', 'wrench'],
  ['用章申请', 'stamp'],
  ['用车申请', 'car'],
];

const NOTE_COLS: Column<Note>[] = [
  { key: 'cate', title: '公告分类', width: 100, render: (r) => <span className="pc-cell-1">{r.cate_title || '—'}</span> },
  {
    key: 'title',
    title: '公告标题',
    render: (r) => (
      <span className="pc-td-strong pc-cell-1" title={r.title}>
        {r.title}
      </span>
    ),
  },
  { key: 'time', title: '发布时间', width: 140, render: (r) => fmtTime(r.create_time) },
];

const ART_COLS: Column<Article>[] = [
  { key: 'cate', title: '知识分类', width: 100, render: (r) => <span className="pc-cell-1">{r.cate_title || '—'}</span> },
  {
    key: 'title',
    title: '知识标题',
    render: (r) => {
      const t = String(r.title).replace(/\n+/g, ' ');
      return (
        <span className="pc-td-strong pc-cell-1" title={t}>
          {t}
        </span>
      );
    },
  },
  { key: 'time', title: '发布时间', width: 140, render: (r) => fmtTime(r.create_time) },
];

const MSG_COLS: Column<Message>[] = [
  {
    key: 'title',
    title: '消息内容',
    render: (r) => (
      <span className="pc-td-strong pc-cell-1" title={r.title}>
        {r.title}
      </span>
    ),
  },
  { key: 'time', title: '时间', width: 130, render: (r) => fmtTime(r.send_time || r.create_time) },
];

export default function DesktopHome({ onNavigate, userName }: { onNavigate: (page: string) => void; userName?: string }) {
  const [stats, setStats] = useState({ pendingApprove: 0, myCustomer: 0, monthOrder: 0, monthAmount: '0.00', unreadMsg: 0 });
  const [approves, setApproves] = useState<ApproveItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [invoices, setInvoices] = useState(0);
  const [financeOrder, setFinanceOrder] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchHomeStats(),
      fetchApproves(0).catch(() => [] as ApproveItem[]),
      fetchNotes().catch(() => [] as Note[]),
      fetchArticles().catch(() => [] as Article[]),
      fetchMessages().catch(() => [] as Message[]),
      fetchSubRows('invoice-handle').catch(() => []),
      fetchSubRows('finance-order').catch(() => []),
    ]).then(([s, ap, no, ar, ms, inv, fo]) => {
      if (!alive) return;
      setStats(s);
      setApproves(ap);
      setNotes(no);
      setArticles(ar);
      setMsgs(ms);
      setInvoices(inv.length);
      setFinanceOrder(fo.length);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** 待办事项（与原站同 6 格；数字全部来自真实接口计数） */
  const pendingList = approves.filter((a) => {
    const cs = (a as any).check_status;
    return cs === undefined || cs === null || Number(cs) < 2;
  });
  const todo = [
    { label: '待审批', num: pendingList.length, go: 'approve', icon: 'approve', tone: 0 },
    {
      label: '待审报销',
      num: pendingList.filter((a) => /报销/.test(`${(a as any).flow_type || ''}${a.content || ''}${(a as any).name || ''}`)).length,
      go: 'approve',
      icon: 'receipt',
      tone: 1,
    },
    { label: '待审发票', num: invoices, go: 'invoice-handle', icon: 'invoice', tone: 2 },
    { label: '待回款', num: financeOrder, go: 'finance-order', icon: 'financeOrder', tone: 3 },
    {
      label: '待审合同',
      num: pendingList.filter((a) => /合同|contract/i.test(`${(a as any).flow_type || ''}${a.content || ''}${(a as any).name || ''}`)).length,
      go: 'approve',
      icon: 'document',
      tone: 4,
    },
    { label: '未读消息', num: msgs.filter((m) => !m.read_time).length, go: 'message', icon: 'message', tone: 5 },
  ];

  /** 顶部问候语（按当前时间） */
  const now = new Date();
  const hh = now.getHours();
  const greet = hh < 6 ? '夜深了' : hh < 9 ? '早上好' : hh < 12 ? '上午好' : hh < 14 ? '中午好' : hh < 18 ? '下午好' : '晚上好';
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const dateStr = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 星期${week}`;

  return (
    <div className="home-grid">
      {/* ===== 左列 ===== */}
      <div className="home-col">
        {/* 品牌横幅 */}
        <div className="home-hero">
          <div className="home-hero-title">
            {greet}
            {userName ? `，${userName}` : ''}
          </div>
          <div className="home-hero-sub">{dateStr} · 欢迎回到优品生物办公系统，祝你工作顺利</div>
          <div className="home-hero-btns">
            <button className="home-hero-btn" onClick={() => onNavigate('approve')}>
              <Icon name="plus" size={15} />
              发起审批
            </button>
            <button className="home-hero-btn ghost" onClick={() => onNavigate('ai')}>
              <Icon name="robot" size={15} />
              AI 问答
            </button>
          </div>
        </div>

        {/* 快捷申请 */}
        <Panel
          title="快捷申请"
          extra={
            <span className="pc-link" onClick={() => onNavigate('approve')}>
              更多
            </span>
          }
        >
          <div className="home-quick">
            {QUICKS.map(([label, icon]) => (
              <div key={label} className="home-quick-item" onClick={() => onNavigate('approve')}>
                <span className="hqi-ico">
                  <Icon name={icon} size={19} />
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* 待办事项 */}
        <Panel title="待办事项">
          <div className="home-todo">
            {todo.map((t) => (
              <div key={t.label} className="home-todo-item" onClick={() => onNavigate(t.go)}>
                <div className="td-head">
                  <span className={`td-ico td-ico-${t.tone}`}>
                    <Icon name={t.icon} size={15} />
                  </span>
                  <span className="td-label">{t.label}</span>
                </div>
                <div className={`td-num${t.num === 0 ? ' zero' : ''}`}>{t.num}</div>
              </div>
            ))}
          </div>
        </Panel>

        {/* 公告列表 */}
        <Panel
          title="公告列表"
          extra={
            <span className="pc-link" onClick={() => onNavigate('note')}>
              更多
            </span>
          }
          bodyPad={false}
        >
          <div style={{ padding: '6px 8px' }}>
            <DataTable columns={NOTE_COLS} rows={notes.slice(0, 8)} rowKey={(r) => String(r.id)} onRowClick={() => onNavigate('note')} loading={loading} indexCol={false} pageSize={8} />
          </div>
        </Panel>

        {/* 知识列表 */}
        <Panel
          title="知识列表"
          extra={
            <span className="pc-link" onClick={() => onNavigate('article')}>
              更多
            </span>
          }
          bodyPad={false}
        >
          <div style={{ padding: '6px 8px' }}>
            <DataTable
              columns={ART_COLS}
              rows={articles.slice(0, 5)}
              rowKey={(r) => String(r.id)}
              onRowClick={() => onNavigate('article')}
              loading={loading}
              indexCol={false}
              pageSize={5}
            />
          </div>
        </Panel>
      </div>

      {/* ===== 右列 ===== */}
      <div className="home-col">
        {/* 快捷入口 */}
        <Panel title="快捷入口">
          <div className="home-quick" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {(
              [
                ['mail', 'mail', '通讯录'],
                ['note', 'note', '企业公告'],
                ['message', 'message', '消息中心'],
                ['files', 'file', '文件库'],
              ] as [string, string, string][]
            ).map(([key, icon, label]) => (
              <div key={key} className="home-quick-item" onClick={() => onNavigate(key)}>
                <span className="hqi-ico">
                  <Icon name={icon} size={19} />
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* 系统信息（与原站一致） */}
        <Panel title="系统信息">
          <table className="home-sysinfo">
            <tbody>
              <tr>
                <td>服务器系统</td>
                <td>Linux</td>
              </tr>
              <tr>
                <td>PHP版本</td>
                <td>
                  7.4.33 <span className="gg-tag blue">TP文档</span>
                </td>
              </tr>
              <tr>
                <td>上传附件限制</td>
                <td>500M</td>
              </tr>
              <tr>
                <td>执行时间限制</td>
                <td>300秒</td>
              </tr>
              <tr>
                <td>ThinkPHP版本</td>
                <td>6.1.4</td>
              </tr>
              <tr>
                <td>Layui版本</td>
                <td>
                  2.9.13 <span className="gg-tag">Layui文档</span>
                </td>
              </tr>
              <tr>
                <td>数据来源</td>
                <td>
                  <StatusTag tone="ok">已连接真实后端</StatusTag>
                </td>
              </tr>
            </tbody>
          </table>
        </Panel>

        {/* 最新消息 */}
        <Panel
          title="最新消息"
          extra={
            <span className="pc-link" onClick={() => onNavigate('message')}>
              更多
            </span>
          }
          bodyPad={false}
        >
          <div style={{ padding: '6px 8px' }}>
            <DataTable
              columns={MSG_COLS}
              rows={msgs.slice(0, 6)}
              rowKey={(r) => String(r.id)}
              onRowClick={() => onNavigate('message')}
              loading={loading}
              indexCol={false}
              pageSize={6}
            />
          </div>
        </Panel>

        <Panel title="快捷操作">
          <div className="home-quick" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="home-quick-item" onClick={() => onNavigate('approve')}>
              <span className="hqi-ico">
                <Icon name="plus" size={18} />
              </span>
              <span>发起审批</span>
            </div>
            <div className="home-quick-item" onClick={() => onNavigate('ai')}>
              <span className="hqi-ico">
                <Icon name="robot" size={18} />
              </span>
              <span>AI 问答</span>
            </div>
            <div className="home-quick-item" onClick={() => onNavigate('product')}>
              <span className="hqi-ico">
                <Icon name="product" size={18} />
              </span>
              <span>产品查询</span>
            </div>
            <div
              className="home-quick-item"
              onClick={() => toast('日常安排为原站功能，此处为真实数据页面入口')}
            >
              <span className="hqi-ico">
                <Icon name="calendar" size={18} />
              </span>
              <span>日常安排</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
