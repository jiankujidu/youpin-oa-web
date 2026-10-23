/**
 * 业务表格「行操作 / 工具栏」→ 原站真实接口映射。
 *
 * 来源：scripts/extract-ops.mjs 从 origin-snapshot/*.html 的
 *   table.on('tool'/'toolbar') handler 中自动提取的 tool.post / tool.delete / tool.side 端点。
 *
 * 每个 event 的真实行为：
 *   - { kind:'delete', url }  → POST url + {id}            （删除类）
 *   - { kind:'post',   url }  → POST url + {id}            （移库/分配/领取/撤回等）
 *   - { kind:'flow',   check }→ POST /api/index/flow_check （审批通过/拒绝/撤回）
 *   - { kind:'view' }         → 弹出行数据详情（本地渲染，与原站 side 详情一致）
 *   - { kind:'form',  url, save } → 抓取原站表单片段 / 用列字段渲染编辑-添加弹窗，提交到 save（默认 url 去参）
 *   - { kind:'export' }       → 前端把当前页数据导出 CSV
 *
 * 这是「功能要都能用」的落地：按钮全部真实提交原站，不再有「本地模式」假提示。
 */
import type { PageSpec } from './pageSpecs';

export type OpDef =
  | { kind: 'delete'; url: string; confirm: string }
  | { kind: 'post'; url: string; confirm: string }
  | { kind: 'flow'; check: '1' | '2' | '3'; confirm: string; needContent: boolean }
  | { kind: 'view' }
  | { kind: 'form'; url: string; save?: string; title: string }
  | { kind: 'export' };

/** file(快照文件名) → { 行操作event, 工具栏event } → OpDef */
export const OP_API: Record<string, { tool?: Record<string, OpDef>; toolbar?: Record<string, OpDef> }> = {
  'advancedeposit.html': {
    tool: { view: { kind: 'view' } },
    toolbar: {
      add: { kind: 'form', url: '/finance/advancedepositlog/add', title: '添加预存款记录' },
      export: { kind: 'export' },
    },
  },
  'aftersale.html': {
    tool: {
      view: { kind: 'view' },
      edit: { kind: 'form', url: '/customer/aftersalesservice/add', title: '编辑售后' },
    },
  },
  'approve.html': {
    tool: {
      view: { kind: 'view' },
      reapply: { kind: 'form', url: '/oa/approve/add', title: '重申审批' },
      del: { kind: 'delete', url: '/oa/approve/delete', confirm: '确定删除该审批单？' },
    },
    toolbar: { add: { kind: 'form', url: '/oa/approve/add', title: '发起审批' } },
  },
  'article.html': {
    tool: {
      edit: { kind: 'form', url: '/article/index/listadd', title: '编辑问答' },
      del: { kind: 'delete', url: '/article/index/listdelete', confirm: '确定删除该问答？' },
    },
    toolbar: { export: { kind: 'export' } },
  },
  'contact.html': {
    tool: {
      edit: { kind: 'form', url: '/customer/contact/add', title: '编辑联系人' },
      view: { kind: 'view' },
      del: { kind: 'delete', url: '/customer/contact/contact_del', confirm: '确定删除该联系人？' },
    },
  },
  'customer-sea.html': {
    tool: {
      view: { kind: 'view' },
      edit: { kind: 'form', url: '/customer/index/add', title: '编辑客户' },
      distribute: { kind: 'post', url: '/customer/api/distribute', confirm: '确定分配该客户？' },
      get: { kind: 'post', url: '/customer/index/get', confirm: '确定领取该客户？' },
      del: { kind: 'delete', url: '/customer/index/to_trash', confirm: '确定将该客户转入废弃池？' },
    },
    toolbar: { add: { kind: 'form', url: '/customer/index/add?sea=1', title: '添加公海客户' } },
  },
  'customer-trash.html': {
    tool: {
      view: { kind: 'view' },
      back: { kind: 'post', url: '/customer/index/revert', confirm: '确定拉回公海？' },
      del: { kind: 'delete', url: '/customer/index/delete', confirm: '确定彻底删除该客户？' },
    },
  },
  'customer.html': {
    tool: {
      edit: { kind: 'form', url: '/customer/index/add', title: '编辑客户' },
      view: { kind: 'view' },
      remove: { kind: 'post', url: '/customer/index/to_sea', confirm: '确定将该客户移入公海？' },
    },
    toolbar: { add: { kind: 'form', url: '/customer/index/add', title: '新增客户' } },
  },
  'deduction-checked.html': {
    tool: { view: { kind: 'view' } },
    toolbar: { export: { kind: 'export' } },
  },
  'deduction.html': {
    tool: {
      view: { kind: 'view' },
      edit: { kind: 'form', url: '/finance/deductionlog/add', title: '编辑抵扣券' },
      del: { kind: 'delete', url: '/finance/deductionlog/delete', confirm: '确定删除该抵扣券记录？' },
    },
    toolbar: { add: { kind: 'form', url: '/finance/deductionlog/add', title: '添加抵扣券记录' }, export: { kind: 'export' } },
  },
  'income-invoice.html': {
    tool: {
      add: { kind: 'form', url: '/finance/income/add', title: '到账管理' },
      view: { kind: 'view' },
    },
    toolbar: { add: { kind: 'form', url: '/finance/income/add', title: '到账管理' } },
  },
  'invoice-handle.html': { tool: { view: { kind: 'view' } } },
  'margindeposit.html': {
    tool: {
      view: { kind: 'view' },
      edit: { kind: 'form', url: '/finance/margindepositlog/add', title: '编辑保证金' },
      del: { kind: 'delete', url: '/finance/margindepositlog/delete', confirm: '确定删除该保证金记录？' },
    },
    toolbar: { add: { kind: 'form', url: '/finance/margindepositlog/add', title: '添加保证金记录' }, export: { kind: 'export' } },
  },
  'message.html': {
    tool: {
      del: { kind: 'delete', url: '/message/index/check', confirm: '确定删除该消息？' },
      view: { kind: 'view' },
      reply: { kind: 'form', url: '/message/index/reply', title: '回复消息' },
      resend: { kind: 'form', url: '/message/index/reply?type=2', title: '转发消息' },
    },
    toolbar: { add: { kind: 'form', url: '/message/index/add', title: '发送消息' } },
  },
  'note.html': {
    tool: {
      edit: { kind: 'form', url: '/note/index/add', title: '编辑公告' },
      del: { kind: 'delete', url: '/note/index/delete', confirm: '确定删除该公告？' },
    },
    toolbar: { add: { kind: 'form', url: '/note/index/add', title: '添加公告' } },
  },
  'order-apply.html': {
    tool: {
      view: { kind: 'view' },
      edit: { kind: 'form', url: '/customer/order/add', title: '编辑订单' },
      pay_record: { kind: 'form', url: '/customer/order/payrecord', title: '付款记录' },
      repurchase: { kind: 'form', url: '/customer/order/add', title: '复购' },
    },
    toolbar: { add: { kind: 'form', url: '/customer/order/add', title: '新建订单' } },
  },
  'order-handle.html': { tool: { view: { kind: 'view' } } },
  'orderapply-apply.html': {
    tool: {
      view: { kind: 'view' },
      edit: { kind: 'form', url: '/finance/orderapply/add', title: '编辑到账/退款' },
      del: { kind: 'delete', url: '/finance/orderapply/delete', confirm: '确定删除该到账/退款申请？' },
    },
    toolbar: { add: { kind: 'form', url: '/finance/orderapply/add', title: '到账/退款申请' } },
  },
  'orderapply-handle.html': { tool: { view: { kind: 'view' } }, toolbar: { exportcheck: { kind: 'export' } } },
  'product.html': {
    tool: {
      edit: { kind: 'form', url: '/product/index/add', title: '编辑产品' },
      del: { kind: 'delete', url: '/product/index/delete', confirm: '确定删除该产品？' },
      copy: { kind: 'form', url: '/product/index/add', title: '复制产品' },
    },
    toolbar: { add: { kind: 'form', url: '/product/index/add', title: '新增产品' } },
  },
  'sample.html': {
    tool: { del: { kind: 'delete', url: '/customer/sample/delete', confirm: '确定删除该样本？' } },
  },
  'schoolexhibition-handle.html': { tool: { view: { kind: 'view' } } },
  'schoolexhibition.html': {
    tool: {
      view: { kind: 'view' },
      edit: { kind: 'form', url: '/customer/schoolexhibition/add', title: '编辑校展' },
      del: { kind: 'delete', url: '/customer/schoolexhibition/delete', confirm: '确定删除该校展？' },
    },
    toolbar: { add: { kind: 'form', url: '/customer/schoolexhibition/add', title: '新增校展' } },
  },
  'chance.html': {
    tool: {
      view: { kind: 'view' },
      edit: { kind: 'form', url: '/customer/index/add', title: '编辑销售机会' },
      del: { kind: 'delete', url: '/customer/chance/chance_del', confirm: '确定删除该销售机会？' },
    },
    toolbar: { add: { kind: 'form', url: '/customer/chance/add', title: '新增销售机会' } },
  },
  'trace.html': {
    tool: {
      view: { kind: 'view' },
      edit: { kind: 'form', url: '/customer/trace/add', title: '编辑跟进' },
      del: { kind: 'delete', url: '/customer/api/del_trace', confirm: '确定删除该跟进记录？' },
    },
  },
  'invoice-apply.html': {
    tool: {
      view: { kind: 'view' },
      edit: { kind: 'form', url: '/finance/invoice/add?flagtype=2', title: '编辑发票' },
      del: { kind: 'delete', url: '/finance/invoice/delete', confirm: '确定删除该发票？' },
    },
    toolbar: { add: { kind: 'form', url: '/finance/invoice/add', title: '申请发票' } },
  },
};

/** 取某页某 event 的操作定义；file 取 spec.file（如 "customer.html"） */
export function resolveOp(spec: PageSpec | null, event: string, zone: 'tool' | 'toolbar' = 'tool'): OpDef | null {
  if (!spec) return null;
  const entry = OP_API[spec.file];
  if (!entry) return null;
  return (zone === 'tool' ? entry.tool : entry.toolbar)?.[event] || null;
}
