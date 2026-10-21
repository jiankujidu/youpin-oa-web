/**
 * 手机端 AI 问答 — 对齐原站「售前售后问答 › AI问答」
 * 检索语料来自原站真实接口 /article/index/index（售前售后问答库），
 * 命中结果可点开查看原文；不编造答案、不使用假数据。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchArticles } from '../core/api';
import type { Article } from '../core/types';
import { fmtTime } from '../core/util';

interface Msg {
  from: 'me' | 'ai';
  text: string;
  hits?: Article[];
}

/** 中文关键词切分：2 字以上词组 + 英文/货号词 */
function tokenize(q: string): string[] {
  const raw = q.toLowerCase();
  const en = raw.match(/[a-z0-9-]{2,}/g) || [];
  const zh = raw.match(/[\u4e00-\u9fa5]{2}/g) || [];
  const bi: string[] = [];
  for (let i = 0; i < raw.length - 1; i++) {
    const w = raw.slice(i, i + 2);
    if (/[\u4e00-\u9fa5]{2}/.test(w)) bi.push(w);
  }
  return Array.from(new Set([...en, ...zh, ...bi]));
}

export default function MobileAi() {
  const [lib, setLib] = useState<Article[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Article | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchArticles()
      .then((rows) => {
        setLib(rows);
        setMsgs([
          {
            from: 'ai',
            text: `已载入原站售前售后问答库 ${rows.length} 条。可直接提问（如「WB 二抗 稀释比例」「抗体 运输 温度」），我将从真实问答记录中检索最相关的条目。`,
          },
        ]);
        setLoading(false);
      })
      .catch(() => {
        setMsgs([{ from: 'ai', text: '问答库加载失败，请检查代理会话后重试。' }]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [msgs]);

  const ask = useCallback(() => {
    const text = q.trim();
    if (!text) return;
    const keys = tokenize(text);
    const scored = lib
      .map((a) => {
        const hay = (a.title + ' ' + (a.content || '') + ' ' + (a.cate_title || '')).toLowerCase();
        let score = 0;
        for (const k of keys) if (hay.includes(k)) score += k.length;
        return { a, score };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 5)
      .map((x) => x.a);
    setMsgs((m) => [
      ...m,
      { from: 'me', text },
      scored.length
        ? { from: 'ai', text: `在问答库中命中 ${scored.length} 条相关记录（点击查看原文）：`, hits: scored }
        : { from: 'ai', text: '问答库中未检索到相关记录。可换个关键词，或到「问答知识」按分类浏览全文。' },
    ]);
    setQ('');
  }, [q, lib]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px - 56px)' }}>
      <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {loading ? <div className="m-card"><div className="m-card-line">正在载入问答库…</div></div> : null}
        {msgs.map((m, i) =>
          m.from === 'me' ? (
            <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0' }}>
              <div style={{ background: '#1E6FFF', color: '#fff', padding: '8px 12px', borderRadius: 12, maxWidth: '80%', fontSize: 14 }}>
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} style={{ margin: '8px 0' }}>
              <div className="m-card" style={{ borderTop: '3px solid #1E6FFF' }}>
                <div className="m-card-line">{m.text}</div>
                {m.hits?.map((h) => (
                  <div
                    key={h.id}
                    className="m-card clickable"
                    style={{ marginTop: 8, boxShadow: 'none', border: '1px solid #e8ecf2' }}
                    onClick={() => setOpen(h)}
                  >
                    <div className="m-card-title" style={{ fontSize: 14 }}>{h.cate_title || '问答'} · {h.title}</div>
                    <div className="m-card-line">{fmtTime(h.create_time)}</div>
                  </div>
                ))}
              </div>
            </div>
          ),
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #e8ecf2', background: '#fff' }}>
        <input
          style={{ flex: 1, border: '1px solid #e8ecf2', borderRadius: 10, padding: '9px 12px', fontSize: 15, outline: 'none' }}
          placeholder="输入问题，例如：抗体 保存 温度"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
        />
        <button
          style={{ background: '#1E6FFF', color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', fontSize: 15 }}
          onClick={ask}
        >
          发送
        </button>
      </div>

      {open ? (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={() => setOpen(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 14, maxHeight: '82vh', width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #eee', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15 }}>{open.title}</span>
              <span style={{ color: '#999', fontSize: 22, lineHeight: 1, cursor: 'pointer' }} onClick={() => setOpen(null)}>×</span>
            </div>
            <div style={{ padding: '8px 16px', color: '#8a8f99', fontSize: 12, borderBottom: '1px solid #f2f4f8' }}>
              {open.cate_title || '问答'} · {fmtTime(open.create_time)}
            </div>
            <div style={{ padding: 16, overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: open.content || '（无正文）' }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
