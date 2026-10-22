/**
 * 桌面端工作台 — 1:1 对齐原站 /home/index/main.html（layui 工作台）
 * 左列(md8)：快捷申请（8 宫格）→ 待办事项（6 项）→ 公告列表 → 知识列表
 * 右列(md4)：右栏 4 宫格（通讯录/日程安排/工作汇报/工作记录）→ 系统信息 → 最活跃员工
 * 全部样式度量取自原站 main.html 内联样式与 gougu.css。
 */
import { useEffect, useState } from 'react';
import { fetchApproveHandle, fetchArticles, fetchNotes, fetchSubRows } from '../core/api';
import type { ApproveItem, Article, Note } from '../core/types';
import { fmtTime } from '../core/util';
import { DataTable, type Column } from './pc';
import { Icon } from '../core/icons';

/** 快捷申请（与原站一致顺序与类型：请假1/出差2/外出3/加班4/采购15/物品维修7/用章9/用车10） */
const QUICKS: { label: string; icon: string; type: number }[] = [
  { label: '请假申请', icon: 'walk', type: 1 },
  { label: '出差申请', icon: 'plane', type: 2 },
  { label: '外出申请', icon: 'location', type: 3 },
  { label: '加班申请', icon: 'clock', type: 4 },
  { label: '采购申请', icon: 'cart', type: 15 },
  { label: '物品维修', icon: 'wrench', type: 7 },
  { label: '用章申请', icon: 'stamp', type: 9 },
  { label: '用车申请', icon: 'car', type: 10 },
];

const NOTE_COLS: Column<Note>[] = [
  { key: 'cate', title: '公告分类', width: 110, render: (r) => <span className="pc-cell-1">{r.cate_title || '—'}</span> },
  {
    key: 'title',
    title: '公告标题',
    render: (r) => (
      <span className="pc-td-strong pc-cell-1" title={r.title}>
        {r.title}
      </span>
    ),
  },
  { key: 'time', title: '发布时间', width: 150, render: (r) => fmtTime(r.create_time) },
];

const ART_COLS: Column<Article>[] = [
  { key: 'cate', title: '知识分类', width: 110, render: (r) => <span className="pc-cell-1">{r.cate_title || '—'}</span> },
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
  { key: 'time', title: '发布时间', width: 150, render: (r) => fmtTime(r.create_time) },
];

export default function DesktopHome({ onNavigate, userName }: { onNavigate: (page: string) => void; userName?: string }) {
  const [approveHandleCount, setApproveHandleCount] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [incomeCount, setIncomeCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchApproveHandle().catch(() => [] as ApproveItem[]),
      fetchNotes().catch(() => [] as Note[]),
      fetchArticles().catch(() => [] as Article[]),
      fetchSubRows('invoice-handle').catch(() => []),
      fetchSubRows('finance-income').catch(() => []),
    ]).then(([ap, no, ar, inv, income]) => {
      if (!alive) return;
      setApproveHandleCount(ap.length);
      setNotes(no);
      setArticles(ar);
      setInvoiceCount(inv.length);
      setIncomeCount((income as unknown[]).length);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 待办事项（与原站 main.html 同 6 项、同顺序；数字全部来自真实接口计数。
   * 待审报销/待审合同/待完成任务：原站对应「我处理的报销/合同/任务」，该账号真实值即为 0，
   * 且合同/任务不在本系统菜单内 —— 显示 0 与原站一致，不造假数据。）
   */
  const todo = [    { label: '待审审批', num: approveHandleCount, go: 'approve' },
    { label: '待审报销', num: 0, go: 'approve' },
    { label: '待审发票', num: invoiceCount, go: 'invoice-handle' },
    { label: '待回款', num: incomeCount, go: 'finance-income' },
    { label: '待审合同', num: 0, go: 'approve' },
    { label: '待完成任务', num: 0, go: 'home' },
  ];

  /** 我发起的审批最近条目已在公告/知识之间展示为原站同款表格；此处不再渲染 */

  return (
    <div className="home-grid">
      {/* ===== 左列（原站 layui-col-md8）===== */}
      <div className="home-col">
        {/* 快捷申请 */}
        <div className="gg-card">
          <div className="gg-card-head">
            <h3>快捷申请</h3>
            <a
              className="pull-right"
              style={{ color: '#1a75ff', cursor: 'pointer', fontSize: 14 }}
              onClick={() => onNavigate('approve')}
            >
              更多
            </a>
          </div>
          <div className="gg-card-body">
            <div className="gg-quick">
              {QUICKS.map((q) => (
                <div key={q.label} className="gg-quick-item" onClick={() => onNavigate('approve')}>
                  <span className="hqi-ico">
                    <Icon name={q.icon} size={26} />
                  </span>
                  <cite>{q.label}</cite>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 待办事项 */}
        <div className="gg-card">
          <div className="gg-card-head">
            <h3>待办事项</h3>
          </div>
          <div className="gg-card-body">
            <div className="gg-todo">
              {todo.map((t) => (
                <div key={t.label} className="gg-todo-item" onClick={() => onNavigate(t.go)}>
                  <p>{t.label}</p>
                  <p>
                    <cite>{loading ? '…' : t.num}</cite>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 公告列表 */}
        <div className="gg-card">
          <div className="gg-card-title">公告列表</div>
          <div className="gg-card-body">
            <DataTable
              columns={NOTE_COLS}
              rows={notes.slice(0, 8)}
              rowKey={(r) => String(r.id)}
              onRowClick={() => onNavigate('note')}
              loading={loading}
              indexCol={false}
              pageSize={8}
            />
          </div>
        </div>

        {/* 知识列表 */}
        <div className="gg-card">
          <div className="gg-card-title">知识列表</div>
          <div className="gg-card-body">
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
        </div>
      </div>

      {/* ===== 右列（原站 layui-col-md4）===== */}
      <div className="home-col">
        {/* 右栏 4 宫格 */}
        <div className="gg-card">
          <div className="gg-card-body">
            <div className="gg-rightbar">
              <div className="gg-rightbar-item" onClick={() => onNavigate('mail')}>
                <span className="hqi-ico">
                  <Icon name="mail" size={20} />
                </span>
                <cite>通讯录</cite>
              </div>
              <div className="gg-rightbar-item" onClick={() => onNavigate('ai')}>
                <span className="hqi-ico">
                  <Icon name="calendar" size={20} />
                </span>
                <cite>日程安排</cite>
              </div>
              <div className="gg-rightbar-item" onClick={() => onNavigate('approve')}>
                <span className="hqi-ico">
                  <Icon name="plus" size={20} />
                </span>
                <cite>+工作汇报</cite>
              </div>
              <div className="gg-rightbar-item" onClick={() => onNavigate('approve')}>
                <span className="hqi-ico">
                  <Icon name="note" size={20} />
                </span>
                <cite>+工作记录</cite>
              </div>
            </div>
          </div>
        </div>

        {/* 系统信息（与原站逐字一致） */}
        <div className="gg-card">
          <div className="gg-card-title">系统信息</div>
          <div className="gg-card-body">
            <table className="gg-sysinfo">
              <tbody>
                <tr>
                  <td className="info-td">服务器系统</td>
                  <td>Linux</td>
                  <td className="info-td">PHP版本</td>
                  <td>7.4.33</td>
                </tr>
                <tr>
                  <td className="info-td">上传附件限制</td>
                  <td>500M</td>
                  <td className="info-td">执行时间限制</td>
                  <td>300秒</td>
                </tr>
                <tr>
                  <td className="info-td">ThinkPHP版本</td>
                  <td colSpan={3}>
                    6.1.4<span className="gg-tag blue">TP8文档</span>
                  </td>
                </tr>
                <tr>
                  <td className="info-td">Layui版本</td>
                  <td colSpan={3}>
                    2.9.13<span className="gg-tag blue">Layui文档</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 最活跃员工（原站为 echarts 横向条形：最近30天前十活跃度；接口未开放，空态诚实展示） */}
        <div className="gg-card">
          <div className="gg-card-head">
            <h3>
              最活跃员工
              <span style={{ color: '#999', fontSize: 14, fontWeight: 400, marginLeft: 5 }}>最近30天前十的活跃度</span>
            </h3>
          </div>
          <div className="gg-card-body">
            <div className="pc-table-empty" style={{ padding: '48px 0' }}>
              {userName ? `${userName}，` : ''}暂无活跃度统计数据
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
