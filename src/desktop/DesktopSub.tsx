/**
 * 桌面端子页面（财务管理 / 客户子类 / 订单 等）+ 表单页（基本资料 / 修改密码）
 * PC 后台版式：工具栏（搜索 / 筛选）+ 数据表格 + 分页 + 详情弹层
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  changePassword, fetchSubRows, getProfile, saveProfile, subPageTitle,
} from '../core/api';
import type { BizRow } from '../core/biz';
import { fmtTime, toast } from '../core/util';
import { Modal } from './ui';
import { PageHead, Panel, StatusTag, DataTable, type Column } from './pc';

function tagTone(tone?: string): 'ok' | 'no' | 'wait' | '' {
  if (tone === 'ok') return 'ok';
  if (tone === 'no') return 'no';
  if (tone === 'wait') return 'wait';
  return '';
}

export function DesktopSub({ pageKey }: { pageKey: string }) {
  const [rows, setRows] = useState<BizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<BizRow | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetchSubRows(pageKey).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [pageKey]);

  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? rows.filter((r) => (r.title + r.sub + (r.status || '')).toLowerCase().includes(k)) : rows;
  }, [rows, q]);

  const cols: Column<BizRow>[] = [
    { key: 'title', title: '名称', render: (r) => <span className="pc-td-strong">{r.title}</span> },
    { key: 'sub', title: '说明', render: (r) => r.sub || '—' },
    { key: 'amount', title: '金额 / 数量', width: 130, align: 'right', render: (r) => r.amount || '—' },
    {
      key: 'status',
      title: '状态',
      width: 120,
      render: (r) => (r.status ? <StatusTag tone={tagTone(r.tone)}>{r.status}</StatusTag> : '—'),
    },
    { key: 'time', title: '时间', width: 160, render: (r) => (r.time ? fmtTime(r.time) : '—') },
    {
      key: 'op',
      title: '操作',
      width: 90,
      render: () => <span className="pc-link">详情</span>,
    },
  ];

  return (
    <div>
      <PageHead
        title={subPageTitle(pageKey)}
        crumb={['业务', subPageTitle(pageKey)]}
        desc={`共 ${rows.length} 条记录`}
        actions={
          <button className="pc-btn pc-btn-ghost" onClick={load}>
            刷新
          </button>
        }
      />

      <Panel bodyPad={false}>
        <div style={{ padding: '12px 16px 0' }}>
          <div className="pc-toolbar">
            <input
              className="pc-input"
              style={{ width: 240 }}
              placeholder="搜索名称 / 说明 / 状态"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q ? (
              <button className="pc-btn pc-btn-ghost" onClick={() => setQ('')}>
                清空
              </button>
            ) : null}
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable
            columns={cols}
            rows={list}
            rowKey={(r) => r.id}
            onRowClick={setDetail}
            pageSize={20}
            loading={loading}
          />
        </div>
      </Panel>

      {detail ? (
        <Modal
          title={detail.title}
          onClose={() => setDetail(null)}
          footer={
            <button className="pc-btn" onClick={() => setDetail(null)}>
              关闭
            </button>
          }
        >
          <dl className="pc-kv">
            {(detail.detail || []).map(([k, v], i) => (
              <div key={i} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      ) : null}
    </div>
  );
}

/* ======================= 基本资料 ======================= */

export function DesktopProfile() {
  const [p, setP] = useState(() => getProfile());
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const r = await saveProfile(p);
    setSaving(false);
    toast(r.ok ? r.msg || '已保存' : r.msg || '保存失败');
  }

  const f = (key: keyof typeof p, label: string, ph: string) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, color: '#8a919f', marginBottom: 5 }}>{label}</div>
      <input
        className="pc-input"
        style={{ width: 340, height: 36 }}
        placeholder={ph}
        value={p[key] || ''}
        onChange={(e) => setP({ ...p, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div>
      <PageHead title="基本资料" crumb={['个人', '基本资料']} desc="修改后即时保存，下次登录自动带出" />
      <Panel>
        {f('nickname', '姓名', '请输入姓名')}
        {f('mobile', '手机号', '请输入手机号')}
        {f('email', '邮箱', '请输入邮箱')}
        {f('department', '部门', '如：销售部')}
        {f('position', '职务', '如：销售代表')}
        <button className="pc-btn" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </Panel>
    </div>
  );
}

/* ======================= 修改密码 ======================= */

export function DesktopPassword() {
  const [oldPwd, setOld] = useState('');
  const [newPwd, setNew] = useState('');
  const [re, setRe] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!oldPwd) return toast('请输入原密码');
    if (newPwd !== re) return toast('两次输入的新密码不一致');
    setBusy(true);
    const r = await changePassword(oldPwd, newPwd);
    setBusy(false);
    if (r.ok) {
      setOld('');
      setNew('');
      setRe('');
    }
    toast(r.ok ? r.msg || '密码已修改' : r.msg || '修改失败');
  }

  const f = (label: string, v: string, set: (s: string) => void, ph: string) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, color: '#8a919f', marginBottom: 5 }}>{label}</div>
      <input
        className="pc-input"
        style={{ width: 340, height: 36 }}
        type="password"
        placeholder={ph}
        value={v}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );

  return (
    <div>
      <PageHead title="修改密码" crumb={['个人', '修改密码']} desc="新密码至少 6 位，且不能与旧密码相同" />
      <Panel>
        {f('原密码', oldPwd, setOld, '请输入原密码')}
        {f('新密码', newPwd, setNew, '至少 6 位')}
        {f('确认新密码', re, setRe, '请再次输入新密码')}
        <button className="pc-btn" onClick={submit} disabled={busy}>
          {busy ? '提交中…' : '确认修改'}
        </button>
      </Panel>
    </div>
  );
}
