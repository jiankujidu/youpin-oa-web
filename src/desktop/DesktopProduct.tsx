/**
 * 产品中心 › 产品列表（/product/index/list）
 * PC 后台统一版式：工具栏 + 数据表格 + 分页 + 详情弹层（说明书 预览/收藏/转发）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchProductCateTree,
  fetchProductPage,
  productAndUpInstructions,
  productDelete,
  productExportDownloadUrl,
  productExportUrl,
  productImport,
  productImportUnder,
  rememberDiscoveredCates,
  productImportUp,
  productImportUpdate,
  productSave,
  productTempInstructions,
  productUpInstructions,
  type ProductFilter,
} from '../core/api';
import { CONFIG } from '../core/config';
import { absOaUrl, fixContentHtml, signedOssToProxy } from '../core/fileurl';
import { editLocal, localAdded, mergeLocal } from '../core/localOps';
import { type EditField } from '../core/opsFields';
import { type CateNode } from '../core/productCates';
import { addDocToFolder, createFolder, getFolders } from '../core/session';
import { addProducts, addVariants, createFolder as createQuoteFolder, docsOf, getFolders as getQuoteFolders, type DocSnap } from '../core/quoteStore';
import { downloadDocFiles } from '../core/folderPack';
import { shareFile, shareFilesAsZip } from '../core/share';
import type { FavFolder, Product } from '../core/types';
import { fmtTime, plain, sanitizeName, toast } from '../core/util';
import { ConfirmDialog, DocPreviewModal, DocPreviewPane, EditModal, Modal } from './ui';
import { DataTable, PageHead, Panel, StatusTag, TreeMultiSelect, type Column } from './pc';

/** 产品编辑 / 复制 表单字段（对齐原站 /product/index/add 主要可填项） */
const PRODUCT_FIELDS: EditField[] = [
  { key: 'title', label: '产品标题', type: 'text' },
  { key: 'species', label: '种属', type: 'text' },
  { key: 'application', label: '应用', type: 'text' },
  { key: 'cate_title', label: '产品分类', type: 'text' },
  { key: 'gene_name', label: '基因名称', type: 'text' },
  { key: 'methodology', label: '方法学', type: 'text' },
  { key: 'expression_system', label: '表达系统', type: 'text' },
  { key: 'brand', label: '品牌', type: 'text' },
  { key: 'content', label: '备注/说明', type: 'textarea' },
];

/** 说明书地址：优先稳定端点 pc_goods_no_url（get_oss_file?id=，经代理不过期）；签名直链永远 403，转代理 /oss/ */
function docUrl(g: { goods_no_url?: string; pc_goods_no_url?: string }): string {
  return absOaUrl(g.pc_goods_no_url || '') || signedOssToProxy(g.goods_no_url || '');
}

/* ---------- 导入 / 上下架 / 说明书上传弹窗（对齐原站 toolbar 事件的 layer.open 面板） ---------- */

/** 弹窗形态 → 原站标题 / 提示语 / 文件要求 / 模板下载链接 */
const UPLOAD_KINDS: Record<
  string,
  { title: string; tips: string; accept: string; tpl?: string; tplName?: string; instr?: boolean }
> = {
  sync: {
    title: '批量导入产品',
    tips: '1、普通员工都可以进行批量导入操作；2、只能上传 .xls、.xlsx文件；3、数据请勿放在合并的单元格中；4、文件大小请勿超过2MB，导入数据不能超过20000条；5、一二级分类需要系统中存在。',
    accept: '.xls,.xlsx',
    tpl: '/static/home/file/优品OA产品导入模板.xlsx',
    tplName: 'Execl表格模板下载',
  },
  async: {
    title: '批量导入产品(异步)',
    tips: '1、普通员工都可以进行批量导入操作；2、只能上传 .xls、.xlsx文件；3、数据请勿放在合并的单元格中；4、文件大小请勿超过2MB，导入数据不能超过20000条。',
    accept: '.xls,.xlsx',
    tpl: '/static/home/file/优品OA产品导入模板.xlsx',
    tplName: 'Execl表格模板下载',
  },
  update: {
    title: '批量更新产品',
    tips: '1、普通员工都可以进行批量更新操作；2、只能上传 .xls、.xlsx文件；3、数据请勿放在合并的单元格中；4、文件大小请勿超过2MB。',
    accept: '.xls,.xlsx',
    tpl: '/static/home/file/优品OA产品导入模板.xlsx',
    tplName: 'Execl表格模板下载',
  },
  under: {
    title: '批量下架产品',
    tips: '1、普通员工都可以进行批量下架操作；2、只能上传 .xls、.xlsx文件；3、货号需要系统中存在，不存在处理失败。',
    accept: '.xls,.xlsx',
    tpl: '/static/home/file/优品OA产品上下架导入模板.xlsx',
    tplName: 'Execl表格模板下载',
  },
  up: {
    title: '批量上架产品',
    tips: '1、普通员工都可以进行批量上架操作；2、只能上传 .xls、.xlsx文件；3、货号需要系统中存在，不存在处理失败。',
    accept: '.xls,.xlsx',
    tpl: '/static/home/file/优品OA产品上下架导入模板.xlsx',
    tplName: 'Execl表格模板下载',
  },
  up2: {
    title: '批量生成UP说明书',
    tips: '1、数据文件只能上传 .xls、.xlsx文件，模板文件只能上传docx文件；2、数据请勿放在合并的单元格中；3、文件大小请勿超过1MB，导入数据不能超过1000条；4、文件名列需填写数据表中用于命名文件所在的列序号：A-最后列名，不填默认取C列。',
    accept: '.xls,.xlsx',
    tpl: '/static/home/file/优品OA产品说明书导入模板.xlsx',
    tplName: '说明书数据demo.xlsx下载',
    instr: true,
  },
  productUp: {
    title: '批量导入产品(异步)&生成UP说明书',
    tips: '1、数据文件只能上传 .xls、.xlsx文件，模板文件只能上传docx文件；2、数据请勿放在合并的单元格中；3、文件大小请勿超过2MB。',
    accept: '.xls,.xlsx',
    tpl: '/static/home/file/优品OA产品说明书导入模板.xlsx',
    tplName: '说明书数据demo.xlsx下载',
    instr: true,
  },
  productTemp: {
    title: '批量导入产品(异步)&生成说明书',
    tips: '1、数据文件只能上传 .xls、.xlsx文件，模板文件只能上传docx文件；2、数据请勿放在合并的单元格中；3、文件大小请勿超过2MB。',
    accept: '.xls,.xlsx',
    tpl: '/static/home/file/优品OA产品说明书导入模板.xlsx',
    tplName: '说明书数据demo.xlsx下载',
    instr: true,
  },
};

function UploadModal({
  kind,
  busy,
  note,
  onBusy,
  onNote,
  onClose,
  onDone,
}: {
  kind: string;
  busy: boolean;
  note: string;
  onBusy: (v: boolean) => void;
  onNote: (v: string) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const cfg = UPLOAD_KINDS[kind] || UPLOAD_KINDS.sync;
  const instr = !!cfg.instr;
  const [file, setFile] = useState<File | null>(null);
  const [tpl, setTpl] = useState<File | null>(null);
  const [arrange, setArrange] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const tplRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!file) return toast('请先选择文件');
    if (instr && !tpl) return toast('请选择模板文件（.docx）');
    onBusy(true);
    onNote('文件上传中...');
    let res;
    if (kind === 'sync') res = await productImport(file, 1);
    else if (kind === 'async') res = await productImport(file, 2);
    else if (kind === 'update') res = await productImportUpdate(file);
    else if (kind === 'under') res = await productImportUnder(file);
    else if (kind === 'up') res = await productImportUp(file);
    else if (kind === 'up2') res = await productUpInstructions(file, tpl!, arrange);
    else if (kind === 'productUp') res = await productAndUpInstructions(file, tpl!, arrange);
    else res = await productTempInstructions(file, tpl!, arrange);
    onBusy(false);
    onNote(res.msg || '');
    if (res.ok) {
      toast(res.msg || '操作成功');
      onDone();
    } else {
      toast(res.msg || '操作失败');
    }
  }

  return (
    <Modal
      title={cfg.title}
      onClose={onClose}
      footer={
        <>
          <button className="pc-btn pc-btn-ghost" onClick={onClose} disabled={busy}>
            关闭
          </button>
          <button className="pc-btn" onClick={submit} disabled={busy}>
            {busy ? '处理中…' : '上传并导入'}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.9 }}>
        <div style={{ marginBottom: 10 }}>
          <span style={{ color: 'var(--c-text)' }}>文件：</span>
          <span style={{ color: 'var(--c-text-4)' }}>{cfg.accept}</span>
          <button className="pc-btn pc-btn-ghost" style={{ marginLeft: 10 }} onClick={() => fileRef.current?.click()}>
            选择文件
          </button>
          <span style={{ marginLeft: 10, color: 'var(--c-primary)' }}>
            {file ? file.name : ''}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept={cfg.accept}
            style={{ display: 'none' }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        {instr ? (
          <div style={{ marginBottom: 10 }}>
            <span style={{ color: 'var(--c-text)' }}>模板文件：</span>
            <span style={{ color: 'var(--c-text-4)' }}>.docx</span>
            <button className="pc-btn pc-btn-warm" style={{ marginLeft: 10 }} onClick={() => tplRef.current?.click()}>
              选择模板文件
            </button>
            <span style={{ marginLeft: 10, color: 'var(--c-primary)' }}>
              {tpl ? tpl.name : ''}
            </span>
            <input
              ref={tplRef}
              type="file"
              accept=".docx"
              style={{ display: 'none' }}
              onChange={(e) => setTpl(e.target.files?.[0] || null)}
            />
          </div>
        ) : null}
        {instr ? (
          <div style={{ marginBottom: 10 }}>
            <span style={{ color: 'var(--c-text)' }}>文件名列：</span>
            <input
              className="pc-input"
              style={{ width: 220, marginLeft: 10 }}
              maxLength={12}
              placeholder="文件命名存在的列序号：A-最后列名"
              value={arrange}
              onChange={(e) => setArrange(e.target.value)}
            />
          </div>
        ) : null}
        {cfg.tpl ? (
          <div style={{ marginBottom: 10 }}>
            <a
              className="pc-link"
              href={`${CONFIG.oaProxy}${cfg.tpl}`}
              target="_blank"
              rel="noreferrer"
            >
              {cfg.tplName || '模板下载'}
            </a>
          </div>
        ) : null}
        <div style={{ color: 'var(--c-text-4)', fontSize: 12.5, whiteSpace: 'pre-line' }}>{cfg.tips}</div>
        {note ? (
          <div style={{ marginTop: 10, color: note.includes('失败') || note.includes('错误') ? '#f53f3f' : '#16b777' }}>
            {note}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export default function DesktopProduct({ onNavigate }: { onNavigate?: (key: string) => void } = {}) {
  const [list, setList] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  /** 每页条数（原站分页条「20 条/页 ▾」，服务端生效） */
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  /** 分类筛选用 cate_id（服务端参数，多选用逗号拼接）；种属/应用直接传值 */
  const [cateIds, setCateIds] = useState<string[]>([]);
  const [speciesF, setSpeciesF] = useState('');
  const [appF, setAppF] = useState('');
  /** 原站 #searchForm 其余筛选项（全部服务端参数） */
  const [attrF, setAttrF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [diffTimeF, setDiffTimeF] = useState('');
  const [productNameF, setProductNameF] = useState('');
  const [geneNameF, setGeneNameF] = useState('');
  const [otherNameF, setOtherNameF] = useState('');
  /** 关键词匹配方式：模糊(1) / 分词(2)，对齐原站 radio name=keyword_type（默认 checked=模糊） */
  const [keywordType, setKeywordType] = useState<'1' | '2'>('1');
  /** 导入/上下架/说明书上传弹窗（原站 toolbar 事件） */
  const [importKind, setImportKind] = useState<'sync' | 'async' | 'update' | 'under' | 'up' | null>(null);
  const [instrKind, setInstrKind] = useState<'up2' | 'productUp' | 'productTemp' | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadNote, setUploadNote] = useState('');
  const [cateTree, setCateTree] = useState<CateNode[]>([]);
  const [cur, setCur] = useState<Product | null>(null);
  const [folders, setFolders] = useState<FavFolder[]>([]);
  const [saving, setSaving] = useState<{ name: string; url: string; productId: string } | null>(null);
  /** 说明书「真预览」弹窗：url 指向 get_oss_file，组件内部拉流成 blob 再内联渲染 */
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);
  /** 产品详情弹窗里展开内联预览的说明书货号 */
  const [inlineDoc, setInlineDoc] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  /**
   * 勾选的货号（按货号维度，而非整行产品）。key = `${productId}::${goodsNo}`。
   * 一个产品含多个公司货号时，每个货号独立可勾，避免「同个指标乱勾」「分不清选的是哪个公司的货号」。
   *
   * ★ 存的是「key → {product, goodsNo} 快照字典」而不仅是 key 数组（用户原话：「搜勾选后不丢弃勾」）：
   *   换关键词搜索 / 翻页后，之前勾选的产品已不在当前结果里，但勾选项必须保留。
   *   若只存 key，加入收藏夹时只能从当前页 displayRows 反查产品对象，之前勾的会被静默丢弃
   *   （表现为「我勾了，再搜别的，刚勾的就不在了」）。
   */
  const [checkedMap, setCheckedMap] = useState<Record<string, { product: Product; goodsNo: string }>>(
    {},
  );
  /** 勾选 key 列表（渲染用；字典的键序即勾选顺序） */
  const checked = useMemo(() => Object.keys(checkedMap), [checkedMap]);
  /** 批量勾选 / 取消（带产品快照写入，跨搜索保留） */
  const setKeys = useCallback(
    (keys: { key: string; entry: { product: Product; goodsNo: string } }[], on: boolean) => {
      setCheckedMap((prev) => {
        const next = { ...prev };
        for (const { key, entry } of keys) {
          if (on) next[key] = entry;
          else delete next[key];
        }
        return next;
      });
    },
    [],
  );
  /** 清空全部勾选 */
  const clearChecked = useCallback(() => setCheckedMap({}), []);
  /** 新增 / 编辑产品弹窗（真实提交 POST /product/index/add） */
  const [editing, setEditing] = useState<Product | null>(null);
  /** 编辑弹窗形态：edit=编辑既有 / copy=复制为新品 / new=添加产品 */
  const [editKind, setEditKind] = useState<'edit' | 'copy' | 'new'>('edit');
  /** 删除确认 */
  const [confirmDel, setConfirmDel] = useState<Product | null>(null);
  /** 本地层版本号（复制/编辑后刷新合并行） */
  const [localVer, setLocalVer] = useState(0);

  /** 服务端分页载入（原站每页 20 条，共 12 万+ 条；筛选/关键词全部走服务端参数） */
  const load = useCallback((kw: string, p: number, filter?: ProductFilter) => {
    setLoading(true);
    fetchProductPage(kw, p, pageSize, filter)
      .then(({ rows, total }) => {
        setList(rows);
        setTotal(total);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setLoading(false);
        toast('产品列表加载失败：' + (e instanceof Error ? e.message : '网络异常'));
      });
  }, [pageSize]);

  /** 筛选条件 → 服务端参数（严格按原站 #searchForm 字段名） */
  const activeFilter = useMemo<ProductFilter | undefined>(() => {
    const f: ProductFilter = {
      cateId: cateIds.length ? cateIds.join(',') : undefined,
      species: speciesF || undefined,
      application: appF || undefined,
      type: attrF || undefined,
      status: statusF || undefined,
      diffTime: diffTimeF || undefined,
      productName: productNameF || undefined,
      geneName: geneNameF || undefined,
      otherName: otherNameF || undefined,
      keywordType: keywordType || undefined,
    };
    const has = Object.values(f).some((v) => !!v);
    return has ? f : undefined;
  }, [cateIds, speciesF, appF, attrF, statusF, diffTimeF, productNameF, geneNameF, otherNameF, keywordType]);

  useEffect(() => {
    setPage(1);
    load(query, 1, activeFilter);
  }, [query, activeFilter, load]);
  useEffect(() => setFolders(getFolders()), []);
  /** 切换产品时收起上一条的内联说明书预览 */
  useEffect(() => setInlineDoc(null), [cur]);

  /** 分类下拉数据：完整树（productCates.ts，原站 xmSelect 同款 93 节点）+ 运行时新发现分类合并 */
  useEffect(() => {
    fetchProductCateTree().then((tree) => {
      if (tree.length) setCateTree(tree);
    });
  }, []);
  /** 载入的产品行里若出现快照外的新分类，记录下来供下拉合并（原站新增分类自适应） */
  useEffect(() => {
    if (list.length) rememberDiscoveredCates(list as any[]);
  }, [list]);

  /** 载入行即展示行（筛选已由服务端完成；本地复制的产品仍合并显示） */
  const rows = list;

  /** OA 行 + 本地新增/编辑合并（复制出来的产品在本地层） */
  const displayRows = useMemo(
    () => [...mergeLocal('product', []), ...rows] as Product[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ['product', rows, localVer],
  );

  const localCount = useMemo(() => localAdded('product').length, [localVer]);

  /** 列举一个产品的所有可勾选货号（来自 goods_no_list；无列表则回退到主 goods_no 第一个） */
  const goodsEntriesOf = useCallback((r: Product): { no: string; has: boolean; url?: string; dlName?: string }[] => {
    const list = ((r as any).goods_no_list || []) as any[];
    if (list.length) {
      return list
        .map((g) => {
          const no = g.goods_no || '';
          const has = !!(g.goods_no_url || g.pc_goods_no_url);
          return {
            no,
            has,
            url: docUrl(g),
            dlName: g.goods_no_desc || `${sanitizeName(no)}-${sanitizeName(plain(r.title || ''))}.pdf`,
          };
        })
        .filter((e) => e.no);
    }
    const no = String(r.goods_no || '').split(/[;；]/)[0] || '';
    return no ? [{ no, has: false }] : [];
  }, []);

  /**
   * 勾选的货号 → {product, goodsNo} 列表，供收藏夹 / 报价按具体货号落库。
   * ★ 直接取勾选字典里的产品快照，**不依赖当前页 displayRows**——
   *   这样换关键词搜索后，之前勾选（已不在当前结果里）的货号依然会一起加入收藏夹。
   */
  const selEntries = useMemo(
    () => Object.entries(checkedMap).map(([, v]) => v),
    [checkedMap],
  );

  /* ---- 收藏夹 / 报价（本系统新增能力，数据落本机，不改动原站结构） ---- */
  const [favFolders, setFavFolders] = useState(() => getQuoteFolders());
  const [favTarget, setFavTarget] = useState('');
  const [favNew, setFavNew] = useState('');

  /** 把勾选的货号加入收藏夹（每个货号各成一条）；andQuote=true 时顺带跳到报价页 */
  function addCheckedToFolder(andQuote: boolean) {
    if (!checked.length) return toast('请先勾选货号（可点表头全选）');
    const list = favFolders.length ? favFolders : [createQuoteFolder('默认收藏夹')];
    const id = favNew.trim() ? createQuoteFolder(favNew.trim()).id : favTarget || list[0].id;
    const { added, updated } = addVariants(id, selEntries);
    toast(`已加入收藏夹 ${added} 个货号${updated ? `，更新 ${updated} 个` : ''}`);
    setFavNew('');
    setFavFolders(getQuoteFolders());
    clearChecked();
    if (andQuote) onNavigate?.('quote');
  }

  /**
   * 批量下载已勾货号的说明书（逐个文件落盘，每个 PDF 一个文件）。
   * 说明书地址从产品行的 goods_no_list 取（只取该货号对应的那条）。
   */
  async function downloadCheckedDocs() {
    if (!selEntries.length) return toast('请先勾选货号');
    const docs: DocSnap[] = [];
    for (const e of selEntries) {
      const d = docsOf(e.product).find((x) => x.no === e.goodsNo);
      if (d && (d.id || d.ossPath)) docs.push(d);
    }
    if (!docs.length) return toast('勾选的货号原站没有说明书文件');
    toast(`正在下载 ${docs.length} 份说明书…`);
    const r = await downloadDocFiles(docs);
    toast(
      r.ok
        ? `已下载 ${r.ok} 份说明书${r.miss ? `，${r.miss} 份缺失` : ''}${
            r.ok > 1 ? '（浏览器首次会询问是否允许多个文件下载，需点「允许」）' : ''
          }`
        : '说明书下载失败',
    );
  }

  /** 复制产品（打开编辑弹窗，去掉 id 即「另存为新品」真实提交原站） */  function copyProduct(p: Product) {
    const { id: _drop, ...rest } = p as any;
    setEditKind('copy');
    setEditing({ ...rest, title: `${plain(p.title || '')}（副本）` } as Product);
  }

  /** 添加产品（原站「+ 添加产品」，真实 POST /product/index/add） */
  function addProduct() {
    setEditKind('new');
    setEditing({ id: '', title: '', goods_no: '', species: '', application: '', cate_title: '', create_time: '' } as Product);
  }

  async function shareDoc(name: string, url: string) {
    if (!url) {
      toast('该说明书暂无可访问地址');
      return;
    }
    const r = await shareFile({ url, name });
    if (r.ok) toast(r.via === 'clipboard' ? '已复制链接' : r.via === 'download' ? '已下载' : '已调起分享');
    else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
  }

  /** 单个货号勾选 / 取消；key = `${productId}::${goodsNo}`（带产品快照，跨搜索保留） */
  function toggleKey(key: string, product: Product, goodsNo: string) {
    setCheckedMap((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { product, goodsNo };
      return next;
    });
  }
  /** 本页所有可勾选货号（每个产品 × 其每个货号变体），带产品快照 */
  const pageVariants = useMemo(() => {
    const arr: { key: string; entry: { product: Product; goodsNo: string } }[] = [];
    for (const p of displayRows) {
      const pid = String((p as any).id ?? '');
      for (const e of goodsEntriesOf(p as any)) {
        arr.push({ key: `${pid}::${e.no}`, entry: { product: p, goodsNo: e.no } });
      }
    }
    return arr;
  }, [displayRows, goodsEntriesOf]);
  /** 本页所有可勾选货号的 key 列表 */
  const pageVariantKeys = useMemo(() => pageVariants.map((v) => v.key), [pageVariants]);
  /** 本页是否全选 / 部分选中（表头复选框的 indeterminate 半选态） */
  const pageAllOn = pageVariantKeys.length > 0 && pageVariantKeys.every((k) => checked.includes(k));
  const pageSomeOn = !pageAllOn && pageVariantKeys.some((k) => checked.includes(k));
  /** 已勾选但不在当前结果页里的货号数（提示用：这些也会一起加入收藏夹，不会被丢掉） */
  const offPageSel = useMemo(() => {
    const onPage = new Set(pageVariantKeys);
    return checked.filter((k) => !onPage.has(k)).length;
  }, [checked, pageVariantKeys]);

  /**
   * 列顺序（用户指定，这 12 列必须在一屏内完整显示、不被右侧常驻「操作」列压住）：
   *   产品货号/说明书 → 产品标题 → 种属 → 应用 → 价格明细 → 基因名称 →
   *   方法学 → 分子量 → 来源 → 定量/定性 → 分类 → 浓度点
   * 其余列（状态 / 别称 / 种属英文名 / 英文名 / Tag / 表达系统 / 产品代码 /
   *   属性 / 下载量 / 阅读权限 / 操作）往后放，横向滚动查看。
   * 宽度预算：240+172+70+70+126+76+76+70+70+72+76+74 = 1192px（首屏可用约 1244px，12 列完整可见）。
   * ★ 勾选方式（用户定稿）：按「货号」勾选——每个货号（来自不同公司的变体）各一个复选框，
   *   整行不再有单一勾选框，避免「同个指标乱勾、分不清选的是哪个公司的货号」。
   *   表头复选框 = 全选本页所有货号；勾选的货号所在行高亮；右下浮条可加入收藏夹 / 报价。
   */
  const cols: Column<Product>[] = [
    {
      key: 'no',
      title: '产品货号/说明书',
      width: 240,
      align: 'center',
      freeze: 'left',
      /** 表头：全选本页所有货号变体（半选态 indeterminate 直接写 DOM 属性） */
      head: (
        <label className="pc-th-pick" title={pageAllOn ? '取消全选本页货号' : '全选本页所有货号'}>
          <input
            type="checkbox"
            className="pc-check"
            checked={pageAllOn}
            ref={(el) => {
              if (el) el.indeterminate = pageSomeOn;
            }}
            onChange={() => setKeys(pageVariants, !pageAllOn)}
          />
          <span>产品货号/说明书</span>
        </label>
      ),
      render: (r) => {
        const rid = String(r.id ?? '');
        // 原站 templet：逐行列出 goods_no_list 每个变体——
        // 有说明书 → 蓝色货号 + 预览(红) + 下载；无 → 红色货号 + 两个「暂无说明书」提示
        const entries = goodsEntriesOf(r as any);
        const body =
          entries.length === 0 ? (
            <span className="pc-td-strong">{String(r.goods_no || '').split(';')[0] || ''}</span>
          ) : (
            <span className="pc-goods-body">
              {entries.map((e, i) => {
                const key = `${rid}::${e.no}`;
                const on = checked.includes(key);
                return (
                  <span className={`pc-goods-row${on ? ' pc-goods-row-sel' : ''}`} key={i}>
                    <input
                      type="checkbox"
                      className="pc-check"
                      checked={on}
                      title={on ? '取消勾选此货号' : '勾选此货号（加入收藏夹 / 报价）'}
                      onClick={(ev) => ev.stopPropagation()}
                      onChange={() => toggleKey(key, r, e.no)}
                    />
                    <span className={`pc-goods-no${e.has ? ' pc-c-blue' : ' pc-c-red'}`}>{e.no}</span>
                    {e.has && e.url ? (
                      <>
                        <button
                          className="pc-xs-btn pc-xs-danger"
                          title="在浏览器内预览"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setPreviewDoc({ name: e.dlName!, url: e.url! });
                          }}
                        >
                          预览
                        </button>
                        <a
                          className="pc-xs-btn pc-xs-cyan"
                          href={e.url}
                          download={e.dlName}
                          title={`下载 ${e.dlName}`}
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          下载
                        </a>
                      </>
                    ) : (
                      <>
                        <button
                          className="pc-xs-btn pc-xs-danger"
                          title="暂无说明书"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            toast('暂无说明书');
                          }}
                        >
                          预览
                        </button>
                        <button
                          className="pc-xs-btn pc-xs-cyan"
                          title="暂无说明书"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            toast('暂无说明书');
                          }}
                        >
                          下载
                        </button>
                      </>
                    )}
                  </span>
                );
              })}
            </span>
          );
        return <span className="pc-goods-cell">{body}</span>;
      },
    },
    // 原站 templet：'<a data-href="/product/index/view/id/xx.html" class="side-a">{{d.title}}</a>'（.side-a = #1A75FF 可点）
    { key: 'title', title: '产品标题', width: 172, render: (r) => (
        <span className="pc-cell-2" style={{ color: '#1A75FF', cursor: 'pointer' }} title={plain(r.title)} onClick={(e) => { e.stopPropagation(); setCur(r); }}>
          {plain(r.title)}
        </span>
      ) },
    { key: 'species', title: '种属', width: 70, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={r.species}>{r.species || ''}</span> },
    { key: 'app', title: '应用', width: 70, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={r.application}>{r.application || ''}</span> },
    // 原站 templet：'<span class="green">{{d.price_desc}}</span>' —— 原始字符串直接展示，绿色，自然换行
    { key: 'price', title: '价格明细', width: 126, render: (r) => (
        <span className="pc-c-green" style={{ fontSize: 12.5 }}>{(r as any).price_desc || ''}</span>
      ) },
    { key: 'gene', title: '基因名称', width: 76, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).gene_name}>{(r as any).gene_name || ''}</span> },
    { key: 'method', title: '方法学', width: 76, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).methodology}>{(r as any).methodology || ''}</span> },
    { key: 'mw', title: '分子量', width: 70, align: 'center', render: (r) => (
        <span className="pc-cell-1 pc-td-sub" title={(r as any).da}>
          {(r as any).da || ''}
        </span>
      ) },
    { key: 'source', title: '来源', width: 70, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).source}>{(r as any).source || ''}</span> },
    { key: 'scope', title: '定量/定性', width: 72, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).scope}>{(r as any).scope || ''}</span> },
    { key: 'cate', title: '分类', width: 76, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={r.cate_title}>{r.cate_title || ''}</span> },
    { key: 'concentration', title: '浓度点', width: 74, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).concentration}>{(r as any).concentration || ''}</span> },
    /* ---- 以下为次要列（横向滚动查看）：状态 / 别称 / 种属英文名 / 英文名 等 ---- */
    {
      key: 'status',
      title: '状态',
      width: 80,
      align: 'center',
      render: (r) => {
        // 原站 #status 模板：status==1 → 绿色「有货」，否则红色「下架」
        // 计算样式：纯色文字无底色无边框，字号 16px（.layui-icon 默认字号）
        const s = String((r as any).status ?? '');
        const on = s === '1' || s === '已上架' || s === '在售';
        return on ? (
          <span className="pc-c-green" style={{ fontSize: 16 }}>有货</span>
        ) : (
          <span className="pc-c-red" style={{ fontSize: 16 }}>下架</span>
        );
      },
    },
    // 原站对齐：货号/状态/各属性列 align="center"；价格明细与产品标题左对齐；空值渲染为空白（不是「—」）
    { key: 'alias', title: '其他别称', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).other_name}>{(r as any).other_name || ''}</span> },
    { key: 'speciesEng', title: '种属英文名称', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).species_eng_name}>{(r as any).species_eng_name || ''}</span> },
    { key: 'eng', title: '英文名称', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).eng_name}>{(r as any).eng_name || ''}</span> },
    { key: 'tag', title: 'Tag', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).tag}>{(r as any).tag || ''}</span> },
    { key: 'expr', title: '表达系统', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).expression_system}>{(r as any).expression_system || ''}</span> },
    { key: 'productCode', title: '产品代码', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).product_code}>{(r as any).product_code || ''}</span> },
    { key: 'attr', title: '属性', width: 80, align: 'center', render: (r) => {
        // 原站 templet：0/其它→暂无(绿)、1→精华(蓝)、2→热门(黄)、3→推荐(红)
        const t = String((r as any).type ?? '');
        if (t === '1') return <span className="pc-c-blue">精华</span>;
        if (t === '2') return <span className="pc-c-yellow">热门</span>;
        if (t === '3') return <span className="pc-c-red">推荐</span>;
        return <span className="pc-c-green">暂无</span>;
      } },
    { key: 'dl', title: '下载量', width: 80, align: 'center', render: (r) => String(r.down_load_num ?? 0) },
    { key: 'share', title: '阅读权限范围', width: 100, align: 'center', render: (r) => {
        // 原站 templet：0→私有(绿)、1→所有人(蓝)、2→部门(黄)、3→部分人员(红)
        const v = String((r as any).is_share ?? '');
        if (v === '1') return <span className="pc-c-blue">所有人</span>;
        if (v === '2') return <span className="pc-c-yellow">部门</span>;
        if (v === '3') return <span className="pc-c-red">部分人员</span>;
        return <span className="pc-c-green">私有</span>;
      } },
    {
      key: 'op',
      title: '操作',
      width: 138,
      align: 'center',
      fixed: true,
      freeze: 'right',
      render: (r) => {
        const isLocal = String((r as any).id ?? '').startsWith('local-');
        return (
            <span className="pc-ops">
            {/* 原站 #barDemo：复制(蓝) / 编辑(青绿) / 删除(红)——layui-btn-group 实心小按钮 */}
            <span
              className="pc-xs-btn pc-xs-blue"
              onClick={(e) => {
                e.stopPropagation();
                copyProduct(r);
              }}
            >
              复制
            </span>
            {!isLocal ? (
              <span
                className="pc-xs-btn pc-xs-cyan"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditKind('edit');
                  setEditing(r as Product);
                }}
              >
                编辑
              </span>
            ) : null}
            {!isLocal ? (
              <span
                className="pc-xs-btn pc-xs-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDel(r as Product);
                }}
              >
                删除
              </span>
            ) : null}
            {isLocal ? (
              <span className="pc-xs-btn pc-xs-cyan" onClick={() => setCur(r)}>
                本地
              </span>
            ) : null}
          </span>
        );
      },
    },
  ];

  const docs = (cur?.goods_no_list || []).map((g: any) => {
    const fileName = g.goods_no_desc || `${sanitizeName(g.goods_no || '')}-${sanitizeName(plain(cur?.title || ''))}.pdf`;
    return {
      no: g.goods_no,
      url: docUrl(g),
      /** 保存时用的文件名（先按原站命名，再兜底） */
      name: `${sanitizeName(g.goods_no || '')}-${sanitizeName(plain(cur?.title || ''))}.pdf`,
      /** 真实下载文件名（优先用原站 goods_no_desc） */
      fileName,
    };
  });

  return (
    <div>
      <PageHead
        title="产品列表"
        crumb={['产品中心', '产品列表']}
        actions={
          <>
            {/* 原站 #toolbarDemo 12 按钮：顺序/标签/配色严格按渲染快照的 layui-btn 计算样式
                （实测：添加=normal#1e9fff、导入同步/异步/下架/上架=cyan#16baaa、批量更新=normal、
                 导出csv/排行榜=warm#ffb800、导出选中行/清空选中=danger#ff5722、
                 批量生成UP=purple#a233c6、导入&UP说明书=checked#16b777；原站无「刷新」） */}
            <button className="pc-btn pc-btn-sm pc-btn-blue" onClick={addProduct}>
              + 添加产品
            </button>
            <button className="pc-btn pc-btn-sm pc-btn-cyan" onClick={() => { setImportKind('sync'); setUploadNote(''); }}>
              批量导入(同步)
            </button>
            <button className="pc-btn pc-btn-sm pc-btn-cyan" onClick={() => { setImportKind('async'); setUploadNote(''); }}>
              批量导入(异步)
            </button>
            <button className="pc-btn pc-btn-sm pc-btn-blue" onClick={() => { setImportKind('update'); setUploadNote(''); }}>
              批量更新(异步)
            </button>
            <button className="pc-btn pc-btn-sm pc-btn-cyan" onClick={() => { setImportKind('under'); setUploadNote(''); }}>
              批量下架
            </button>
            <button className="pc-btn pc-btn-sm pc-btn-cyan" onClick={() => { setImportKind('up'); setUploadNote(''); }}>
              批量上架
            </button>
            {/* 原站 export：window.open('/product/index/list?export=1&limit=10000000&'+formData) */}
            <button
              className="pc-btn pc-btn-sm pc-btn-warm"
              onClick={() => {
                window.open(productExportUrl(), '_blank', 'noopener');
                toast('已按当前筛选条件导出（原站服务端 CSV）');
              }}
            >
              导出产品(csv)
            </button>
            {/* 原站 getCheckData：导出勾选 id（空则提示「请至少选择一个产品」） */}
            <button
              className="pc-btn pc-btn-sm pc-btn-danger"
              onClick={() => {
                if (!checked.length) return toast('请至少选择一个产品');
                window.open(productExportUrl(checked), '_blank', 'noopener');
              }}
            >
              导出选中行数据({checked.length})
            </button>
            <button className="pc-btn pc-btn-sm pc-btn-danger" onClick={() => clearChecked()}>
              清空选中
            </button>
            <button className="pc-btn pc-btn-sm pc-btn-purple" onClick={() => { setInstrKind('up2'); setUploadNote(''); }}>
              批量生成UP说明书
            </button>
            <button className="pc-btn pc-btn-sm pc-btn-green" onClick={() => { setInstrKind('productUp'); setUploadNote(''); }}>
              导入(异步)&UP说明书
            </button>
            {/* 原站 exportDownload：/product/api/exportDownload?export_file_type=2 */}
            <button
              className="pc-btn pc-btn-sm pc-btn-warm"
              onClick={() => {
                window.open(productExportDownloadUrl(), '_blank', 'noopener');
                toast('正在导出说明书下载量排行榜');
              }}
            >
              导出产品(说明书下载量排行榜)
            </button>
          </>
        }
      />

      <Panel bodyPad={false}>
        {/* 原站 #searchForm：单个 flex 行内表单，按源码顺序
             分类(150) → 种属(150) → 应用(150) → 状态(150) → 时间区间(300) → 产品标题(300)
             → 基因名称(300) → 其他别称(300) → 关键词(300) → 模糊/分词 → 搜索/清空
             ★ 源码里「请选择产品属性 / 请选择产品分类」两段 select 已被注释掉，故无属性筛选 */}
        <div style={{ padding: '14px 16px 4px' }}>
          <div className="pc-toolbar">
            {/* 原站 #cateId：xmSelect 树形多选（93 节点，父子独立选，逗号拼接提交） */}
            <TreeMultiSelect
              placeholder="产品分类"
              value={cateIds}
              tree={cateTree}
              onChange={setCateIds}
              width={150}
            />
            <input
              className="pc-input"
              style={{ width: 150 }}
              placeholder="种属"
              value={speciesF}
              onChange={(e) => setSpeciesF(e.target.value)}
            />
            <input
              className="pc-input"
              style={{ width: 150 }}
              placeholder="应用"
              value={appF}
              onChange={(e) => setAppF(e.target.value)}
            />
            <select
              className="pc-input"
              style={{ width: 150 }}
              value={statusF}
              onChange={(e) => setStatusF(e.target.value)}
            >
              <option value="">请选择状态</option>
              <option value="1">有货</option>
              <option value="0">下架</option>
            </select>
            <input
              className="pc-input"
              style={{ width: 300 }}
              placeholder="选择时间区间"
              value={diffTimeF}
              onChange={(e) => setDiffTimeF(e.target.value)}
            />
            <input
              className="pc-input"
              style={{ width: 300 }}
              placeholder="产品标题"
              value={productNameF}
              onChange={(e) => setProductNameF(e.target.value)}
            />
            <input
              className="pc-input"
              style={{ width: 300 }}
              placeholder="基因名称"
              value={geneNameF}
              onChange={(e) => setGeneNameF(e.target.value)}
            />
            <input
              className="pc-input"
              style={{ width: 300 }}
              placeholder="其他别称"
              value={otherNameF}
              onChange={(e) => setOtherNameF(e.target.value)}
            />
            <input
              className="pc-input"
              style={{ width: 300 }}
              placeholder="货号/其他别称/基因名称/产品标题/产品代码"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setQuery(keyword);
              }}
            />
            {/* 原站 keyword_type 单选组：模糊(默认) / 分词 */}
            <label className="pc-radio">
              <input
                type="radio"
                name="keyword_type"
                checked={keywordType !== '2'}
                onChange={() => setKeywordType('1')}
              />
              模糊
            </label>
            <label className="pc-radio">
              <input
                type="radio"
                name="keyword_type"
                checked={keywordType === '2'}
                onChange={() => setKeywordType('2')}
              />
              分词
            </label>
            <button className="pc-btn pc-btn-sm" onClick={() => setQuery(keyword)}>
              搜索
            </button>
            <button
              className="pc-btn pc-btn-sm pc-btn-ghost"
              onClick={() => {
                setKeyword('');
                setQuery('');
                setCateIds([]);
                setAttrF('');
                setSpeciesF('');
                setAppF('');
                setStatusF('');
                setDiffTimeF('');
                setProductNameF('');
                setGeneNameF('');
                setOtherNameF('');
              }}
            >
              清空
            </button>
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <DataTable
            columns={cols}
            rows={displayRows}
            rowKey={(r) => String(r.id)}
            onRowClick={setCur}
            loading={loading}
            pageSize={pageSize}
            page={page}
            total={total}
            onPageChange={(p) => {
              setPage(p);
              load(query, p, activeFilter);
            }}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
              load(query, 1, activeFilter);
            }}
            rowSelect={{
              isSel: (r) => {
                const id = String((r as any).id ?? '');
                return goodsEntriesOf(r as any).some((e) => checked.includes(`${id}::${e.no}`));
              },
              onToggle: (r) => {
                const id = String((r as any).id ?? '');
                const vs = goodsEntriesOf(r as any).map((e) => ({
                  key: `${id}::${e.no}`,
                  entry: { product: r, goodsNo: e.no },
                }));
                const allOn = vs.length > 0 && vs.every((v) => checked.includes(v.key));
                setKeys(vs, !allOn);
              },
              onAll: (on) => (on ? setKeys(pageVariants, true) : setKeys(pageVariants, false)),
              allOn: pageVariantKeys.length > 0 && pageVariantKeys.every((k) => checked.includes(k)),
              selCount: checked.length,
            }}
          />
        </div>
      </Panel>

      {/* ===== 产品详情 + 说明书 ===== */}
      {cur ? (
        <Modal
          title={plain(cur.title)}
          onClose={() => setCur(null)}
          footer={
            <>
              <button className="pc-btn pc-btn-ghost" onClick={() => setCur(null)}>
                关闭
              </button>
              {docs.filter((d) => d.url).length ? (
                <button
                  className="pc-btn"
                  onClick={() => {
                    void shareFilesAsZip(
                      docs.filter((d) => d.url).map((d) => ({ name: d.name, url: d.url })),
                      plain(cur.title),
                    ).then((r) => {
                      if (r.ok) toast(r.via === 'download' ? '已下载 zip' : '已调起系统分享');
                      else if (r.reason !== '已取消') toast('转发失败：' + r.reason);
                    });
                  }}
                >
                  打包转发说明书
                </button>
              ) : null}
            </>
          }
        >
          <dl className="pc-kv">
            {(
              [
                ['产品编号', cur.id],
                ['货号', cur.goods_no],
                ['产品分类', cur.cate_title],
                ['规格 / 价格', cur.price_desc || '—'],
                ['物种', cur.species],
                ['应用', cur.application],
                ['方法学', cur.methodology],
                ['表达系统', cur.expression_system],
                ['浓度', cur.concentration],
                ['关键词', cur.keywords],
                ['下载数', String(cur.down_load_num ?? 0)],
                ['更新时间', fmtTime((cur as any).update_time || (cur as any).create_time)],
              ] as [string, string | undefined][])
              .filter(([, v]) => v !== undefined && v !== null && v !== '')
              .map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>

          <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            说明书（{docs.length}）
          </div>
          {docs.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--c-text-4)' }}>该产品暂无说明书</div>
          ) : (
            docs.map((d) => (
              <div key={d.no} style={{ borderTop: '1px solid var(--c-border)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 0',
                    fontSize: 13,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.no}</span>
                  {d.url ? (
                    <>
                      <span
                        className="pc-link"
                        onClick={() => setInlineDoc((v) => (v === d.no ? null : d.no))}
                      >
                        {inlineDoc === d.no ? '收起预览' : '预览'}
                      </span>
                      <a className="pc-link" href={d.url} download={d.fileName}>
                        下载
                      </a>
                      <span className="pc-link" onClick={() => setPreviewDoc({ name: d.fileName, url: d.url })}>
                        全屏
                      </span>
                      <span className="pc-link" onClick={() => setSaving({ name: d.name, url: d.url, productId: String(cur.id) })}>
                        收藏
                      </span>
                      <span className="pc-link" onClick={() => void shareDoc(d.name, d.url)}>
                        转发
                      </span>
                    </>
                  ) : (
                    <StatusTag tone="info">未提供文件</StatusTag>
                  )}
                </div>
                {/* 行内真预览：blob → iframe，直接在产品详情里翻说明书 */}
                {d.url && inlineDoc === d.no ? (
                  <div className="d-doc-inline">
                    <DocPreviewPane url={d.url} name={d.fileName} height={520} />
                  </div>
                ) : null}
              </div>
            ))
          )}

          {cur.content ? (
            <>
              <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>产品详情</div>
              <div
                className="ai-doc-body"
                dangerouslySetInnerHTML={{ __html: fixContentHtml(cur.content) }}
              />
            </>
          ) : null}
        </Modal>
      ) : null}

      {/* ===== 收藏到文件夹 ===== */}
      {saving ? (
        <Modal
          title="收藏说明书"
          onClose={() => setSaving(null)}
          footer={
            <button
              className="pc-btn"
              onClick={() => {
                const n = newName.trim();
                if (!n) {
                  toast('请输入文件夹名称');
                  return;
                }
                const f = createFolder(n);
                setFolders(getFolders());
                addDocToFolder(f.id, saving.name, saving.url, saving.productId);
                setNewName('');
                setSaving(null);
                toast('已收藏');
              }}
            >
              新建并收藏
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {folders.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--c-text-3)', padding: '8px 0' }}>暂无文件夹</div>
            ) : (
              folders.map((f) => (
                <div
                  key={f.id}
                  className="pc-list-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    addDocToFolder(f.id, saving.name, saving.url, saving.productId);
                    setFolders(getFolders());
                    setSaving(null);
                    toast('已收藏');
                  }}
                >
                  {f.name}（{f.docs.length}）
                </div>
              ))
            )}
          </div>
          <input
            className="pc-input"
            style={{ width: '100%' }}
            placeholder="新文件夹名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </Modal>
      ) : null}

      {/* 新增 / 编辑 / 复制 产品（原站 POST /product/index/add，带 id 即编辑，无 id 即新建/复制） */}
      {editing ? (
        <EditModal
          title={editKind === 'edit' ? '编辑产品' : editKind === 'copy' ? '复制为新品' : '添加产品'}
          fields={PRODUCT_FIELDS}
          value={editing}
          onSave={async (v) => {
            const id = String((editing as any).id || '');
            const res = await productSave({
              id,
              title: String((v as any).title || editing.title || ''),
              species: String((v as any).species ?? ''),
              application: String((v as any).application ?? ''),
              cate_title: String((v as any).cate_title ?? ''),
              gene_name: String((v as any).gene_name ?? ''),
              methodology: String((v as any).methodology ?? ''),
              expression_system: String((v as any).expression_system ?? ''),
              brand: String((v as any).brand ?? ''),
              content: String((v as any).content ?? ''),
            });
            if (!res.ok) return toast(res.msg || '保存失败');
            if (id) editLocal('product', { ...editing, ...v });
            setLocalVer((n) => n + 1);
            setEditing(null);
            toast(
              editKind === 'edit'
                ? '已保存（原站已更新）'
                : editKind === 'copy'
                  ? '已复制为新品（原站已同步）'
                  : '已添加（原站已同步）',
            );
            setPage(1);
            load(query, 1, activeFilter);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {confirmDel ? (
        <ConfirmDialog
          title="删除确认"
          text={`确认删除产品「${plain(String((confirmDel as any).title || (confirmDel as any).id || ''))}」？将同步从 OA 原站删除。`}
          onOk={async () => {
            const res = await productDelete(String((confirmDel as any).id));
            if (!res.ok) return toast(res.msg || '删除失败');
            setConfirmDel(null);
            toast('已删除（原站已同步）');
            load(query, page, activeFilter);
          }}
          onClose={() => setConfirmDel(null)}
        />
      ) : null}

      {/* ===== 导入 / 上下架 / 说明书上传弹窗（对齐原站 toolbar 事件的 layer.open 面板） ===== */}
      {importKind || instrKind ? (
        <UploadModal
          kind={(importKind || instrKind) as string}
          busy={uploadBusy}
          note={uploadNote}
          onBusy={setUploadBusy}
          onNote={setUploadNote}
          onClose={() => {
            setImportKind(null);
            setInstrKind(null);
            setUploadNote('');
          }}
          onDone={() => {
            setImportKind(null);
            setInstrKind(null);
            setUploadNote('');
            load(query, page, activeFilter);
          }}
        />
      ) : null}

      {/* 勾选后的批量操作浮条（按货号维度）：加入收藏夹 / 去报价 */}
      {checked.length ? (
        <div className="pc-fav-bar">
          <span>
            已选 <b>{checked.length}</b> 个货号
            {offPageSel ? (
              <span className="pc-fav-bar-tip" title="换关键词 / 翻页不会丢弃已勾货号，加入收藏夹时一并带上">
                （其中 {offPageSel} 个不在当前结果，会一并加入）
              </span>
            ) : null}
          </span>
          <select
            className="pc-input"
            style={{ width: 150, height: 30 }}
            value={favTarget}
            onChange={(e) => setFavTarget(e.target.value)}
          >
            <option value="">选择收藏夹…</option>
            {favFolders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.parentId ? `　└ ${f.name}` : f.name}
              </option>
            ))}
          </select>
          <input
            className="pc-input"
            style={{ width: 130, height: 30 }}
            placeholder="新建收藏夹"
            value={favNew}
            onChange={(e) => setFavNew(e.target.value)}
          />
          <button
            className="pc-btn pc-btn-sm pc-btn-ghost"
            title="选中本页所有货号"
            onClick={() => setKeys(pageVariants, true)}
          >
            全选本页货号
          </button>
          <button
            className="pc-btn pc-btn-sm pc-btn-ghost"
            title="逐个下载已勾货号的说明书（每个 PDF 一个文件）"
            onClick={() => void downloadCheckedDocs()}
          >
            ⤓ 下载说明书
          </button>
          <button className="pc-btn pc-btn-sm pc-btn-cyan" onClick={() => addCheckedToFolder(false)}>
            加入收藏夹
          </button>
          <button className="pc-btn pc-btn-sm" onClick={() => addCheckedToFolder(true)}>
            加入并去报价
          </button>
          <button className="pc-btn pc-btn-sm pc-btn-ghost" onClick={() => clearChecked()}>
            取消选择
          </button>
        </div>
      ) : null}

      {/* 说明书真预览（blob → iframe） */}
      {previewDoc ? (
        <DocPreviewModal
          url={previewDoc.url}
          name={previewDoc.name}
          onClose={() => setPreviewDoc(null)}
        />
      ) : null}
    </div>
  );
}
