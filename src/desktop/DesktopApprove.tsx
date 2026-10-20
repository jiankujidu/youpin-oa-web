/**
 * 桌面端审批页 — master-detail 双栏（左列表 / 右详情）
 * 与手机端的「分段控件 + 全屏详情」是两套独立设计
 */
import { useCallback, useEffect, useState } from 'react';
import { applyApproveDecision, fetchApproves, getApproveStatus } from '../core/api';
import type { ApproveItem } from '../core/types';
import { fmtTime, toast } from '../core/util';
import { Empty, Loading, Modal } from './ui';

function tag(s: number) {
  if (s === 2) return <span className="d-tag d-tag-pass">已通过</span>;
  if (s === 3) return <span className="d-tag d-tag-reject">已拒绝</span>;
  return <span className="d-tag d-tag-pending">待审批</span>;
}

export default function DesktopApprove() {
  const [status, setStatus] = useState<0 | 1 | 2 | 3>(0);
  const [list, setList] = useState<ApproveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState<ApproveItem | null>(null);
  const [remark, setRemark] = useState('');
  const [confirm, setConfirm] = useState<{ pass: boolean } | null>(null);

  const load = useCallback((s: 0 | 1 | 2 | 3) => {
    setLoading(true);
    fetchApproves(s).then((rows) => {
      setList(rows);
      setLoading(false);
      setCur((prev) => (prev ? rows.find((r) => r.id === prev.id) || rows[0] || null : rows[0] || null));
    });
  }, []);

  useEffect(() => {
    load(status);
  }, [status, load]);

  function decide(pass: boolean) {
    if (!cur) return;
    if (!pass && !remark.trim()) {
      toast('请填写拒绝理由');
      return;
    }
    applyApproveDecision(cur.id, pass, remark);
    toast(pass ? '已通过' : '已拒绝');
    setRemark('');
    setConfirm(null);
    load(status);
  }

  const st = cur ? getApproveStatus(cur) : 0;

  return (
    <div>
      <div className="d-page-head">
        <span className="d-page-title">审批</span>
        <span className="d-page-sub">共 {list.length} 条</span>
        <span className="d-page-actions">
          {(
            [
              [0, '全部'],
              [1, '待审批'],
              [2, '已通过'],
              [3, '已拒绝'],
            ] as [0 | 1 | 2 | 3, string][]
          ).map(([s, label]) => (
            <button
              key={s}
              className={`d-btn ${status === s ? 'd-btn-primary' : 'd-btn-ghost'}`}
              onClick={() => setStatus(s)}
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      <div className="d-cols-2">
        {/* ===== 左：列表 ===== */}
        <div className="d-list">
          <div className="d-list-head">审批列表</div>
          {loading ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty text="暂无审批" />
          ) : (
            list.map((it) => (
              <div
                key={it.id}
                className={`d-list-row${cur?.id === it.id ? ' active' : ''}`}
                onClick={() => {
                  setCur(it);
                  setRemark('');
                }}
              >
                <div className="d-row-main">
                  <div className="d-row-title">{it.title}</div>
                  <div className="d-row-sub">
                    {it.type_name} · {it.admin_name} · {fmtTime(it.create_time)}
                  </div>
                </div>
                {tag(getApproveStatus(it))}
              </div>
            ))
          )}
        </div>

        {/* ===== 右：详情 ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {cur ? (
            <>
              <div className="d-card">
                <div className="d-card-title" style={{ fontSize: 16, marginBottom: 10 }}>
                  {cur.title}
                  {tag(st)}
                </div>
                <div className="d-card-line">
                  {cur.type_name} · 申请人 {cur.admin_name} · {fmtTime(cur.create_time)}
                </div>
                {cur.content ? (
                  <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.9, color: 'var(--c-text-2)' }}>
                    {cur.content.split('\n').map((p, i) => (
                      <div key={i}>{p}</div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="d-card">
                <div className="d-card-title">审批流程</div>
                {(cur.flow || []).map((n, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--c-border-2)' }}>
                    <span
                      style={{
                        width: 10, height: 10, borderRadius: '50%', marginTop: 5, flex: 'none',
                        background: n.state === 'ok' ? 'var(--c-success-2)' : n.state === 'no' ? 'var(--c-danger)' : 'var(--c-warn-2)',
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{n.name}</div>
                      {n.admin_name ? <div style={{ fontSize: 12.5, color: 'var(--c-text-2)', marginTop: 2 }}>{n.admin_name}</div> : null}
                      {n.remark ? <div style={{ fontSize: 12.5, color: 'var(--c-text-2)', marginTop: 2 }}>意见：{n.remark}</div> : null}
                      {n.time ? <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 2 }}>{n.time}</div> : null}
                    </div>
                  </div>
                ))}
              </div>

              {st === 1 ? (
                <div className="d-card">
                  <div className="d-card-title">审批意见</div>
                  <textarea
                    className="d-field"
                    style={{ width: '100%', height: 72, padding: 10, borderRadius: 8, resize: 'vertical', fontSize: 13 }}
                    placeholder="填写审批意见（拒绝时必填）"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button className="d-btn d-btn-primary" onClick={() => setConfirm({ pass: true })}>
                      通过
                    </button>
                    <button className="d-btn d-btn-danger" onClick={() => setConfirm({ pass: false })}>
                      拒绝
                    </button>
                  </div>
                </div>
              ) : (
                <div className="d-card">
                  <div className="d-card-line">
                    该审批已处理：{st === 2 ? '已通过' : '已拒绝'}
                    {st === 3 && cur.remark ? ` · ${cur.remark}` : ''}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="d-card">
              <Empty text="请选择左侧一条审批" />
            </div>
          )}
        </div>
      </div>

      {confirm ? (
        <Modal
          title={confirm.pass ? '确认通过？' : '确认拒绝？'}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="d-btn d-btn-ghost" onClick={() => setConfirm(null)}>
                取消
              </button>
              <button className="d-btn d-btn-primary" onClick={() => decide(confirm.pass)}>
                确定
              </button>
            </>
          }
        >
          <div style={{ fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
            {cur?.title}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
