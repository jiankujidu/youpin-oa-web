/**
 * 各模块「本地编辑」的字段配置。
 * 字段取自原站对应表单的输入项（与表格列保持一致），
 * 保存只写 localStorage，不提交 OA。
 */

export type EditField = {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'select' | 'date';
  options?: string[];
  placeholder?: string;
};

const CUSTOMER_FIELDS: EditField[] = [
  { key: 'name', label: '客户名称', placeholder: '如：XX 大学张三' },
  { key: 'contact', label: '联系人' },
  { key: 'mobile', label: '联系电话' },
  { key: 'source', label: '客户来源', type: 'select', options: ['独立开发', '官网', '官方小红书', '自媒体', '展会', '老客户介绍', '其他'] },
  { key: 'status_name', label: '客户状态', type: 'select', options: ['待联系', '重点线索', '常规客户', '成交客户', '沉睡客户', '废弃客户'] },
  { key: 'address', label: '地址' },
  { key: 'remark', label: '备注', type: 'textarea' },
];

export const OPS_FIELDS: Record<string, EditField[]> = {
  /* ---- 客户 ---- */
  customer: CUSTOMER_FIELDS,
  'customer-sea': CUSTOMER_FIELDS,
  'customer-trash': CUSTOMER_FIELDS,
  contact: [
    { key: 'name', label: '联系人姓名' },
    { key: 'customer_title', label: '所属客户' },
    { key: 'mobile', label: '电话' },
    { key: 'position', label: '职务' },
    { key: 'email', label: '邮箱' },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  chance: [
    { key: 'customer_title', label: '客户名称' },
    { key: 'title', label: '机会名称' },
    { key: 'amount', label: '预计金额', type: 'number' },
    { key: 'stage', label: '阶段', type: 'select', options: ['初步接触', '需求确认', '方案报价', '谈判', '赢单', '输单'] },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  trace: [
    { key: 'customer_title', label: '客户名称' },
    { key: 'type', label: '跟进方式', type: 'select', options: ['电话', '微信', '上门', '邮件', '其他'] },
    { key: 'content', label: '跟进内容', type: 'textarea' },
  ],

  /* ---- 订单 / 样本 / 校展 ---- */
  'order-my': [
    { key: 'customer_title', label: '客户名称' },
    { key: 'goods_no', label: '货号' },
    { key: 'goods_num', label: '数量', type: 'number' },
    { key: 'amount', label: '订单金额', type: 'number' },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  'order-handle': [
    { key: 'customer_title', label: '客户名称' },
    { key: 'amount', label: '订单金额', type: 'number' },
    { key: 'status', label: '处理状态', type: 'select', options: ['待审核', '已通过', '已撤销', '已发货', '已驳回'] },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  platform: [
    { key: 'customer_title', label: '客户名称' },
    { key: 'goods_no', label: '货号' },
    { key: 'amount', label: '金额', type: 'number' },
  ],
  sample: [
    { key: 'customer_title', label: '客户名称' },
    { key: 'sample_no', label: '样本编号' },
    { key: 'sample_name', label: '样本名称' },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  school: [
    { key: 'school_name', label: '学校名称' },
    { key: 'contact', label: '联系人' },
    { key: 'mobile', label: '电话' },
    { key: 'status', label: '状态', type: 'select', options: ['筹备中', '计划中', '进行中', '已结束'] },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  'school-handle': [
    { key: 'school_name', label: '学校名称' },
    { key: 'status', label: '处理状态', type: 'select', options: ['待审核', '已通过', '已驳回', '已撤销'] },
  ],

  /* ---- 售后 ---- */
  after: [
    { key: 'customer_title', label: '客户名称' },
    { key: 'service_type', label: '售后类型', type: 'select', options: ['质量问题', '物流破损', '使用咨询', '退换货', '补发', '其他'] },
    { key: 'title', label: '售后标题' },
    { key: 'content', label: '问题描述', type: 'textarea' },
    { key: 'mobile', label: '联系电话' },
  ],

  /* ---- 财务 ---- */
  'finance-advance': [
    { key: 'customer_title', label: '客户名称' },
    { key: 'amount', label: '金额', type: 'number' },
    { key: 'type', label: '类型', type: 'select', options: ['充值', '消费'] },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  deduction: [
    { key: 'customer_title', label: '客户名称' },
    { key: 'amount', label: '抵扣金额', type: 'number' },
    { key: 'status', label: '状态', type: 'select', options: ['审核中', '已通过', '已驳回', '已撤销'] },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  'deduction-checked': [
    { key: 'customer_title', label: '客户名称' },
    { key: 'amount', label: '抵扣金额', type: 'number' },
    { key: 'status', label: '处理状态', type: 'select', options: ['审核中', '已通过', '已驳回', '已撤销'] },
  ],
  margin: [
    { key: 'customer_title', label: '客户名称' },
    { key: 'amount', label: '金额', type: 'number' },
    { key: 'type', label: '类型', type: 'select', options: ['缴纳', '退还'] },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  'invoice-my': [
    { key: 'customer_title', label: '开票客户' },
    { key: 'amount', label: '开票金额', type: 'number' },
    { key: 'invoice_type', label: '发票类型', type: 'select', options: ['增值税专用发票', '增值税普通发票'] },
    { key: 'tax_no', label: '税号' },
    { key: 'title', label: '发票抬头' },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  'invoice-handle': [
    { key: 'customer_title', label: '开票客户' },
    { key: 'amount', label: '开票金额', type: 'number' },
    { key: 'status', label: '处理状态', type: 'select', options: ['待开票', '已开票', '已驳回', '已撤销'] },
  ],
  'finance-income': [
    { key: 'customer_title', label: '客户名称' },
    { key: 'amount', label: '到账金额', type: 'number' },
    { key: 'status', label: '状态', type: 'select', options: ['已到账', '未到账', '已撤销'] },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  'finance-order': [
    { key: 'customer_title', label: '客户名称' },
    { key: 'order_no', label: '订单号' },
    { key: 'amount', label: '申请金额', type: 'number' },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  'orderapply-handle': [
    { key: 'customer_title', label: '客户名称' },
    { key: 'amount', label: '金额', type: 'number' },
    { key: 'status', label: '处理状态', type: 'select', options: ['待审核', '已通过', '已驳回', '已撤销'] },
  ],

  /* ---- 审批（对齐原站 8 类审批） ---- */
  approve: [
    { key: 'approve_type', label: '审批类型', type: 'select', options: ['请假', '出差', '外出', '加班', '采购', '维修', '用章', '用车'] },
    { key: 'title', label: '申请事由' },
    { key: 'content', label: '详细说明', type: 'textarea' },
    { key: 'start_time', label: '开始时间', type: 'date' },
    { key: 'end_time', label: '结束时间', type: 'date' },
  ],

  /* ---- 附件（本地登记，不上传原站） ---- */
  files: [
    { key: 'name', label: '文件名称' },
    { key: 'fileext', label: '格式', type: 'select', options: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'png', 'zip', '其他'] },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
};

/** 该模块是否支持本地新增/编辑 */
export function opsFields(module: string): EditField[] | null {
  return OPS_FIELDS[module] || null;
}

/** 本地行在表格里显示的徽标文字 */
export function localBadge(row: Record<string, any>): string {
  if (row._op === 'added') return '本地新增';
  if (row._op === 'edited') return '本地已改';
  return '';
}
