/**
 * 内置演示数据集。
 *
 * 假设 A3：字段结构与 api.js 中真实接口返回完全一致（{code,msg,data} + create_time 等命名），
 * 因此把 VITE_OA_PROXY 配上真实后端后，视图层零改动即可切换。
 */
import type {
  ApproveItem, Article, Attachment, Customer, MailContact, Message, Note, Product,
} from './types';

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);
const ts = (daysAgo: number, hour = 10, min = 30) =>
  now - daysAgo * DAY + hour * 3600 + min * 60;

const dstr = (t: number) => {
  const d = new Date(t * 1000);
  const p = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ============================ 审批 ============================ */

const APPROVE_SEED: [string, string, 0 | 1 | 2 | 3, string, number][] = [
  ['10月试剂采购申请（FGF-19 抗体）', '采购', 1, '李慧敏', 0],
  ['武汉理工大学校展用车申请', '用车', 1, '张海涛', 1],
  ['客户拜访出差申请（南京）', '出差', 1, '陈思远', 1],
  ['销售合同用章申请（YPE800085）', '用章', 1, '王雅琴', 2],
  ['实验室离心机维修申请', '维修', 1, '刘工', 3],
  ['年假申请 3 天', '请假', 2, '周敏', 4],
  ['周末加班申请（订单复核）', '加班', 2, '赵磊', 5],
  ['外出拜访客户（华中科技大学）', '外出', 2, '孙楠', 6],
  ['抗体原料采购申请（Q4 备货）', '采购', 3, '李慧敏', 7],
  ['用章申请（投标文件）', '用章', 3, '王雅琴', 8],
];

export const APPROVES: ApproveItem[] = APPROVE_SEED.map(
  ([title, type_name, status, admin_name, ago], i) => ({
    id: String(2001 + i),
    title,
    type_name,
    status,
    admin_name,
    create_time: dstr(ts(ago, 9, (i * 7) % 60)),
    content:
      status === 1
        ? `申请人：${admin_name}\n申请事由：${title}\n请尽快审批。`
        : `申请人：${admin_name}\n申请事由：${title}`,
    remark: status === 3 ? '预算超出本季度额度，请先与财务确认后再提交。' : '',
    flow: [
      { name: '发起申请', state: 'ok' as const, admin_name, time: dstr(ts(ago + 1, 9, 0)) },
      {
        name: '部门主管审批',
        state: (status === 1 ? 'wait' : status === 3 ? 'no' : 'ok') as 'ok' | 'wait' | 'no',
        admin_name: '吴部长',
        time: status === 1 ? '' : dstr(ts(ago, 14, 20)),
        remark: status === 3 ? '预算超出本季度额度，请先与财务确认后再提交。' : '同意',
      },
      {
        name: '财务复核',
        state: (status === 2 ? 'ok' : 'wait') as 'ok' | 'wait',
        admin_name: '财务-郑会计',
        time: status === 2 ? dstr(ts(ago - 1, 11, 5)) : '',
      },
    ],
  }),
);

/* ============================ 客户 ============================ */

const CUSTOMER_SEED: [string, Customer['grade'], string, string, string, number, number, number, boolean, string][] = [
  ['武汉大学生命科学学院', 'deal', '周教授', '027-6877****', '展会', 4, 3, 2, true, '湖北省武汉市武昌区八一路299号'],
  ['华中科技大学同济医学院', 'deal', '李主任', '027-8369****', '转介绍', 4, 3, 1, true, '湖北省武汉市硚口区航空路13号'],
  ['南京农业大学动物医学院', 'lead', '王研究员', '025-8439****', '官网', 3, 2, 1, false, '江苏省南京市玄武区卫岗1号'],
  ['中国检验检疫科学研究院', 'lead', '张博士', '010-8577****', '招标', 3, 2, 0, false, '北京市朝阳区高碑店北路'],
  ['广州金域医学检验中心', 'deal', '陈经理', '020-3222****', '老客户', 4, 5, 2, true, '广东省广州市黄埔区科学城'],
  ['上海透景生命科技', 'normal', '刘采购', '021-5838****', '展会', 2, 1, 1, true, '上海市浦东新区张江高科技园区'],
  ['山东农业大学', 'sleep', '孙老师', '0538-8241****', '官网', 1, 1, 0, false, '山东省泰安市岱宗大街61号'],
  ['郑州大学第一附属医院', 'lead', '赵医师', '0371-6691****', '转介绍', 3, 2, 1, true, '河南省郑州市二七区建设东路1号'],
  ['深圳华大基因研究院', 'deal', '吴主管', '0755-3630****', '展会', 4, 4, 2, true, '广东省深圳市盐田区北山工业区'],
  ['四川农业大学动物科技学院', 'normal', '何教授', '028-8629****', '官网', 2, 2, 0, false, '四川省成都市温江区惠民路211号'],
  ['天津医科大学', 'sleep', '冯老师', '022-8333****', '展会', 1, 1, 0, false, '天津市和平区气象台路22号'],
  ['西安交通大学医学院', 'lead', '许研究员', '029-8265****', '招标', 3, 2, 1, false, '陕西省西安市雁塔区雁塔西路76号'],
];

const GRADE_TEXT: Record<Customer['grade'], string> = {
  deal: '成交客户', lead: '重点线索', sleep: '沉睡客户', normal: '常规客户',
};

export const CUSTOMERS: Customer[] = CUSTOMER_SEED.map(
  ([name, grade, contact, tel, source, intent, status, , hasW, address], i) => ({
    id: String(3001 + i),
    name,
    grade,
    grade_text: GRADE_TEXT[grade],
    contact,
    tel,
    source,
    intent,
    status,
    has_wechat: hasW,
    admin_name: ['李慧敏', '张海涛', '陈思远', '王雅琴'][i % 4],
    create_time: dstr(ts(i * 5 + 3, 10, i * 3)),
    last_time: dstr(ts(i, 15, i * 5)),
    address,
    remark:
      grade === 'deal'
        ? '长期合作客户，季度复购稳定，注意提前备货。'
        : grade === 'lead'
        ? '有明确采购意向，跟进报价与说明书。'
        : grade === 'sleep'
        ? '近半年无互动，建议定期回访唤醒。'
        : '常规维护，关注新品通知。',
  }),
);

/* ============================ 产品 / 说明书 ============================ */

const PRODUCT_SEED: [string, string, string, string, string, string, string][] = [
  ['科研原料 FGF-19 Rabbit pAb', 'YP-Ab-12429', '一抗', '¥ 2,380.00', '100μL', 'Rabbit', '优品生物'],
  ['科研原料 FGF-19 Mouse mAb', 'YP-mAb-12429', '一抗', '¥ 3,180.00', '100μL', 'Mouse', '优品生物'],
  ['科研原料 Notch1 Rabbit mAb', 'YP-rAb-18051', '一抗', '¥ 2,980.00', '100μL', 'Rabbit', '优品生物'],
  ['山羊抗小鼠 IgG(H+L) — HRP', 'YP848536-H', '二抗', '¥ 860.00', '1mL', 'Goat', '优品生物'],
  ['山羊抗兔 IgG(H+L) — HRP', 'YP848537-H', '二抗', '¥ 860.00', '1mL', 'Goat', '优品生物'],
  ['山羊抗兔 IgG(H+L) Cy3 标记', 'YPE800085', '二抗', '¥ 1,260.00', '500μL', 'Goat', '优品生物'],
  ['山羊抗兔 IgG(H+L) Cy5 标记', 'YPE800104', '二抗', '¥ 1,380.00', '500μL', 'Goat', '优品生物'],
  ['重组人 FGF-19 蛋白', 'YP-Rec-0117', '重组蛋白', '¥ 4,600.00', '50μg', 'E.coli', '优品生物'],
];

/** 说明书用同源静态 PDF（public/data/ 下的真实文件，可被 pdf.js 直接渲染） */
function docUrl(goodsNo: string): string {
  return `data/manual/${encodeURIComponent(goodsNo)}.pdf`;
}

export const PRODUCTS: Product[] = PRODUCT_SEED.map(
  ([title, goodsNo, cate, price, specs, species, brand], i) => ({
    id: String(4001 + i),
    title,
    goods_no: goodsNo,
    cate_title: cate,
    price_desc: price,
    specs,
    unit: '支',
    species,
    application: ['WB', 'IHC', 'IF', 'ELISA'][i % 4],
    brand,
    stock: i % 3 === 0 ? '现货' : i % 3 === 1 ? '预定（3 个工作日）' : '现货（少量）',
    create_time: dstr(ts(i * 11 + 2, 11, 20)),
    content: `<p>${title}为优品生物自主研发的科研用原料，适用于 ${['WB', 'IHC', 'IF', 'ELISA'][i % 4]} 等实验场景。</p><p>纯度 ≥95%，-20℃ 保存，避免反复冻融。</p>`,
    goods_no_list: [
      { goods_no: goodsNo, goods_no_url: docUrl(goodsNo), pc_goods_no_url: docUrl(goodsNo) },
      { goods_no: `${goodsNo}-S`, goods_no_url: docUrl(`${goodsNo}-S`), pc_goods_no_url: docUrl(`${goodsNo}-S`) },
    ],
  }),
);

/* ============================ 公告 / 问答 ============================ */

const NOTE_SEED: [string, string, string, number][] = [
  ['关于 Q4 抗体原料备货的通知', '公司通知', '行政部', 0],
  ['2026 年中秋国庆放假安排', '公司通知', '行政部', 2],
  ['新版销售协议模板上线说明', '业务公告', '销售部', 3],
  ['实验室安全操作规范（修订版）', '规章制度', '技术部', 5],
  ['关于客户信息录入规范的要求', '业务公告', '销售部', 8],
  ['年会暨年度表彰大会通知', '公司通知', '行政部', 12],
];

export const NOTES: Note[] = NOTE_SEED.map(([title, cate_title, admin_name, ago], i) => ({
  id: String(5001 + i),
  title,
  cate_title,
  admin_name,
  create_time: dstr(ts(ago, 9, 0)),
  content: `<p>各位同事：</p><p>${title}。请各相关部门按通知要求执行，如有疑问请联系${admin_name}。</p><p>特此通知。</p>`,
}));

const ARTICLE_SEED: [string, string, number][] = [
  ['抗体保存与分装的常见误区', '技术问答', 0],
  ['WB 实验背景高怎么排查？', '技术问答', 1],
  ['二抗选择指南：HRP / Cy3 / Cy5 怎么选', '产品指南', 2],
  ['客户报价流程与折扣权限说明', '业务问答', 4],
  ['销售协议在线编辑操作手册', '系统帮助', 6],
  ['发票申请与到账核销流程', '业务问答', 9],
];

export const ARTICLES: Article[] = ARTICLE_SEED.map(([title, cate_title, ago], i) => ({
  id: String(6001 + i),
  title,
  cate_title,
  create_time: dstr(ts(ago, 14, 15)),
  content: `<h3>${title}</h3><p>本文针对该问题给出标准处理流程与注意事项。</p><p>1. 先确认基础条件是否满足；</p><p>2. 按标准流程逐项排查；</p><p>3. 仍无法解决时联系技术支持。</p>`,
}));

/* ============================ 消息 / 通讯录 ============================ */

const MSG_SEED: [string, string, number, boolean][] = [
  ['【审批提醒】您有 1 条待审批：10月试剂采购申请', '系统消息', 0, false],
  ['【客户分配】新增客户「郑州大学第一附属医院」已分配给您', '系统消息', 0, false],
  ['关于 Q4 抗体原料备货的通知', '行政部', 1, false],
  ['【订单提醒】订单 SO-20261012-008 已审核通过', '系统消息', 1, true],
  ['周会纪要：下周重点跟进高校客户', '李慧敏', 3, true],
  ['【到账提醒】一笔 ¥ 12,800.00 已到账', '财务-郑会计', 4, true],
];

export const MESSAGES: Message[] = MSG_SEED.map(([title, from_name, ago, is_read], i) => ({
  id: String(7001 + i),
  title,
  from_name,
  create_time: dstr(ts(ago, 9, i * 11)),
  is_read,
  content: `<p>${title}</p><p>—— ${from_name}</p>`,
}));

const MAIL_SEED: [string, string, string, string, string][] = [
  ['李慧敏', '销售部', '大区经理', '027-8801****', 'lihm@upingbio.cn'],
  ['张海涛', '销售部', '销售代表', '027-8802****', 'zhanght@upingbio.cn'],
  ['陈思远', '销售部', '销售代表', '027-8803****', 'chensy@upingbio.cn'],
  ['王雅琴', '商务部', '商务专员', '027-8804****', 'wangyq@upingbio.cn'],
  ['吴部长', '销售部', '销售总监', '027-8805****', 'wu@upingbio.cn'],
  ['郑会计', '财务部', '会计', '027-8806****', 'zheng@upingbio.cn'],
  ['刘工', '技术部', '技术支持', '027-8807****', 'liu@upingbio.cn'],
  ['周敏', '行政部', '行政主管', '027-8808****', 'zhoum@upingbio.cn'],
];

export const MAILS: MailContact[] = MAIL_SEED.map(([name, department, position, tel, email], i) => ({
  id: String(8001 + i),
  name,
  department,
  position,
  tel,
  mobile: tel,
  email,
}));

/* ============================ 附件（初始几条，上传后追加） ============================ */

export const ATTACHMENTS: Attachment[] = [
  {
    id: '9001',
    name: 'YP-Ab-12429 说明书.pdf',
    url: 'data/manual/YP-Ab-12429.pdf',
    filepath: 'upload/2026/10/YP-Ab-12429.pdf',
    filesize: 179619,
    fileext: 'pdf',
    create_time: dstr(ts(2, 10, 30)),
    admin_name: '李慧敏',
    group_title: '销售部',
  },
  {
    id: '9002',
    name: '报价表.xlsx',
    url: 'data/报价表.xlsx',
    filepath: 'upload/2026/10/报价表.xlsx',
    filesize: 10017,
    fileext: 'xlsx',
    create_time: dstr(ts(5, 16, 12)),
    admin_name: '王雅琴',
    group_title: '商务部',
  },
  {
    id: '9003',
    name: '山羊抗兔IgG(H+L)—HRP.pdf',
    url: 'data/manual/YP848537-H.pdf',
    filepath: 'upload/2026/10/YP848537-H.pdf',
    filesize: 363032,
    fileext: 'pdf',
    create_time: dstr(ts(8, 11, 5)),
    admin_name: '陈思远',
    group_title: '销售部',
  },
];

/* ============================ 首页统计 ============================ */

export const HOME_STATS = {
  pendingApprove: APPROVES.filter((a) => a.status === 1).length,
  myCustomer: CUSTOMERS.filter((c) => c.grade !== 'sleep').length,
  monthOrder: 27,
  monthAmount: '386,420.00',
  unreadMsg: MESSAGES.filter((m) => !m.is_read).length,
};
