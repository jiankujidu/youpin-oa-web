/** 桌面端内容类页面：公告 / 问答知识 / 消息中心 / 通讯录 — 统一 PC 后台表格版式 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchArticles, fetchMails, fetchMessages, fetchNotes } from '../core/api';
import { fixContentHtml } from '../core/fileurl';
import { shareContent } from '../core/share';
import type { Article, MailContact, Message, Note } from '../core/types';
import { fmtTime, plain, toast } from '../core/util';
import { Modal } from './ui';
import { DataTable, FilterTabs, PageHead, Panel, StatusTag, type Column } from './pc';

/** 富文本正文（后端返回 HTML） */
function Rich({ html }: { html?: string }) {
  if (!html) return <div style={{ fontSize: 13, color: 'var(--c-text-4)' }}>（无正文）</div>;
  return <div className="ai-doc-body" dangerouslySetInnerHTML={{ __html: fixContentHtml(html) }} />;
}

/* ======================= 公告（/note/index/index） ======================= */

export function DesktopNote() {
  const [list, setList] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState('');
  const [cur, setCur] = useState<Note | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchNotes()
      .then((r) => {
        setList(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return k ? list.filter((n) => (n.title + (n.cate_title || '')).toLowerCase().includes(k)) : list;
  }, [list, kw]);

  const cols: Column<Note>[] = [
    { key: 'title', title: '公告标题', render: (r) => <span className="pc-td-strong">{r.title}</span> },
    { key: 'cate', title: '分类', width: 130, render: (r) => <StatusTag tone="info">{r.cate_title || '—'}</StatusTag> },
    { key: 'start', title: '生效时间', width: 130, render: (r) => r.start_time || '—' },
    { key: 'end', title: '结束时间', width: 130, render: (r) => r.end_time || '—' },
    { key: 'time', title: '发布时间', width: 150, render: (r) => fmtTime(r.create_time) },
    {
      key: 'op',
      title: '操作',
      width: 90,
      render: (r) => (
        <span className="pc-link" onClick={() => setCur(r)}>
          查看
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="企业公告"
        crumb={['办公首页', '企业公告']}
        desc={`共 ${rows.length} 条公告`}
        actions={
          <button className="pc-btn pc-btn-ghost" onClick={load}>
            刷新
          </button>
        }
      />
      <Panel bodyPad={false}>
        <div style={{ padding: '14px 16px' }}>
          <div className="pc-toolbar">
            <input
              className="pc-input"
              style={{ width: 280 }}
              placeholder="搜索公告标题"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable columns={cols} rows={rows} rowKey={(r) => String(r.id)} onRowClick={setCur} loading={loading} pageSize={20} />
        </div>
      </Panel>

      {cur ? (
        <Modal
          title={cur.title}
          onClose={() => setCur(null)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => setCur(null)}>
                关闭
              </button>
              <button
                className="pc-btn"
                onClick={() => {
                  void shareContent({ title: cur.title, text: `${cur.cate_title || ''} · ${fmtTime(cur.create_time)}`, url: location.href }).then(
                    (r) => {
                      if (r.ok) toast(r.via === 'clipboard' ? '已复制分享内容' : '已调起分享');
                      else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
                    },
                  );
                }}
              >
                转发本公告
              </button>
            </>
          }
        >
          <div style={{ fontSize: 12.5, color: 'var(--c-text-4)', marginBottom: 12 }}>
            {cur.cate_title ? `分类：${cur.cate_title} · ` : ''}
            发布人：{cur.admin_name || '系统'} · 时间：{fmtTime(cur.create_time)}
            {cur.start_time ? ` · 有效期：${cur.start_time} ~ ${cur.end_time || '长期'}` : ''}
          </div>
          <Rich html={cur.content} />
        </Modal>
      ) : null}
    </div>
  );
}

/* ======================= 问答知识（/article/index/index） ======================= */

export function DesktopArticle() {
  const [list, setList] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState('');
  const [cate, setCate] = useState('');
  const [cur, setCur] = useState<Article | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchArticles()
      .then((r) => {
        setList(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const cates = useMemo(() => {
    const s = new Set<string>();
    list.forEach((a) => a.cate_title && s.add(a.cate_title));
    return [...s].sort();
  }, [list]);

  const rows = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return list.filter((a) => (!cate || a.cate_title === cate) && (!k || (a.title + (a.desc || '')).toLowerCase().includes(k)));
  }, [list, kw, cate]);

  const cols: Column<Article>[] = [
    { key: 'id', title: '编号', width: 80, render: (r) => String(r.id ?? '—') },
    {
      key: 'title',
      title: '问题',
      width: 320,
      render: (r) => <span className="pc-td-strong">{plain(r.title).replace(/\n+/g, ' ').slice(0, 80)}</span>,
    },
    { key: 'cate', title: '分类', width: 130, render: (r) => <StatusTag tone="ok">{r.cate_title || '—'}</StatusTag> },
    { key: 'desc', title: '回答', width: 320, render: (r) => plain(r.desc || '').slice(0, 60) || '—' },
    { key: 'read', title: '阅读量', width: 90, align: 'center', render: (r) => String((r as any).read ?? '—') },
    { key: 'user', title: '发布人', width: 110, render: (r) => (r as any).user || '—' },
    { key: 'dept', title: '部门', width: 150, render: (r) => (r as any).department || '—' },
    { key: 'time', title: '创建时间', width: 150, render: (r) => fmtTime(r.create_time) },
    {
      key: 'op',
      title: '操作',
      width: 90,
      render: (r) => (
        <span className="pc-link" onClick={() => setCur(r)}>
          查看
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="问答知识"
        crumb={['知识管理', '问答知识']}
        desc={`共 ${rows.length} 条`}
        actions={
          <>
            <button className="pc-btn pc-btn-ghost" onClick={load}>
              刷新
            </button>
            <button
              className="pc-btn"
              onClick={() => {
                const head = ['编号', '问题', '分类', '回答', '阅读量', '发布人', '部门', '创建时间'];
                const lines = rows.map((r) => [
                  r.id,
                  plain(r.title).replace(/\n+/g, ' '),
                  r.cate_title || '',
                  plain(r.desc || '').replace(/\n+/g, ' '),
                  (r as any).read ?? '',
                  (r as any).user ?? '',
                  (r as any).department ?? '',
                  r.create_time,
                ]);
                const csv =
                  '\uFEFF' +
                  [head, ...lines]
                    .map((r) => r.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(','))
                    .join('\r\n');
                const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                const el = document.createElement('a');
                el.href = url;
                el.download = '问答知识.csv';
                el.click();
                URL.revokeObjectURL(url);
                toast('已导出 ' + rows.length + ' 条');
              }}
            >
              导出(CSV)
            </button>
          </>
        }
      />
      <Panel bodyPad={false}>
        <div style={{ padding: '14px 16px' }}>
          <div className="pc-toolbar">
            <input
              className="pc-input"
              style={{ width: 300 }}
              placeholder="搜索问题关键词 / 结论"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
            <select className="pc-input" style={{ width: 200 }} value={cate} onChange={(e) => setCate(e.target.value)}>
              <option value="">全部分类</option>
              {cates.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button className="pc-btn pc-btn-ghost" onClick={() => { setKw(''); setCate(''); }}>
              重置
            </button>
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable columns={cols} rows={rows} rowKey={(r) => String(r.id)} onRowClick={setCur} loading={loading} pageSize={20} />
        </div>
      </Panel>

      {cur ? (
        <Modal
          title={plain(cur.title).replace(/\n+/g, ' ').slice(0, 60)}
          onClose={() => setCur(null)}
          footer={
            <button className="pc-btn" onClick={() => setCur(null)}>
              关闭
            </button>
          }
        >
          <div style={{ fontSize: 12.5, color: 'var(--c-text-4)', marginBottom: 12 }}>
            {cur.cate_title ? `分类：${cur.cate_title} · ` : ''}
            {cur.department ? `部门：${cur.department} · ` : ''}
            时间：{fmtTime(cur.create_time)}
          </div>
          <Rich html={cur.content || cur.desc} />
        </Modal>
      ) : null}
    </div>
  );
}

/* ======================= 消息中心（/message/index/inbox） ======================= */

const MSG_TABS = [
  { key: '', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'read', label: '已读' },
];

export function DesktopMessage() {
  const [list, setList] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('');
  const [cur, setCur] = useState<Message | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchMessages()
      .then((r) => {
        setList(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    if (tab === 'unread') return list.filter((m) => !m.read_time);
    if (tab === 'read') return list.filter((m) => !!m.read_time);
    return list;
  }, [list, tab]);

  const cols: Column<Message>[] = [
    { key: 'title', title: '消息内容', render: (r) => <span className="pc-td-strong">{r.title}</span> },
    { key: 'type', title: '类型', width: 120, render: (r) => <StatusTag tone="info">{r.type_title || r.module_name || '系统'}</StatusTag> },
    { key: 'from', title: '来源', width: 120, render: (r) => r.from_name || '系统' },
    { key: 'send', title: '发送时间', width: 160, render: (r) => fmtTime(r.send_time || r.create_time) },
    {
      key: 'read',
      title: '状态',
      width: 90,
      render: (r) => (r.read_time ? <StatusTag tone="info">已读</StatusTag> : <StatusTag tone="wait">未读</StatusTag>),
    },
    {
      key: 'op',
      title: '操作',
      width: 90,
      render: (r) => (
        <span className="pc-link" onClick={() => setCur(r)}>
          查看
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="消息中心"
        crumb={['消息管理', '我的消息']}
        desc={`共 ${rows.length} 条 · 未读 ${list.filter((m) => !m.read_time).length} 条`}
        actions={
          <button className="pc-btn pc-btn-ghost" onClick={load}>
            刷新
          </button>
        }
      />
      <Panel bodyPad={false}>
        <div style={{ padding: '12px 16px 0' }}>
          <FilterTabs tabs={MSG_TABS} value={tab} onChange={(v: string) => setTab(v)} />
        </div>
        <div style={{ padding: '12px 16px' }}>
          <DataTable columns={cols} rows={rows} rowKey={(r) => String(r.id)} onRowClick={setCur} loading={loading} pageSize={20} />
        </div>
      </Panel>

      {cur ? (
        <Modal
          title={cur.title}
          onClose={() => setCur(null)}
          footer={
            <button className="pc-btn" onClick={() => setCur(null)}>
              关闭
            </button>
          }
        >
          <div style={{ fontSize: 12.5, color: 'var(--c-text-4)', marginBottom: 12 }}>
            来自：{cur.from_name || '系统'} · {cur.type_title || ''} · {fmtTime(cur.send_time || cur.create_time)}
            {cur.read_time ? ` · 已读于 ${fmtTime(cur.read_time)}` : ' · 未读'}
          </div>
          <Rich html={cur.content} />
        </Modal>
      ) : null}
    </div>
  );
}

/* ======================= 通讯录（/home/index/mail_list） ======================= */

export function DesktopMail() {
  const [list, setList] = useState<MailContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback((k: string) => {
    setLoading(true);
    fetchMails(k)
      .then((r) => {
        setList(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => load(query), [query, load]);

  const cols: Column<MailContact>[] = [
    { key: 'name', title: '姓名', width: 120, render: (r) => <span className="pc-td-strong">{r.name}</span> },
    { key: 'dept', title: '部门', width: 180, render: (r) => r.department || '—' },
    { key: 'pos', title: '职位', width: 160, render: (r) => r.position || '—' },
    { key: 'mobile', title: '手机', width: 140, render: (r) => r.mobile || r.tel || '—' },
    { key: 'email', title: '邮箱', render: (r) => r.email || '—' },
    {
      key: 'op',
      title: '操作',
      width: 140,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 10 }}>
          {r.mobile || r.tel ? (
            <a className="pc-link" href={`tel:${String(r.mobile || r.tel || '').replace(/[^\d+-]/g, '')}`}>
              拨打
            </a>
          ) : null}
          {r.email ? (
            <a className="pc-link" href={`mailto:${r.email}`}>
              邮件
            </a>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="通讯录"
        crumb={['人事管理', '通讯录']}
        desc={`共 ${list.length} 人`}
        actions={
          <button className="pc-btn pc-btn-ghost" onClick={() => load(query)}>
            刷新
          </button>
        }
      />
      <Panel bodyPad={false}>
        <div style={{ padding: '14px 16px' }}>
          <div className="pc-toolbar">
            <input
              className="pc-input"
              style={{ width: 280 }}
              placeholder="搜索姓名 / 部门"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setQuery(kw);
              }}
            />
            <button className="pc-btn" onClick={() => setQuery(kw)}>
              查询
            </button>
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable columns={cols} rows={list} rowKey={(r) => String(r.id)} loading={loading} pageSize={20} />
        </div>
      </Panel>
    </div>
  );
}

/* ======================= 占位页（需后端接口，当前未接） ======================= */

const PLACEHOLDER: Record<string, string> = {
  'finance-advance': '预存款余额与流水',
  'finance-income': '到账记录（发票维度）',
  'finance-order': '到账记录（订单维度）',
  deduction: '我申请的抵扣券',
  'deduction-checked': '待我处理的抵扣券',
  margin: '保证金缴纳与退还记录',
  'invoice-my': '我申请的发票',
  'invoice-handle': '待我处理的发票',
  'orderapply-handle': '待我处理的订单到账',
  contact: '客户联系人列表',
  chance: '销售机会列表',
  trace: '客户跟进记录',
  'order-my': '我申请的订单',
  'order-handle': '待我处理的订单',
  sample: '样本寄送与回收记录',
  school: '校展活动申请与记录',
  after: '售后服务申请与处理',
  'customer-add': '新增客户表单',
  profile: '个人基本资料',
  password: '修改登录密码',
};

export function DesktopPlaceholder({ pageKey }: { pageKey: string }) {
  const title = PLACEHOLDER[pageKey] || '功能页';
  return (
    <div>
      <PageHead title={title} desc="该模块正在接入中" />
      <Panel>
        <div style={{ fontSize: 13.5, lineHeight: 1.9, color: 'var(--c-text-2)' }}>
          「{title}」的原站接口字段尚未映射到本页，当前以通用列表呈现。
          已接入的模块（客户 / 产品 / 公告 / 问答 / 消息 / 附件 / 审批 / 通讯录）均为后端真实数据。
        </div>
      </Panel>
    </div>
  );
}
