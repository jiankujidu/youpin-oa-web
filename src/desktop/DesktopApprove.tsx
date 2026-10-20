/**
 * 办公审批 › 我发起的（/oa/approve/index）
 * PC 后台统一版式：筛选 Tab + 数据表格 + 分页 + 详情弹层（含审批意见与通过/拒绝）
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyApproveDecision, createApprove, fetchApproves, getApproveRemark, getApproveStatus } from '../core/api';
import type { ApproveItem } from '../core/types';
import { fmtTime, toast } from '../core/util';
import { Modal } from './ui';
import { DataTable, FilterTabs, PageHead, Panel, StatusTag, type Column } from './pc';

const APPROVE_TYPES = ['请假', '出差', '外出', '加班', '采购', '维修', '用章', '用车'];

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
  const [cur, setCur] = useState<ApproveItem | null>(null);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(false);
  const [addType, setAddType] = useState(APPROVE_TYPES[0]);
  const [addTitle, setAddTitle] = useState('');
  const [addContent, setAddContent] = useState('');

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

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return list.filter((r) => {
      if (status !== 0 && statusOf(r) !== status) return false;
      if (!k) return true;
      return (titleOf(r) + typeOf(r) + (r.admin_name || '') + (r.content || '') + ((r as any).name || ''))
        .toLowerCase()
        .includes(k);
    });
  }, [list, q, status]);

  async function submitAdd() {
    if (!addTitle.trim()) return toast('请填写申请事由');
    setBusy(true);
    const r = await createApprove({ typeName: addType, title: addTitle, content: addContent });
    setBusy(false);
    if (!r.ok) return toast(r.msg || '提交失败');
    setAdd(false);
    setAddTitle('');
    setAddContent('');
    setStatus(1);
    toast('已提交，进入待审批');
    setStatus(1);
    load();
  }

  async function decide(pass: boolean) {
    if (!cur) return;
    if (!pass && !remark.trim()) {
      toast('请填写拒绝理由');
      return;
    }
    const r = await applyApproveDecision(cur.id, pass, remark);
    if (!r.ok) return toast(r.msg || '提交失败');
    toast(pass ? '已通过' : '已拒绝');
    setRemark('');
    setCur(null);
    load();
  }

  const cols: Column<ApproveItem>[] = [
    { key: 'type', title: '类型', width: 120, render: (r) => typeOf(r) },
    { key: 'title', title: '审批事项', render: (r) => <span className="pc-td-strong">{titleOf(r)}</span> },
    { key: 'admin', title: '申请人', width: 110, render: (r) => r.admin_name || '—' },
    { key: 'time', title: '提交时间', width: 150, render: (r) => fmtTime(r.create_time) },
    { key: 'status', title: '状态', width: 110, render: (r) => tag(statusOf(r)) },
    {
      key: 'op',
      title: '操作',
      width: 160,
      render: (r) => {
        const s = statusOf(r);
        return s === 1 ? (
          <span className="pc-link" onClick={() => setCur(r)}>
            审批 · 详情
          </span>
        ) : (
          <span className="pc-link" onClick={() => setCur(r)}>
            详情
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
        desc={`共 ${rows.length} 条审批`}
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
            <input className="pc-input" style={{ width: 260 }} placeholder="搜索事由 / 类型 / 申请人" value={q} onChange={(e) => setQ(e.target.value)} />
            {q ? <button className="pc-btn pc-btn-ghost" onClick={() => setQ('')}>清空</button> : null}
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} onRowClick={setCur} loading={loading} pageSize={20} />
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
    </div>
  );
}
