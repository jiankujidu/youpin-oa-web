/**
 * 客户管理 › 客户列表（/customer/index/index | /sea | /trash）
 * PC 后台统一版式：筛选 Tab + 工具栏 + 数据表格 + 分页 + 详情弹层
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCustomerPage } from '../core/api';
import { addLocal, deleteLocal, editLocal, mergeLocal } from '../core/localOps';
import { localBadge, opsFields } from '../core/opsFields';
import type { Customer } from '../core/types';
import { fmtTime, toast } from '../core/util';
import { ConfirmDialog, EditModal, Modal } from './ui';
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

/** 三种列表各自的本地操作存储 key（公海/废弃分开存） */
const MODULE_OF: Record<1 | 2 | 3, string> = { 1: 'customer', 2: 'customer-sea', 3: 'customer-trash' };

function gradeText(c: Customer): string {
  return c.grade_text || String((c as any).grade || '') || '—';
}

type Row = Record<string, any>;

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
  const [statusF, setStatusF] = useState('');
  const [intentF, setIntentF] = useState('');
  const [sourceF, setSourceF] = useState('');
  const [industryF, setIndustryF] = useState('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [list, setList] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState<Customer | null>(null);
  const [localVer, setLocalVer] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirmDel, setConfirmDel] = useState<Row | null>(null);

  const module = MODULE_OF[type];
  const fields = opsFields(module);

  /** 逐页载入（后端共 1000+ 家，一次拉完会超时） */
  const load = useCallback((t: 1 | 2 | 3, kw: string, p: number, append: boolean) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    fetchCustomerPage(t, kw, p)
      .then(({ rows, total }) => {
        setList((prev) => (append ? [...prev, ...rows] : rows));
        setTotal(total);
        setLoading(false);
        setLoadingMore(false);
      })
      .catch((e: unknown) => {
        setLoading(false);
        setLoadingMore(false);
        toast('客户列表加载失败：' + (e instanceof Error ? e.message : '网络异常'));
      });
  }, []);

  useEffect(() => {
    setPage(1);
    load(type, query, 1, false);
  }, [type, query, load]);

  /** 左侧菜单切换（客户列表 / 公海 / 废弃）时同步类型 */
  useEffect(() => {
    setType(initialType);
  }, [initialType]);

  const rows = useMemo(
    () =>
      list.filter(
        (c) =>
          (!grade || gradeText(c).includes(grade)) &&
          (!statusF || c.status_name === statusF) &&
          (!intentF || c.intent_status_name === intentF) &&
          (!sourceF || c.source === sourceF) &&
          (!industryF || c.industry === industryF),
      ),
    [list, grade, statusF, intentF, sourceF, industryF],
  );

  /** OA 行 + 本地新增/编辑 合并（本地行置顶，便于查看操作结果） */
  const displayRows = useMemo(
    () => [...mergeLocal(module, []), ...rows] as unknown as Customer[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [module, rows, localVer],
  );

  /** 筛选项取自真实数据的去重值（与原站下拉内容一致） */
  const opts = useMemo(
    () => ({
      grade: [...new Set(list.map(gradeText).filter((v) => v && v !== '—'))].sort(),
      status: [...new Set(list.map((c) => c.status_name).filter(Boolean))].sort(),
      intent: [...new Set(list.map((c) => c.intent_status_name).filter(Boolean))].sort(),
      source: [...new Set(list.map((c) => c.source).filter(Boolean))].sort(),
      industry: [...new Set(list.map((c) => c.industry).filter(Boolean))].sort(),
    }),
    [list],
  );

  /** 与原站一致的列（编号 / 客户名称 / 联系人 / 手机号 / 是否加微信 / 等级 / 沟通情况 / 部门 / 员工 / QQ / 微信 / 求购内容 / 最后下单 / 最近沟通 / 下次跟进 / 研究方向 / 城市 / 意向 / 状态 / 来源 / 行业 / 创建时间 / 操作） */
  const cols: Column<Customer>[] = [
    { key: 'id', title: '编号', width: 76, render: (r) => r.id },
    {
      key: 'name',
      title: '客户名称',
      width: 240,
      render: (r) => (
        <span className="pc-td-strong">
          {r.name}
          {(r as any)._local ? (
            <span className="pc-tag-local" style={{ marginLeft: 6 }}>
              {localBadge(r as any)}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: 'user', title: '联系人', width: 90, render: (r) => (r as any).user || (r as any).contact_first || '—' },
    { key: 'mobile', title: '手机号码', width: 130, render: (r) => r.mobile || r.tel || '—' },
    {
      key: 'wechat',
      title: '是否加微信',
      width: 96,
      render: (r) =>
        (r as any).is_add_wechat ? <StatusTag tone="ok">已加</StatusTag> : <StatusTag tone="info">未加</StatusTag>,
    },
    { key: 'grade', title: '客户等级', width: 140, render: (r) => <StatusTag tone="info">{gradeText(r)}</StatusTag> },
    {
      key: 'remark',
      title: '沟通情况',
      width: 160,
      render: (r) => String((r as any).remark || '').slice(0, 22) || '—',
    },
    { key: 'dept', title: '所属部门', width: 160, render: (r) => (r as any).belong_department || '—' },
    { key: 'belong', title: '所属员工', width: 100, render: (r) => r.belong_name || r.admin_name || '—' },
    { key: 'qq', title: 'QQ号', width: 110, render: (r) => (r as any).qq || '—' },
    { key: 'wx', title: '微信号', width: 120, render: (r) => (r as any).wechat || '—' },
    {
      key: 'inquiry',
      title: '求购内容',
      width: 150,
      render: (r) => String((r as any).purchase_inquiry || '').slice(0, 22) || '—',
    },
    {
      key: 'order_time',
      title: '最后下单',
      width: 120,
      render: (r) => {
        const v = (r as any).order_time;
        return v && v !== '-' ? fmtTime(v) : '—';
      },
    },
    { key: 'follow', title: '最近沟通', width: 120, render: (r) => (r.follow_time && r.follow_time !== '-' ? fmtTime(r.follow_time) : '—') },
    {
      key: 'next',
      title: '下次跟进',
      width: 120,
      render: (r) => {
        const v = (r as any).next_time;
        return v && v !== '-' ? fmtTime(v) : '—';
      },
    },
    {
      key: 'research',
      title: '课题组/研究方向',
      width: 160,
      render: (r) => String((r as any).research_direction || '').slice(0, 20) || '—',
    },
    { key: 'city', title: '城市', width: 90, render: (r) => (r as any).city || '—' },
    { key: 'intent', title: '客户意向', width: 100, render: (r) => <StatusTag tone={statusTone(r.intent_status_name)}>{r.intent_status_name || '—'}</StatusTag> },
    { key: 'status', title: '状态', width: 100, render: (r) => <StatusTag tone={statusTone(r.status_name)}>{r.status_name || '—'}</StatusTag> },
    { key: 'source', title: '来源渠道', width: 110, render: (r) => r.source || '—' },
    { key: 'industry', title: '客户所属行业', width: 120, render: (r) => r.industry || '—' },
    { key: 'time', title: '创建时间', width: 140, render: (r) => fmtTime(r.create_time) },
    {
      key: 'op',
      title: '操作',
      width: 150,
      render: (r) => (
        <span className="pc-ops">
          <span className="gg-xs blue" onClick={() => setCur(r)}>
            详情
          </span>
          {fields ? (
            <>
              <span className="gg-xs blue" onClick={() => setEditing(r)}>
                编辑
              </span>
              <span className="gg-xs red" onClick={() => setConfirmDel(r)}>
                删除
              </span>
            </>
          ) : null}
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
        desc={`共 ${total || rows.length} 家客户 · 已载入 ${list.length} 家`}
        actions={
          <>
            <button className="pc-btn pc-btn-ghost" onClick={() => load(type, query, 1, false)}>
              刷新
            </button>
            {list.length < total ? (
              <button
                className="pc-btn"
                disabled={loadingMore}
                onClick={() => {
                  const p = page + 1;
                  setPage(p);
                  load(type, query, p, true);
                }}
              >
                {loadingMore ? '载入中…' : `载入更多（${list.length}/${total}）`}
              </button>
            ) : null}
            <button
              className="pc-btn"
              onClick={() => {
                void navigator.clipboard?.writeText(rows.map((r) => r.name).join('\n'));
                toast('已复制当前客户名单');
              }}
            >
              导出名单
            </button>
            <button className="pc-btn" onClick={() => setEditing({ id: '' })}>
              ＋ 新增客户
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
            {(
              [
                ['全部等级', grade, setGrade, opts.grade.length ? opts.grade : GRADES.filter(Boolean), 190],
                ['全部状态', statusF, setStatusF, opts.status, 130],
                ['全部意向', intentF, setIntentF, opts.intent, 120],
                ['全部来源', sourceF, setSourceF, opts.source, 130],
                ['全部行业', industryF, setIndustryF, opts.industry, 130],
              ] as [string, string, (v: string) => void, string[], number][]
            ).map(([label, val, set, values, w]) => (
              <select
                key={label}
                className="pc-input"
                style={{ width: w }}
                value={val}
                onChange={(e) => set(e.target.value)}
              >
                <option value="">{label}</option>
                {values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ))}
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
                  setStatusF('');
                  setIntentF('');
                  setSourceF('');
                  setIndustryF('');
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
            rows={displayRows}
            rowKey={(r) => String(r.id)}
            onRowClick={setCur}
            loading={loading}
            pageSize={20}
            totalText={total ? `已载入 ${list.length} / 共 ${total} 家` : undefined}
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
              {fields ? (
                <>
                  <button className="pc-btn" onClick={() => setEditing(cur)}>
                    编辑
                  </button>
                  <button
                    className="pc-btn"
                    style={{ background: '#e4564f' }}
                    onClick={() => setConfirmDel(cur)}
                  >
                    删除
                  </button>
                </>
              ) : null}
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

      {/* 本地新增 / 编辑客户（不提交原站） */}
      {editing && fields ? (
        <EditModal
          title={editing.id ? '编辑客户' : '新增客户'}
          fields={fields}
          value={editing}
          onSave={(v) => {
            if (editing.id) editLocal(module, { ...editing, ...v });
            else addLocal(module, v);
            setLocalVer((n) => n + 1);
            toast('已保存到本地（未提交原站）');
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {confirmDel ? (
        <ConfirmDialog
          title="删除确认"
          text={`确认删除客户「${String(confirmDel.name || confirmDel.id || '')}」？删除只在本机生效，OA 原站数据不受影响。`}
          onOk={() => {
            deleteLocal(module, String(confirmDel.id ?? ''));
            setCur(null);
            setLocalVer((n) => n + 1);
            toast('已删除（本地生效，未提交原站）');
          }}
          onClose={() => setConfirmDel(null)}
        />
      ) : null}
    </div>
  );
}
