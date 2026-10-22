/** 手机端账号管理（多账号体系）：查看当前账号 / 切换 / 验证 / 删除 / 添加（SID 或账号密码登录） */
import { useCallback, useEffect, useState } from 'react';
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
import { Dialog } from './ui';

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

export default function MobileAccounts() {
  const [accounts, setAccounts] = useState<OaAccount[]>(() => listAccounts());
  const [currentId, setCurrentId] = useState(() => getCurrentAccount()?.id || '');
  const [confirmDel, setConfirmDel] = useState<OaAccount | null>(null);
  const [busy, setBusy] = useState('');

  // 添加表单
  const [mode, setMode] = useState<'sid' | 'login'>('sid');
  const [sidLabel, setSidLabel] = useState('');
  const [sidValue, setSidValue] = useState('');
  const [lu, setLu] = useState('');
  const [lp, setLp] = useState('');
  const [lc, setLc] = useState('');
  const [captchaUrl, setCaptchaUrl] = useState('');

  const refresh = useCallback(() => {
    setAccounts(listAccounts());
    setCurrentId(getCurrentAccount()?.id || '');
  }, []);
  useEffect(() => subscribeAccounts(refresh), [refresh]);

  const loadCaptcha = useCallback(() => {
    fetchCaptchaUrl(freshSessionId())
      .then(setCaptchaUrl)
      .catch(() => setCaptchaUrl(''));
  }, []);
  useEffect(() => {
    if (mode === 'login' && !IS_DEMO_DATA) loadCaptcha();
  }, [mode, loadCaptcha]);

  const switchTo = (acc: OaAccount) => {
    if (acc.id === currentId) return;
    setCurrentAccount(acc.id);
    toast(`已切换到「${acc.label}」`);
    window.setTimeout(() => window.location.reload(), 500);
  };

  const validate = async (acc: OaAccount) => {
    if (!acc.sid) {
      toast('该账号没有会话，请用账号密码重新登录');
      return;
    }
    setBusy(acc.id);
    const r = await validateAccountSid(acc.sid);
    updateAccount(acc.id, { status: r.ok ? 'valid' : 'invalid', lastError: r.ok ? undefined : r.msg });
    setBusy('');
    toast(r.ok ? `会话有效${r.name ? `（${r.name}）` : ''}` : `会话无效：${r.msg}`);
  };

  const addBySid = async () => {
    const sid = sidValue.trim();
    if (!sid) {
      toast('请粘贴 PHPSESSID');
      return;
    }
    setBusy('sid');
    const r = await validateAccountSid(sid);
    setBusy('');
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
    toast(`已添加「${acc.label}」，点它即可切换`);
  };

  const addByLogin = async () => {
    if (!lu.trim() || !lp || !lc.trim()) {
      toast('请填写账号、密码、验证码');
      return;
    }
    setBusy('login');
    const r = await login(lu.trim(), lp, lc.trim(), undefined, freshSessionId());
    setBusy('');
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
    toast(`已添加「${acc.label}」，点它即可切换`);
    loadCaptcha();
  };

  const cur = accounts.find((a) => a.id === currentId) || null;

  return (
    <div>
      <div className="m-section-title">当前账号</div>
      <div className="m-menu-item" style={{ cursor: 'default' }}>
        <span className="m-mi-left">
          {cur ? (
            <>
              <b>{cur.label}</b>
              <div style={{ fontSize: 12, color: '#999' }}>
                {SOURCE_LABEL[cur.source]} · {cur.sid ? `会话 ${cur.sid.slice(0, 8)}…` : '无独立会话（固定会话模式）'}
              </div>
            </>
          ) : (
            <>
              <b>未选择账号</b>
              <div style={{ fontSize: 12, color: '#999' }}>免登录固定会话模式（旧行为），添加账号后即可切换</div>
            </>
          )}
        </span>
      </div>

      <div className="m-section-title">账号列表（{accounts.length}）</div>
      {accounts.length === 0 ? <div className="m-notice">暂无账号，请在下方添加</div> : null}
      {accounts.map((a) => (
        <div key={a.id} className="m-menu-item" onClick={() => switchTo(a)}>
          <span className="m-mi-left">
            {a.label}
            {a.id === currentId ? <span style={{ color: '#1a75ff', marginLeft: 6 }}>✓ 当前</span> : null}
            <div style={{ fontSize: 12, color: '#999' }}>
              {a.username || '—'} ·{' '}
              {a.status === 'valid' ? '会话有效' : a.status === 'invalid' ? '会话失效' : '未验证'}
            </div>
          </span>
          <span className="m-mi-right">
            <span
              className="gg-xs blue"
              style={{ marginRight: 8 }}
              onClick={(e) => {
                e.stopPropagation();
                validate(a);
              }}
            >
              {busy === a.id ? '…' : '验证'}
            </span>
            <span
              className="gg-xs red"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDel(a);
              }}
            >
              删除
            </span>
          </span>
        </div>
      ))}

      <div className="m-section-title">添加账号</div>
      <div style={{ display: 'flex', gap: 8, padding: '0 12px 8px' }}>
        <button className={`pc-btn${mode === 'sid' ? '' : ' pc-btn-ghost'}`} onClick={() => setMode('sid')}>
          粘贴 PHPSESSID
        </button>
        <button className={`pc-btn${mode === 'login' ? '' : ' pc-btn-ghost'}`} onClick={() => setMode('login')}>
          账号密码登录
        </button>
      </div>
      {mode === 'sid' ? (
        <div style={{ padding: '0 12px' }}>
          <input
            className="pc-input"
            style={{ width: '100%', marginBottom: 8 }}
            placeholder="账号备注（可选）"
            value={sidLabel}
            onChange={(e) => setSidLabel(e.target.value)}
          />
          <input
            className="pc-input"
            style={{ width: '100%', marginBottom: 8 }}
            placeholder="PHPSESSID"
            value={sidValue}
            onChange={(e) => setSidValue(e.target.value)}
          />
          <button className="pc-btn" style={{ width: '100%' }} disabled={busy === 'sid' || IS_DEMO_DATA} onClick={addBySid}>
            {busy === 'sid' ? '校验中…' : '验证并添加'}
          </button>
        </div>
      ) : (
        <div style={{ padding: '0 12px' }}>
          <input
            className="pc-input"
            style={{ width: '100%', marginBottom: 8 }}
            placeholder="OA 账号"
            value={lu}
            onChange={(e) => setLu(e.target.value)}
          />
          <input
            className="pc-input"
            style={{ width: '100%', marginBottom: 8 }}
            type="password"
            placeholder="OA 密码"
            value={lp}
            onChange={(e) => setLp(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {captchaUrl ? (
              <img src={captchaUrl} alt="验证码" style={{ height: 36, borderRadius: 3 }} onClick={loadCaptcha} />
            ) : (
              <span style={{ fontSize: 12, color: '#999', lineHeight: '36px' }}>验证码加载中…</span>
            )}
            <input
              className="pc-input"
              style={{ flex: 1 }}
              placeholder="验证码"
              value={lc}
              onChange={(e) => setLc(e.target.value)}
            />
          </div>
          <button className="pc-btn" style={{ width: '100%' }} disabled={busy === 'login' || IS_DEMO_DATA} onClick={addByLogin}>
            {busy === 'login' ? '登录中…' : '登录并添加'}
          </button>
        </div>
      )}
      <div className="m-notice" style={{ marginTop: 10 }}>
        密码仅存本机浏览器；添加后点账号条目即可切换，全站数据随之刷新。
      </div>

      {confirmDel ? (
        <Dialog
          message={`确定删除账号「${confirmDel.label}」？`}
          onCancel={() => setConfirmDel(null)}
          onOk={() => {
            const wasCurrent = confirmDel.id === currentId;
            removeAccount(confirmDel.id);
            setConfirmDel(null);
            if (wasCurrent) window.setTimeout(() => window.location.reload(), 300);
          }}
        />
      ) : null}
    </div>
  );
}
