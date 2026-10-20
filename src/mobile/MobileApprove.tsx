/**
 * 手机端审批页 — 复刻 app.js renderApprove()
 * 分段控件（全部/待审批/已通过/已拒绝）+ 列表卡片 + 详情（流程节点 + 通过/拒绝）
 */
import { useCallback, useEffect, useState } from 'react';
import { applyApproveDecision, fetchApproves, getApproveRemark, getApproveStatus } from '../core/api';
import type { ApproveItem } from '../core/types';
import { fmtTime, toast } from '../core/util';
import { Dialog, Empty, Loading, PromptDialog } from './ui';

const STATUS_LABEL: Record<number, string> = {
  0: '待审批', 1: '待审批', 2: '已通过', 3: '已拒绝',
};

function StatusTag({ s }: { s: number }) {
  if (s === 2) return <span className="m-tag m-tag-pass">已通过</span>;
  if (s === 3) return <span className="m-tag m-tag-reject">已拒绝</span>;
  return <span className="m-tag m-tag-pending">待审批</span>;
}

type Pending = { item: ApproveItem; pass: boolean; remark: string };

export default function MobileApprove() {
  const [status, setStatus] = useState<0 | 1 | 2 | 3>(0);
  const [list, setList] = useState<ApproveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ApproveItem | null>(null);
  /** 待确认的审批决定：先填意见 → 再确认 → 落库 */
  const [pending, setPending] = useState<Pending | null>(null);
  /** 意见输入弹层：pass=true 通过 / false 拒绝 */
  const [asking, setAsking] = useState<{ item: ApproveItem; pass: boolean } | null>(null);

  const load = useCallback((s: 0 | 1 | 2 | 3) => {
    setLoading(true);
    fetchApproves(s).then((rows) => {
      setList(rows);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load(status);
  }, [status, load]);

  async function commit(p: Pending) {
    const r = await applyApproveDecision(p.item.id, p.pass, p.remark);
    if (!r.ok) {
      toast(r.msg || '提交失败');
      setPending(null);
      return;
    }
    toast(p.pass ? '已通过' : '已拒绝');
    setPending(null);
    setDetail(null);
    load(status);
  }

  /* ======================= 详情视图 ======================= */
  if (detail) {
    const st = getApproveStatus(detail);
    return (
      <div>
        <div className="m-detail-head">
          <div className="m-dh-title">{detail.title}</div>
          <div className="m-dh-sub">
            {detail.type_name} · {detail.admin_name} · {fmtTime(detail.create_time)}
            <StatusTag s={st} />
          </div>
        </div>

        <div className="m-detail-card">
          <div className="m-detail-row">
            <span className="dl">审批类型</span>
            <span className="dv">{detail.type_name}</span>
          </div>
          <div className="m-detail-row">
            <span className="dl">申请人</span>
            <span className="dv">{detail.admin_name}</span>
          </div>
          <div className="m-detail-row">
            <span className="dl">提交时间</span>
            <span className="dv">{fmtTime(detail.create_time)}</span>
          </div>
        </div>

        {detail.content ? (
          <div className="m-detail-content">
            {detail.content.split('\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : null}

        <div className="m-section-title">审批流程</div>
        <div className="m-card">
          {(detail.flow || []).map((n, i) => (
            <div className="m-node-item" key={i}>
              <span className={`m-node-dot ${n.state}`} />
              <div className="m-node-body">
                <div className="m-node-name">{n.name}</div>
                {n.admin_name ? <div className="m-node-info">{n.admin_name}</div> : null}
                {n.remark ? <div className="m-node-info">意见：{n.remark}</div> : null}
                {n.time ? <div className="m-node-time">{n.time}</div> : null}
              </div>
            </div>
          ))}
        </div>

        {st === 1 ? (
          <div style={{ display: 'flex', gap: 10, margin: '0 12px 20px' }}>
            <button className="m-btn m-btn-ok" onClick={() => setAsking({ item: detail, pass: true })}>
              通过
            </button>
            <button className="m-btn m-btn-no" onClick={() => setAsking({ item: detail, pass: false })}>
              拒绝
            </button>
          </div>
        ) : (
          <div className="m-card">
            <div className="m-card-line">
              当前状态：{STATUS_LABEL[st] || '—'}
              {` · ${getApproveRemark(detail) || '无意见'}`}
            </div>
          </div>
        )}

        <div style={{ padding: '0 12px 20px' }}>
          <button
            className="m-btn"
            style={{ background: '#f0f2f5', color: '#666' }}
            onClick={() => setDetail(null)}
          >
            返回列表
          </button>
        </div>

        {asking ? (
          <PromptDialog
            title={asking.pass ? '通过意见（可留空）' : '拒绝理由'}
            placeholder={asking.pass ? '同意' : '请填写拒绝理由'}
            defaultValue={asking.pass ? '同意' : ''}
            onCancel={() => setAsking(null)}
            onOk={(v) => {
              if (!asking.pass && !v.trim()) {
                toast('请填写拒绝理由');
                return;
              }
              setPending({ item: asking.item, pass: asking.pass, remark: v });
              setAsking(null);
            }}
          />
        ) : null}

        {pending ? (
          <Dialog
            message={pending.pass ? '确认通过该审批？' : `确认拒绝「${pending.item.title}」？`}
            onCancel={() => setPending(null)}
            onOk={() => commit(pending)}
          />
        ) : null}
      </div>
    );
  }

  /* ======================= 列表视图 ======================= */
  return (
    <div>
      <div className="m-seg">
        {(
          [
            [0, '全部'],
            [1, '待审批'],
            [2, '已通过'],
            [3, '已拒绝'],
          ] as [0 | 1 | 2 | 3, string][]
        ).map(([s, label]) => (
          <div
            key={s}
            className={`m-seg-item${status === s ? ' active' : ''}`}
            onClick={() => setStatus(s)}
          >
            {label}
          </div>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty text="暂无审批" />
      ) : (
        list.map((it) => (
          <div key={it.id} className="m-card clickable" onClick={() => setDetail(it)}>
            <div className="m-card-title">
              {it.title}
              <StatusTag s={getApproveStatus(it)} />
            </div>
            <div className="m-card-line">
              {it.type_name} · {it.admin_name}
            </div>
            <div className="m-card-line">{fmtTime(it.create_time)}</div>
          </div>
        ))
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}
