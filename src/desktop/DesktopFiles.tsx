/**
 * 附件管理 › 文件库（/home/files/index）
 * PC 后台统一版式：工具栏 + 数据表格 + 转发弹层
 *
 * 只读版（对齐"不要账号不要提交"）：打开/下载/转发走稳定流式端点
 * get_oss_file.html?id=（经同源代理注入会话，永不过期）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAttachments } from '../core/api';
import { fileTypeInfo } from '../core/filetype';
import { copyText, openWithViewer, shareFile, shareFilesAsZip } from '../core/share';
import type { Attachment } from '../core/types';
import { downloadBlob, fmtSize, fmtTime, toast, urlToFile } from '../core/util';
import { Modal } from './ui';
import { DataTable, PageHead, Panel, StatusTag, type Column } from './pc';

export default function DesktopFiles() {
  const [list, setList] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [ext, setExt] = useState('');
  const [group, setGroup] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [shareTarget, setShareTarget] = useState<Attachment | null>(null);

  const load = useCallback((kw: string) => {
    setLoading(true);
    fetchAttachments(kw)
      .then((rows) => {
        setList(rows);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setLoading(false);
        toast('文件库加载失败：' + (e instanceof Error ? e.message : '网络异常'));
      });
  }, []);

  useEffect(() => {
    load(query);
  }, [query, load]);

  const exts = useMemo(() => {
    const s = new Set<string>();
    list.forEach((a) => a.fileext && s.add(a.fileext));
    return [...s].sort();
  }, [list]);

  /** 分组（原站附件库按分组归类） */
  const groups = useMemo(() => {
    const s = new Set<string>();
    list.forEach((a) => (a as any).group_title && s.add((a as any).group_title));
    return [...s].sort();
  }, [list]);

  const rows = useMemo(
    () =>
      list.filter(
        (a) => (!ext || a.fileext === ext) && (!group || (a as any).group_title === group),
      ),
    [list, ext, group],
  );

  function doOpen(r: Attachment) {
    if (/\.pdf$/i.test(r.name) || /\.pdf$/i.test(r.url)) {
      window.open(r.url, '_blank', 'noopener');
      return;
    }
    openWithViewer(r.url);
  }

  const cols: Column<Attachment>[] = [
    {
      key: 'ck',
      title: '',
      width: 44,
      render: (r) => (
        <input
          type="checkbox"
          checked={checked.has(r.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const s = new Set(checked);
            if (e.target.checked) s.add(r.id);
            else s.delete(r.id);
            setChecked(s);
          }}
        />
      ),
    },
    {
      key: 'name',
      title: '文件名',
      render: (r) => {
        const ft = fileTypeInfo(r.name);
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="d-ft" style={{ background: ft.c }}>
              {ft.t}
            </span>
            <span className="pc-td-strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.name}
            </span>
          </span>
        );
      },
    },
    { key: 'size', title: '大小', width: 100, align: 'right', render: (r) => fmtSize(r.filesize) },
    { key: 'group', title: '分组', width: 130, render: (r) => r.group_title || <StatusTag tone="info">未分组</StatusTag> },
    { key: 'admin', title: '上传者', width: 110, render: (r) => r.admin_name || '—' },
    { key: 'time', title: '上传时间', width: 160, render: (r) => fmtTime(r.create_time) },
    {
      key: 'op',
      title: '操作',
      width: 190,
      render: (r) => (
        <span className="pc-ops">
          <span className="gg-xs ghost" onClick={() => doOpen(r)}>
            打开
          </span>
          <span className="gg-xs blue" onClick={() => setShareTarget(r)}>
            转发
          </span>
          <span
            className="gg-xs green"
            onClick={() => {
              void urlToFile(r.url, r.name)
                .then((f) => downloadBlob(f, r.name))
                .catch(() => window.open(r.url, '_blank', 'noopener'));
            }}
          >
            下载
          </span>
        </span>
      ),
    },
  ];

  async function shareZipChecked() {
    const items = rows.filter((x) => checked.has(x.id));
    if (!items.length) {
      toast('请先勾选要转发的文件');
      return;
    }
    toast('正在打包…');
    const r = await shareFilesAsZip(
      items.map((x) => ({ name: x.name, url: x.url })),
      '优品OA-转发',
    );
    if (r.ok) toast(r.via === 'download' ? '已下载 zip' : '已调起系统分享');
    else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
  }

  return (
    <div>
      <PageHead
        title="文件库"
        crumb={['日常办公', '文件库']}
        desc={`共 ${rows.length} 个文件`}
        actions={
          <button className="pc-btn pc-btn-ghost" onClick={() => void shareZipChecked()}>
            打包转发（{checked.size}）
          </button>
        }
      />

      {/* ===== 文件表格 ===== */}
      <Panel bodyPad={false}>
        <div style={{ padding: '14px 16px' }}>
          <div className="pc-toolbar">
            <input
              className="pc-input"
              style={{ width: 280 }}
              placeholder="搜索文件名"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setQuery(keyword);
              }}
            />
            <select className="pc-input" style={{ width: 140 }} value={ext} onChange={(e) => setExt(e.target.value)}>
              <option value="">全部类型</option>
              {exts.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <select className="pc-input" style={{ width: 180 }} value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">全部分组</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <button className="pc-btn" onClick={() => setQuery(keyword)}>
              查询
            </button>
            {(query || ext) && (
              <button
                className="pc-btn pc-btn-ghost"
                onClick={() => {
                  setKeyword('');
                  setQuery('');
                  setExt('');
                  setGroup('');
                }}
              >
                重置
              </button>
            )}
            <button className="pc-btn pc-btn-ghost" onClick={() => load(query)}>
              刷新
            </button>
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={loading} pageSize={20} indexCol={false} />
        </div>
      </Panel>

      {/* ===== 转发弹层 ===== */}
      {shareTarget ? (
        <Modal
          title={`转发：${shareTarget.name}`}
          onClose={() => setShareTarget(null)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => setShareTarget(null)}>
                关闭
              </button>
              <button
                className="pc-btn"
                onClick={() => {
                  void shareFile({ url: shareTarget.url, name: shareTarget.name }).then((r) => {
                    if (r.ok) {
                      toast(r.via === 'clipboard' ? '已复制链接' : r.via === 'download' ? '已下载' : '已调起分享');
                      setShareTarget(null);
                    } else if (r.reason !== '已取消') {
                      toast('转发失败：' + r.reason);
                    }
                  });
                }}
              >
                系统分享
              </button>
            </>
          }
        >
          <div style={{ fontSize: 13, color: 'var(--c-text-2)' }}>可分享链接（公网可直接访问）：</div>
          <div
            style={{
              marginTop: 8,
              padding: '10px 12px',
              background: '#f7f9fc',
              border: '1px solid var(--c-border)',
              borderRadius: 8,
              fontSize: 12,
              wordBreak: 'break-all',
            }}
          >
            {shareTarget.url || '（该文件暂无可访问地址）'}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <span
              className="pc-link"
              onClick={() => {
                void copyText(shareTarget.url).then((ok) => toast(ok ? '已复制链接' : '复制失败'));
              }}
            >
              复制链接
            </span>
            <span className="pc-link" onClick={() => window.open(shareTarget.url, '_blank', 'noopener')}>
              在浏览器打开
            </span>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
