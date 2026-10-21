/**
 * 办公审批 › 我发起的（/oa/approve/index）
 * PC 后台统一版式：筛选 Tab + 数据表格 + 分页 + 详情弹层（含审批意见与通过/拒绝）
 *
 * 功能对齐 oa.upingbio.com：
 *   - 24 类审批类型（付款/会议室预定/借款/入职/公文流转/出差/加班/垫付退回/外出/奖励/实验付款/
 *     招聘需求/活动经费/物品维修/用章/用车/用车归还/离职/请假/资质借用/转岗/转正/通用审批/采购）
 *   - 行内：审批 / 详情 / 重新申请 / 删除
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyApproveDecision, createApprove, deleteApprove, fetchApproves,
  getApproveRemark, getApproveStatus, revokeApprove,
} from '../core/api';
import { addLocal, deleteLocal, editLocal, localAdded, mergeLocal } from '../core/localOps';
import { localBadge, opsFields } from '../core/opsFields';
import type { ApproveItem } from '../core/types';
import { fmtTime, toast } from '../core/util';
import { ConfirmDialog, EditModal, Modal } from './ui';
import { DataTable, FilterTabs, PageHead, Panel, StatusTag, type Column } from './pc';

/** 原站 24 类审批（/oa/approve/index 页面 lay-filter 里的类型标签） */
const APPROVE_TYPES = [
  '付款', '会议室预定', '借款', '入职', '公文流转', '出差', '加班', '垫付退回',
  '外出', '奖励', '实验付款', '招聘需求', '活动经费', '物品维修', '用章', '用车',
  '用车归还', '离职', '请假', '资质借用', '转岗', '转正', '通用审批', '采购',
];

const TABS = [
  { key: 0, label: '全部' },
  { key: 1, label: '待审批' },
  { key: 2, label: '已通过' },
  { key: 3, label: '已拒绝' },
] as { key: 0 | 1 | 2 | 3; label: string }[];

/** 真实接口用 check_status（0/1 待审，2 通过，3 拒绝，4 撤销），演示数据用 status */
function statusOf(r: ApproveItem): 0 | 1 | 2 | 3 | 4 {
  const raw = (r as any).check_status;
  if (raw === undefined || raw === null) return getApproveStatus(r);
  const n = Number(raw);
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 4;
  return 1;
}

function tag(s: number) {
  if (s === 2) return <StatusTag tone="ok">已通过</StatusTag>;
  if (s === 3) return <StatusTag tone="no">已拒绝</StatusTag>;
  if (s === 4) return <StatusTag tone="info">已撤销</StatusTag>;
  return <StatusTag tone="wait">待审批</StatusTag>;
}

/** 真实接口没有 title / type_name，用 content、name、flow_type 兜底 */
function titleOf(r: ApproveItem): string {
  return r.title || r.content || (r as any).name || '（无标题）';
}
function typeOf(r: ApproveItem): string {
  return r.type_name || (r as any).flow_type || (r as any).subject || '—';
}

export default function DesktopApprove() {
  const [status, setStatus] = useState<0 | 1 | 2 | 3>(0);
  const [list, setList] = useState<ApproveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('');
  const [cur, setCur] = useState<ApproveItem | null>(null);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(false);
  const [addType, setAddType] = useState(APPROVE_TYPES[0]);
  const [addTitle, setAddTitle] = useState('');
  const [addContent, setAddContent] = useState('');
  const [localVer, setLocalVer] = useState(0);
  /** 重新申请 / 删除 / 撤回 */
  const [reapply, setReapply] = useState<ApproveItem | null>(null);
  const [reTitle, setReTitle] = useState('');
  const [confirmDel, setConfirmDel] = useState<ApproveItem | null>(null);
  const [revokeRow, setRevokeRow] = useState<ApproveItem | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  /** 一次取全部，状态筛选在前端做（后端 status 语义与列表字段不一致） */
  const load = useCallback(() => {
    setLoading(true);
    fetchApproves(0)
      .then((rows) => {
        setList(rows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** OA 行 + 本地新增/编辑合并 */
  const allRows = useMemo(
    () => mergeLocal('approve', list as any[]) as unknown as ApproveItem[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, localVer],
  );

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return allRows.filter((r) => {
      if (status !== 0 && statusOf(r) !== status) return false;
      if (typeF && typeOf(r) !== typeF) return false;
      if (!k) return true;
      return (
        titleOf(r) +
        typeOf(r) +
        (r.admin_name || '') +
        (r.content || '') +
        ((r as any).name || '') +
        ((r as any).product_msg || '') +
        ((r as any).department_name || '') +
        ((r as any).check_user || '')
      )
        .toLowerCase()
        .includes(k);
    });
  }, [allRows, q, status, typeF]);

  /** 审批类型下拉：原站 24 类 + 真实数据里出现过的类型 */
  const typeOpts = useMemo(
    () => [...new Set([...APPROVE_TYPES, ...allRows.map((r) => typeOf(r))].filter((v) => v && v !== '—'))],
    [allRows],
  );

  async function submitAdd() {
    if (!addTitle.trim()) return toast('请填写申请事由');
    setBusy(true);
    const r = await createApprove({ typeName: addType, title: addTitle, content: addContent });
    setBusy(false);
    if (!r.ok) return toast(r.msg || '提交失败');
    setAdd(false);
    setAddTitle('');
    setAddContent('');
    setLocalVer((n) => n + 1);
    load();
  }

  /** 重新申请（对齐原站 reapply）：真实发起一条同类型同内容的新申请 */
  async function doReapply(r: ApproveItem, title: string) {
    const t = title.trim();
    if (!t) return toast('请填写申请事由');
    const res = await createApprove({
      typeName: typeOf(r),
      title: t,
      content: String((r as any).content || ''),
    });
    if (!res.ok) return toast(res.msg || '提交失败');
    setReapply(null);
    setReTitle('');
    setLocalVer((n) => n + 1);
    setStatus(1);
    toast('已重新发起，原站审批流已创建');
    load();
  }

  async function decide(pass: boolean) {
    if (!cur) return;
    if (!remark.trim()) {
      toast(pass ? '请填写审批意见（原站要求必填）' : '请填写拒绝理由');
      return;
    }
    const r = await applyApproveDecision(cur.id, pass, remark);
    if (!r.ok) return toast(r.msg || '提交失败');
    toast(pass ? '已通过（原站审批流已更新）' : '已拒绝（原站审批流已更新）');
    setRemark('');
    setCur(null);
    setLocalVer((n) => n + 1);
    load();
  }

  /** 撤回我发起的审批（原站：flow_check check=3 + 撤回理由） */
  async function doRevoke() {
    if (!revokeRow) return;
    if (!revokeReason.trim()) return toast('请填写撤回理由');
    const r = await revokeApprove(String(revokeRow.id ?? ''), revokeReason.trim());
    if (!r.ok) return toast(r.msg || '撤回失败');
    toast('已撤回（原站审批流已更新）');
    setRevokeRow(null);
    setRevokeReason('');
    setCur(null);
    load();
  }

  /** 与原站一致：ID号 / 申请人 / 申请时间 / 审批类型 / 所属部门 / 物品名称 / 当前审批人 / 审批状态 */
  const cols: Column<ApproveItem>[] = [
    { key: 'id', title: 'ID号', width: 80, render: (r) => r.id },
    { key: 'admin', title: '申请人', width: 100, render: (r) => r.admin_name || '—' },
    { key: 'time', title: '申请时间', width: 150, render: (r) => fmtTime(r.create_time) },
    { key: 'ftype', title: '审批类型', width: 120, render: (r) => typeOf(r) },
    { key: 'dept', title: '所属部门', width: 160, render: (r) => (r as any).department_name || '—' },
    {
      key: 'product',
      title: '物品名称',
      width: 230,
      render: (r) => (
        <span className="pc-td-strong">{(r as any).product_msg || titleOf(r)}</span>
      ),
    },
    { key: 'checker', title: '当前审批人', width: 110, render: (r) => (r as any).check_user || '—' },
    { key: 'status', title: '审批状态', width: 110, render: (r) => tag(statusOf(r)) },
    {
      key: 'op',
      title: '操作',
      width: 230,
      fixed: true,
      render: (r) => {
        const s = statusOf(r);
        return (
          <span className="pc-ops">
            {s === 1 ? (
              <span className="gg-xs orange" onClick={() => setCur(r)}>
                审批
              </span>
            ) : null}
            <span className="gg-xs blue" onClick={() => setCur(r)}>
              详情
            </span>
            {s === 1 ? (
              <span
                className="gg-xs red"
                onClick={(e) => {
                  e.stopPropagation();
                  setRevokeRow(r);
                  setRevokeReason('');
                }}
              >
                撤回
              </span>
            ) : null}
            {s === 3 || s === 4 ? (
              <span
                className="gg-xs purple"
                onClick={(e) => {
                  e.stopPropagation();
                  setReapply(r);
                  setReTitle(String(titleOf(r) || ''));
                }}
              >
                重新申请
              </span>
            ) : null}
            <span className="gg-xs red" onClick={() => setConfirmDel(r)}>
              删除
            </span>
          </span>
        );
      },
    },
  ];

  const st = cur ? statusOf(cur) : 0;

  return (
    <div>
      <PageHead
        title="我发起的"
        crumb={['办公审批', '我发起的']}
        desc={`共 ${rows.length} 条审批${localAdded('approve').length ? ` · 本地新增 ${localAdded('approve').length} 条` : ''}`}
        actions={
          <>
            <button className="pc-btn pc-btn-ghost" onClick={() => load()}>
              刷新
            </button>
            <button className="pc-btn" onClick={() => setAdd(true)}>
              ＋ 发起审批
            </button>
          </>
        }
      />
      <Panel bodyPad={false}>
        <div style={{ padding: '12px 16px 0' }}>
          <FilterTabs tabs={TABS} value={status} onChange={(v: 0 | 1 | 2 | 3) => setStatus(v)} />
          <div className="pc-toolbar">
            <input className="pc-input" style={{ width: 260 }} placeholder="物品名称 / 申请人 / 部门" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="pc-input" style={{ width: 170 }} value={typeF} onChange={(e) => setTypeF(e.target.value)}>
              <option value="">全部类型</option>
              {typeOpts.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {q || typeF ? (
              <button className="pc-btn pc-btn-ghost" onClick={() => { setQ(''); setTypeF(''); }}>
                清空
              </button>
            ) : null}
          </div>
          {/* 24 类审批类型筛选（对齐原站页面顶部的类型标签） */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 0 12px' }}>
            <span
              className={`gg-xs ${typeF === '' ? '' : 'ghost'}`}
              style={{ cursor: 'pointer', padding: '3px 10px', borderRadius: 4 }}
              onClick={() => setTypeF('')}
            >
              全部类型
            </span>
            {APPROVE_TYPES.map((t) => {
              const n = allRows.filter((r) => typeOf(r) === t).length;
              return (
                <span
                  key={t}
                  className={`gg-xs ${typeF === t ? '' : 'ghost'}`}
                  style={{ cursor: 'pointer', padding: '3px 10px', borderRadius: 4 }}
                  onClick={() => setTypeF(typeF === t ? '' : t)}
                >
                  {t}
                  {n ? ` (${n})` : ''}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable columns={cols} rows={rows} rowKey={(r) => String(r.id)} onRowClick={setCur} loading={loading} pageSize={20} />
        </div>
      </Panel>

      {/* ===== 详情 / 审批 ===== */}
      {cur ? (
        <Modal
          title={titleOf(cur)}
          onClose={() => {
            setCur(null);
            setRemark('');
          }}
          footer={
            st === 1 ? (
              <>
                <button className="pc-btn pc-btn-ghost" onClick={() => { setCur(null); setRemark(''); }}>
                  取消
                </button>
                <button className="pc-btn pc-btn-danger" onClick={() => void decide(false)}>
                  拒绝
                </button>
                <button className="pc-btn" onClick={() => void decide(true)}>
                  通过
                </button>
              </>
            ) : (
              <button className="pc-btn" onClick={() => setCur(null)}>
                关闭
              </button>
            )
          }
        >
          <dl className="pc-kv">
            <div style={{ display: 'contents' }}><dt>编号</dt><dd>{cur.id}</dd></div>
            <div style={{ display: 'contents' }}><dt>类型</dt><dd>{typeOf(cur)}</dd></div>
            <div style={{ display: 'contents' }}><dt>物品名称</dt><dd>{(cur as any).product_msg || titleOf(cur)}</dd></div>
            <div style={{ display: 'contents' }}><dt>所属部门</dt><dd>{(cur as any).department_name || '—'}</dd></div>
            <div style={{ display: 'contents' }}><dt>当前审批人</dt><dd>{(cur as any).check_user || '—'}</dd></div>
            <div style={{ display: 'contents' }}><dt>申请人</dt><dd>{cur.admin_name || '—'}</dd></div>
            <div style={{ display: 'contents' }}><dt>提交时间</dt><dd>{fmtTime(cur.create_time)}</dd></div>
            <div style={{ display: 'contents' }}><dt>状态</dt><dd>{st === 2 ? '已通过' : st === 3 ? '已拒绝' : st === 4 ? '已撤销' : '待审批'}</dd></div>
          </dl>
          {cur.content ? (
            <div style={{ marginTop: 14, fontSize: 13.5, lineHeight: 1.9, color: 'var(--c-text-2)', whiteSpace: 'pre-wrap' }}>
              {cur.content}
            </div>
          ) : null}
          {(cur.flow || []).length ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>审批流程</div>
              {(cur.flow || []).map((n, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: '1px solid var(--c-border)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 5, flex: 'none', background: n.state === 'ok' ? 'var(--c-success-2)' : n.state === 'no' ? 'var(--c-danger)' : 'var(--c-warn-2)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{n.name}</div>
                    {n.admin_name ? <div style={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{n.admin_name}</div> : null}
                    {n.remark ? <div style={{ fontSize: 12.5 }}>意见：{n.remark}</div> : null}
                    {n.time ? <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{n.time}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {getApproveRemark(cur) ? (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--c-text-2)' }}>审批意见：{getApproveRemark(cur)}</div>
          ) : null}
          {st === 1 ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>审批意见（拒绝时必填）</div>
              <textarea className="pc-input" style={{ width: '100%', height: 70, resize: 'vertical' }} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="填写审批意见" />
            </div>
          ) : null}
        </Modal>
      ) : null}

      {/* ===== 发起审批 ===== */}
      {add ? (
        <Modal
          title="发起审批"
          onClose={() => setAdd(false)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => setAdd(false)}>取消</button>
              <button className="pc-btn" onClick={() => void submitAdd()} disabled={busy}>{busy ? '提交中…' : '提交'}</button>
            </>
          }
        >
          <div style={{ fontSize: 13, marginBottom: 8 }}>申请类型</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {APPROVE_TYPES.map((t) => (
              <button key={t} className={`pc-btn ${addType === t ? '' : 'pc-btn-ghost'}`} onClick={() => setAddType(t)}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>申请事由 *</div>
          <input className="pc-input" style={{ width: '100%', marginBottom: 12 }} placeholder="如：10月试剂采购申请" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} />
          <div style={{ fontSize: 13, marginBottom: 6 }}>详细说明</div>
          <input className="pc-input" style={{ width: '100%' }} placeholder="补充说明（可选）" value={addContent} onChange={(e) => setAddContent(e.target.value)} />
        </Modal>
      ) : null}

      {/* ===== 重新申请（对齐原站 reapply，本地生效） ===== */}
      {reapply ? (
        <Modal
          title="重新申请"
          onClose={() => { setReapply(null); setReTitle(''); }}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => { setReapply(null); setReTitle(''); }}>
                取消
              </button>
              <button className="pc-btn" onClick={() => doReapply(reapply, reTitle)}>
                提交
              </button>
            </>
          }
        >
          <div style={{ fontSize: 12.5, color: '#e8862a', background: '#fff7ec', border: '1px solid #ffd9a8', borderRadius: 6, padding: '7px 10px', marginBottom: 14 }}>
            重新申请会在本机生成一条新的同类型审批，原记录保留，不提交 oa.upingbio.com。
          </div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>类型</div>
          <input className="pc-input" style={{ width: '100%', marginBottom: 12 }} value={typeOf(reapply)} readOnly />
          <div style={{ fontSize: 13, marginBottom: 6 }}>申请事由 *</div>
          <input className="pc-input" style={{ width: '100%', marginBottom: 12 }} value={reTitle} onChange={(e) => setReTitle(e.target.value)} placeholder="请填写申请事由" />
          <div style={{ fontSize: 13, marginBottom: 6 }}>原申请说明</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-2)', whiteSpace: 'pre-wrap' }}>{(reapply as any).content || '（无）'}</div>
        </Modal>
      ) : null}

      {/* 删除审批（原站 POST /oa/approve/delete） */}
      {confirmDel ? (
        <ConfirmDialog
          title="删除确认"
          text={`确认删除审批「${String(titleOf(confirmDel) || confirmDel.id || '')}」？将同步删除 OA 原站的这条审批。`}
          onOk={async () => {
            const r = await deleteApprove(String(confirmDel.id ?? ''));
            if (!r.ok) return toast(r.msg || '删除失败');
            deleteLocal('approve', String(confirmDel.id ?? ''));
            setCur(null);
            setLocalVer((n) => n + 1);
            toast('已删除（原站已同步）');
            load();
          }}
          onClose={() => setConfirmDel(null)}
        />
      ) : null}

      {/* 撤回审批（原站 flow_check check=3） */}
      {revokeRow ? (
        <Modal
          title="撤回审批"
          onClose={() => setRevokeRow(null)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => setRevokeRow(null)}>
                取消
              </button>
              <button className="pc-btn pc-btn-danger" onClick={doRevoke}>
                确认撤回
              </button>
            </>
          }
        >
          <div style={{ marginBottom: 10, fontSize: 13.5 }}>
            撤回「{String(titleOf(revokeRow) || revokeRow.id || '')}」
          </div>
          <textarea
            className="pc-input"
            style={{ width: '100%', height: 90, padding: 10, resize: 'vertical' }}
            placeholder="请输入撤回理由（必填）"
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
