/**
 * 手机端内容类子页面：企业公告 / 问答知识 / 消息中心 / 通讯录
 * 以及财务与客户子功能的「演示模式」占位页
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchArticles, fetchMails, fetchMessages, fetchNotes } from '../core/api';
import { shareContent } from '../core/share';
import type { Article, MailContact, Message, Note } from '../core/types';
import { fmtTime, toast } from '../core/util';
import { Empty, Loading } from './ui';

/* ======================= 企业公告 ======================= */

export function MobileNote() {
  const [list, setList] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Note | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchNotes().then((r) => {
      setList(r);
      setLoading(false);
    });
  }, []);
  useEffect(load, [load]);

  if (detail) {
    return (
      <div>
        <div className="m-detail-head">
          <div className="m-dh-title">{detail.title}</div>
          <div className="m-dh-sub">
            {detail.cate_title} · {detail.admin_name} · {fmtTime(detail.create_time)}
          </div>
        </div>
        <div className="m-detail-content" dangerouslySetInnerHTML={{ __html: detail.content || '' }} />
        <div className="m-card">
          <div className="m-card-title">转发</div>
          <div className="m-file-actions">
            <button
              className="m-mini-btn m-mini-green"
              onClick={() => {
                void shareContent({ title: detail.title, text: `${detail.cate_title} · ${detail.admin_name}`, url: location.href }).then((r) => {
                  if (r.ok) toast(r.via === 'clipboard' ? '已复制分享内容' : '已调起分享');
                  else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
                });
              }}
            >
              转发本公告
            </button>
          </div>
        </div>
        <div style={{ padding: '0 12px 20px' }}>
          <button className="m-btn" style={{ background: '#f0f2f5', color: '#666' }} onClick={() => setDetail(null)}>
            返回列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {loading ? <Loading /> : list.length === 0 ? <Empty text="暂无公告" /> :
        list.map((n) => (
          <div key={n.id} className="m-card clickable" onClick={() => setDetail(n)}>
            <div className="m-card-title">{n.title}</div>
            <div className="m-card-line">
              {n.cate_title} · {n.admin_name} · {fmtTime(n.create_time)}
            </div>
          </div>
        ))}
      <div style={{ height: 8 }} />
    </div>
  );
}

/* ======================= 问答知识 ======================= */

export function MobileArticle() {
  const [list, setList] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Article | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchArticles().then((r) => {
      setList(r);
      setLoading(false);
    });
  }, []);
  useEffect(load, [load]);

  if (detail) {
    return (
      <div>
        <div className="m-detail-head">
          <div className="m-dh-title">{detail.title}</div>
          <div className="m-dh-sub">
            {detail.cate_title} · {fmtTime(detail.create_time)}
          </div>
        </div>
        <div className="m-detail-content" dangerouslySetInnerHTML={{ __html: detail.content || '' }} />
        <div style={{ padding: '0 12px 20px' }}>
          <button className="m-btn" style={{ background: '#f0f2f5', color: '#666' }} onClick={() => setDetail(null)}>
            返回列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {loading ? <Loading /> : list.length === 0 ? <Empty text="暂无内容" /> :
        list.map((a) => (
          <div key={a.id} className="m-card clickable" onClick={() => setDetail(a)}>
            <div className="m-card-title">{a.title}</div>
            <div className="m-card-line">
              {a.cate_title} · {fmtTime(a.create_time)}
            </div>
          </div>
        ))}
      <div style={{ height: 8 }} />
    </div>
  );
}

/* ======================= 消息中心 ======================= */

export function MobileMessage() {
  const [list, setList] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Message | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchMessages().then((r) => {
      setList(r);
      setLoading(false);
    });
  }, []);
  useEffect(load, [load]);

  if (detail) {
    return (
      <div>
        <div className="m-detail-head">
          <div className="m-dh-title">{detail.title}</div>
          <div className="m-dh-sub">
            来自 {detail.from_name} · {fmtTime(detail.create_time)}
          </div>
        </div>
        <div className="m-detail-content" dangerouslySetInnerHTML={{ __html: detail.content || '' }} />
        <div style={{ padding: '0 12px 20px' }}>
          <button className="m-btn" style={{ background: '#f0f2f5', color: '#666' }} onClick={() => setDetail(null)}>
            返回列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {loading ? <Loading /> : list.length === 0 ? <Empty text="暂无消息" /> :
        list.map((m) => (
          <div key={m.id} className="m-card clickable" onClick={() => setDetail(m)}>
            <div className="m-card-title">
              {!m.is_read ? <span className="m-tag m-tag-pending">未读</span> : null}
              {m.title}
            </div>
            <div className="m-card-line">
              {m.from_name} · {fmtTime(m.create_time)}
            </div>
          </div>
        ))}
      <div style={{ height: 8 }} />
    </div>
  );
}

/* ======================= 通讯录 ======================= */

export function MobileMail() {
  const [list, setList] = useState<MailContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback((kw: string) => {
    setLoading(true);
    fetchMails(kw).then((r) => {
      setList(r);
      setLoading(false);
    });
  }, []);
  useEffect(() => load(query), [query, load]);

  return (
    <div>
      <div className="m-search-bar">
        <input
          value={keyword}
          placeholder="搜索姓名 / 部门"
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setQuery(keyword);
          }}
        />
        <span className="m-search-btn" onClick={() => setQuery(keyword)}>
          搜索
        </span>
      </div>
      {loading ? <Loading /> : list.length === 0 ? <Empty text="暂无联系人" /> :
        list.map((m) => (
          <div key={m.id} className="m-card">
            <div className="m-card-title">{m.name}</div>
            <div className="m-card-line">
              {m.department} · {m.position}
            </div>
            <div className="m-card-line">{m.tel}</div>
            <div className="m-file-actions">
              <a className="m-mini-btn m-mini-blue" href={`tel:${(m.tel || '').replace(/[^\d+-]/g, '')}`}>
                拨打
              </a>
              <a className="m-mini-btn m-mini-green" href={`mailto:${m.email || ''}`}>
                邮件
              </a>
            </div>
          </div>
        ))}
      <div style={{ height: 8 }} />
    </div>
  );
}

/* ======================= 通用「演示模式」占位页 ======================= */

const PLACEHOLDER_TEXT: Record<string, string> = {
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

export function MobilePlaceholder({ pageKey }: { pageKey: string }) {
  const title = PLACEHOLDER_TEXT[pageKey] || '功能页';
  return (
    <div>
      <div className="m-notice">
        <b>演示模式</b>
        「{title}」依赖真实 OA 后端接口（需登录会话）。当前站点为纯静态部署，后端无 CORS 响应头，
        浏览器无法直连，因此本页展示占位说明。
        <div style={{ marginTop: 8 }}>
          配置 <code>VITE_OA_PROXY</code>（部署 workers/oa-proxy.js）后即可接入真实数据，
          视图层无需改动。详见 README「已知限制 L-5」。
        </div>
      </div>
      <div className="m-card">
        <div className="m-card-title">{title}</div>
        <div className="m-card-line">该页面的真实数据来自 OA 后端，接入后自动填充。</div>
      </div>
    </div>
  );
}
