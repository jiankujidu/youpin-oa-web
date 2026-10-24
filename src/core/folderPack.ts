/**
 * 收藏夹打包：批量下载说明书 / 打包整个收藏夹
 * ---------------------------------------------------------------------------
 * 需求（用户原话）：「收藏夹的可以批量下载，或者打包文件夹」
 *
 * 两条链路：
 *  1. 批量下载说明书 —— 把勾选（或当前夹）里所有产品的说明书 PDF 打成一个 zip 落盘
 *  2. 打包收藏夹     —— 说明书 PDF + 一份「产品清单.csv」（货号/名称/规格/价格…）
 *
 * 说明书地址：用收藏条目自带的**文件 id**（get_oss_file?id=N）在下载时重建地址，
 * 不吃快照里写死的域名 —— 换部署（pages.dev / 本机 / GitHub Pages）都不会失效。
 * 旧存档条目没有说明书快照时，按货号回原站列表接口查一次补齐（兜底）。
 */
import { absOaUrl, oaFileUrl } from './fileurl';
import { downloadBlob, downloadZip, utf8, type ZipFile } from './zip';
import { docsOf, type DocSnap, type QuoteItem } from './quoteStore';
import { fetchProductPage } from './api';

/** 最近一次抓取失败的原因（用于给用户可读的提示，而不是干巴巴的「没有说明书」） */
let lastError = '';

/** 文件名净化：去掉路径分隔符与 Windows 非法字符 */
function safeName(s: string): string {  return (
    String(s || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || '未命名'
  );
}

/**
 * 兜底：条目没有说明书快照时，按货号回原站查一次。
 * 会把「这个货号属于哪个产品」查准（遍历结果的 goods_no_list 变体），
 * 拿不到就返回空——宁可少一个文件，也不要打错别的货号的说明书进去。
 */
async function resolveDocs(it: QuoteItem): Promise<DocSnap[]> {
  if (it.docs && it.docs.length) return it.docs;
  const no = (it.goods_no || '').trim();
  if (!no) return [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { rows } = await fetchProductPage(no, 1, 10);
      for (const p of rows) {
        const docs = docsOf(p);
        const hit = docs.find((d) => d.no === no);
        if (hit) return [hit];
      }
      // 结果里没有这个货号的说明书（该货号本来就没说明书）→ 不用再试
      if (rows.length) return [];
    } catch {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  return [];
}

/**
 * 抓一个说明书的字节；失败返回 null。
 *
 * ★ 两条通道，顺序很重要：
 *   1) /oss/<年月>/<md5>.pdf —— 原站 nginx 直出，**不经过 static.upingbio.cn**，
 *      所以原站静态主机的通配证书过期（*.upingbio.cn，2026-10-24 19:43 到期）也不受影响；
 *      但只覆盖较新的文件（2026-10 的能取到，2025-02/2026-03 的 404）。
 *   2) /api/index/get_oss_file.html?id=N —— 302 跳 static.upingbio.cn，
 *      证书过期时边缘报 526，文件取不到（旧文件就靠这条通道，证书有效时可用）。
 *   两条都试，任一成功即可。
 */
async function fetchDoc(d: DocSnap): Promise<{ name: string; data: Uint8Array } | null> {
  const urls = [
    d.ossPath ? absOaUrl('/oss/' + d.ossPath) : '',
    d.id ? oaFileUrl(d.id, d.fileName) : '',
  ].filter(Boolean);
  const name =
    d.fileName && /\.pdf$/i.test(d.fileName) ? d.fileName : `${d.fileName || d.no}.pdf`;
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await fetch(url);
        // ★ Cloudflare 526：边缘跟随时站静态主机（static.upingbio.cn）时校验证书失败。
        //   根因是原站通配证书 *.upingbio.cn 过期（2026-10-24 19:43 到期），
        //   与本系统无关，等原站续签即恢复——**直接换下一条通道**，不在这耗重试。
        if (resp.status === 526) {
          lastError = '原站静态文件服务器证书过期（*.upingbio.cn），部分老文件取不到';
          break;
        }
        if (!resp.ok) {
          await new Promise((r) => setTimeout(r, 500 + attempt * 700));
          continue;
        }
        const buf = new Uint8Array(await resp.arrayBuffer());
        if (!buf.length) {
          await new Promise((r) => setTimeout(r, 500 + attempt * 700));
          continue;
        }
        // ★ 必须是真 PDF：原站偶发返回 88 字节的 {"code":…} 错误体（限流/会话抖动），
        //   也可能返回 404 HTML 页——只看 resp.ok 会把错误页当说明书打进 zip。
        const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
        if (magic !== '%PDF') {
          const head = new TextDecoder().decode(buf.slice(0, 400));
          if (head.includes('526') || head.includes('Invalid SSL certificate')) {
            lastError = '原站静态文件服务器证书过期（*.upingbio.cn），部分老文件取不到';
            break;
          }
          await new Promise((r) => setTimeout(r, 700 + attempt * 900));
          continue;
        }
        return { name: safeName(name), data: buf };
      } catch {
        await new Promise((r) => setTimeout(r, 500 + attempt * 700));
      }
    }
  }
  return null;
}

/** 条目 → 它要打包的说明书（货号维度，一个货号一份说明书） */
async function docsOfItem(it: QuoteItem): Promise<DocSnap[]> {
  const docs = await resolveDocs(it);
  if (!docs.length) return [];
  return docs.length ? docs : [];
}

/** 打包结果 */
export interface PackResult {
  /** 成功打进包的说明书数 */
  ok: number;
  /** 没有说明书的条目数 */
  miss: number;
  /** 条目总数 */
  total: number;
  /** 打包文件名 */
  filename: string;
  /** 最近一次抓取失败的原因（可读提示，如原站证书过期） */
  error?: string;
}

/**
 * 解析一批条目的说明书地址（不下载）。
 * 旧存档条目没快照时按货号回原站查一次补齐；查出来的通过 onResolved 回写。
 */
export async function resolveItemDocs(
  items: QuoteItem[],
  onProgress?: (done: number, total: number) => void,
  onResolved?: (itemId: string, docs: DocSnap[]) => void,
): Promise<DocSnap[][]> {
  const total = items.length;
  const resolved: DocSnap[][] = new Array(total);
  let done = 0;
  const queue = items.map((_, i) => i);
  const resolveWorker = async () => {
    while (queue.length) {
      const i = queue.shift()!;
      const docs = await docsOfItem(items[i]);
      resolved[i] = docs;
      // 兜底查出来的说明书回写给调用方存进收藏夹条目（下次打包不用再查原站）
      if (docs.length && onResolved) onResolved(items[i].id, docs);
      done++;
      onProgress?.(done, total);
    }
  };
  await Promise.all([resolveWorker(), resolveWorker(), resolveWorker(), resolveWorker()]);
  return resolved;
}

/**
 * 逐个下载说明书文件——**每个 PDF 单独落盘**（不是一个 zip）。
 * 用户原话「批量下载应该是说明书啊」：批量下载给的就是说明书文件本身；
 * 「打包文件夹」才是打 zip。两件事分开。
 *
 * ★ 关键做法：**先把所有 PDF 抓成 blob，再连续触发下载**。
 *   边抓边下会让下载动作被网络等待拉开间隔，浏览器（Chrome 多文件下载策略）
 *   会把后面的下载拦掉——实测第一个能下、第二个就没了。
 */
export async function downloadDocFiles(
  docs: DocSnap[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: number; miss: number }> {
  lastError = '';
  let ok = 0;
  let miss = 0;

  /* ---- 阶段 1：抓字节（并发 2，慢一点更稳） ---- */
  const blobs: { name: string; data: Uint8Array }[] = [];
  const dlQueue = docs.slice();
  const worker = async () => {
    while (dlQueue.length) {
      const d = dlQueue.shift()!;
      const got = await fetchDoc(d);
      if (got) blobs.push(got);
      else miss++;
    }
  };
  await Promise.all([worker(), worker()]);

  /* ---- 阶段 2：连续触发下载（每个 PDF 一个文件） ---- */
  const used = new Set<string>();
  for (const b of blobs) {
    let name = b.name;
    let i = 1;
    while (used.has(name)) {
      const dot = name.lastIndexOf('.');
      name = dot > 0 ? `${name.slice(0, dot)}(${++i})${name.slice(dot)}` : `${name}(${++i})`;
    }
    used.add(name);
    downloadBlob(new Blob([b.data.slice().buffer], { type: 'application/pdf' }), name);
    ok++;
    onProgress?.(ok + miss, docs.length);
    // 连续触发之间留一点间隔（浏览器对密集的多次下载会拦）
    await new Promise((r) => setTimeout(r, 180));
  }
  return { ok, miss };
}

/**
 * 逐条抓说明书。
 * ★ 分两阶段，避免把原站打爆导致限流（4 并发下载时实测会丢文件）：
 *   阶段 1 解析（查原站列表接口拿说明书地址）——并发 4
 *   阶段 2 下载（取 PDF 字节）——并发 2
 */
async function collectFiles(
  items: QuoteItem[],
  onProgress?: (done: number, total: number) => void,
  onResolved?: (itemId: string, docs: DocSnap[]) => void,
): Promise<{ files: ZipFile[]; ok: number; miss: number }> {
  lastError = '';
  const resolved = await resolveItemDocs(items, onProgress, onResolved);
  const total = items.length;

  /* ---- 阶段 2：下载 PDF（并发 2，慢一点更稳） ---- */
  const files: ZipFile[] = [];
  let ok = 0;
  let miss = 0;
  const used = new Set<string>();
  const dlQueue = resolved.map((docs) => docs).filter((d) => d.length);
  miss += resolved.filter((d) => !d.length).length;
  const dlWorker = async () => {
    while (dlQueue.length) {
      const docs = dlQueue.shift()!;
      for (const d of docs) {
        const got = await fetchDoc(d);
        if (!got) {
          miss++;
          continue;
        }
        ok++;
        // 同名文件加序号，避免 zip 内重名覆盖
        let name = got.name;
        let i = 1;
        while (used.has(name)) {
          const dot = name.lastIndexOf('.');
          name = dot > 0 ? `${name.slice(0, dot)}(${++i})${name.slice(dot)}` : `${name}(${++i})`;
        }
        used.add(name);
        files.push({ name, data: got.data });
      }
    }
  };
  await Promise.all([dlWorker(), dlWorker()]);
  return { files, ok, miss };
}

/**
 * 批量下载说明书：**逐个文件落盘**（每个 PDF 一个文件），不是 zip。
 * items 传勾选行；为空时传当前夹全部条目。
 */
export async function downloadManuals(
  items: QuoteItem[],
  name = '说明书',
  onProgress?: (done: number, total: number) => void,
  onResolved?: (itemId: string, docs: DocSnap[]) => void,
): Promise<PackResult> {
  lastError = '';
  const resolved = await resolveItemDocs(items, undefined, onResolved);
  const docs = resolved.flat();
  const r = await downloadDocFiles(docs, onProgress);
  return {
    ok: r.ok,
    miss: r.miss + resolved.filter((d) => !d.length).length,
    total: items.length,
    filename: name,
    error: lastError || undefined,
  };
}

/**
 * 打包收藏夹：说明书 PDF + 产品清单.csv。
 * manifest 由调用方给出（报价单口径的 CSV 文本）。
 */
export async function packFolder(
  folderName: string,
  items: QuoteItem[],
  manifest: string,
  onProgress?: (done: number, total: number) => void,
  onResolved?: (itemId: string, docs: DocSnap[]) => void,
): Promise<PackResult> {
  const { files, ok, miss } = await collectFiles(items, onProgress, onResolved);
  const zipFiles: ZipFile[] = [{ name: '产品清单.csv', data: utf8(manifest) }, ...files];
  const filename = `${safeName(folderName)}_${Date.now()}.zip`;
  downloadZip(zipFiles, filename);
  return { ok, miss, total: items.length, filename, error: lastError || undefined };
}

/** 收藏夹产品清单 CSV（货号/名称/分类/种属/应用/规格/取价/报价/数量/小计/备注） */
export function folderManifest(items: QuoteItem[], unitPrice: (it: QuoteItem) => number): string {
  const head = [
    '序号',
    '货号',
    '产品名称',
    '分类',
    '种属',
    '应用场景',
    '规格',
    '报价',
    '数量',
    '小计',
    '备注',
  ];
  const cell = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.join(',')];
  items.forEach((it, i) => {
    const spec = it.prices[it.specIndex] || it.prices[0];
    const price = unitPrice(it);
    lines.push(
      [
        i + 1,
        it.goods_no,
        it.title,
        it.cate || '',
        it.species || '',
        it.application || '',
        spec?.spec || '',
        price,
        it.qty,
        (price * (it.qty || 0) * ((it.discount || 100) / 100)).toFixed(2),
        it.note || '',
      ]
        .map(cell)
        .join(','),
    );
  });
  // BOM：Excel 直接双击打开不乱码
  return '﻿' + lines.join('\r\n');
}
