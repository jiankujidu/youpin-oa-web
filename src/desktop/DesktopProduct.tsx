/**
 * 产品中心 › 产品列表（/product/index/list）
 * PC 后台统一版式：工具栏 + 数据表格 + 分页 + 详情弹层（说明书 预览/收藏/转发）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchProductCateOptions,
  fetchProductPage,
  productAndUpInstructions,
  productDelete,
  productExportDownloadUrl,
  productExportUrl,
  productImport,
  productImportUnder,
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
import { addDocToFolder, createFolder, getFolders } from '../core/session';
import { shareFile, shareFilesAsZip } from '../core/share';
import type { FavFolder, Product } from '../core/types';
import { fmtTime, plain, sanitizeName, toast } from '../core/util';
import { ConfirmDialog, EditModal, Modal } from './ui';
import { DataTable, PageHead, Panel, StatusTag, type Column } from './pc';

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

export default function DesktopProduct() {
  const [list, setList] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  /** 每页条数（原站分页条「20 条/页 ▾」，服务端生效） */
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  /** 分类筛选用 cate_id（服务端参数）；种属/应用直接传值 */
  const [cateId, setCateId] = useState('');
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
  const [cateOpts, setCateOpts] = useState<{ id: string; title: string }[]>([]);
  const [cur, setCur] = useState<Product | null>(null);
  const [folders, setFolders] = useState<FavFolder[]>([]);
  const [saving, setSaving] = useState<{ name: string; url: string; productId: string } | null>(null);
  const [newName, setNewName] = useState('');
  /** 勾选的产品（对齐原站批量说明书 / getCheckData） */
  const [checked, setChecked] = useState<string[]>([]);
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
      cateId: cateId || undefined,
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
  }, [cateId, speciesF, appF, attrF, statusF, diffTimeF, productNameF, geneNameF, otherNameF, keywordType]);

  useEffect(() => {
    setPage(1);
    load(query, 1, activeFilter);
  }, [query, activeFilter, load]);
  useEffect(() => setFolders(getFolders()), []);

  /** 分类映射（cate_id → 分类名，后台拉取并缓存）；种属/应用选项取自当前页数据 */
  useEffect(() => {
    fetchProductCateOptions().then((opts) => {
      if (opts.length) setCateOpts(opts);
    });
  }, []);
  /** 载入行即展示行（筛选已由服务端完成；本地复制的产品仍合并显示） */
  const rows = list;

  /** OA 行 + 本地新增/编辑合并（复制出来的产品在本地层） */
  const displayRows = useMemo(
    () => [...mergeLocal('product', []), ...rows] as Product[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ['product', rows, localVer],
  );

  const localCount = useMemo(() => localAdded('product').length, [localVer]);

  /** 勾选行的产品 */
  const checkedRows = useMemo(
    () => (displayRows as any[]).filter((p) => checked.includes(String(p.id ?? ''))),
    [displayRows, checked],
  );

  /** 复制产品（打开编辑弹窗，去掉 id 即「另存为新品」真实提交原站） */
  function copyProduct(p: Product) {
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

  /** 与原站一致：货号/说明书(左冻结) / 状态 / 分类 / 价格 / 标题 / 种属 / 应用 / 基因名 / 别称 / 分子量 / 来源 / 定量定性 / 种属英文名 / 方法学 / 浓度点 / 英文名 / Tag / 表达系统 / 产品代码 / 属性 / 下载量 / 阅读权限范围 / 更新时间 / 操作(右冻结) */
  const cols: Column<Product>[] = [
    {
      key: '_check',
      title: '',
      width: 50,
      freeze: 'left',
      head: (
        <input
          type="checkbox"
          className="pc-check"
          title="全选"
          checked={displayRows.length > 0 && checked.length === displayRows.length}
          onChange={(e) => setChecked(e.target.checked ? (displayRows as any[]).map((p) => String(p.id ?? '')) : [])}
        />
      ),
      render: (r) => (
        <input
          type="checkbox"
          className="pc-check"
          checked={checked.includes(String(r.id ?? ''))}
          onChange={() =>
            setChecked((prev) =>
              prev.includes(String(r.id ?? '')) ? prev.filter((x) => x !== String(r.id ?? '')) : [...prev, String(r.id ?? '')],
            )
          }
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      key: 'no',
      title: '产品货号/说明书',
      width: 300,
      align: 'center',
      freeze: 'left',
      render: (r) => {
        // 原站 templet：逐行列出 goods_no_list 每个变体——
        // 有说明书 → 蓝色货号 + 预览(红) + 下载；无 → 红色货号 + 两个「暂无说明书」提示
        const list = ((r as any).goods_no_list || []) as { goods_no?: string; goods_no_url?: string; pc_goods_no_url?: string }[];
        if (!list.length) {
          return <span className="pc-td-strong">{String(r.goods_no || '').split(';')[0] || ''}</span>;
        }
        return (
          <span className="pc-goods-cell">
            {list.map((g, i) => {
              const no = g.goods_no || '';
              const has = !!(g.goods_no_url || g.pc_goods_no_url);
              const url = docUrl(g as any);
              return (
                <span className="pc-goods-row" key={i}>
                  <span className={has ? 'pc-c-blue' : 'pc-c-red'}>{no}</span>
                  {has && url ? (
                    <>
                      <span
                        className="pc-xs-btn pc-xs-danger"
                        title="在线查看"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(url, '_blank', 'noopener');
                        }}
                      >
                        预览
                      </span>
                      <span
                        className="pc-xs-btn pc-xs-cyan"
                        onClick={(e) => {
                          e.stopPropagation();
                          void shareDoc(`${sanitizeName(no)}-${sanitizeName(plain(r.title || ''))}.pdf`, url);
                        }}
                      >
                        下载
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="pc-xs-btn pc-xs-danger" onClick={(e) => { e.stopPropagation(); toast('暂无说明书'); }}>
                        预览
                      </span>
                      <span className="pc-xs-btn pc-xs-cyan" onClick={(e) => { e.stopPropagation(); toast('暂无说明书'); }}>
                        下载
                      </span>
                    </>
                  )}
                </span>
              );
            })}
          </span>
        );
      },
    },
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
    // 原站对齐：货号/状态/分类/各属性列 align="center"；价格明细与产品标题左对齐；空值渲染为空白（不是「—」）
    { key: 'cate', title: '分类', width: 150, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={r.cate_title}>{r.cate_title || ''}</span> },
    // 原站 templet：'<span class="green">{{d.price_desc}}</span>' —— 原始字符串直接展示，绿色，自然换行
    { key: 'price', title: '价格明细', width: 200, render: (r) => (
        <span className="pc-c-green" style={{ fontSize: 12.5 }}>{(r as any).price_desc || ''}</span>
      ) },
    // 原站 templet：'<a data-href="/product/index/view/id/xx.html" class="side-a">{{d.title}}</a>'（.side-a = #1A75FF 可点）
    { key: 'title', title: '产品标题', width: 250, render: (r) => (
        <span className="pc-cell-2" style={{ color: '#1A75FF', cursor: 'pointer' }} title={plain(r.title)} onClick={(e) => { e.stopPropagation(); setCur(r); }}>
          {plain(r.title)}
        </span>
      ) },
    { key: 'species', title: '种属', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={r.species}>{r.species || ''}</span> },
    { key: 'app', title: '应用', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={r.application}>{r.application || ''}</span> },
    { key: 'gene', title: '基因名称', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).gene_name}>{(r as any).gene_name || ''}</span> },
    { key: 'alias', title: '其他别称', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).other_name}>{(r as any).other_name || ''}</span> },
    { key: 'mw', title: '分子量', width: 100, align: 'center', render: (r) => (
        <span className="pc-cell-1 pc-td-sub" title={(r as any).da}>
          {(r as any).da || ''}
        </span>
      ) },
    { key: 'source', title: '来源', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).source}>{(r as any).source || ''}</span> },
    { key: 'scope', title: '定量/定性', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).scope}>{(r as any).scope || ''}</span> },
    { key: 'speciesEng', title: '种属英文名称', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).species_eng_name}>{(r as any).species_eng_name || ''}</span> },
    { key: 'method', title: '方法学', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).methodology}>{(r as any).methodology || ''}</span> },
    { key: 'concentration', title: '浓度点', width: 100, align: 'center', render: (r) => <span className="pc-cell-1 pc-td-sub" title={(r as any).concentration}>{(r as any).concentration || ''}</span> },
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
      width: 150,
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

  const docs = (cur?.goods_no_list || []).map((g) => ({
    no: g.goods_no,
    url: docUrl(g),
    name: `${sanitizeName(g.goods_no)}-${sanitizeName(plain(cur?.title || ''))}.pdf`,
  }));

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
            <button className="pc-btn pc-btn-sm pc-btn-danger" onClick={() => setChecked([])}>
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
            <select
              className="pc-input"
              style={{ width: 150 }}
              value={cateId}
              onChange={(e) => setCateId(e.target.value)}
            >
              <option value="">产品分类</option>
              {cateOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
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
                setCateId('');
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
              <div
                key={d.no}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 0',
                  borderTop: '1px solid var(--c-border)',
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.no}</span>
                {d.url ? (
                  <>
                    <span className="pc-link" onClick={() => window.open(d.url, '_blank', 'noopener')}>
                      预览
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
    </div>
  );
}
