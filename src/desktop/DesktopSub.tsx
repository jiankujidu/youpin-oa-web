/**
 * 桌面端子页面（财务管理 / 客户子类 / 订单 等）+ 表单页（基本资料 / 修改密码）。
 *
 * 桌面端用表格 + 详情弹窗的独立布局（与手机端卡片流是两套组件树，非媒体查询缩放）。
 * 数据层与手机端共用 fetchSubRows：演示模式读内置业务集，配置代理后走 OA 真实接口。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  changePassword, fetchSubRows, getProfile, saveProfile, subPageTitle,
} from '../core/api';
import type { BizRow } from '../core/biz';
import { fmtTime, toast } from '../core/util';
import { Empty, Loading, Modal } from './ui';

function tagCls(tone?: string): string {
  if (tone === 'ok') return 'd-tag d-tag-pass';
  if (tone === 'no') return 'd-tag d-tag-reject';
  if (tone === 'wait') return 'd-tag d-tag-pending';
  return 'd-tag';
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

  const list = q.trim()
    ? rows.filter((r) => (r.title + r.sub).toLowerCase().includes(q.trim().toLowerCase()))
    : rows;

  return (
    <div>
      <div className="d-page-head">
        <div>
          <div className="d-page-title">{subPageTitle(pageKey)}</div>
          <div className="d-page-sub">共 {rows.length} 条记录</div>
        </div>
        <div className="d-page-actions">
          <input
            className="d-field"
            style={{ width: 220 }}
            placeholder="搜索关键词"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty />
      ) : (
        <table className="d-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>说明</th>
              <th>金额 / 数量</th>
              <th>状态</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} onClick={() => setDetail(r)} style={{ cursor: 'pointer' }}>
                <td className="d-td-name">{r.title}</td>
                <td>{r.sub}</td>
                <td>{r.amount || '—'}</td>
                <td>
                  <span className={tagCls(r.tone)}>{r.status || '—'}</span>
                </td>
                <td>{r.time ? fmtTime(r.time) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detail ? (
        <Modal
          title={detail.title}
          onClose={() => setDetail(null)}
          footer={
            <button className="d-btn" onClick={() => setDetail(null)}>
              关闭
            </button>
          }
        >
          <div className="d-card">
            {(detail.detail || []).map(([k, v], i) => (
              <div className="d-card-line" key={i}>
                <span style={{ color: 'var(--c-text-4)', display: 'inline-block', minWidth: 96 }}>
                  {k}
                </span>
                <span>{v}</span>
              </div>
            ))}
          </div>
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
    <div style={{ marginBottom: 12 }}>
      <div className="d-page-sub" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <input
        className="d-field"
        style={{ width: 320 }}
        placeholder={ph}
        value={p[key] || ''}
        onChange={(e) => setP({ ...p, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div>
      <div className="d-page-head">
        <div>
          <div className="d-page-title">基本资料</div>
          <div className="d-page-sub">修改后即时保存，下次登录自动带出</div>
        </div>
      </div>
      <div className="d-card">
        {f('nickname', '姓名', '请输入姓名')}
        {f('mobile', '手机号', '请输入手机号')}
        {f('email', '邮箱', '请输入邮箱')}
        {f('department', '部门', '如：销售部')}
        {f('position', '职务', '如：销售代表')}
        <button className="d-btn d-btn-primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
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
    <div style={{ marginBottom: 12 }}>
      <div className="d-page-sub" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <input
        className="d-field"
        style={{ width: 320 }}
        type="password"
        placeholder={ph}
        value={v}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );

  return (
    <div>
      <div className="d-page-head">
        <div>
          <div className="d-page-title">修改密码</div>
          <div className="d-page-sub">新密码至少 6 位，且不能与旧密码相同</div>
        </div>
      </div>
      <div className="d-card">
        {f('原密码', oldPwd, setOld, '请输入原密码')}
        {f('新密码', newPwd, setNew, '至少 6 位')}
        {f('确认新密码', re, setRe, '请再次输入新密码')}
        <button className="d-btn d-btn-primary" onClick={submit} disabled={busy}>
          {busy ? '提交中…' : '确认修改'}
        </button>
      </div>
    </div>
  );
}
