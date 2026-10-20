/**
 * 手机端登录页 — 复刻 app-source/index.html 的 #login-view
 * 渐变背景 + Logo + 三字段（账号 / 密码 / 算式验证码）+ 记住密码 + 登录按钮 + 版本号
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { login } from '../core/api';
import { IS_DEMO_DATA } from '../core/config';
import { getRemembered, setRemembered } from '../core/session';
import type { Session } from '../core/types';

const APP_VERSION = '1.0';

interface Captcha {
  expr: string;
  answer: number;
  dataUrl: string;
}

/**
 * 演示模式：本地生成算式验证码（假设 A6 / 限制 L-6）。
 * 真实模式（配置了代理）时应由后端 /captcha.html 提供；这里保留同构接口。
 */
function makeCaptcha(): Captcha {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const op = Math.random() < 0.5 ? '+' : '−';
  const answer = op === '+' ? a + b : a - b;
  const expr = `${a} ${op} ${b} = ?`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="34">` +
    `<rect width="112" height="34" rx="4" fill="#f2f6ff"/>` +
    `<text x="56" y="23" font-size="17" font-family="monospace" fill="#1E6FFF" ` +
    `text-anchor="middle" letter-spacing="1">${expr.replace(/−/g, '-').replace('&', '&amp;')}</text>` +
    `</svg>`;
  return { expr, answer, dataUrl: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}` };
}

export default function MobileLogin({ onSuccess }: { onSuccess: (s: Session) => void }) {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [captchaInput, setC] = useState('');
  const [remember, setRemember] = useState(false);
  const [captcha, setCaptcha] = useState<Captcha>(() => makeCaptcha());
  const [tip, setTip] = useState('');
  const [busy, setBusy] = useState(false);
  const loadedOnce = useRef(false);

  useEffect(() => {
    const r = getRemembered();
    if (r) {
      setU(r.u);
      setP(r.p);
      setRemember(true);
    }
    loadedOnce.current = true;
  }, []);

  const refreshCaptcha = useCallback(() => setCaptcha(makeCaptcha()), []);

  async function doLogin() {
    if (busy) return;
    setTip('');
    if (!username.trim() || !password || !captchaInput.trim()) {
      setTip('请填写账号、密码和验证码');
      return;
    }
    setBusy(true);
    try {
      const r = await login(username.trim(), password, captchaInput.trim(), captcha.answer);
      if (r.ok) {
        if (remember) setRemembered(username.trim(), password);
        const s: Session = {
          username: username.trim(),
          displayName: r.displayName || username.trim(),
          loginAt: Date.now(),
        };
        onSuccess(s);
      } else {
        setTip(r.msg || '登录失败');
        refreshCaptcha();
        setC('');
      }
    } catch {
      setTip('网络异常，请重试');
      refreshCaptcha();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="m-login">
      <div className="m-login-logo">
        优品<span>OA</span>
      </div>
      <div className="m-login-sub">优品生物 移动办公平台</div>

      <div className="m-login-form">
        <div className="m-field">
          <span className="m-field-ico">👤</span>
          <input
            id="m-username"
            type="text"
            placeholder="账户或手机号码"
            autoComplete="off"
            value={username}
            onChange={(e) => setU(e.target.value)}
          />
        </div>
        <div className="m-field">
          <span className="m-field-ico">🔒</span>
          <input
            id="m-password"
            type="password"
            placeholder="登录密码"
            value={password}
            onChange={(e) => setP(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doLogin();
            }}
          />
        </div>
        <div className="m-field">
          <span className="m-field-ico">✏️</span>
          <input
            id="m-captcha"
            type="text"
            placeholder="填算式结果，如 2+6 填 8"
            autoComplete="off"
            value={captchaInput}
            onChange={(e) => setC(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doLogin();
            }}
          />
        </div>
        <div className="m-captcha-row">
          <img
            className="m-captcha-img"
            src={captcha.dataUrl}
            alt="验证码"
            title="点击刷新"
            onClick={refreshCaptcha}
          />
          <span className="m-captcha-hint">算式验证码 · 点击图片刷新</span>
        </div>
        <div className="m-remember">
          <label>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>记住账号密码</span>
          </label>
        </div>

        <button className="m-login-btn" disabled={busy} onClick={doLogin}>
          {busy ? '登录中…' : '登 录'}
        </button>
        <div className="m-login-tip">{tip}</div>
      </div>

      <div className="m-login-foot">
        © 2026 优品生物 · 移动端版 v{APP_VERSION}
        {IS_DEMO_DATA ? <div className="m-demo-flag">演示模式 · 未连接真实后端</div> : null}
      </div>
    </div>
  );
}
