/**
 * 桌面端登录页 — 1:1 复刻 oa.upingbio.com 的 PC 登录页
 * （360px 卡片 / 黄色顶栏 + logo / 白色表单区 / 橙色按钮 / 粒子背景）
 *
 * 数据链路：配置了代理 → 显示后端真实验证码并走真实登录；未配置 → 演示模式算式码。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO_ACCOUNT_HINT, fetchCaptchaUrl, initRealSnapshot, login, realSnapshotInfo } from '../core/api';
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
    `<svg xmlns="http://www.w3.org/2000/svg" width="142" height="44">` +
    `<rect width="142" height="44" rx="4" fill="#f2f6ff"/>` +
    `<text x="71" y="29" font-size="20" font-family="monospace" fill="#1E6FFF" text-anchor="middle">${expr}</text>` +
    `</svg>`;
  return { answer, dataUrl: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}` };
}

/** 背景粒子（复刻原站的 canvas 连线动效） */
function useParticles(ref: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    type Dot = { x: number; y: number; vx: number; vy: number; r: number; c: string };
    const rand = (n: number) => Math.floor(Math.random() * n);
    const W = () => canvas.width;
    const H = () => canvas.height;
    let dots: Dot[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      dots = Array.from({ length: 110 }, () => ({
        x: Math.random() * W(),
        y: Math.random() * H(),
        vx: -0.35 + Math.random() * 0.7,
        vy: -0.35 + Math.random() * 0.7,
        r: 1 + Math.random() * 1.8,
        c: `rgba(${120 + rand(90)},${150 + rand(80)},${230 + rand(25)},.55)`,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      ctx.clearRect(0, 0, W(), H());
      for (const d of dots) {
        if (d.y < 0 || d.y > H()) d.vy = -d.vy;
        if (d.x < 0 || d.x > W()) d.vx = -d.vx;
        d.x += d.vx;
        d.y += d.vy;
        ctx.beginPath();
        ctx.fillStyle = d.c;
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          if (Math.abs(dx) < 110 && Math.abs(dy) < 110) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(70,140,255,.16)';
            ctx.lineWidth = 0.4;
            ctx.moveTo(dots[i].x, dots[i].y);
            ctx.lineTo(dots[j].x, dots[j].y);
            ctx.stroke();
          }
        }
      }
      raf = window.requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [ref]);
}

export default function DesktopLogin({ onSuccess }: { onSuccess: (s: Session) => void }) {
  const proxyMode = !IS_DEMO_DATA;
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [captchaInput, setC] = useState('');
  const [remember, setRemember] = useState(true);
  const [math, setMath] = useState<MathCaptcha>(makeMathCaptcha);
  const [captchaUrl, setCaptchaUrl] = useState<string | null>(null);
  const [tip, setTip] = useState('');
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState(realSnapshotInfo());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useParticles(canvasRef);

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
    <div className="lg-root">
      <canvas ref={canvasRef} className="lg-canvas" />
      <div className="lg-mask" />

      <div className="lg-card">
        <div className="lg-top">
          <img className="lg-logo" src="/oa/login_logo.png" alt="优品OA" />
          <span className="lg-bg1" />
          <span className="lg-bg2" />
        </div>

        <div className="lg-bottom">
          <div className="lg-form">
            <div className="lg-item">
              <input
                type="text"
                placeholder="请输入账户或手机号码"
                autoComplete="off"
                value={username}
                onChange={(e) => setU(e.target.value)}
              />
            </div>
            <div className="lg-item">
              <input
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setP(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doLogin();
                }}
              />
            </div>
            <div className="lg-item lg-captcha-row">
              <input
                className="lg-captcha-input"
                type="text"
                placeholder="验证码"
                value={captchaInput}
                onChange={(e) => setC(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doLogin();
                }}
              />
              <div className="lg-captcha-img">
                <img
                  src={proxyMode ? captchaUrl || '' : math.dataUrl}
                  alt="captcha"
                  title="点击刷新验证码"
                  onClick={() => void refresh()}
                />
              </div>
            </div>

            <button className="lg-submit" disabled={busy} onClick={() => void doLogin()}>
              {busy ? '登录中…' : '登 入 系 统'}
            </button>

            {tip ? <div className="lg-tip">{tip}</div> : null}

            <div className="lg-hint">
              {IS_DEMO_DATA
                ? DEMO_ACCOUNT_HINT
                : proxyMode
                  ? '验证码请填写图中算式结果（如 2+6 填 8）'
                  : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="lg-foot">
        {IS_DEMO_DATA
          ? snap.loaded
            ? `真实数据快照 · ${snap.fetchedAt.slice(0, 10)}${snap.masked ? '（已脱敏）' : ''} · 未连接后端`
            : '演示模式 · 未连接真实后端'
          : '已连接真实后端（代理模式）'}
        {' · '}
        © 2026 upingbio.com · YPOA 网页版
      </div>
    </div>
  );
}
