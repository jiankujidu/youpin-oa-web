/**
 * 手机端子页面（财务管理 / 客户子类 / 订单 等）+ 表单页（基本资料 / 修改密码 / 新增客户）。
 *
 * 这些页此前是 MobilePlaceholder 占位，点了「功能不可用」。现在全部接真实数据源：
 * 演示模式读内置业务数据集，配置代理后走 OA 真实接口，视图层零改动。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  changePassword, createApprove, createCustomer, fetchSubRows, getProfile, saveProfile,
} from '../core/api';
import { subPageTitle } from '../core/api';
import type { BizRow } from '../core/biz';
import { fmtTime, toast } from '../core/util';
import { Dialog, Empty, Loading } from './ui';

/* ======================= 通用列表 + 详情 ======================= */

function RowTag({ row }: { row: BizRow }) {
  if (!row.status) return null;
  const cls =
    row.tone === 'ok' ? 'm-tag m-tag-pass' : row.tone === 'no' ? 'm-tag m-tag-reject' : row.tone === 'wait' ? 'm-tag m-tag-pending' : 'm-tag';
  return <span className={cls}>{row.status}</span>;
}

export function MobileSub({ pageKey }: { pageKey: string }) {
  const [rows, setRows] = useState<BizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<BizRow | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetchSubRows(pageKey)
      .then((r) => {
        setRows(r);
        setLoading(false);
      })
      .catch(() => {
        setRows([]);
        setLoading(false);
      });
  }, [pageKey]);

  useEffect(() => {
    load();
  }, [load]);

  const list = q.trim()
    ? rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q.trim().toLowerCase()) ||
          r.sub.toLowerCase().includes(q.trim().toLowerCase()),
      )
    : rows;

  if (detail) {
    return (
      <div>
        <div className="m-detail-head">
          <div className="m-dh-title">{detail.title}</div>
          <div className="m-dh-sub">
            {detail.sub}
            {detail.time ? ` · ${fmtTime(detail.time)}` : ''}
            <RowTag row={detail} />
          </div>
        </div>
        <div className="m-detail-card">
          {(detail.detail || []).map(([k, v], i) => (
            <div className="m-detail-row" key={i}>
              <span className="dl">{k}</span>
              <span className="dv">{v}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '0 12px 20px' }}>
          <button
            className="m-btn"
            style={{ background: '#f0f2f5', color: '#666' }}
            onClick={() => setDetail(null)}
          >
            返回列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: '8px 12px 0' }}>
        <div className="m-field">
          <input
            placeholder={`搜索${subPageTitle(pageKey)}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty text="暂无数据" />
      ) : (
        list.map((r) => (
          <div key={r.id} className="m-card clickable" onClick={() => setDetail(r)}>
            <div className="m-card-title">
              {r.title}
              <RowTag row={r} />
            </div>
            {r.sub ? <div className="m-card-line">{r.sub}</div> : null}
            <div className="m-card-line">
              {r.amount ? `${r.amount} · ` : ''}
              {r.time ? fmtTime(r.time) : ''}
            </div>
          </div>
        ))
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

/* ======================= 发起审批 ======================= */

const APPROVE_TYPES = ['请假', '出差', '外出', '加班', '采购', '维修', '用章', '用车'];

export function MobileApproveAdd({ onDone }: { onDone: () => void }) {
  const [typeName, setType] = useState(APPROVE_TYPES[0]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return toast('请填写申请事由');
    setConfirm(false);
    setBusy(true);
    const r = await createApprove({ typeName, title, content });
    setBusy(false);
    if (r.ok) {
      toast('已提交，进入待审批');
      onDone();
    } else {
      toast(r.msg || '提交失败');
    }
  }

  return (
    <div>
      <div className="m-section-title" style={{ margin: '0 12px 6px' }}>
        申请类型
      </div>
      <div className="m-seg" style={{ flexWrap: 'wrap' }}>
        {APPROVE_TYPES.map((t) => (
          <div
            key={t}
            className={`m-seg-item${typeName === t ? ' active' : ''}`}
            onClick={() => setType(t)}
          >
            {t}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 12px 0' }}>
        <div className="m-section-title" style={{ margin: '0 0 4px' }}>
          申请事由 *
        </div>
        <div className="m-field">
          <input placeholder="如：10月试剂采购申请" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      <div style={{ padding: '8px 12px 0' }}>
        <div className="m-section-title" style={{ margin: '0 0 4px' }}>
          详细说明
        </div>
        <div className="m-field">
          <input placeholder="补充说明（可选）" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
      </div>
      <div style={{ padding: '12px 12px 20px' }}>
        <button className="m-btn m-btn-ok" onClick={() => setConfirm(true)} disabled={busy}>
          {busy ? '提交中…' : '提交申请'}
        </button>
      </div>

      {confirm ? (
        <Dialog message={`确认提交「${title}」？`} onCancel={() => setConfirm(false)} onOk={submit} />
      ) : null}
    </div>
  );
}

/* ======================= 基本资料 ======================= */

export function MobileProfile() {
  const [p, setP] = useState(() => getProfile());
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const r = await saveProfile(p);
    setSaving(false);
    if (r.ok) toast(r.msg || '已保存');
    else toast(r.msg || '保存失败');
  }

  const field = (key: keyof typeof p, label: string, ph: string) => (
    <div style={{ padding: '0 12px 8px' }}>
      <div className="m-section-title" style={{ margin: '0 0 4px' }}>
        {label}
      </div>
      <div className="m-field">
        <input
          placeholder={ph}
          value={p[key] || ''}
          onChange={(e) => setP({ ...p, [key]: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <div>
      <div className="m-card">
        <div className="m-card-line">修改后即时保存，下次进入自动带出。</div>
      </div>
      <div style={{ paddingTop: 8 }}>
        {field('nickname', '姓名', '请输入姓名')}
        {field('mobile', '手机号', '请输入手机号')}
        {field('email', '邮箱', '请输入邮箱')}
        {field('department', '部门', '如：销售部')}
        {field('position', '职务', '如：销售代表')}
      </div>
      <div style={{ padding: '4px 12px 20px' }}>
        <button className="m-btn m-btn-ok" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}

/* ======================= 修改密码 ======================= */

export function MobilePassword() {
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
      toast(r.msg || '密码已修改');
    } else {
      toast(r.msg || '修改失败');
    }
  }

  const f = (label: string, v: string, set: (s: string) => void, ph: string, pwd = true) => (
    <div style={{ padding: '0 12px 8px' }}>
      <div className="m-section-title" style={{ margin: '0 0 4px' }}>
        {label}
      </div>
      <div className="m-field">
        <input type={pwd ? 'password' : 'text'} placeholder={ph} value={v} onChange={(e) => set(e.target.value)} />
      </div>
    </div>
  );

  return (
    <div>
      {f('原密码', oldPwd, setOld, '请输入原密码')}
      {f('新密码', newPwd, setNew, '至少 6 位')}
      {f('确认新密码', re, setRe, '请再次输入新密码')}
      <div style={{ padding: '4px 12px 20px' }}>
        <button className="m-btn m-btn-ok" onClick={submit} disabled={busy}>
          {busy ? '提交中…' : '确认修改'}
        </button>
      </div>
    </div>
  );
}

/* ======================= 新增客户 ======================= */

export function MobileCustomerAdd({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [tel, setTel] = useState('');
  const [source, setSource] = useState('');
  const [address, setAddress] = useState('');
  const [remark, setRemark] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return toast('请填写客户名称');
    setConfirm(false);
    setBusy(true);
    const r = await createCustomer({ name, contact, tel, source, address, remark });
    setBusy(false);
    if (r.ok) {
      toast('客户已创建');
      onDone();
    } else {
      toast(r.msg || '创建失败');
    }
  }

  const f = (label: string, v: string, set: (s: string) => void, ph: string) => (
    <div style={{ padding: '0 12px 8px' }}>
      <div className="m-section-title" style={{ margin: '0 0 4px' }}>
        {label}
      </div>
      <div className="m-field">
        <input placeholder={ph} value={v} onChange={(e) => set(e.target.value)} />
      </div>
    </div>
  );

  return (
    <div>
      {f('客户名称 *', name, setName, '如：武汉大学生命科学学院')}
      {f('联系人', contact, setContact, '如：周教授')}
      {f('联系电话', tel, setTel, '手机或座机')}
      {f('客户来源', source, setSource, '展会 / 官网 / 转介绍 / 招标')}
      {f('地址', address, setAddress, '详细地址')}
      {f('备注', remark, setRemark, '补充说明')}
      <div style={{ padding: '4px 12px 20px' }}>
        <button className="m-btn m-btn-ok" onClick={() => setConfirm(true)} disabled={busy}>
          {busy ? '提交中…' : '提交'}
        </button>
      </div>

      {confirm ? (
        <Dialog
          message={`确认创建客户「${name}」？`}
          onCancel={() => setConfirm(false)}
          onOk={submit}
        />
      ) : null}
    </div>
  );
}
