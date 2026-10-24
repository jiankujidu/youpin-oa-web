/**
 * 产品分类完整树（93 节点，来源：原站 product.html 内嵌 cateJsonData —— xmSelect 树形下拉的数据源，
 * 2026-10-24 从 origin-snapshot/product.html 的 encodedJsonString 原样解析）
 *
 * 背景：原站「产品分类」管理页面对当前账号无权限（405），下拉数据只嵌在产品列表页里。
 * 这份树与原站 xmSelect 渲染的完全一致：14 个根、最多三级（如 抗体 → 新版一抗 → 4 个子项）。
 * count 为 2026-10-24 逐 ID 探测 /product/index/list 得到的产品数快照（探测时无数据的节点不带 count）。
 *
 * 多选筛选：/product/index/list 的 cate_id 参数接受逗号分隔的多个 ID（服务端取并集，
 * 父分类 ID 会自动展开到其全部子类，实测 cate_id=3,11 → 27714+96=27810 条）。
 * 运行时会把「已加载产品行里新发现的分类」合并进树里（见 mergeDiscoveredCates），
 * 原站新增分类后浏览到对应产品即自动出现，不依赖这份快照。
 */

export interface CateNode {
  id: string;
  title: string;
  /** 该分类下产品数（探测快照；未探测到数据的节点没有该字段） */
  count?: number;
  children?: CateNode[];
}

/** 完整分类树（与原站 xmSelect 数据源一致） */
export const PRODUCT_CATE_TREE: CateNode[] = [
  { id: '100', title: '磁微粒化学发光（只代测）', count: 8395 },
  { id: '99', title: '开票统称', count: 5 },
  { id: '92', title: '质谱实验', count: 1,
  children: [
      { id: '93', title: '氨基酸检测', count: 1 }
  ] },
  { id: '81', title: '整体外包', count: 50,
  children: [
      { id: '94', title: '技术服务', count: 1 },
      { id: '86', title: '动物实验', count: 19 },
      { id: '85', title: '细胞实验', count: 30 }
  ] },
  { id: '59', title: '测序', count: 67,
  children: [
      { id: '77', title: '蛋白组', count: 6 },
      { id: '73', title: '代谢组', count: 3 },
      { id: '69', title: '提取', count: 2 },
      { id: '68', title: '转录组', count: 20 },
      { id: '67', title: '基因组', count: 6 },
      { id: '66', title: '微生物组', count: 22 },
      { id: '65', title: '测序应用', count: 2 },
      { id: '64', title: '建库策略', count: 4 },
      { id: '63', title: '二代测序', count: 1 },
      { id: '60', title: '全基因组', count: 1 }
  ] },
  { id: '57', title: 'WB检测服务', count: 20,
  children: [
      { id: '76', title: 'WB实验耗材', count: 11 },
      { id: '58', title: 'WB检测', count: 7 }
  ] },
  { id: '52', title: 'QPCR', count: 414,
  children: [
      { id: '54', title: '单基因QPCR检测试剂盒', count: 388 },
      { id: '53', title: 'QPCR检测服务', count: 26 }
  ] },
  { id: '38', title: '病理技术服务', count: 113,
  children: [
      { id: '96', title: 'BODIPY染色', count: 2 },
      { id: '84', title: '扫描电镜', count: 1 },
      { id: '56', title: '多重免疫荧光(不含扫描)', count: 7 },
      { id: '51', title: '抗体使用费', count: 1 },
      { id: '50', title: '多重免疫荧光（含扫描）' },
      { id: '47', title: '临床病理读片分析/科研', count: 15 },
      { id: '46', title: '切片扫描/拍照', count: 7 },
      { id: '45', title: '分子病理/超微病理检测', count: 5 },
      { id: '44', title: '组织（芯片）多重荧光（含扫描）芯片客户自己提供', count: 6 },
      { id: '43', title: '多重荧光染色（含扫描）', count: 8 },
      { id: '41', title: '组织切片染色（常规/特殊染色）', count: 47 },
      { id: '40', title: '组织芯片阵列制作', count: 3 },
      { id: '39', title: '组织样本基础处理', count: 11 }
  ] },
  { id: '31', title: '实验室试剂', count: 63,
  children: [
      { id: '97', title: '优品水试剂', count: 24 },
      { id: '88', title: '试剂耗材', count: 2 },
      { id: '83', title: '化学试剂（不单卖）', count: 1 },
      { id: '33', title: 'CCK8', count: 4 },
      { id: '32', title: '缓冲剂', count: 32 }
  ] },
  { id: '23', title: '其他', count: 49,
  children: [
      { id: '98', title: '会员费/优借卡费', count: 3 },
      { id: '37', title: '其他类别费用', count: 10,
      children: [
          { id: '89', title: '其他费用', count: 1 }
      ] },
      { id: '36', title: '其他试剂盒', count: 3 },
      { id: '35', title: '礼品类型', count: 33,
      children: [
          { id: '80', title: '优品礼品', count: 18 },
          { id: '79', title: '仑昌硕礼品', count: 11 },
          { id: '78', title: '睿信礼品', count: 3 }
      ] }
  ] },
  { id: '20', title: '原料', count: 2584,
  children: [
      { id: '22', title: '其它原料', count: 25 },
      { id: '21', title: '抗原', count: 2559 }
  ] },
  { id: '14', title: '生化', count: 2930,
  children: [
      { id: '61', title: '新版生化', count: 1815,
      children: [
          { id: '95', title: '微板法手动生化', count: 1178 },
          { id: '62', title: '新版手动生化', count: 637 }
      ] },
      { id: '17', title: '手动生化', count: 1001 },
      { id: '15', title: '全自动生化', count: 114 }
  ] },
  { id: '2', title: '抗体', count: 37519,
  children: [
      { id: '90', title: '内参抗体', count: 24 },
      { id: '87', title: '一抗（兔单抗）', count: 1679 },
      { id: '70', title: '新版一抗', count: 396,
      children: [
          { id: '75', title: '补发新版多克隆抗体' },
          { id: '74', title: '补发新版单克隆抗体' },
          { id: '72', title: '新版单克隆抗体', count: 294 },
          { id: '71', title: '新版多克隆抗体', count: 102 }
      ] },
      { id: '27', title: '一抗（新单克隆抗体）', count: 15654 },
      { id: '16', title: '抗体对', count: 1262 },
      { id: '10', title: '二抗', count: 157 },
      { id: '9', title: '一抗（没验证图）', count: 584 },
      { id: '8', title: '53ul-臻香抗体（不主推）' },
      { id: '7', title: '一抗', count: 17758 }
  ] },
  { id: '1', title: 'ELISA', count: 71458,
  children: [
      { id: '49', title: '化学发光-只代测', count: 16 },
      { id: '34', title: '磁微粒', count: 13 },
      { id: '28', title: 'MAX ELISA', count: 24101 },
      { id: '26', title: '微量高敏竞争法', count: 523 },
      { id: '25', title: '微量普通竞争法', count: 1514 },
      { id: '24', title: '微量普通ELISA', count: 4363 },
      { id: '19', title: '普通竞争法', count: 1471 },
      { id: '18', title: '高敏竞争法', count: 409 },
      { id: '13', title: '动物疫病', count: 34 },
      { id: '12', title: '食品安全', count: 60 },
      { id: '11', title: '通用试剂盒', count: 96 },
      { id: '6', title: '特殊高敏', count: 1158 },
      { id: '5', title: '高敏热门', count: 263 },
      { id: '4', title: '高敏生物素', count: 9723 },
      { id: '3', title: '普通ELISA', count: 27714 }
  ] }
];

/** 摊平树（id -> title/count 查找表） */
export const CATE_NODE_MAP: Map<string, CateNode> = (() => {
  const m = new Map<string, CateNode>();
  const walk = (nodes: CateNode[]) => {
    for (const n of nodes) {
      m.set(n.id, n);
      if (n.children) walk(n.children);
    }
  };
  walk(PRODUCT_CATE_TREE);
  return m;
})();

/**
 * 合并「运行时从产品行里发现的分类」——原站若新增分类，浏览到对应产品即自动入列。
 * rows 为 /product/index/list 返回的原始行；cate_title 形如「ELISA-普通ELISA」，
 * 按「父-子」前缀挂到对应父节点下，挂不上的作为根节点追加。
 */
export function mergeDiscoveredCates(
  tree: CateNode[],
  rows: Array<{ cate_id?: unknown; cate_title?: unknown }>,
): CateNode[] {
  const seen = new Set(CATE_NODE_MAP.keys());
  const added: CateNode[] = [];
  for (const r of rows) {
    const id = String(r.cate_id ?? '');
    const title = String(r.cate_title ?? '').trim();
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    added.push({ id, title });
  }
  if (!added.length) return tree;
  const out: CateNode[] = tree.map((n) => ({ ...n, children: n.children ? n.children.map((c) => ({ ...c })) : undefined }));
  for (const a of added) {
    const dash = a.title.indexOf('-');
    const parentTitle = dash > 0 ? a.title.slice(0, dash) : '';
    const host = parentTitle ? out.find((n) => n.title === parentTitle) : undefined;
    if (host) {
      if (!host.children) host.children = [];
      host.children.push(a);
    } else {
      out.push({ ...a });
    }
  }
  return out;
}
