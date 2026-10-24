/**
 * 产品分类完整清单（2026-10-24 全量探测重建，来源：/product/index/list 的 cate_id 参数）
 *
 * 背景：原站「产品分类」管理页面对当前账号无权限（405），分类下拉无法从原站直接取；
 * 且 /product/index/list 的 cate_id 参数同时接受一级分类 ID 与叶子分类 ID，故逐 ID 探测 1..300
 * （101..300 均返回错误页，有效 ID 全部 ≤100）重建出完整分类树：
 *   - 一级分类 14 个：传其 ID 返回该大类下全部产品
 *   - 二级分类 75 个：传其 ID 只返回该叶子分类的产品
 * 运行时会与「已加载产品行里出现的分类」合并（见 mergeDiscoveredCates），
 * 原站新增分类后，浏览到对应产品即会自动出现在下拉里，不依赖这份快照。
 */

export interface ProductCate {
  id: string;
  title: string;
  /** 该分类下产品数（探测时快照，仅用于排序参考） */
  count: number;
}

/** 一级分类（父分类，可整组筛选） */
export const PRODUCT_CATES_PARENT: ProductCate[] = [
  { id: '1', title: 'ELISA', count: 71458 },
  { id: '2', title: '抗体', count: 37519 },
  { id: '14', title: '新版生化', count: 2930 },
  { id: '20', title: '原料', count: 2584 },
  { id: '61', title: '新版生化', count: 1815 },
  { id: '52', title: 'QPCR', count: 414 },
  { id: '70', title: '新版一抗', count: 396 },
  { id: '38', title: '病理技术服务', count: 113 },
  { id: '59', title: '测序', count: 67 },
  { id: '31', title: '实验室试剂', count: 63 },
  { id: '81', title: '整体外包', count: 50 },
  { id: '23', title: '礼品类型', count: 49 },
  { id: '35', title: '礼品类型', count: 33 },
  { id: '92', title: '质谱实验', count: 1 },
];

/** 二级分类（叶子分类，精确筛选） */
export const PRODUCT_CATES_LEAF: ProductCate[] = [
  { id: '3', title: 'ELISA-普通ELISA', count: 27714 },
  { id: '28', title: 'ELISA-MAX ELISA', count: 24101 },
  { id: '7', title: '抗体-一抗', count: 17758 },
  { id: '27', title: '抗体-一抗（新单克隆抗体）', count: 15654 },
  { id: '4', title: 'ELISA-高敏生物素', count: 9723 },
  { id: '100', title: '磁微粒化学发光（只代测）', count: 8395 },
  { id: '24', title: 'ELISA-微量普通ELISA', count: 4363 },
  { id: '21', title: '原料-抗原', count: 2559 },
  { id: '87', title: '抗体-一抗（兔单抗）', count: 1679 },
  { id: '25', title: 'ELISA-微量普通竞争法', count: 1514 },
  { id: '19', title: 'ELISA-普通竞争法', count: 1471 },
  { id: '16', title: '抗体-抗体对', count: 1262 },
  { id: '95', title: '新版生化-微板法手动生化', count: 1178 },
  { id: '6', title: 'ELISA-特殊高敏', count: 1158 },
  { id: '17', title: '生化-手动生化', count: 1001 },
  { id: '62', title: '新版生化-新版手动生化', count: 637 },
  { id: '9', title: '抗体-一抗（没验证图）', count: 584 },
  { id: '26', title: 'ELISA-微量高敏竞争法', count: 523 },
  { id: '18', title: 'ELISA-高敏竞争法', count: 409 },
  { id: '54', title: 'QPCR-单基因QPCR检测试剂盒', count: 388 },
  { id: '72', title: '新版一抗-新版单克隆抗体', count: 294 },
  { id: '5', title: 'ELISA-高敏热门', count: 263 },
  { id: '10', title: '抗体-二抗', count: 157 },
  { id: '15', title: '生化-全自动生化', count: 114 },
  { id: '71', title: '新版一抗-新版多克隆抗体', count: 102 },
  { id: '11', title: 'ELISA-通用试剂盒', count: 96 },
  { id: '12', title: 'ELISA-食品安全', count: 60 },
  { id: '41', title: '病理技术服务-组织切片染色（常规/特殊染色）', count: 47 },
  { id: '13', title: 'ELISA-动物疫病', count: 34 },
  { id: '32', title: '实验室试剂-缓冲剂', count: 32 },
  { id: '85', title: '整体外包-细胞实验', count: 30 },
  { id: '53', title: 'QPCR-QPCR检测服务', count: 26 },
  { id: '22', title: '原料-其它原料', count: 25 },
  { id: '90', title: '抗体-内参抗体', count: 24 },
  { id: '97', title: '实验室试剂-优品水试剂', count: 24 },
  { id: '66', title: '测序-微生物组', count: 22 },
  { id: '57', title: 'WB检测服务', count: 20 },
  { id: '68', title: '测序-转录组', count: 20 },
  { id: '86', title: '整体外包-动物实验', count: 19 },
  { id: '80', title: '礼品类型-优品礼品', count: 18 },
  { id: '49', title: 'ELISA-化学发光-只代测', count: 16 },
  { id: '47', title: '病理技术服务-临床病理读片分析/科研', count: 15 },
  { id: '34', title: 'ELISA-磁微粒', count: 13 },
  { id: '39', title: '病理技术服务-组织样本基础处理', count: 11 },
  { id: '76', title: 'WB检测服务-WB实验耗材', count: 11 },
  { id: '79', title: '礼品类型-仑昌硕礼品', count: 11 },
  { id: '37', title: '其他-其他类别费用', count: 10 },
  { id: '43', title: '病理技术服务-多重荧光染色（含扫描）', count: 8 },
  { id: '46', title: '病理技术服务-切片扫描/拍照', count: 7 },
  { id: '56', title: '病理技术服务-多重免疫荧光(不含扫描)', count: 7 },
  { id: '58', title: 'WB检测服务-WB检测', count: 7 },
  { id: '44', title: '病理技术服务-组织（芯片）多重荧光（含扫描）芯片客户自己提供', count: 6 },
  { id: '67', title: '测序-基因组', count: 6 },
  { id: '77', title: '测序-蛋白组', count: 6 },
  { id: '45', title: '病理技术服务-分子病理/超微病理检测', count: 5 },
  { id: '99', title: '开票统称', count: 5 },
  { id: '33', title: '实验室试剂-CCK8', count: 4 },
  { id: '64', title: '测序-建库策略', count: 4 },
  { id: '36', title: '其他-其他试剂盒', count: 3 },
  { id: '40', title: '病理技术服务-组织芯片阵列制作', count: 3 },
  { id: '73', title: '测序-代谢组', count: 3 },
  { id: '78', title: '礼品类型-睿信礼品', count: 3 },
  { id: '98', title: '其他-会员费/优借卡费', count: 3 },
  { id: '65', title: '测序-测序应用', count: 2 },
  { id: '69', title: '测序-提取', count: 2 },
  { id: '88', title: '实验室试剂-试剂耗材', count: 2 },
  { id: '96', title: '病理技术服务-BODIPY染色', count: 2 },
  { id: '51', title: '病理技术服务-抗体使用费', count: 1 },
  { id: '60', title: '测序-全基因组', count: 1 },
  { id: '63', title: '测序-二代测序', count: 1 },
  { id: '83', title: '实验室试剂-化学试剂（不单卖）', count: 1 },
  { id: '84', title: '病理技术服务-扫描电镜', count: 1 },
  { id: '89', title: '其他类别费用-其他费用', count: 1 },
  { id: '93', title: '质谱实验-氨基酸检测', count: 1 },
  { id: '94', title: '整体外包-技术服务', count: 1 },
];

/**
 * 合并「运行时从产品行里发现的分类」——原站若新增分类，浏览到对应产品即自动入列，
 * 不依赖上面的快照。rows 为 /product/index/list 返回的原始行。
 */
export function mergeDiscoveredCates(
  base: ProductCate[],
  rows: Array<{ cate_id?: unknown; cate_title?: unknown }>,
): ProductCate[] {
  const out = base.slice();
  const seen = new Set(out.map((c) => c.id));
  for (const r of rows) {
    const id = String(r.cate_id ?? '');
    const title = String(r.cate_title ?? '').trim();
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title, count: 0 });
  }
  return out;
}
