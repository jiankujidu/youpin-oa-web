/**
 * 手机端客户页 — 复刻 app.js renderCustomer()
 * 分段（我的客户/公海/废弃）+ 搜索 + 快捷筛选 chips + 客户卡片 + 客户功能宫格
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchCustomers } from '../core/api';
import type { Customer } from '../core/types';
import { fmtTime } from '../core/util';
import { Empty, Loading } from './ui';

const GRADES: ['' | Customer['grade'], string][] = [
  ['', '全部'],
  ['deal', '成交客户'],
  ['lead', '重点线索'],
  ['normal', '常规客户'],
  ['sleep', '沉睡客户'],
];

const FEATURES: [string, string, string][] = [
  ['contact', '👤', '联系人'],
  ['chance', '🎯', '销售机会'],
  ['trace', '📝', '跟进记录'],
  ['order-my', '📦', '我的订单'],
  ['order-handle', '⚙️', '订单处理'],
  ['sample', '🧫', '样本管理'],
  ['school', '🏫', '校展管理'],
  ['after', '🔨', '售后管理'],
];

export default function MobileCustomer({ onOpenSub }: { onOpenSub: (key: string) => void }) {
  const [type, setType] = useState<1 | 2 | 3>(1);
  const [grade, setGrade] = useState<'' | Customer['grade']>('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Customer | null>(null);

  const load = useCallback((t: 1 | 2 | 3, kw: string) => {
    setLoading(true);
    fetchCustomers(t, kw).then((rows) => {
      setList(rows);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load(type, query);
  }, [type, query, load]);

  const shown = grade ? list.filter((c) => c.grade === grade) : list;

  /* ======================= 详情 ======================= */
  if (detail) {
    const rows: [string, string][] = [
      ['客户名称', detail.name],
      ['客户等级', detail.grade_text],
      ['联系人', detail.contact || ''],
      ['联系电话', detail.tel || ''],
      ['客户来源', detail.source || ''],
      ['归属销售', detail.admin_name || ''],
      ['地址', detail.address || ''],
      ['创建时间', fmtTime(detail.create_time)],
      ['最近跟进', detail.last_time ? fmtTime(detail.last_time) : ''],
      ['备注', detail.remark || ''],
    ];
    return (
      <div>
        <div className="m-detail-head">
          <div className="m-dh-title">{detail.name}</div>
          <div className="m-dh-sub">
            <span className={`m-cust-grade cg-${detail.grade}`} style={{ color: '#fff', background: 'rgba(255,255,255,.2)' }}>
              {detail.grade_text}
            </span>
            {detail.has_wechat ? ' · 已加微信' : ''}
          </div>
        </div>

        <div className="m-detail-card">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div className="m-detail-row" key={k}>
                <span className="dl">{k}</span>
                <span className="dv">{v}</span>
              </div>
            ))}
        </div>

        {detail.tel ? (
          <div className="m-card">
            <div className="m-card-title">快捷操作</div>
            <div className="m-file-actions">
              <a className="m-mini-btn" href={`tel:${detail.tel.replace(/[^\d+-]/g, '')}`}>
                拨打电话
              </a>
              <button
                className="m-mini-btn m-mini-green"
                onClick={() => {
                  void navigator.clipboard?.writeText(detail.tel || '');
                }}
              >
                复制号码
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ padding: '0 12px 20px' }}>
          <button
            className="m-btn"
            style={{ background: '#f0f2f5', color: '#666' }}
            onClick={() => setDetail(null)}
          >
            返回列表
          </button>
        </div>
      </div>
    );
  }

  /* ======================= 列表 ======================= */
  return (
    <div>
      <div className="m-seg">
        {(
          [
            [1, '我的客户'],
            [2, '公海'],
            [3, '废弃'],
          ] as [1 | 2 | 3, string][]
        ).map(([t, label]) => (
          <div key={t} className={`m-seg-item${type === t ? ' active' : ''}`} onClick={() => setType(t)}>
            {label}
          </div>
        ))}
      </div>

      <div className="m-search-bar">
        <input
          value={keyword}
          placeholder="搜索客户名称/手机号/联系人"
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setQuery(keyword);
          }}
        />
        <span className="m-search-btn" onClick={() => setQuery(keyword)}>
          搜索
        </span>
      </div>

      <div className="m-quick-row no-sb">
        {GRADES.map(([g, label]) => (
          <span
            key={label}
            className={`m-chip${grade === g ? ' active' : ''}`}
            onClick={() => setGrade(g)}
          >
            {label}
          </span>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty text="暂无客户" />
      ) : (
        shown.map((c) => (
          <div key={c.id} className="m-cust-card" onClick={() => setDetail(c)}>
            <div className="m-cust-hd">
              <div className="m-cust-name">{c.name}</div>
              <span className={`m-cust-grade cg-${c.grade}`}>{c.grade_text}</span>
            </div>
            {c.contact ? (
              <div className="m-cust-row">
                <span className="ci">👤</span>
                <span className="ct">
                  {c.contact}
                  {c.tel ? ` · ${c.tel}` : ''}
                </span>
              </div>
            ) : null}
            <div className="m-cust-row">
              <span className="ci">🏷</span>
              <span className="ct">来源：{c.source || '—'}{c.has_wechat ? ' · 已加微信' : ''}</span>
            </div>
            <div className="m-cust-foot">
              <span>归属：{c.admin_name || '—'}</span>
              <span>{c.last_time ? fmtTime(c.last_time) : ''}</span>
            </div>
          </div>
        ))
      )}

      <div className="m-section-title">客户功能</div>
      <div className="m-grid">
        {FEATURES.map(([key, icon, name]) => (
          <div key={key} className="m-grid-item" onClick={() => onOpenSub(key)}>
            <span className="m-gi-icon">{icon}</span>
            <span className="m-gi-text">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
