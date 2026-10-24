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
import { downloadZip, utf8, type ZipFile } from './zip';
import { docsOf, type DocSnap, type QuoteItem } from './quoteStore';
import { fetchProductPage } from './api';

/** 文件名净化：去掉路径分隔符与 Windows 非法字符 */
function safeName(s: string): string {
  return (
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

/** 抓一个说明书的字节；失败返回 null */
async function fetchDoc(d: DocSnap): Promise<{ name: string; data: Uint8Array } | null> {
  // 优先稳定端点（带会话的 get_oss_file?id=），其次 /oss/ 静态路径兜底
  const urls = [
    d.id ? oaFileUrl(d.id, d.fileName) : '',
    d.ossPath ? absOaUrl('/oss/' + d.ossPath) : '',
  ].filter(Boolean);
  const name =
    d.fileName && /\.pdf$/i.test(d.fileName) ? d.fileName : `${d.fileName || d.no}.pdf`;
  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          await new Promise((r) => setTimeout(r, 600 + attempt * 700));
          continue;
        }
        const buf = new Uint8Array(await resp.arrayBuffer());
        if (!buf.length) {
          await new Promise((r) => setTimeout(r, 600 + attempt * 700));
          continue;
        }
        // ★ 必须是真 PDF：原站偶发返回 88 字节的 {"code":…} 错误体（限流/会话抖动），
        //   只看 resp.ok 会把错误 JSON 当说明书打进 zip —— 这里按魔数校验。
        const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
        if (magic !== '%PDF') {
          await new Promise((r) => setTimeout(r, 800 + attempt * 900));
          continue;
        }
        return { name: safeName(name), data: buf };
      } catch {
        await new Promise((r) => setTimeout(r, 600 + attempt * 700));
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
  const total = items.length;
  let done = 0;

  /* ---- 阶段 1：解析说明书地址（并发 4） ---- */
  const resolved: DocSnap[][] = new Array(total);
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

  /* ---- 阶段 2：下载 PDF（并发 2，慢一点更稳） ---- */
  const files: ZipFile[] = [];
  let ok = 0;
  let miss = 0;
  const used = new Set<string>();
  const dlQueue = resolved.map((docs, i) => ({ docs, i })).filter((x) => x.docs.length);
  miss += resolved.filter((d) => !d.length).length;
  const dlWorker = async () => {
    while (dlQueue.length) {
      const { docs } = dlQueue.shift()!;
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
 * 批量下载说明书（只含 PDF 说明书，打成一个 zip）。
 * items 传勾选行；为空时传当前夹全部条目。
 */
export async function downloadManuals(
  items: QuoteItem[],
  name = '说明书',
  onProgress?: (done: number, total: number) => void,
  onResolved?: (itemId: string, docs: DocSnap[]) => void,
): Promise<PackResult> {
  const { files, ok, miss } = await collectFiles(items, onProgress, onResolved);
  const filename = `${safeName(name)}_说明书_${Date.now()}.zip`;
  if (!files.length) return { ok, miss, total: items.length, filename };
  downloadZip(files, filename);
  return { ok, miss, total: items.length, filename };
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
  return { ok, miss, total: items.length, filename };
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
