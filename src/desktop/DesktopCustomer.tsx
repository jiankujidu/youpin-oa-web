/**
 * 客户管理 › 客户列表（/customer/index/index | /sea | /trash）
 * PC 后台统一版式：筛选 Tab + 工具栏 + 数据表格 + 分页 + 详情弹层
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCustomers } from '../core/api';
import type { Customer } from '../core/types';
import { fmtTime, toast } from '../core/util';
import { Modal } from './ui';
import { DataTable, FilterTabs, PageHead, Panel, StatusTag, type Column } from './pc';

const TABS = [
  { key: 1, label: '我的客户' },
  { key: 2, label: '公海客户' },
  { key: 3, label: '废弃客户' },
] as { key: 1 | 2 | 3; label: string }[];

const GRADES = ['', 'AA类成交经销商', 'A类成交终端', 'B类意向客户', 'C类潜在客户', 'D类无效客户'];

const CRUMB: Record<number, string[]> = {
  1: ['客户管理', '我的客户'],
  2: ['客户管理', '公海客户'],
  3: ['客户管理', '废弃客户'],
};

function gradeText(c: Customer): string {
  return c.grade_text || String((c as any).grade || '') || '—';
}

function statusTone(s?: string): 'ok' | 'no' | 'wait' | 'info' {
  if (!s) return 'info';
  if (/成交|已签|合作/.test(s)) return 'ok';
  if (/无效|废弃|流失|关闭/.test(s)) return 'no';
  if (/意向|跟进|待/.test(s)) return 'wait';
  return 'info';
}

export default function DesktopCustomer({ initialType = 1 }: { initialType?: 1 | 2 | 3 } = {}) {
  const [type, setType] = useState<1 | 2 | 3>(initialType);
  const [grade, setGrade] = useState('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState<Customer | null>(null);

  const load = useCallback((t: 1 | 2 | 3, kw: string) => {
    setLoading(true);
    fetchCustomers(t, kw)
      .then((rows) => {
        setList(rows);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setLoading(false);
        toast('客户列表加载失败：' + (e instanceof Error ? e.message : '网络异常'));
      });
  }, []);

  useEffect(() => {
    load(type, query);
  }, [type, query, load]);

  /** 左侧菜单切换（客户列表 / 公海 / 废弃）时同步类型 */
  useEffect(() => {
    setType(initialType);
  }, [initialType]);

  const rows = useMemo(
    () => (grade ? list.filter((c) => gradeText(c).includes(grade)) : list),
    [list, grade],
  );

  const cols: Column<Customer>[] = [
    {
      key: 'name',
      title: '客户名称',
      render: (r) => <span className="pc-td-strong">{r.name}</span>,
    },
    { key: 'grade', title: '客户等级', width: 140, render: (r) => <StatusTag tone="info">{gradeText(r)}</StatusTag> },
    { key: 'status', title: '客户状态', width: 100, render: (r) => <StatusTag tone={statusTone(r.status_name)}>{r.status_name || '—'}</StatusTag> },
    { key: 'intent', title: '意向', width: 90, render: (r) => r.intent_status_name || '—' },
    { key: 'mobile', title: '联系电话', width: 130, render: (r) => r.mobile || r.tel || '—' },
    { key: 'belong', title: '归属销售', width: 100, render: (r) => r.belong_name || r.admin_name || '—' },
    { key: 'industry', title: '行业', width: 110, render: (r) => r.industry || '—' },
    { key: 'source', title: '来源', width: 110, render: (r) => r.source || '—' },
    { key: 'follow', title: '最近跟进', width: 140, render: (r) => (r.follow_time && r.follow_time !== '-' ? fmtTime(r.follow_time) : '—') },
    { key: 'time', title: '创建时间', width: 140, render: (r) => fmtTime(r.create_time) },
    {
      key: 'op',
      title: '操作',
      width: 90,
      render: (r) => (
        <span className="pc-link" onClick={() => setCur(r)}>
          详情
        </span>
      ),
    },
  ];

  const detail: [string, string | undefined][] = cur
    ? [
        ['客户编号', cur.id],
        ['客户名称', cur.name],
        ['客户等级', gradeText(cur)],
        ['客户状态', cur.status_name],
        ['意向状态', cur.intent_status_name],
        ['联系电话', cur.mobile || cur.tel],
        ['微信', cur.wechat],
        ['QQ', cur.qq],
        ['邮箱', cur.email],
        ['联系人', cur.contact || cur.user],
        ['所属行业', cur.industry],
        ['客户来源', cur.source],
        ['所在城市', cur.city],
        ['详细地址', cur.address],
        ['归属销售', cur.belong_name || cur.admin_name],
        ['归属部门', cur.belong_department],
        ['预存款', cur.advance_deposit],
        ['累计扣款', cur.deduction],
        ['保证金', cur.margin_deposit],
        ['研究方向', cur.research_direction],
        ['采购意向', cur.purchase_inquiry],
        ['最近跟进', cur.follow_time && cur.follow_time !== '-' ? String(cur.follow_time) : ''],
        ['下次跟进', cur.next_time && cur.next_time !== '-' ? String(cur.next_time) : ''],
        ['创建时间', fmtTime(cur.create_time)],
        ['备注', cur.remark],
      ]
    : [];

  return (
    <div>
      <PageHead
        title="客户列表"
        crumb={CRUMB[type]}
        desc={`共 ${rows.length} 家客户`}
        actions={
          <>
            <button className="pc-btn pc-btn-ghost" onClick={() => load(type, query)}>
              刷新
            </button>
            <button
              className="pc-btn"
              onClick={() => {
                void navigator.clipboard?.writeText(rows.map((r) => r.name).join('\n'));
                toast('已复制当前客户名单');
              }}
            >
              导出名单
            </button>
          </>
        }
      />

      <Panel bodyPad={false}>
        <div style={{ padding: '12px 16px 0' }}>
          <FilterTabs tabs={TABS} value={type} onChange={(v: 1 | 2 | 3) => setType(v)} />
          <div className="pc-toolbar">
            <input
              className="pc-input"
              style={{ width: 260 }}
              placeholder="搜索客户名称 / 电话 / 联系人"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setQuery(keyword);
              }}
            />
            <select className="pc-input" style={{ width: 190 }} value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">全部等级</option>
              {GRADES.filter(Boolean).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <button className="pc-btn" onClick={() => setQuery(keyword)}>
              查询
            </button>
            {(query || grade) && (
              <button
                className="pc-btn pc-btn-ghost"
                onClick={() => {
                  setKeyword('');
                  setQuery('');
                  setGrade('');
                }}
              >
                重置
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable
            columns={cols}
            rows={rows}
            rowKey={(r) => String(r.id)}
            onRowClick={setCur}
            loading={loading}
            pageSize={20}
          />
        </div>
      </Panel>

      {cur ? (
        <Modal
          title={cur.name}
          onClose={() => setCur(null)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => setCur(null)}>
                关闭
              </button>
              <button
                className="pc-btn"
                onClick={() => {
                  void navigator.clipboard?.writeText(cur.mobile || cur.tel || '');
                  toast('已复制联系电话');
                }}
              >
                复制电话
              </button>
            </>
          }
        >
          <dl className="pc-kv">
            {detail
              .filter(([, v]) => v !== undefined && v !== null && v !== '')
              .map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          {cur.content ? (
            <div style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.9, color: 'var(--c-text-2)' }}>
              {cur.content}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
