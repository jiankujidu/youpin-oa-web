/**
 * 桌面端客户页 — 三栏（左筛选 / 中列表 / 右详情）
 * 与手机端的「分段 + chips + 单列卡片」是两套独立设计
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchCustomers } from '../core/api';
import type { Customer } from '../core/types';
import { fmtTime } from '../core/util';
import { Empty, Loading } from './ui';
import { Icon } from '../core/icons';

const GRADES: ['' | Customer['grade'], string][] = [
  ['', '全部等级'],
  ['deal', '成交客户'],
  ['lead', '重点线索'],
  ['normal', '常规客户'],
  ['sleep', '沉睡客户'],
];

export default function DesktopCustomer() {
  const [type, setType] = useState<1 | 2 | 3>(1);
  const [grade, setGrade] = useState<'' | Customer['grade']>('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState<Customer | null>(null);

  const load = useCallback((t: 1 | 2 | 3, kw: string) => {
    setLoading(true);
    fetchCustomers(t, kw).then((rows) => {
      setList(rows);
      setLoading(false);
      setCur((prev) => (prev ? rows.find((r) => r.id === prev.id) || rows[0] || null : rows[0] || null));
    });
  }, []);

  useEffect(() => {
    load(type, query);
  }, [type, query, load]);

  const shown = grade ? list.filter((c) => c.grade === grade) : list;

  return (
    <div>
      <div className="d-page-head">
        <span className="d-page-title">客户</span>
        <span className="d-page-sub">共 {shown.length} 家</span>
        <span className="d-page-actions">
          {(
            [
              [1, '我的客户'],
              [2, '公海'],
              [3, '废弃'],
            ] as [1 | 2 | 3, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              className={`d-btn ${type === t ? 'd-btn-primary' : 'd-btn-ghost'}`}
              onClick={() => setType(t)}
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      <div className="d-cols-3">
        {/* ===== 左：筛选（常驻面板，桌面习惯）===== */}
        <div className="d-col-panel">
          <div className="d-list-head">筛选</div>
          <div style={{ padding: 12 }}>
            <div className="d-search" style={{ maxWidth: 'none', marginBottom: 12 }}>
              <span className="d-search-ico"><Icon name="search" size={16} /></span>
              <input
                placeholder="名称 / 联系人 / 电话"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setQuery(keyword);
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginBottom: 8 }}>客户等级</div>
            {GRADES.map(([g, label]) => (
              <div key={label} className={`d-nav-item${grade === g ? ' active' : ''}`} onClick={() => setGrade(g)}>
                {label}
              </div>
            ))}
            <button
              className="d-btn d-btn-ghost"
              style={{ width: '100%', marginTop: 12 }}
              onClick={() => {
                setKeyword('');
                setQuery('');
                setGrade('');
              }}
            >
              重置筛选
            </button>
          </div>
        </div>

        {/* ===== 中：列表 ===== */}
        <div className="d-list">
          <div className="d-list-head">客户列表</div>
          {loading ? (
            <Loading />
          ) : shown.length === 0 ? (
            <Empty text="暂无客户" />
          ) : (
            shown.map((c) => (
              <div
                key={c.id}
                className={`d-list-row${cur?.id === c.id ? ' active' : ''}`}
                onClick={() => setCur(c)}
              >
                <div className="d-row-main">
                  <div className="d-row-title">{c.name}</div>
                  <div className="d-row-sub">
                    {c.contact || '—'} · {c.tel || '—'} · {c.admin_name || '—'}
                  </div>
                </div>
                <span className={`d-tag ${c.grade === 'deal' ? 'd-tag-reject' : c.grade === 'lead' ? 'd-tag-pending' : 'd-tag-pass'}`}>
                  {c.grade_text}
                </span>
              </div>
            ))
          )}
        </div>

        {/* ===== 右：详情 ===== */}
        <div className="d-col-panel">
          <div className="d-list-head">客户详情</div>
          {cur ? (
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{cur.name}</div>
              <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginBottom: 14 }}>
                {cur.grade_text}
                {cur.has_wechat ? ' · 已加微信' : ''}
              </div>
              {(
                [
                  ['联系人', cur.contact],
                  ['联系电话', cur.tel],
                  ['客户来源', cur.source],
                  ['归属销售', cur.admin_name],
                  ['地址', cur.address],
                  ['创建时间', fmtTime(cur.create_time)],
                  ['最近跟进', cur.last_time ? fmtTime(cur.last_time) : ''],
                  ['备注', cur.remark],
                ] as [string, string | undefined][]
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--c-border-2)', fontSize: 13 }}>
                    <span style={{ width: 72, flex: 'none', color: 'var(--c-text-3)' }}>{k}</span>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--c-text)', wordBreak: 'break-all' }}>{v}</span>
                  </div>
                ))}
              {cur.tel ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <a className="d-btn d-btn-ghost d-btn-sm" href={`tel:${cur.tel.replace(/[^\d+-]/g, '')}`}>
                    拨打电话
                  </a>
                  <button
                    className="d-btn d-btn-ghost d-btn-sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(cur.tel || '');
                    }}
                  >
                    复制号码
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <Empty text="请选择左侧客户" />
          )}
        </div>
      </div>
    </div>
  );
}
