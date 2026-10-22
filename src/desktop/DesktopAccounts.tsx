/** 账号管理（多账号体系）：查看/切换/验证/删除账号，两种添加方式（粘贴 PHPSESSID / 账号密码登录） */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IS_DEMO_DATA } from '../core/config';
import {
  addAccount,
  getCurrentAccount,
  listAccounts,
  removeAccount,
  setCurrentAccount,
  subscribeAccounts,
  updateAccount,
  type OaAccount,
} from '../core/accounts';
import { fetchCaptchaUrl, login, validateAccountSid } from '../core/api';
import { toast } from '../core/util';
import { Icon } from '../core/icons';
import { Modal } from './ui';
import { PageHead, Panel, StatusTag, type Column } from './pc';
import { DataTable } from './pc';

/** 生成一个全新的随机会话 id（作为「验证码→登录」链的 PHPSESSID，避免污染当前账号会话） */
function freshSessionId(): string {
  try {
    const c = crypto.getRandomValues(new Uint8Array(16));
    return [...c].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(16).slice(2).padEnd(32, '0');
  }
}

const SOURCE_LABEL: Record<OaAccount['source'], string> = {
  preset: '预置',
  manual: '手动',
  login: '登录',
};

export function DesktopAccounts() {
  const [accounts, setAccounts] = useState<OaAccount[]>(() => listAccounts());
  const [currentId, setCurrentId] = useState<string>(() => getCurrentAccount()?.id || '');
  const [verifying, setVerifying] = useState<string>('');
  const [confirmDel, setConfirmDel] = useState<OaAccount | null>(null);

  /** 添加方式：sid=粘贴 PHPSESSID；login=账号密码+验证码 */
  const [mode, setMode] = useState<'sid' | 'login'>('sid');
  const [sidLabel, setSidLabel] = useState('');
  const [sidValue, setSidValue] = useState('');
  const [lu, setLu] = useState('');
  const [lp, setLp] = useState('');
  const [lc, setLc] = useState('');
  const [captchaUrl, setCaptchaUrl] = useState('');
  const [freshSid, setFreshSid] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setAccounts(listAccounts());
    setCurrentId(getCurrentAccount()?.id || '');
  }, []);
  useEffect(() => subscribeAccounts(refresh), [refresh]);

  /** 登录模式：用全新随机会话取验证码（验证码与登录必须同一会话） */
  const loadCaptcha = useCallback(() => {
    const s = freshSessionId();
    setFreshSid(s);
    setLc('');
    fetchCaptchaUrl(s)
      .then(setCaptchaUrl)
      .catch(() => setCaptchaUrl(''));
  }, []);
  useEffect(() => {
    if (mode === 'login' && !IS_DEMO_DATA) loadCaptcha();
  }, [mode, loadCaptcha]);

  const current = useMemo(() => accounts.find((a) => a.id === currentId) || null, [accounts, currentId]);

  const switchTo = (acc: OaAccount) => {
    if (acc.id === currentId) {
      toast('该账号已是当前账号');
      return;
    }
    setCurrentAccount(acc.id);
    toast(`已切换到账号「${acc.label}」，正在刷新数据…`);
    window.setTimeout(() => window.location.reload(), 600);
  };

  const validate = async (acc: OaAccount) => {
    if (!acc.sid) {
      toast('该账号没有会话，请用「账号密码」重新登录');
      return;
    }
    setVerifying(acc.id);
    const r = await validateAccountSid(acc.sid);
    updateAccount(acc.id, {
      status: r.ok ? 'valid' : 'invalid',
      lastError: r.ok ? undefined : r.msg,
      ...(r.ok && r.name && acc.source === 'manual' ? { label: acc.label || r.name } : {}),
    });
    setVerifying('');
    toast(r.ok ? `账号「${acc.label}」会话有效${r.name ? `（${r.name}）` : ''}` : `会话无效：${r.msg}`);
  };

  const addBySid = async () => {
    const sid = sidValue.trim();
    if (!sid) {
      toast('请粘贴 PHPSESSID');
      return;
    }
    setBusy(true);
    const r = await validateAccountSid(sid);
    setBusy(false);
    if (!r.ok) {
      toast(`校验失败：${r.msg}`);
      return;
    }
    const acc = addAccount({
      label: sidLabel.trim() || r.name || '手动账号',
      username: r.name || 'manual',
      sid,
      source: 'manual',
      status: 'valid',
    });
    setSidLabel('');
    setSidValue('');
    toast(`已添加账号「${acc.label}」，点击「设为当前」即可切换`);
  };

  const addByLogin = async () => {
    if (!lu.trim() || !lp) {
      toast('请输入账号和密码');
      return;
    }
    if (!lc.trim()) {
      toast('请填写验证码');
      return;
    }
    setBusy(true);
    const r = await login(lu.trim(), lp, lc.trim(), undefined, freshSid);
    setBusy(false);
    if (!r.ok) {
      toast(r.msg || '登录失败');
      loadCaptcha();
      return;
    }
    const acc = addAccount({
      label: r.displayName || lu.trim(),
      username: lu.trim(),
      password: lp,
      sid: r.sid,
      source: 'login',
      status: r.sid ? 'valid' : 'unknown',
    });
    setLu('');
    setLp('');
    setLc('');
    toast(
      r.sid
        ? `已添加账号「${acc.label}」，点击「设为当前」即可切换`
        : `已添加账号「${acc.label}」（未取得独立会话，将回落固定会话）`,
    );
    loadCaptcha();
  };

  const cols: Column<OaAccount>[] = [
    {
      key: 'label',
      title: '账号',
      render: (r) => (
        <span className="pc-name-cell">
          <span className="d-avatar" style={{ width: 22, height: 22, fontSize: 11, marginRight: 8 }}>
            {(r.label || 'U').slice(0, 1)}
          </span>
          <span className="pc-td-strong pc-cell-1" title={r.label}>
            {r.label}
          </span>
          {r.id === currentId ? <span className="gg-tag blue">当前</span> : null}
          <span className="gg-tag">{SOURCE_LABEL[r.source]}</span>
        </span>
      ),
    },
    { key: 'username', title: '登录名', width: 130, render: (r) => r.username || '—' },
    {
      key: 'status',
      title: '会话状态',
      width: 110,
      render: (r) =>
        r.status === 'valid' ? (
          <StatusTag tone="ok">有效</StatusTag>
        ) : r.status === 'invalid' ? (
          <StatusTag tone="no" >
            失效
          </StatusTag>
        ) : (
          <StatusTag tone="wait">未验证</StatusTag>
        ),
    },
    { key: 'sid', title: 'PHPSESSID', width: 220, render: (r) => (r.sid ? <code style={{ fontSize: 11 }}>{r.sid.slice(0, 12)}…</code> : '—') },
    { key: 'used', title: '最近使用', width: 150, render: (r) => (r.lastUsedAt ? new Date(r.lastUsedAt).toISOString().slice(0, 16).replace('T', ' ') : '—') },
    {
      key: 'op',
      title: '操作',
      width: 220,
      fixed: true,
      render: (r) => (
        <span className="pc-ops">
          {r.id === currentId ? null : (
            <span className="gg-xs blue" onClick={() => switchTo(r)}>
              设为当前
            </span>
          )}
          <span className="gg-xs blue" onClick={() => validate(r)} title="用该账号会话请求一次真实接口">
            {verifying === r.id ? '验证中…' : '验证'}
          </span>
          <span className="gg-xs red" onClick={() => setConfirmDel(r)}>
            删除
          </span>
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="账号管理"
        crumb={['系统', '账号管理']}
        desc="多账号配置与切换：每个账号携带自己的 OA 会话，切换后全站数据随之刷新"
        actions={
          <button className="pc-btn pc-btn-ghost" onClick={refresh}>
            刷新
          </button>
        }
      />

      {IS_DEMO_DATA ? (
        <Panel title="演示模式">
          <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--c-text-3)' }}>
            当前未配置 OA 代理（VITE_OA_PROXY），没有真实后端可校验账号。
            多账号能力在接入 OA 代理后自动生效：预置账号走构建期 VITE_OA_ACCOUNTS，
            运行期可在下方动态添加 / 切换 / 删除。
          </div>
        </Panel>
      ) : null}

      <Panel title="当前账号">
        {current ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
            <span className="d-avatar">{(current.label || 'U').slice(0, 1)}</span>
            <div>
              <div style={{ fontWeight: 600 }}>{current.label}</div>
              <div style={{ color: 'var(--c-text-4)', fontSize: 12 }}>
                登录名 {current.username || '—'} · 来源 {SOURCE_LABEL[current.source]} ·{' '}
                {current.sid ? `会话 ${current.sid.slice(0, 8)}…` : '无独立会话（回落固定会话）'}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--c-text-3)' }}>
            未选择账号 —— 当前为<b>免登录固定会话</b>模式（兼容旧部署）：
            所有请求不带账号会话，由代理使用构建期注入的固定 PHPSESSID。
            在下方添加账号并「设为当前」后，即启用多账号切换。
          </div>
        )}
      </Panel>

      <Panel title={`账号列表（${accounts.length}）`} bodyPad={false}>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable
            columns={cols}
            rows={accounts}
            rowKey={(r) => r.id}
            loading={false}
            pageSize={20}
          />
        </div>
      </Panel>

      <Panel
        title="添加账号"
        extra={
          <span style={{ fontSize: 12, color: 'var(--c-text-4)' }}>
            {mode === 'sid' ? '已有登录态，直接粘贴 PHPSESSID' : '用账号密码 + 验证码登录，自动沉淀会话'}
          </span>
        }
      >
        <div className="pc-toolbar" style={{ marginBottom: 12 }}>
          <button
            className={`pc-btn${mode === 'sid' ? '' : ' pc-btn-ghost'}`}
            onClick={() => setMode('sid')}
          >
            <Icon name="key" size={14} /> 粘贴 PHPSESSID
          </button>
          <button
            className={`pc-btn${mode === 'login' ? '' : ' pc-btn-ghost'}`}
            onClick={() => setMode('login')}
          >
            <Icon name="personPlus" size={14} /> 账号密码登录
          </button>
        </div>

        {mode === 'sid' ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="pc-input"
              style={{ width: 200 }}
              placeholder="账号备注（可选，如：陈美龙·主）"
              value={sidLabel}
              onChange={(e) => setSidLabel(e.target.value)}
            />
            <input
              className="pc-input"
              style={{ width: 340 }}
              placeholder="PHPSESSID（登录 oa.upingbio.com 后从 Cookie 复制）"
              value={sidValue}
              onChange={(e) => setSidValue(e.target.value)}
            />
            <button className="pc-btn" disabled={busy || IS_DEMO_DATA} onClick={addBySid}>
              {busy ? '校验中…' : '验证并添加'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="pc-input"
              style={{ width: 160 }}
              placeholder="OA 账号"
              value={lu}
              onChange={(e) => setLu(e.target.value)}
            />
            <input
              className="pc-input"
              style={{ width: 160 }}
              type="password"
              placeholder="OA 密码"
              value={lp}
              onChange={(e) => setLp(e.target.value)}
            />
            {captchaUrl ? (
              <img
                src={captchaUrl}
                alt="验证码"
                title="点击刷新"
                style={{ height: 36, borderRadius: 3, border: '1px solid var(--c-border)', cursor: 'pointer' }}
                onClick={loadCaptcha}
              />
            ) : (
              <span style={{ fontSize: 12, color: 'var(--c-text-4)' }}>验证码加载中…</span>
            )}
            <input
              className="pc-input"
              style={{ width: 100 }}
              placeholder="验证码"
              value={lc}
              onChange={(e) => setLc(e.target.value)}
            />
            <button className="pc-btn" disabled={busy || IS_DEMO_DATA} onClick={addByLogin}>
              {busy ? '登录中…' : '登录并添加'}
            </button>
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--c-text-4)', marginTop: 10, lineHeight: 1.7 }}>
          说明：① 密码仅保存在本机浏览器 localStorage，用于下次一键重新登录，不会上传到除 OA 外的任何地方；
          ② 添加后不会自动切换，请在列表里点「设为当前」；③ 删除当前账号后会回落固定会话模式（旧行为）。
        </div>
      </Panel>

      {confirmDel ? (
        <Modal title="删除账号" onClose={() => setConfirmDel(null)}>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            确定删除账号「<b>{confirmDel.label}</b>」吗？
            {confirmDel.id === currentId ? '（这是当前账号，删除后将回落固定会话模式）' : ''}
            删除后如需恢复，可重新添加。
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="pc-btn pc-btn-ghost" onClick={() => setConfirmDel(null)}>
              取消
            </button>
            <button
              className="pc-btn pc-btn-danger"
              onClick={() => {
                removeAccount(confirmDel.id);
                setConfirmDel(null);
                toast('账号已删除');
                if (confirmDel.id === currentId) window.setTimeout(() => window.location.reload(), 400);
              }}
            >
              删除
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
