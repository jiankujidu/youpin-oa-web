/**
 * AI 问答（对应原站菜单：售前售后问答 › AI问答 /article/index/openai）
 *
 * 检索语料来自原站真实接口 /article/index/index（售前售后问答库），
 * 命中结果可点开查看原文；不编造答案、不使用假数据。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchArticles } from '../core/api';
import { fixContentHtml } from '../core/fileurl';
import type { Article } from '../core/types';
import { Icon } from '../core/icons';
import { PageHead, Panel } from './pc';

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

export function DesktopAi() {
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
        ? { from: 'ai', text: `在问答库中命中 ${scored.length} 条相关记录（按相关度排序，点击查看原文）：`, hits: scored }
        : { from: 'ai', text: '问答库中未检索到相关记录。可换个关键词，或到「售前售后查询」按分类浏览全文。' },
    ]);
    setQ('');
  }, [q, lib]);

  return (
    <div>
      <PageHead
        title="AI 问答"
        crumb={['售前售后问答', 'AI问答']}
        desc={`检索源：原站真实问答库 ${lib.length} 条`}
        actions={
          <button className="pc-btn pc-btn-ghost" onClick={() => setMsgs([{ from: 'ai', text: '对话已清空。' }])}>
            清空对话
          </button>
        }
      />
      <Panel bodyPad={false}>
        <div ref={boxRef} className="ai-box">
          {loading ? <div className="ai-loading">正在载入问答库…</div> : null}
          {msgs.map((m, i) =>
            m.from === 'me' ? (
              <div key={i} className="ai-row me">
                <div className="ai-bubble me">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="ai-row">
                <span className="ai-avatar">
                  <Icon name="robot" size={16} />
                </span>
                <div>
                  <div className="ai-bubble">{m.text}</div>
                  {m.hits?.length ? (
                    <div className="ai-hits">
                      {m.hits.map((h) => (
                        <div key={h.id} className="ai-hit" onClick={() => setOpen(h)}>
                          <span className="ai-hit-cate">{h.cate_title || '问答'}</span>
                          <span className="ai-hit-title">{h.title}</span>
                          <span className="ai-hit-time">{h.create_time}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          )}
        </div>
        <div className="ai-input">
          <input
            className="pc-input"
            placeholder="输入问题后回车，例如：抗体 保存 温度"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ask();
            }}
          />
          <button className="pc-btn" onClick={ask}>
            发送
          </button>
        </div>
      </Panel>

      {open ? (
        <div className="ai-mask" onClick={() => setOpen(null)}>
          <div className="ai-doc" onClick={(e) => e.stopPropagation()}>
            <div className="ai-doc-head">
              <span>{open.title}</span>
              <button className="pc-btn pc-btn-ghost" onClick={() => setOpen(null)}>
                关闭
              </button>
            </div>
            <div className="ai-doc-meta">
              {open.cate_title || '问答'} · {open.create_time}
            </div>
            <div
              className="ai-doc-body"
              dangerouslySetInnerHTML={{ __html: fixContentHtml(open.content || '（无正文）') }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DesktopAi;
