/** 领域类型。字段命名沿用 app-source/js/api.js 的真实接口返回，保证接真实后端时视图层零改动。 */

export interface ApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
  totalRow?: Record<string, string>;
}

/** 附件（/home/files/index 返回项 + /api/index/upload 返回项） */
export interface Attachment {
  id: string;
  name: string;
  /** 公网可访问地址（真实上传服务给出） */
  url: string;
  filepath?: string;
  filesize: number;
  fileext: string;
  create_time: string | number;
  admin_name?: string;
  group_title?: string;
  /** 本地上传的 File 对象句柄：仅本次会话内存持有，用于直接 Web Share，不持久化 */
  _file?: File;
}

/** 审批（/oa/approve/index） */
export interface ApproveItem {
  id: string;
  title: string;
  type_name: string;
  /** 0全部 1待审批 2通过 3拒绝（APP 的 data-s 映射） */
  status: 0 | 1 | 2 | 3;
  admin_name: string;
  create_time: string | number;
  content?: string;
  remark?: string;
  flow?: FlowNode[];
}

export interface FlowNode {
  name: string;
  /** ok | wait | no */
  state: 'ok' | 'wait' | 'no';
  admin_name?: string;
  time?: string;
  remark?: string;
}

/** 客户（/customer/index/index） */
export interface Customer {
  id: string;
  name: string;
  /** deal 成交 | lead 线索 | sleep 沉睡 | normal 常规 */
  grade: 'deal' | 'lead' | 'sleep' | 'normal';
  grade_text: string;
  contact?: string;
  tel?: string;
  source?: string;
  intent?: number;
  status?: number;
  has_wechat?: boolean;
  admin_name?: string;
  create_time: string | number;
  last_time?: string | number;
  address?: string;
  remark?: string;
}

/** 产品（/product/index/list） */
export interface Product {
  id: string;
  title: string;
  goods_no: string;
  cate_title?: string;
  price_desc?: string;
  specs?: string;
  unit?: string;
  species?: string;
  application?: string;
  brand?: string;
  stock?: string;
  create_time: string | number;
  content?: string;
  /** 说明书列表（APP 的 goods_no_list） */
  goods_no_list?: DocRef[];
}

export interface DocRef {
  goods_no: string;
  goods_no_url?: string;
  pc_goods_no_url?: string;
}

/** 公告（/note/index/index） */
export interface Note {
  id: string;
  title: string;
  cate_title?: string;
  admin_name?: string;
  create_time: string | number;
  content?: string;
}

/** 问答知识（/article/index/index） */
export interface Article {
  id: string;
  title: string;
  cate_title?: string;
  create_time: string | number;
  content?: string;
}

/** 消息（/message/index/{inbox|sendbox|draft|rubbish}） */
export interface Message {
  id: string;
  title: string;
  from_name?: string;
  to_name?: string;
  create_time: string | number;
  is_read?: boolean;
  content?: string;
}

/** 通讯录（/home/index/mail_list） */
export interface MailContact {
  id: string;
  name: string;
  department?: string;
  position?: string;
  tel?: string;
  mobile?: string;
  email?: string;
}

/** 收藏夹文件夹（元数据，只存 URL 字符串，绝不存文件字节） */
export interface FavFolder {
  id: string;
  name: string;
  docs: FavDoc[];
  create_time: number;
}

export interface FavDoc {
  id: string;
  /** 说明书名称，形如「货号-标题.pdf」 */
  name: string;
  /** 公网可访问地址 */
  url: string;
  productId?: string;
  add_time: number;
}

/** 会话 */
export interface Session {
  username: string;
  displayName: string;
  loginAt: number;
}

/** 上传进度回调 */
export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}
