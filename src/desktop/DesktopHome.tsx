/**
 * 桌面端工作台 — 1:1 对齐原站 /home/index/main.html（layui 工作台）
 * 左列(md8)：快捷申请 + 待办事项（md6/md6 左右并排）→ 公告列表 → 知识列表
 *          → 今日与昨日员工活跃度（折线 300px）→ 近一年员工活跃度（日历热力图 240px）
 * 右列(md4)：右栏 4 宫格（通讯录/日程安排/工作汇报/工作记录）→ 系统信息 → 最活跃员工（饼图 268px）
 * 全部样式度量取自原站 main.html 内联样式与 gougu.css；数据走原站同路径接口。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import {
  fetchHomeArticles, fetchHomeBoard, fetchHomeNotes, fetchViewData, fetchViewLog,
  type HomeBoard, type ViewData,
} from '../core/api';
import type { Article, Note } from '../core/types';
import { fmtTime } from '../core/util';
import { DataTable, type Column } from './pc';

/* ---------------- 图表容器（原站 echarts.init + setOption + onresize） ---------------- */

function ChartBox<T>({ data, render, height }: { data: T | null; render: (d: T) => EChartsOption; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !data) return;
    const inst = echarts.init(ref.current);
    inst.setOption(render(data));
    const onResize = () => inst.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      inst.dispose();
    };
  }, [data, render]);
  if (!data) return <div style={{ width: '100%', height }} />;
  return <div ref={ref} style={{ width: '100%', height }} />;
}

/** 原站 setHour：0 → '00:00' */
function setHour(num: number): string {
  return (num < 10 ? '0' + num : String(num)) + ':00';
}

/** 今日与昨日员工活跃度（原站 layoutChartView：color #1AAD19/#1890FF，smooth + areaStyle 0.2） */
const lineOption = (d: ViewData): EChartsOption => {
  const nowHour = new Date().getHours();
  const xData = d.dataSecond.map((_, i) => setHour(i));
  const yToday = d.dataFirst.slice(0, nowHour + 1);
  const area = { type: 'default' as const, opacity: 0.2 };
  return {
    title: { top: '12px', text: '今日与昨日员工活跃度', left: '6px', textStyle: { fontSize: 18, color: '#333' } },
    color: ['#1AAD19', '#1890FF'],
    grid: { left: '16px', right: '30px', bottom: '12px', top: '60px', containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross', crossStyle: { color: '#999' } } },
    toolbox: { show: true },
    legend: { data: ['今日', '昨日'], top: '16px' },
    xAxis: [{ type: 'category', boundaryGap: false, data: xData, axisLine: { lineStyle: { color: '#999999', width: 1 } } }],
    yAxis: [{ type: 'value', axisLine: { show: true, lineStyle: { color: '#999999', width: 1 } } }],
    series: [
      { name: '今日', type: 'line', smooth: true, areaStyle: area, data: yToday },
      { name: '昨日', type: 'line', smooth: true, areaStyle: area, data: d.dataSecond },
    ],
  };
};

/** 近一年员工活跃度（原站 layoutChartYear：calendar heatmap，visualMap #fafafa→#1AAD19） */
const heatOption = (d: ViewData): EChartsOption => {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const dd = today.getDate();
  const p2 = (n: number) => (n < 10 ? '0' + n : String(n));
  const range = [`${y}-${m}-${dd}`, `${y - 1}-${m}-${dd}`];
  const data: [string, number][] = [];
  for (let i = 0; i < 366; i++) {
    const t = new Date(today.getTime() - 1000 * 60 * 60 * 24 * i);
    const key = `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`;
    data.push([key, d.dataThree[key] ?? 0]);
  }
  return {
    title: { top: '12px', text: '近一年员工活跃度', left: '8px', textStyle: { fontSize: 18, color: '#333' } },
    tooltip: {
      padding: 6,
      formatter: (obj: any) => `<div style="font-size: 12px;">${obj.value[0]}员工活跃度：${obj.value[1]}</div>`,
    },
    visualMap: { min: 0, max: 300, show: false, inRange: { color: ['#fafafa', '#1AAD19'] } },
    // dayLabel.formatter 是原站用法（echarts 5 运行期支持，类型声明未收），此处保留并断言
    calendar: {
      top: 75, left: 52, right: 20, range, cellSize: ['auto', 21],
      splitLine: { lineStyle: { color: '#aaa', type: 'dashed' } },
      itemStyle: { borderWidth: 0.5 },
      yearLabel: { show: false },
      monthLabel: { nameMap: 'cn', fontSize: 12 },
      dayLabel: {
        show: true, formatter: '{start}  1st', fontWeight: 'lighter',
        nameMap: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'], fontSize: 12,
      },
    } as EChartsOption['calendar'],
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', calendarIndex: 0, data }],
  };
};

/** 最活跃员工（原站 layoutRaking：pie radius 50% center ['50%','60%']） */
const pieOption = (logs: { name: string; count: number }[]): EChartsOption => ({
  tooltip: { trigger: 'item', formatter: '{a} <br/>{b} :{d}%' },
  legend: { top: '1%', left: 'center' },
  series: [
    {
      name: '活跃度',
      type: 'pie',
      radius: '50%',
      center: ['50%', '60%'],
      data: logs.map((l) => ({ value: l.count, name: l.name })),
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
    },
  ],
});

/* ---------------- 快捷申请（原站 iconfont 图标 + 顺序：请假1/出差2/外出3/加班4/采购15/物品维修7/用章9/用车10） ---------------- */
const QUICKS: { label: string; icon: string; type: number }[] = [
  { label: '请假申请', icon: 'icon-kechengziyuanguanli', type: 1 },
  { label: '出差申请', icon: 'icon-jiaoshiguanli', type: 2 },
  { label: '外出申请', icon: 'icon-tuiguangguanli', type: 3 },
  { label: '加班申请', icon: 'icon-xueshengchengji', type: 4 },
  { label: '采购申请', icon: 'icon-shoufeiguanli', type: 15 },
  { label: '物品维修', icon: 'icon-chuangjianxitong', type: 7 },
  { label: '用章申请', icon: 'icon-shenpishezhi', type: 9 },
  { label: '用车申请', icon: 'icon-dongtaiguanli', type: 10 },
];

/** 右栏 4 宫格（原站 layui-right-bar） */
const RIGHTBAR: { label: string; icon: string; go: string }[] = [
  { label: '通讯录', icon: 'icon-huamingce', go: 'mail' },
  { label: '日程安排', icon: 'icon-kaoshijihua', go: 'ai' },
  { label: '+工作汇报', icon: 'icon-fuwuliebiao', go: 'approve' },
  { label: '+工作记录', icon: 'icon-paikeshezhi', go: 'approve' },
];

const NOTE_COLS: Column<Note>[] = [
  { key: 'cate', title: '公告分类', width: 90, align: 'center', render: (r) => <span className="pc-cell-1">{r.cate_title || '—'}</span> },
  {
    key: 'title',
    title: '公告标题',
    render: (r) =>
      Number(r.is_read) === 0 ? (
        <span className="gg-note-new">
          <span className="gg-note-link">{r.title}</span>
          <span className="gg-note-badge">新</span>
        </span>
      ) : (
        <span className="gg-note-title pc-cell-1" title={r.title}>
          {r.title}
        </span>
      ),
  },
  { key: 'time', title: '发布时间', width: 150, align: 'center', render: (r) => fmtTime(r.create_time) },
];

const ART_COLS: Column<Article>[] = [
  { key: 'cate', title: '知识分类', width: 90, align: 'center', render: (r) => <span className="pc-cell-1">{r.cate_title || '—'}</span> },
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
  { key: 'time', title: '发布时间', width: 150, align: 'center', render: (r) => fmtTime(r.create_time) },
];

export default function DesktopHome({ onNavigate }: { onNavigate: (page: string) => void; userName?: string }) {
  const [board, setBoard] = useState<HomeBoard | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [viewData, setViewData] = useState<ViewData | null>(null);
  const [viewLog, setViewLog] = useState<{ name: string; count: number }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchHomeBoard(),
      fetchHomeNotes(),
      fetchHomeArticles(),
      fetchViewData(),
      fetchViewLog(),
    ])
      .then(([b, no, ar, vd, vl]) => {
        if (!alive) return;
        setBoard(b);
        setNotes(no);
        setArticles(ar);
        setViewData(vd);
        setViewLog(vl);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 待办事项（与原站 main.html 同 6 项、同顺序）。
   * 数字取自原站 main.html 服务端渲染值（逐账号会话真实计数），不是本地估算。
   * 跳转目标按原站 data-href 映射到本系统已有页面。
   */
  const todo = [
    { label: '待审审批', num: board?.todoApprove ?? 0, go: 'approve' },
    { label: '待审报销', num: board?.todoExpense ?? 0, go: 'approve' },
    { label: '待审发票', num: board?.todoInvoice ?? 0, go: 'invoice-handle' },
    { label: '待回款', num: board?.todoIncome ?? 0, go: 'finance-income' },
    { label: '待审合同', num: board?.todoContract ?? 0, go: 'approve' },
    { label: '待完成任务', num: board?.todoTask ?? 0, go: 'home' },
  ];

  const renderLine = useCallback((d: ViewData) => lineOption(d), []);
  const renderHeat = useCallback((d: ViewData) => heatOption(d), []);
  const renderPie = useCallback((l: { name: string; count: number }[]) => pieOption(l), []);

  return (
    <div className="home-grid">
      {/* ===== 左列（原站 layui-col-md8）===== */}
      <div className="home-col">
        {/* 快捷申请 + 待办事项：原站 md6/md6 左右并排 */}
        <div className="home-pair">
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
                      <i className={`iconfont ${q.icon}`} />
                    </span>
                    <cite>{q.label}</cite>
                  </div>
                ))}
              </div>
            </div>
          </div>

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
        </div>

        {/* 公告列表（原站 /home/api/get_note_list） */}
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

        {/* 知识列表（原站 /home/api/get_article_list） */}
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

        {/* 今日与昨日员工活跃度（原站 #chartView 300px） */}
        <div className="gg-card">
          <ChartBox data={viewData} render={renderLine} height={300} />
        </div>

        {/* 近一年员工活跃度（原站 #chartYear 240px） */}
        <div className="gg-card">
          <ChartBox data={viewData} render={renderHeat} height={240} />
        </div>
      </div>

      {/* ===== 右列（原站 layui-col-md4）===== */}
      <div className="home-col">
        {/* 右栏 4 宫格（原站 layui-right-bar） */}
        <div className="gg-card">
          <div className="gg-card-body">
            <div className="gg-rightbar">
              {RIGHTBAR.map((r) => (
                <div key={r.label} className="gg-rightbar-item" onClick={() => onNavigate(r.go)}>
                  <span className="hqi-ico">
                    <i className={`iconfont ${r.icon}`} />
                  </span>
                  <cite>{r.label}</cite>
                </div>
              ))}
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

        {/* 最活跃员工（原站 #logChart 268px 饼图；无数据时诚实空态） */}
        <div className="gg-card">
          <div className="gg-card-head">
            <h3>
              最活跃员工
              <span style={{ color: '#999', fontSize: 14, fontWeight: 400, marginLeft: 5 }}>最近30天前十的活跃度</span>
            </h3>
          </div>
          <div className="gg-card-body">
            {viewLog && viewLog.length > 0 ? (
              <ChartBox data={viewLog} render={renderPie} height={268} />
            ) : (
              <div className="pc-table-empty" style={{ padding: '48px 0' }}>
                {loading ? '加载中…' : '暂无活跃度统计数据'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
