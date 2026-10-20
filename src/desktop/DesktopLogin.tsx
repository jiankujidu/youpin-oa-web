/**
 * 桌面端登录页 — 左右分栏（与手机端登录页为两套独立视图）
 * 双模式：演示模式用本地算式验证码；真实模式（配置了代理）显示后端 /oa/captcha.html 真实验证码图片。
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchCaptchaUrl, initRealSnapshot, login, realSnapshotInfo } from '../core/api';
import { IS_DEMO_DATA } from '../core/config';
import { getRemembered, setRemembered } from '../core/session';
import type { Session } from '../core/types';

interface MathCaptcha {
  answer: number;
  dataUrl: string;
}

function makeMathCaptcha(): MathCaptcha {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const op = Math.random() < 0.5 ? '+' : '-';
  const answer = op === '+' ? a + b : a - b;
  const expr = `${a} ${op} ${b} = ?`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="42">` +
    `<rect width="120" height="42" rx="6" fill="#f2f6ff"/>` +
    `<text x="60" y="27" font-size="18" font-family="monospace" fill="#1E6FFF" text-anchor="middle">${expr}</text>` +
    `</svg>`;
  return { answer, dataUrl: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}` };
}

export default function DesktopLogin({ onSuccess }: { onSuccess: (s: Session) => void }) {
  const proxyMode = !IS_DEMO_DATA;
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [captchaInput, setC] = useState('');
  const [remember, setRemember] = useState(false);
  const [math, setMath] = useState<MathCaptcha>(makeMathCaptcha);
  const [captchaUrl, setCaptchaUrl] = useState<string | null>(null);
  const [tip, setTip] = useState('');
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState(realSnapshotInfo());

  useEffect(() => {
    const r = getRemembered();
    if (r) {
      setU(r.u);
      setP(r.p);
      setRemember(true);
    }
    void initRealSnapshot().then(() => setSnap(realSnapshotInfo()));
  }, []);

  const refresh = useCallback(async () => {
    if (proxyMode) {
      try {
        setCaptchaUrl(await fetchCaptchaUrl());
      } catch {
        setCaptchaUrl(null);
        setTip('验证码加载失败，请重试');
      }
    } else {
      setMath(makeMathCaptcha());
    }
  }, [proxyMode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function doLogin() {
    if (busy) return;
    setTip('');
    if (!username.trim() || !password || !captchaInput.trim()) {
      setTip('请填写账号、密码和验证码');
      return;
    }
    setBusy(true);
    try {
      const r = await login(username.trim(), password, captchaInput.trim(), proxyMode ? undefined : math.answer);
      if (r.ok) {
        if (remember) setRemembered(username.trim(), password);
        onSuccess({
          username: username.trim(),
          displayName: r.displayName || username.trim(),
          loginAt: Date.now(),
        });
      } else {
        setTip(r.msg || '登录失败');
        void refresh();
        setC('');
      }
    } catch {
      setTip('网络异常，请重试');
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="d-login">
      <div className="d-login-left">
        <div className="d-login-brand">
          优品<span>OA</span>
        </div>
        <div className="d-login-slogan">优品生物 · 移动办公平台</div>
        <div className="d-login-feats">
          <div>✓ 审批 / 客户 / 订单 / 财务 一屏掌握</div>
          <div>✓ 附件上传直达对象存储，链接可转发</div>
          <div>✓ 说明书在线预览、收藏、打包转发</div>
        </div>
      </div>

      <div className="d-login-right">
        <div className="d-login-box">
          <h2>欢迎登录</h2>
          <div className="sub">请使用您的 OA 账号登录</div>

          <div className="d-field">
            <span className="d-field-ico">👤</span>
            <input
              type="text"
              placeholder="账户或手机号码"
              autoComplete="off"
              value={username}
              onChange={(e) => setU(e.target.value)}
            />
          </div>
          <div className="d-field">
            <span className="d-field-ico">🔒</span>
            <input
              type="password"
              placeholder="登录密码"
              value={password}
              onChange={(e) => setP(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doLogin();
              }}
            />
          </div>
          <div className="d-captcha-row">
            {proxyMode ? (
              <img
                className="d-captcha-img"
                src={captchaUrl || ''}
                alt="验证码"
                title="点击刷新"
                onClick={() => void refresh()}
              />
            ) : (
              <img
                className="d-captcha-img"
                src={math.dataUrl}
                alt="验证码"
                title="点击刷新"
                onClick={() => void refresh()}
              />
            )}
            <div style={{ flex: 1 }}>
              <div className="d-field" style={{ marginBottom: 0, height: 42 }}>
                <input
                  type="text"
                  placeholder={proxyMode ? '请输入图中字符' : '算式结果，如 2+6 填 8'}
                  value={captchaInput}
                  onChange={(e) => setC(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void doLogin();
                  }}
                />
              </div>
            </div>
          </div>

          <label className="d-remember" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            记住账号密码
          </label>

          <button className="d-login-btn" disabled={busy} onClick={() => void doLogin()}>
            {busy ? '登录中…' : '登 录'}
          </button>
          <div className="d-login-tip">{tip}</div>

          <div className="d-login-foot">
            © 2026 优品生物 · 网页版 v1.0
            {IS_DEMO_DATA ? (
              snap.loaded ? (
                <div style={{ marginTop: 4, color: '#0a8f4c' }}>
                  真实数据快照 · {snap.fetchedAt.slice(0, 10)}
                  {snap.masked ? '（手机号已脱敏）' : ''}
                </div>
              ) : (
                <div style={{ marginTop: 4 }}>演示模式 · 未连接真实后端</div>
              )
            ) : (
              <div style={{ marginTop: 4 }}>已连接真实后端（代理模式）</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
