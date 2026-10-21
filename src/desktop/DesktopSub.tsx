/**
 * 桌面端子页面（财务管理 / 客户子类 / 订单 等）+ 表单页（基本资料 / 修改密码）
 *
 * 与原站一致：工具栏（关键词搜索 + 刷新）→ 数据表（按真实接口字段自动生成列）→ 服务端分页 → 详情弹层
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  changePassword, fetchSubPage, getProfile, saveProfile, subPageTitle,
} from '../core/api';
import { cellText, dynamicColumns, FIELD_LABEL } from '../core/biz';
import { addLocal, deleteLocal, editLocal, localAdded, mergeLocal } from '../core/localOps';
import { localBadge, opsFields } from '../core/opsFields';
import { fmtTime, toast } from '../core/util';
import { ConfirmDialog, EditModal, Modal } from './ui';
import { PageHead, Panel, StatusTag, DataTable, type Column } from './pc';

type Row = Record<string, any>;

const PAGE_SIZE = 20;

function statusTone(v: string): 'ok' | 'no' | 'wait' | 'info' {
  if (/驳回|取消|作废|关闭|失败|拒绝|撤销|退回/.test(v)) return 'no';
  if (/待|处理中|审核|运输中|进行中|投标|计划中|未/.test(v)) return 'wait';
  if (/已|完成|生效|成交|解决|通过/.test(v)) return 'ok';
  return 'info';
}

export function DesktopSub({ pageKey }: { pageKey: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Row | null>(null);
  const [q, setQ] = useState('');
  const [kw, setKw] = useState('');
  const [localVer, setLocalVer] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirmDel, setConfirmDel] = useState<Row | null>(null);

  const fields = opsFields(pageKey);

  const load = useCallback(
    (p: number, k: string) => {
      setLoading(true);
      fetchSubPage(pageKey, p, PAGE_SIZE, k)
        .then((r) => {
          setRows(r.raw.length ? r.raw : r.rows.map((b) => ({ ...b })));
          setTotal(r.total);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    },
    [pageKey],
  );

  useEffect(() => {
    load(page, kw);
  }, [page, kw, load]);

  /** OA 行 + 本地新增/编辑/删除 合并后渲染 */
  const displayRows = useMemo(
    () => mergeLocal(pageKey, rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageKey, rows, localVer],
  );

  function saveRow(v: Row) {
    if (editing) {
      if (editing.id) editLocal(pageKey, { ...editing, ...v });
      else addLocal(pageKey, v);
      toast('已保存到本地（未提交原站）');
    }
    setLocalVer((n) => n + 1);
  }

  const cols = useMemo<Column<Row>[]>(() => {
    const dyn = dynamicColumns(rows);
    const base = dyn.length
      ? dyn
      : [
          { key: 'title', title: '名称' },
          { key: 'sub', title: '说明' },
          { key: 'status', title: '状态' },
          { key: 'time', title: '时间' },
        ];
    const list: Column<Row>[] = base.map((c) => ({
      key: c.key,
      title: c.title,
      width: /remark|content|desc|direction|inquiry/.test(c.key) ? 200 : undefined,
      render: (r) => {
        const v = cellText(r[c.key]);
        if (/status$/.test(c.key) || c.key === 'check_status') {
          return v === '—' ? '—' : <StatusTag tone={statusTone(v)}>{v}</StatusTag>;
        }
        if (c.key === 'title' || c.key === 'name' || c.key === 'code') {
          return (
            <span className="pc-td-strong">
              {v}
              {r._local ? (
                <span className="pc-tag-local" style={{ marginLeft: 6 }}>
                  {localBadge(r)}
                </span>
              ) : null}
            </span>
          );
        }
        if (/time$/.test(c.key) && /^\d{4}-\d{2}-\d{2}/.test(v)) return fmtTime(v);
        return v;
      },
    }));
    list.push({
      key: 'op',
      title: '操作',
      width: 150,
      render: (r) => (
        <span className="pc-ops">
          <span className="gg-xs blue" onClick={() => setDetail(r)}>
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
    });
    return list;
  }, [rows, fields]);

  const detailPairs = useMemo<[string, string][]>(() => {
    if (!detail) return [];
    return Object.entries(detail)
      .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
      .map(([k, v]) => [FIELD_LABEL[k] || k, String(v).replace(/<[^>]+>/g, ' ').trim()] as [string, string]);
  }, [detail]);

  const search = () => {
    setPage(1);
    setKw(q.trim());
  };

  return (
    <div>
      <PageHead
        title={subPageTitle(pageKey)}
        crumb={['业务', subPageTitle(pageKey)]}
        desc={`共 ${total} 条记录 · 数据实时取自 oa.upingbio.com${localAdded(pageKey).length ? ` · 本地新增 ${localAdded(pageKey).length} 条` : ''}`}
        actions={
          <>
            <button className="pc-btn pc-btn-ghost" onClick={() => load(page, kw)}>
              刷新
            </button>
            {fields ? (
              <button className="pc-btn" onClick={() => setEditing({ id: '' })}>
                ＋ 新增
              </button>
            ) : null}
          </>
        }
      />

      <Panel bodyPad={false}>
        <div style={{ padding: '12px 16px 0' }}>
          <div className="pc-toolbar">
            <input
              className="pc-input"
              style={{ width: 260 }}
              placeholder="关键词"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') search();
              }}
            />
            <button className="pc-btn" onClick={search}>
              搜索
            </button>
            {kw || q ? (
              <button
                className="pc-btn pc-btn-ghost"
                onClick={() => {
                  setQ('');
                  setKw('');
                  setPage(1);
                }}
              >
                清空
              </button>
            ) : null}
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable
            columns={cols}
            rows={displayRows}
            rowKey={(r, i) => String(r.id ?? i)}
            onRowClick={setDetail}
            pageSize={PAGE_SIZE}
            page={page}
            total={total}
            onPageChange={setPage}
            loading={loading}
            empty="该模块当前没有数据"
          />
        </div>
      </Panel>

      {detail ? (
        <Modal
          title="记录详情"
          onClose={() => setDetail(null)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => setDetail(null)}>
                关闭
              </button>
              {fields && detail.id ? (
                <>
                  <button className="pc-btn" onClick={() => setEditing(detail)}>
                    编辑
                  </button>
                  <button
                    className="pc-btn"
                    style={{ background: '#e4564f' }}
                    onClick={() => setConfirmDel(detail)}
                  >
                    删除
                  </button>
                </>
              ) : null}
            </>
          }
        >
          <dl className="pc-kv">
            {detailPairs.length ? (
              detailPairs.map(([k, v], i) => (
                <div key={i} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))
            ) : (
              <div style={{ display: 'contents' }}>
                <dt>提示</dt>
                <dd>该记录没有可读字段</dd>
              </div>
            )}
          </dl>
        </Modal>
      ) : null}

      {/* 本地新增 / 编辑（不提交原站） */}
      {editing && fields ? (
        <EditModal
          title={editing.id ? `编辑记录 · ${subPageTitle(pageKey)}` : `新增记录 · ${subPageTitle(pageKey)}`}
          fields={fields}
          value={editing}
          onSave={(v) => saveRow(v)}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {/* 删除确认（仅本地生效） */}
      {confirmDel ? (
        <ConfirmDialog
          title="删除确认"
          text={`确认删除「${String(confirmDel.title || confirmDel.name || confirmDel.id || '该记录')}」？删除只在本机生效，OA 原站数据不受影响。`}
          onOk={() => {
            deleteLocal(pageKey, String(confirmDel.id ?? ''));
            setDetail(null);
            setLocalVer((n) => n + 1);
            toast('已删除（本地生效，未提交原站）');
          }}
          onClose={() => setConfirmDel(null)}
        />
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
