/**
 * 客户管理 › 客户列表 / 公海客户 / 废弃客户（/customer/index/index | /sea | /trash）
 * PC 后台统一版式：筛选 Tab + 工具栏 + 数据表格 + 分页 + 详情弹层
 *
 * 功能对齐 oa.upingbio.com：
 *   工具栏：＋ 添加客户 / 导入名单 / 转移全部 / 避开名单 / 导出 / 预览 / 清空选中
 *   行内（我的客户）：查看 / 编辑 / 移入公海 / 走访 / 分类
 *   行内（公海客户）：查看 / 获取（领取）/ 分配 / 编辑 / 删除
 *   行内（废弃客户）：查看 / 恢复 / 彻底删除
 * 所有写操作（移入公海 / 领取 / 分配 / 恢复 / 走访 / 分类 / 删除 / 编辑）均真实提交原站。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCustomer,
  customerToSea,
  customerToTrash,
  customerDeleteHard,
  customerGet,
  customerRevert,
  customerDistribute,
  customerVisit,
  customerClassification,
  fetchCustomerPage,
  getEmployees,
  type ActionResult,
} from '../core/api';
import { addLocal, deleteLocal, editLocal, mergeLocal } from '../core/localOps';
import { localBadge, opsFields, type EditField } from '../core/opsFields';
import type { Customer } from '../core/types';
import { downloadCsv, fmtTime, sanitizeName, toast } from '../core/util';
import { ConfirmDialog, EditModal, Modal } from './ui';
import { OpsMore } from './DesktopSub';
import { DataTable, FilterTabs, PageHead, Panel, StatusTag, type Column } from './pc';

const TABS = [
  { key: 1, label: '我的客户' },
  { key: 2, label: '公海客户' },
  { key: 3, label: '废弃客户' },
] as { key: 1 | 2 | 3; label: string }[];

/** 客户列表页页签（原站 hidden input tab：全部客户/我的客户/下属客户/共享客户） */
const SCOPES = [
  { key: 1, label: '全部客户' },
  { key: 2, label: '我的客户' },
  { key: 3, label: '下属客户' },
  { key: 4, label: '共享客户' },
] as { key: 1 | 2 | 3 | 4; label: string }[];

const GRADES = ['', 'AA类成交经销商', 'A类成交终端', 'B类意向客户', 'C类潜在客户', 'D类无效客户'];

const CRUMB: Record<number, string[]> = {
  1: ['客户管理', '我的客户'],
  2: ['客户管理', '公海客户'],
  3: ['客户管理', '废弃客户'],
};

/** 三种列表各自的本地操作存储 key（公海/废弃分开存） */
const MODULE_OF: Record<1 | 2 | 3, string> = { 1: 'customer', 2: 'customer-sea', 3: 'customer-trash' };

/** 每个 tab 的行操作（对齐原站 lay-event） */
type TabOp = { key: string; label: string; tone?: 'blue' | 'red' | 'orange' | 'purple' };
const TAB_OPS: Record<1 | 2 | 3, TabOp[]> = {
  1: [
    { key: 'to_sea', label: '移入公海', tone: 'orange' },
    { key: 'visit', label: '走访', tone: 'purple' },
    { key: 'classification', label: '分类', tone: 'purple' },
  ],
  2: [
    { key: 'get', label: '获取', tone: 'blue' },
    { key: 'distribute', label: '分配', tone: 'purple' },
  ],
  3: [
    { key: 'back', label: '恢复', tone: 'blue' },
  ],
};

/** 走访表单（照原站 visit_record 字段：visitor / visit_date） */
const VISIT_FIELDS: EditField[] = [
  { key: 'visitor', label: '走访人', type: 'text', placeholder: '请输入走访人姓名' },
  { key: 'visit_date', label: '走访/代理时间', type: 'date' },
];
/** 客户分类选项（照原站 set_customer_classification 下拉） */
const CLASS_FIELDS: EditField[] = [
  {
    key: 'classification',
    label: '客户分类',
    type: 'select',
    options: ['优品代理', '睿信代理', '仑昌硕代理', '走访客户', '客户上门拜访'],
  },
];

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

/** 把一行从 fromModule 搬到 toModule（本地层内部搬迁，不碰原站） */
function moveRow(fromModule: string, toModule: string, row: Row): void {
  const id = String(row.id ?? '');
  deleteLocal(fromModule, id);
  const { id: _drop, _local, _op, ...rest } = row;
  addLocal(toModule, { ...rest, from_id: id || undefined });
}

/** 解析 CSV/逗号文本为客户行（本地导入，不提交原站） */
function parseCustomerText(text: string): Row[] {
  const out: Row[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const cells = t.split(/[,，\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (!cells[0] || /客户名称/i.test(cells[0])) continue;
    out.push({
      name: cells[0],
      contact: cells[1] || '',
      mobile: cells[2] || '',
      source: cells[3] || '其他',
      status_name: cells[4] || '待联系',
      address: cells[5] || '',
      remark: cells[6] || '',
    });
  }
  return out;
}

export default function DesktopCustomer({ initialType = 1 }: { initialType?: 1 | 2 | 3 } = {}) {
  const [type, setType] = useState<1 | 2 | 3>(initialType);
  /** 客户列表页页签（原站 tab：全部/我的/下属/共享客户），仅 type=1 使用 */
  const [scope, setScope] = useState<1 | 2 | 3 | 4>(1);
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
  /** 行内带表单的操作（走访 / 分类 / 分配） */
  const [acting, setActing] = useState<{ row: Row; op: TabOp; fields: EditField[] } | null>(null);
  /** 勾选的行 id（对齐原站 getCheckData） */
  const [checked, setChecked] = useState<string[]>([]);
  /** 预览名单弹窗 */
  const [preview, setPreview] = useState(false);
  /** 分配面板（真实员工列表多选） */
  const [distributing, setDistributing] = useState<Row | null>(null);
  const [empList, setEmpList] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [distBusy, setDistBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const module = MODULE_OF[type];
  const fields = opsFields(module);
  const tabOps = TAB_OPS[type];

  /** 逐页载入（后端共 1000+ 家，一次拉完会超时） */
  const load = useCallback((t: 1 | 2 | 3, kw: string, p: number, append: boolean, sc: 1 | 2 | 3 | 4 = 1) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    fetchCustomerPage(t, kw, p, 100, sc)
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
    setChecked([]);
    load(type, query, 1, false, scope);
  }, [type, query, scope, load]);

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

  const toggleCheck = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /** 批量操作目标行：有勾选走勾选，否则当前已载入全部 */
  const targetRows: Row[] = useMemo(() => {
    const all = displayRows as unknown as Row[];
    return checked.length ? all.filter((r) => checked.includes(String(r.id ?? ''))) : all;
  }, [displayRows, checked]);

  /** 批量移入公海（真实提交原站 /customer/index/to_sea；本地模拟行在本地层搬迁） */
  async function transfer(rowsToMove: Row[]) {
    if (!rowsToMove.length) return toast('没有可操作的客户');
    const real = rowsToMove.filter((r) => !String(r.id ?? '').startsWith('local-'));
    if (real.length) {
      let okN = 0;
      let fail = '';
      for (const r of real) {
        const res = await customerToSea(String(r.id));
        if (res.ok) okN++;
        else fail = res.msg;
      }
      if (okN) toast(`已移入公海 ${okN} 家（原站已同步）${fail ? `；${fail}` : ''}`);
      else toast(fail || '操作失败');
    }
    rowsToMove.filter((r) => String(r.id ?? '').startsWith('local-')).forEach((r) => moveRow(module, 'customer-sea', r));
    setChecked([]);
    setLocalVer((n) => n + 1);
    load(type, query, 1, false);
  }

  /** 导出 CSV（对齐原站「导出」） */
  function exportCsv() {
    const cols = [
      { key: 'id', title: '编号' },
      { key: 'name', title: '客户名称' },
      { key: 'user', title: '联系人' },
      { key: 'mobile', title: '手机号码' },
      { key: 'grade', title: '客户等级' },
      { key: 'status', title: '状态' },
      { key: 'intent', title: '客户意向' },
      { key: 'source', title: '来源渠道' },
      { key: 'industry', title: '客户所属行业' },
      { key: 'city', title: '城市' },
      { key: 'belong', title: '所属员工' },
      { key: 'time', title: '创建时间' },
    ];
    const csvRows = targetRows.map((r) => ({
      id: r.id,
      name: r.name,
      user: (r as any).user || (r as any).contact_first || '',
      mobile: r.mobile || r.tel || '',
      grade: gradeText(r as Customer),
      status: r.status_name || '',
      intent: r.intent_status_name || '',
      source: r.source || '',
      industry: r.industry || '',
      city: (r as any).city || '',
      belong: r.belong_name || r.admin_name || '',
      time: fmtTime(r.create_time),
    }));
    downloadCsv(`${CRUMB[type][1]}-${new Date().toISOString().slice(0, 10)}`, cols, csvRows);
    toast(`已导出 ${csvRows.length} 家客户为 CSV`);
  }

  /** 避开名单（对齐原站 avoidList：本地打标记） */
  function avoidSelected() {
    if (!targetRows.length) return toast('请先勾选要避开的客户');
    targetRows.forEach((r) => {
      const id = String(r.id ?? '');
      if (id.startsWith('local-')) editLocal(module, { ...r, avoid: 1 });
      else if (id) editLocal(module, { id, avoid: 1 });
    });
    setChecked([]);
    setLocalVer((n) => n + 1);
    toast(`已标记 ${targetRows.length} 家为避开名单（本地生效）`);
  }

  /** 导入 CSV / 文本名单（逐行真实创建客户 POST /customer/index/add） */
  async function importFile(file: File) {
    try {
      const text = await file.text();
      const parsed = parseCustomerText(text);
      if (!parsed.length) return toast('未解析到有效行（格式：客户名称,联系人,电话,来源,状态,地址,备注）');
      let ok = 0;
      let fail = '';
      for (const r of parsed) {
        const res = await createCustomer({
          name: String(r.name || ''),
          contact: String(r.contact || ''),
          tel: String(r.mobile || ''),
          address: String(r.address || ''),
          remark: String(r.remark || ''),
          source: String(r.source || '其他'),
        });
        if (res.ok) ok++;
        else fail = res.msg;
      }
      toast(`已导入 ${ok} 家（原站已同步）${fail ? `；${fail}` : ''}`);
      load(type, query, 1, false);
    } catch {
      toast('文件读取失败');
    }
  }

  /** 行内操作（领取 / 分配 / 恢复 / 走访 / 分类 均真实提交原站） */
  function runTabOp(row: Row, op: TabOp) {
    const id = String(row.id ?? '');
    const isLocal = id.startsWith('local-');
    if (op.key === 'to_sea') {
      if (isLocal) return transfer([row]);
      customerToSea(id).then((r) => {
        if (!r.ok) return toast(r.msg || '操作失败');
        toast('已移入公海（原站已同步）');
        load(type, query, 1, false);
      });
      return;
    }
    if (op.key === 'back') {
      if (isLocal) return toast('本地模拟客户无需恢复');
      customerRevert(id).then((r) => {
        if (!r.ok) return toast(r.msg || '恢复失败');
        toast('已恢复到客户库（原站已同步）');
        load(type, query, 1, false);
      });
      return;
    }
    if (op.key === 'get') {
      if (isLocal) return toast('本地模拟客户无法领取');
      customerGet(id).then((r) => {
        if (!r.ok) return toast(r.msg || '领取失败');
        toast('已领取（原站已同步）');
        load(type, query, 1, false);
      });
      return;
    }
    if (op.key === 'visit') return setActing({ row, op, fields: VISIT_FIELDS });
    if (op.key === 'classification') return setActing({ row, op, fields: CLASS_FIELDS });
    if (op.key === 'distribute') {
      setDistributing(row);
      setPicked([]);
      getEmployees().then((list) => setEmpList(list || []));
      return;
    }
    toast(`已执行「${op.label}」（本地生效）`);
  }

  /** 与原站一致的列（编号 / 客户名称 / 联系人 / 手机号 / 是否加微信 / 等级 / 沟通情况 / 部门 / 员工 / QQ / 微信 / 求购内容 / 最后下单 / 最近沟通 / 下次跟进 / 研究方向 / 城市 / 意向 / 状态 / 来源 / 行业 / 创建时间 / 操作） */
  const allCols: Column<Customer>[] = [
    {
      key: '_check',
      title: '',
      width: 40,
      head: (
        <input
          type="checkbox"
          className="pc-check"
          title="全选"
          checked={displayRows.length > 0 && checked.length === displayRows.length}
          onChange={(e) => setChecked(e.target.checked ? (displayRows as any[]).map((r) => String(r.id ?? '')) : [])}
        />
      ),
      render: (r) => (
        <input
          type="checkbox"
          className="pc-check"
          checked={checked.includes(String(r.id ?? ''))}
          onChange={() => toggleCheck(String(r.id ?? ''))}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    { key: 'id', title: '编号', width: 76, render: (r) => r.id },
    {
      key: 'name',
      title: '客户名称',
      width: 240,
      render: (r) => (
        <span className="pc-name-cell">
          <span className="pc-td-strong pc-cell-1" title={r.name}>
            {r.name}
          </span>
          {(r as any).avoid ? (
            <span className="pc-tag-local" style={{ background: '#fff1f0', color: '#cf1322', border: '1px solid #ffa39e' }}>
              避开
            </span>
          ) : null}
          {(r as any)._local ? <span className="pc-tag-local">{localBadge(r as any)}</span> : null}
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
    { key: 'dept', title: '所属部门', width: 160, render: (r) => (r as any).belong_department || (r as any).owner_department || '—' },
    { key: 'belong', title: '所属员工', width: 100, render: (r) => r.belong_name || (r as any).owner_name || r.admin_name || '—' },
    { key: 'createDate', title: '创建日期', width: 120, render: (r) => (r as any).create_date || '—' },
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
      title: '下次跟进时间',
      width: 120,
      render: (r) => {
        const v = (r as any).next_time;
        return v && v !== '-' ? fmtTime(v) : '—';
      },
    },
    {
      key: 'research',
      title: '课题组名称/研究方向',
      width: 160,
      render: (r) => String((r as any).research_direction || '').slice(0, 20) || '—',
    },
    { key: 'city', title: '城市', width: 90, render: (r) => (r as any).city || '—' },
    { key: 'intent', title: '客户意向', width: 100, render: (r) => <StatusTag tone={statusTone(r.intent_status_name)}>{r.intent_status_name || '—'}</StatusTag> },
    { key: 'status', title: '状态', width: 100, render: (r) => <StatusTag tone={statusTone(r.status_name)}>{r.status_name || '—'}</StatusTag> },
    { key: 'source', title: '来源渠道', width: 110, render: (r) => r.source || '—' },
    { key: 'industry', title: '客户所属行业', width: 120, render: (r) => r.industry || '—' },
    { key: 'time', title: '创建时间', width: 140, render: (r) => fmtTime(r.create_time) },
    { key: 'upd', title: '最后编辑时间', width: 140, render: (r) => { const v = (r as any).update_time; return v && v !== '-' ? fmtTime(v) : '—'; } },
    {
      key: 'op',
      title: '操作',
      width: 210,
      fixed: true,
      render: (r) => (
        <span className="pc-ops">
          <span className="gg-xs blue" onClick={() => setCur(r)}>
            查看
          </span>
          {/* 最多 1 个动作常驻，其余收进「更多 ▾」：避免 chip 换行把行高撑到 60px+ */}
          {tabOps.slice(0, 1).map((op) => (
            <span
              key={op.key}
              className={`gg-xs ${op.tone || 'blue'}`}
              onClick={(e) => {
                e.stopPropagation();
                runTabOp(r, op);
              }}
            >
              {op.label}
            </span>
          ))}
          {tabOps.length > 1 || fields ? (
            <OpsMore
              actions={tabOps.slice(1)}
              extra={
                fields
                  ? [
                      { key: '__edit', label: '编辑', tone: 'ghost' as const, onPick: () => setEditing(r) },
                      {
                        key: '__del',
                        label: type === 3 ? '彻底删除' : '删除',
                        tone: 'red' as const,
                        onPick: () => setConfirmDel(r),
                      },
                    ]
                  : undefined
              }
              onPick={(a) => (a as any).run ? (a as any).run() : runTabOp(r, a)}
            />
          ) : null}
        </span>
      ),
    },
  ];

  /** 与原站各页列 1:1：客户列表 23 列 / 公海 15 列 / 废弃 10 列（不含 checkbox，含操作） */
  const COLS_BY_TYPE: Record<1 | 2 | 3, string[]> = {
    1: ['id', 'name', 'user', 'mobile', 'wechat', 'grade', 'remark', 'dept', 'belong', 'createDate', 'qq', 'wx', 'inquiry', 'order_time', 'follow', 'research', 'city', 'intent', 'status', 'source', 'industry', 'time', 'op'],
    2: ['id', 'dept', 'belong', 'name', 'user', 'mobile', 'qq', 'wx', 'research', 'inquiry', 'city', 'time', 'upd', 'source', 'industry', 'op'],
    3: ['id', 'name', 'user', 'mobile', 'qq', 'wx', 'time', 'upd', 'source', 'industry', 'op'],
  };
  /** 公海/废弃页的原站列标题与客户列表略异（联系方式/QQ号码/部门/归属人） */
  const TITLE_FIX: Record<number, Record<string, string>> = {
    2: { mobile: '联系方式', qq: 'QQ号码', dept: '部门', belong: '归属人' },
    3: { mobile: '联系方式', qq: 'QQ号码' },
  };
  const cols = allCols
    .filter((c) => COLS_BY_TYPE[type].includes(String(c.key)))
    .map((c) => ({ ...c, title: TITLE_FIX[type]?.[String(c.key)] || c.title }));

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
        title={CRUMB[type][1]}
        crumb={CRUMB[type]}
        desc={`共 ${total || rows.length} 家客户 · 已载入 ${list.length} 家${checked.length ? ` · 已勾选 ${checked.length} 家` : ''}`}
        actions={
          <>
            <button className="pc-btn pc-btn-ghost" onClick={() => load(type, query, 1, false)}>
              刷新
            </button>
            <button className="pc-btn pc-btn-ghost" onClick={exportCsv}>
              导出
            </button>
            <button className="pc-btn pc-btn-ghost" onClick={() => setPreview(true)}>
              预览
            </button>
            <button className="pc-btn pc-btn-ghost" onClick={avoidSelected}>
              避开名单
            </button>
            {type === 1 ? (
              <button
                className="pc-btn pc-btn-danger"
                onClick={() => transfer(targetRows)}
              >
                转移全部
              </button>
            ) : null}
            <button className="pc-btn pc-btn-ghost" onClick={() => fileRef.current?.click()}>
              导入名单
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
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
            <button className="pc-btn" onClick={() => setEditing({ id: '' })}>
              ＋ 添加客户
            </button>
            {checked.length ? (
              <button className="pc-btn pc-btn-ghost" onClick={() => setChecked([])}>
                清空选中
              </button>
            ) : null}
          </>
        }
      />

      <Panel bodyPad={false}>
        <div style={{ padding: '12px 16px 0' }}>
          {type === 1 ? (
            <FilterTabs tabs={SCOPES} value={scope} onChange={(v: 1 | 2 | 3 | 4) => setScope(v)} />
          ) : null}
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
                className="pc-btn pc-btn-ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(cur.mobile || cur.tel || '');
                  toast('已复制联系电话');
                }}
              >
                复制电话
              </button>
              {tabOps.map((op) => (
                <button key={op.key} className="pc-btn pc-btn-ghost" onClick={() => runTabOp(cur, op)}>
                  {op.label}
                </button>
              ))}
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
                    {type === 3 ? '彻底删除' : '删除'}
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

      {/* ===== 预览名单（对齐原站「预览」） ===== */}
      {preview ? (
        <Modal
          title={`${CRUMB[type][1]}预览`}
          onClose={() => setPreview(false)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={exportCsv}>
                导出 CSV
              </button>
              <button className="pc-btn" onClick={() => setPreview(false)}>
                关闭
              </button>
            </>
          }
        >
          <div style={{ fontSize: 12.5, color: '#e8862a', background: '#fff7ec', border: '1px solid #ffd9a8', borderRadius: 6, padding: '7px 10px', marginBottom: 12 }}>
            预览为本地名单快照（共 {targetRows.length} 家），不提交原站。
          </div>
          <div style={{ maxHeight: 380, overflow: 'auto', border: '1px solid var(--c-border)', borderRadius: 6 }}>
            <table className="pc-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>序号</th>
                  <th>客户名称</th>
                  <th style={{ width: 120 }}>联系人</th>
                  <th style={{ width: 140 }}>手机号码</th>
                  <th style={{ width: 130 }}>客户等级</th>
                </tr>
              </thead>
              <tbody>
                {targetRows.slice(0, 300).map((r, i) => (
                  <tr key={String(r.id ?? i)}>
                    <td className="pc-col-idx">{i + 1}</td>
                    <td>{r.name}</td>
                    <td>{(r as any).user || (r as any).contact_first || '—'}</td>
                    <td>{r.mobile || r.tel || '—'}</td>
                    <td>{gradeText(r as Customer)}</td>
                  </tr>
                ))}
                {targetRows.length === 0 ? (
                  <tr>
                    <td className="pc-table-empty" colSpan={5}>
                      暂无数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {targetRows.length > 300 ? (
            <div style={{ fontSize: 12, color: 'var(--c-text-4)', marginTop: 8 }}>
              仅预览前 300 条，完整数据请点「导出 CSV」。
            </div>
          ) : null}
        </Modal>
      ) : null}

      {/* 分配客户（真实员工列表多选，POST /customer/api/distribute {id, uid, did}） */}
      {distributing ? (
        <Modal
          title={`分配客户 · ${String(distributing.name || distributing.id || '')}`}
          onClose={() => setDistributing(null)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => setDistributing(null)}>
                取消
              </button>
              <button
                className="pc-btn"
                disabled={!picked.length || distBusy}
                onClick={async () => {
                  setDistBusy(true);
                  const res = await customerDistribute(String(distributing.id), picked.join(','), '');
                  setDistBusy(false);
                  if (!res.ok) return toast(res.msg || '分配失败');
                  toast('已分配（原站已同步）');
                  setDistributing(null);
                  load(type, query, 1, false);
                }}
              >
                {distBusy ? '提交中…' : `确认分配${picked.length ? `（${picked.length}人）` : ''}`}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 12.5, color: 'var(--c-text-3)', margin: '0 0 8px' }}>选择要分配给的员工（可多选）：</p>
          <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--c-border)', borderRadius: 6 }}>
            {empList.length ? (
              empList.map((e) => (
                <label
                  key={e.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid var(--c-border)', fontSize: 13 }}
                >
                  <input
                    type="checkbox"
                    checked={picked.includes(e.id)}
                    onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))}
                  />
                  {e.name}
                </label>
              ))
            ) : (
              <div style={{ padding: 12, color: 'var(--c-text-4)' }}>加载员工列表中…（若为空则当前账号无分配权限）</div>
            )}
          </div>
          {picked.length ? <div style={{ marginTop: 8, fontSize: 12.5 }}>已选 {picked.length} 人</div> : null}
        </Modal>
      ) : null}

      {/* 新增 / 编辑客户（原站 POST /customer/index/add，带 id 即编辑） */}
      {editing && fields ? (
        <EditModal
          title={editing.id && !String(editing.id).startsWith('local-') ? '编辑客户' : '添加客户'}
          fields={fields}
          value={editing}
          onSave={async (v) => {
            const isLocal = String(editing.id || '').startsWith('local-');
            const res = await createCustomer({
              id: isLocal ? undefined : String(editing.id || ''),
              name: String(v.name || editing.name || ''),
              contact: String((v as any).user ?? (v as any).contact ?? editing.contact ?? ''),
              tel: String((v as any).mobile ?? (v as any).tel ?? editing.tel ?? ''),
              address: String((v as any).address ?? editing.address ?? ''),
              remark: String((v as any).remark ?? (v as any).content ?? editing.remark ?? ''),
            });
            if (!res.ok) return toast(res.msg || '保存失败');
            if (isLocal) editLocal(module, { ...editing, ...v });
            setLocalVer((n) => n + 1);
            setEditing(null);
            toast(editing.id && !isLocal ? '已保存（原站已更新）' : '已新增（原站已同步）');
            load(type, query, 1, false);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {/* 行内带表单操作：走访 / 分类 / 分配（真实接口见各 op；备注走 update_intent） */}
      {acting ? (
        <EditModal
          title={`${acting.op.label} · ${String(acting.row.name || acting.row.id || '')}`}
          fields={acting.fields}
          value={acting.row}
          onSave={async (v) => {
            const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const id = String(acting.row.id ?? '');
            if (id.startsWith('local-')) {
              // 本地模拟客户：仅在本地层记录，未提交原站
              editLocal(module, { ...acting.row, ...v, [`op_${acting.op.key}`]: stamp });
              setActing(null);
              setLocalVer((n) => n + 1);
              toast(`已记录「${acting.op.label}」（本地模拟，未提交原站）`);
              return;
            }
            let res = { ok: true, msg: '' } as ActionResult;
            if (acting.op.key === 'classification') {
              res = await customerClassification(id, String(acting.row.name || ''), String((v as any).classification ?? ''));
            } else if (acting.op.key === 'visit') {
              res = await customerVisit(id, String((v as any).visitor ?? ''), String((v as any).visit_date ?? ''));
            }
            if (!res.ok) return toast(res.msg || '提交失败');
            editLocal(module, { id, ...v, [`op_${acting.op.key}`]: stamp });
            setActing(null);
            setLocalVer((n) => n + 1);
            toast(`已保存「${acting.op.label}」（原站已同步）`);
            load(type, query, 1, false);
          }}
          onClose={() => setActing(null)}
        />
      ) : null}

      {confirmDel ? (
        <ConfirmDialog
          title="删除确认"
          text={`确认删除客户「${String(confirmDel.name || confirmDel.id || '')}」？${type === 3 ? '将彻底删除 OA 原站的这条客户（放入废弃层的将同步销毁）。' : '将同步从 OA 原站删除。'}`}
          onOk={async () => {
            const id = String(confirmDel.id ?? '');
            const isLocal = id.startsWith('local-');
            if (!isLocal) {
              let r = { ok: true, msg: '' } as ActionResult;
              if (type === 2) r = await customerToTrash(id); // 公海 → 废弃池
              else if (type === 3) r = await customerDeleteHard(id); // 废弃 → 彻底删除
              else r = await customerToTrash(id); // 我的客户 → 软删到废弃池
              if (!r.ok) return toast(r.msg || '删除失败');
            }
            deleteLocal(module, id);
            setCur(null);
            setLocalVer((n) => n + 1);
            toast(type === 3 ? '已彻底删除（原站已同步）' : '已删除（原站已同步）');
            load(type, query, 1, false);
          }}
          onClose={() => setConfirmDel(null)}
        />
      ) : null}
    </div>
  );
}
