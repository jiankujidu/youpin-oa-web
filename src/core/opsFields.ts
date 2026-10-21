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

  /* ---- 审批（对齐原站 24 类审批） ---- */
  approve: [
    {
      key: 'approve_type',
      label: '审批类型',
      type: 'select',
      options: [
        '付款', '会议室预定', '借款', '入职', '公文流转', '出差', '加班', '垫付退回',
        '外出', '奖励', '实验付款', '招聘需求', '活动经费', '物品维修', '用章', '用车',
        '用车归还', '离职', '请假', '资质借用', '转岗', '转正', '通用审批', '采购',
      ],
    },
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

  /* ---- 公告 / 问答（原站 note、article 均有 add / edit / del） ---- */
  note: [
    { key: 'title', label: '公告标题' },
    { key: 'cate_title', label: '分类' },
    { key: 'start_time', label: '生效时间', type: 'date' },
    { key: 'end_time', label: '结束时间', type: 'date' },
    { key: 'content', label: '公告正文', type: 'textarea' },
  ],
  article: [
    { key: 'title', label: '问题' },
    { key: 'cate_title', label: '分类' },
    { key: 'desc', label: '回答', type: 'textarea' },
    { key: 'content', label: '详细内容', type: 'textarea' },
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

/* ======================= 行操作（对齐原站工具栏/行内按钮） ======================= */

/**
 * 原站各列表页行内的额外操作（除 详情/编辑/删除 外）。
 * 全部只在本机生效：提交即写 localStorage，绝不 POST 原站。
 */
export type OpAction = {
  /** 操作标识（写进本地记录的 op_<key> 字段） */
  key: string;
  /** 按钮文案（照原站） */
  label: string;
  /** 按钮色 */
  tone?: 'blue' | 'red' | 'orange' | 'purple';
  /** 该操作要填的表单项（不传则只记录"已执行"） */
  fields?: EditField[];
  /** 执行后给用户的提示 */
  msg?: string;
};

export const OPS_ACTIONS: Record<string, OpAction[]> = {
  /* 订单（我申请的）：原站 /customer/order/index 行内 快速下单 / 复购 / 付款记录 / 销售协议 */
  'order-my': [
    { key: 'quick_order', label: '快速下单', fields: [{ key: 'goods_no', label: '货号' }, { key: 'goods_num', label: '数量', type: 'number' }, { key: 'amount', label: '金额', type: 'number' }, { key: 'remark', label: '备注', type: 'textarea' }], msg: '已登记快速下单（本地）' },
    { key: 'repurchase', label: '复购', fields: [{ key: 'goods_no', label: '复购货号' }, { key: 'goods_num', label: '数量', type: 'number' }], msg: '已登记复购（本地）' },
    { key: 'pay_record', label: '付款记录', tone: 'blue' },
    { key: 'sales_agreement', label: '销售协议', tone: 'purple' },
  ],
  /* 订单（我处理的）：原站 /customer/order/list 行内 添加发票 / 添加到账 / 物流 / 代检进度 / 销售协议 */
  'order-handle': [
    { key: 'addinvoice', label: '添加发票', fields: [{ key: 'invoice_no', label: '发票号' }, { key: 'amount', label: '开票金额', type: 'number' }], msg: '已登记发票（本地）' },
    { key: 'addreceived', label: '添加到账', fields: [{ key: 'amount', label: '到账金额', type: 'number' }, { key: 'deal_time', label: '到账时间', type: 'date' }], msg: '已登记到账（本地）' },
    { key: 'logistics', label: '物流', fields: [{ key: 'logistics_no', label: '物流单号' }, { key: 'logistics_company', label: '物流公司' }], msg: '已登记物流（本地）' },
    { key: 'proxytestingprogress', label: '代检进度', fields: [{ key: 'progress', label: '当前进度', type: 'select', options: ['待寄样', '检测中', '已出报告', '已驳回'] }], msg: '已登记代检进度（本地）' },
    { key: 'sales_agreement', label: '销售协议', tone: 'purple' },
  ],
  platform: [
    { key: 'pay_record', label: '付款记录', tone: 'blue' },
  ],

  /* 到账（订单·我申请的）：原站 /finance/orderapply/index 行内 撤回(back) */
  'finance-order': [
    { key: 'back', label: '撤回', tone: 'red', fields: [{ key: 'back_remark', label: '撤回原因', type: 'textarea' }], msg: '已撤回（本地生效）' },
  ],
  /* 到账（订单·我处理的）：原站 /finance/orderapply/list 行内 处理 */
  'orderapply-handle': [
    { key: 'handle', label: '处理', fields: [{ key: 'status', label: '处理结果', type: 'select', options: ['已通过', '已驳回', '已撤销'] }, { key: 'remark', label: '处理意见', type: 'textarea' }], msg: '已处理（本地）' },
  ],
  /* 抵扣（管理专用）：原站 /finance/deductionlog/checkedlist 行内 撤回(back) */
  'deduction-checked': [
    { key: 'back', label: '撤回', tone: 'red', fields: [{ key: 'back_remark', label: '撤回原因', type: 'textarea' }], msg: '已撤回（本地生效）' },
  ],

  /* 售后（我申请的）：原站 /customer/aftersalesservice/index 行内 导出信息报表 */
  after: [
    { key: 'exportInfoReport', label: '导出信息报表', tone: 'purple' },
  ],

  /* 样本：原站 /customer/sample/index 工具栏 + 行内 退回 / 责任人 / 测试盒责任人 */
  sample: [
    { key: 'getReturnData', label: '退回', fields: [{ key: 'return_num', label: '退回数量', type: 'number' }, { key: 'remark', label: '退回原因', type: 'textarea' }], msg: '已登记退回（本地）' },
    { key: 'custodian', label: '责任人', fields: [{ key: 'custodian', label: '责任人姓名' }], msg: '已设置责任人（本地）' },
    { key: 'test_kit_custodian', label: '测试盒责任人', fields: [{ key: 'test_kit_custodian', label: '测试盒责任人' }], msg: '已设置测试盒责任人（本地）' },
  ],

  /* 发票：原站 /finance/invoice/index 与 /list 行内 子单 */
  'invoice-my': [
    { key: 'children', label: '子单', tone: 'blue' },
  ],
  'invoice-handle': [
    { key: 'children', label: '子单', tone: 'blue' },
  ],

  /* 客户联系人：原站 /customer/contact/index 行内 发消息 */
  contact: [
    { key: 'send_msg', label: '发消息', fields: [{ key: 'content', label: '消息内容', type: 'textarea' }], msg: '已记录消息（本地）' },
  ],
};

/** 取某页的额外行操作 */
export function opsActions(module: string): OpAction[] {
  return OPS_ACTIONS[module] || [];
}

/** 本地 op_<key> 记录对应的操作名（详情页展示用） */
export function opActionLabel(key: string): string {
  for (const list of Object.values(OPS_ACTIONS)) {
    const hit = list.find((a) => a.key === key);
    if (hit) return hit.label;
  }
  return key;
}

/* ======================= 工具栏操作（对齐原站各页工具栏按钮） ======================= */

/**
 * 原站工具栏里的批量按钮（除 新增/刷新 外）。
 * kind: export=导出 CSV；record=写一条本地 op 记录；info=仅提示（原站该动作需服务端，本地模式降级）
 */
export type ToolAction = {
  key: string;
  label: string;
  tone?: 'blue' | 'red' | 'orange' | 'purple' | 'ghost';
  kind: 'export' | 'record' | 'info';
  /** record 类型要填的表单项 */
  fields?: EditField[];
  msg?: string;
};

export const OPS_TOOLBAR: Record<string, ToolAction[]> = {
  /* 样本管理：原站工具栏 导出数据 / 导出指南 / 导出状态数据 / 获取选中 / 清空选中 / 导入剩余样本 */
  sample: [
    { key: 'exportGuide', label: '导出指南', kind: 'info', msg: '样本导出指南：本地模式仅支持 CSV 导出（点上方「导出」）' },
    { key: 'exportStatusData', label: '导出状态数据', kind: 'export' },
    { key: 'getCheckData', label: '获取选中', kind: 'info', msg: '已勾选行的统计请在表格下方查看（本地模式）' },
    { key: 'clearCheckData', label: '清空选中', kind: 'info', msg: '已清空勾选' },
    { key: 'importRemainingSamples', label: '导入剩余样本', kind: 'info', msg: '导入涉及原站写入，本地模式不执行（未提交原站）' },
  ],
  /* 校展预名单：原站工具栏 导入 */
  school: [
    { key: 'import', label: '导入名单', kind: 'info', msg: '导入涉及原站写入，本地模式不执行（未提交原站）' },
  ],
  /* 到账（订单·我处理的）：原站工具栏 导出信息 / 导出核对 */
  'orderapply-handle': [
    { key: 'exportInfo', label: '导出信息', kind: 'export' },
    { key: 'exportcheck', label: '导出核对', kind: 'export' },
  ],
  /* 售后：原站工具栏 导出信息报表 */
  after: [
    { key: 'exportInfoReport', label: '导出信息报表', kind: 'export' },
  ],
  /* 客户联系人：原站可群发消息 */
  contact: [
    {
      key: 'batch_msg',
      label: '群发消息',
      kind: 'record',
      fields: [{ key: 'content', label: '消息内容', type: 'textarea' }],
      msg: '已记录群发消息（本地生效，未提交原站）',
    },
  ],
};

/** 取某页的额外工具栏按钮 */
export function opsToolbar(module: string): ToolAction[] {
  return OPS_TOOLBAR[module] || [];
}
