/** 桌面端内容类页面：公告 / 问答 / 消息 / 通讯录 / 演示占位 */
import { useCallback, useEffect, useState } from 'react';
import { fetchArticles, fetchMails, fetchMessages, fetchNotes } from '../core/api';
import { shareContent } from '../core/share';
import type { Article, MailContact, Message, Note } from '../core/types';
import { fmtTime, toast } from '../core/util';
import { Empty, Loading } from './ui';

/* ======================= 公告 ======================= */

export function DesktopNote() {
  const [list, setList] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState<Note | null>(null);
  const load = useCallback(() => {
    setLoading(true);
    fetchNotes().then((r) => {
      setList(r);
      setCur((p) => (p ? r.find((x) => x.id === p.id) || r[0] || null : r[0] || null));
      setLoading(false);
    });
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <div className="d-page-head">
        <span className="d-page-title">企业公告</span>
        <span className="d-page-sub">共 {list.length} 条</span>
      </div>
      <div className="d-cols-2">
        <div className="d-list">
          {loading ? <Loading /> : list.length === 0 ? <Empty /> :
            list.map((n) => (
              <div key={n.id} className={`d-list-row${cur?.id === n.id ? ' active' : ''}`} onClick={() => setCur(n)}>
                <div className="d-row-main">
                  <div className="d-row-title">{n.title}</div>
                  <div className="d-row-sub">{n.cate_title} · {n.admin_name} · {fmtTime(n.create_time)}</div>
                </div>
              </div>
            ))}
        </div>
        <div className="d-card">
          {cur ? (
            <>
              <div className="d-card-title" style={{ fontSize: 16 }}>{cur.title}</div>
              <div className="d-card-line" style={{ marginBottom: 12 }}>{cur.admin_name} · {fmtTime(cur.create_time)}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.9 }} dangerouslySetInnerHTML={{ __html: cur.content || '' }} />
              <button
                className="d-btn d-btn-primary"
                style={{ marginTop: 14 }}
                onClick={() => {
                  void shareContent({ title: cur.title, text: `${cur.cate_title} · ${cur.admin_name}`, url: location.href }).then((r) => {
                    if (r.ok) toast(r.via === 'clipboard' ? '已复制分享内容' : '已调起分享');
                    else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
                  });
                }}
              >
                转发本公告
              </button>
            </>
          ) : <Empty />}
        </div>
      </div>
    </div>
  );
}

/* ======================= 问答知识 ======================= */

export function DesktopArticle() {
  const [list, setList] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState<Article | null>(null);
  const load = useCallback(() => {
    setLoading(true);
    fetchArticles().then((r) => {
      setList(r);
      setCur((p) => (p ? r.find((x) => x.id === p.id) || r[0] || null : r[0] || null));
      setLoading(false);
    });
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <div className="d-page-head">
        <span className="d-page-title">问答知识</span>
        <span className="d-page-sub">共 {list.length} 条</span>
      </div>
      <div className="d-cols-2">
        <div className="d-list">
          {loading ? <Loading /> : list.length === 0 ? <Empty /> :
            list.map((a) => (
              <div key={a.id} className={`d-list-row${cur?.id === a.id ? ' active' : ''}`} onClick={() => setCur(a)}>
                <div className="d-row-main">
                  <div className="d-row-title">{a.title}</div>
                  <div className="d-row-sub">{a.cate_title} · {fmtTime(a.create_time)}</div>
                </div>
              </div>
            ))}
        </div>
        <div className="d-card">
          {cur ? (
            <>
              <div className="d-card-title" style={{ fontSize: 16 }}>{cur.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.9, marginTop: 10 }} dangerouslySetInnerHTML={{ __html: cur.content || '' }} />
            </>
          ) : <Empty />}
        </div>
      </div>
    </div>
  );
}

/* ======================= 消息中心 ======================= */

export function DesktopMessage() {
  const [list, setList] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState<Message | null>(null);
  const load = useCallback(() => {
    setLoading(true);
    fetchMessages().then((r) => {
      setList(r);
      setCur((p) => (p ? r.find((x) => x.id === p.id) || r[0] || null : r[0] || null));
      setLoading(false);
    });
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <div className="d-page-head">
        <span className="d-page-title">消息中心</span>
        <span className="d-page-sub">未读 {list.filter((m) => !m.is_read).length} 条</span>
      </div>
      <div className="d-cols-2">
        <div className="d-list">
          {loading ? <Loading /> : list.length === 0 ? <Empty /> :
            list.map((m) => (
              <div key={m.id} className={`d-list-row${cur?.id === m.id ? ' active' : ''}`} onClick={() => setCur(m)}>
                <div className="d-row-main">
                  <div className="d-row-title">{m.title}</div>
                  <div className="d-row-sub">{m.from_name} · {fmtTime(m.create_time)}</div>
                </div>
                {!m.is_read ? <span className="d-tag d-tag-pending">未读</span> : null}
              </div>
            ))}
        </div>
        <div className="d-card">
          {cur ? (
            <>
              <div className="d-card-title" style={{ fontSize: 16 }}>{cur.title}</div>
              <div className="d-card-line" style={{ marginBottom: 12 }}>来自 {cur.from_name} · {fmtTime(cur.create_time)}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.9 }} dangerouslySetInnerHTML={{ __html: cur.content || '' }} />
            </>
          ) : <Empty />}
        </div>
      </div>
    </div>
  );
}

/* ======================= 通讯录（表格） ======================= */

export function DesktopMail() {
  const [list, setList] = useState<MailContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState('');
  const [query, setQuery] = useState('');
  const load = useCallback((k: string) => {
    setLoading(true);
    fetchMails(k).then((r) => {
      setList(r);
      setLoading(false);
    });
  }, []);
  useEffect(() => load(query), [query, load]);

  return (
    <div>
      <div className="d-page-head">
        <span className="d-page-title">通讯录</span>
        <span className="d-page-sub">共 {list.length} 人</span>
        <span className="d-page-actions">
          <div className="d-search" style={{ maxWidth: 260 }}>
            <span className="d-search-ico">🔍</span>
            <input
              placeholder="姓名 / 部门"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setQuery(kw);
              }}
            />
          </div>
        </span>
      </div>
      <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? <Loading /> : list.length === 0 ? <Empty /> : (
          <table className="d-table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>姓名</th>
                <th style={{ width: 140 }}>部门</th>
                <th style={{ width: 140 }}>职位</th>
                <th style={{ width: 160 }}>电话</th>
                <th>邮箱</th>
                <th style={{ width: 140 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td style={{ color: 'var(--c-text)', fontWeight: 500 }}>{m.name}</td>
                  <td>{m.department}</td>
                  <td>{m.position}</td>
                  <td>{m.tel}</td>
                  <td>{m.email}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a className="d-btn d-btn-ghost d-btn-sm" href={`tel:${(m.tel || '').replace(/[^\d+-]/g, '')}`}>拨打</a>
                      <a className="d-btn d-btn-ghost d-btn-sm" href={`mailto:${m.email || ''}`}>邮件</a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ======================= 演示占位 ======================= */

const PLACEHOLDER: Record<string, string> = {
  'finance-advance': '预存款余额与流水', 'finance-income': '到账记录（发票维度）',
  'finance-order': '到账记录（订单维度）', deduction: '我申请的抵扣券',
  'deduction-checked': '待我处理的抵扣券', margin: '保证金缴纳与退还记录',
  'invoice-my': '我申请的发票', 'invoice-handle': '待我处理的发票',
  'orderapply-handle': '待我处理的订单到账', contact: '客户联系人列表',
  chance: '销售机会列表', trace: '客户跟进记录', 'order-my': '我申请的订单',
  'order-handle': '待我处理的订单', sample: '样本寄送与回收记录',
  school: '校展活动申请与记录', after: '售后服务申请与处理',
  'customer-add': '新增客户表单', profile: '个人基本资料', password: '修改登录密码',
};

export function DesktopPlaceholder({ pageKey }: { pageKey: string }) {
  const title = PLACEHOLDER[pageKey] || '功能页';
  return (
    <div>
      <div className="d-page-head">
        <span className="d-page-title">{title}</span>
      </div>
      <div className="d-notice">
        <b>演示模式</b>
        「{title}」依赖真实 OA 后端接口（需登录会话）。当前站点为纯静态部署，
        后端无 CORS 响应头（实测 403 且无 <code>Access-Control-Allow-Origin</code>），浏览器无法直连。
        <div style={{ marginTop: 6 }}>
          配置 <code>VITE_OA_PROXY</code>（部署 workers/oa-proxy.js）后即可接入真实数据，视图层无需改动。
          详见 README「已知限制 L-5」。
        </div>
      </div>
      <div className="d-card">
        <div className="d-card-line">该页面的真实数据来自 OA 后端，接入后自动填充。</div>
      </div>
    </div>
  );
}
