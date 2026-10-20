# INVENTORY.md — 优品OA APP 源码盘点

> 盘点对象：`./app-source/`（Android WebView 混合壳应用，包名 `com.uping.oa`）
> 真正的 UI 与业务逻辑全部在 `app/src/main/assets/www/`，Android 工程只是宿主壳 + 原生桥。

## 0. 源码构成

| 路径 | 行数 | 作用 |
|---|---|---|
| `assets/www/index.html` | 95 | 单页骨架：启动遮罩、登录页、主界面（顶栏 + 页面容器 + 底部 Tab） |
| `assets/www/css/style.css` | 743 | 全部样式（含 v1.1.55 起的多档媒体查询） |
| `assets/www/js/api.js` | 1077 | 后端接口封装，BASE = `https://oa.upingbio.cn` |
| `assets/www/js/app.js` | 6488 | 主逻辑：登录、Tab、全部页面渲染、上传、转发 |
| `assets/www/js/quote.js` | 932 | 产品报价表：勾选 → 改价 → 导出 Excel |
| `assets/www/js/doc.js` | 534 | 销售协议 docx 高保真渲染 + PDF 生成 |
| `assets/www/js/pdfview.js` | 386 | 内嵌 PDF 连续滚动阅读器（pdf.js） |
| `assets/www/js/approve_meta.js` | 1 (57KB) | 审批类型元数据 |
| `assets/www/lib/*` | — | pdf.js / mammoth / docx-preview / jszip / jspdf / xlsx / html2canvas |
| `java/com/uping/oa/MainActivity.java` | 1589 | WebView 宿主 + `AndroidBridge`（HTTP、上传、选文件、拍照、分享、下载、打包、消息轮询、提示音） |
| `java/com/uping/oa/ShareProvider.java` | — | `content://` 文件分享 Provider（Android 7+ 兼容） |
| `java/com/uping/oa/WebViewActivity.java` | — | 内嵌浏览器页（打开 OA 桌面版页面） |

**结论：这是一个「WebView 壳 + H5 业务」的混合应用。H5 部分本身就是网页，重构为静态站点的本质是「把原生桥依赖替换成浏览器能力」。**

---

## 1. 页面 / 视图清单

### 1.1 顶层结构
1. **启动遮罩** `#boot-splash`（蓝字「优品OA」+ 加载提示，初始化完成后移除，失败给重试入口）
2. **登录页** `#login-view`
3. **主界面** `#app-view` = 顶栏 + `#page-container` + 底部 Tab

### 1.2 底部 Tab（4 个，手机端固定）
| Tab | 图标（字符） | 文案 | 渲染函数 |
|---|---|---|---|
| home | `⌂` | 首页 | `renderHome()` (app.js:826) |
| approve | `✓` | 审批 | `renderApprove()` (app.js:2984) |
| customer | `☰` | 客户 | `renderCustomer()` (app.js:3208) |
| mine | `●` | 我的 | `renderMine()` (app.js:6147) |

### 1.3 首页（home）
- 「快捷审批」4 列宫格，8 项：请假🏖 / 出差✈ / 外出🏃 / 加班⏰ / 采购🛒 / 维修🔧 / 用章🔏 / 用车🚗
- 「办公入口」4 列宫格，28 项：企业公告📢、问答知识💬、AI问答🤖、产品管理🧪、附件管理📁、消息中心✉️、通讯录📇、发起审批📝、客户列表👥、工作台🏠、预存款💰、抵扣券🎫、保证金🛡️、发票申请🧾、发票处理🗂️、到账(发票)📊、到账(订单)📈、订单到账处理⚙️、客户联系人👤、销售机会🎯、跟进记录📝、我的订单📦、订单处理🔧、平台订单🛒、样本管理🧫、校展管理🏫、售后管理🔨、新增客户➕
- 「我的待办」2 张卡：待审审批 / 客户跟进

### 1.4 审批（approve）
- 分段控件：全部 / 待审批 / 已通过 / 已拒绝（`data-s` 0/1/2/3）
- 列表卡片 + 状态标签（待审批黄 / 通过绿 / 拒绝红）+ 通过/拒绝按钮
- 发起审批表单、审批详情（流程节点、备注、通过/拒绝）

### 1.5 客户（customer）
- 分段控件：我的客户 / 公海 / 废弃
- 搜索栏 + 筛选按钮（带红点角标）
- 快捷筛选 chips + 已选筛选 chips
- 客户卡片（名称 + 等级徽标 + 标签 + 联系人/电话行 + 底部时间）
- 「客户功能」宫格 9 项：联系人、销售机会、跟进记录、我的订单、订单处理、平台订单、样本管理、校展管理、售后管理

### 1.6 我的（mine）
- 渐变头部（姓名 + 账号）
- 分组菜单：财务管理（8 项）、常用功能（6 项）、账号（退出登录）
- 底部版本号

### 1.7 办公入口子页面（`showSubPage`，顶栏出现「‹ 返回」）
企业公告、问答知识、产品管理、附件管理、消息中心（收/发/草稿/回收站）、通讯录、基本资料、修改密码、客户联系人、销售机会、跟进记录、我的订单、订单处理、平台订单、样本管理、校展管理、售后管理、新增客户，以及财务 9 项（预存款/抵扣券×2/保证金/发票×2/到账×2/订单到账处理）

### 1.8 详情页壳 / 弹层
- 通用详情页壳（返回栈 `navStack`）
- 自定义弹层替代原生 `confirm/prompt`（`uiConfirm` / `uiPrompt` / 底部选择面板）
- 底部弹出面板：分类树多选、客户筛选抽屉、合同选择器、人员选择器、文件夹选择、Excel 预览
- PDF 全屏阅读器（`.pdf-view`，深色底 `#33363d`，顶栏 + 底栏工具）
- 收藏夹文件夹：左滑露出「重命名 / 删除」

---

## 2. 功能清单（按约束 2 三分法标注）

| # | 功能 | 分类 | 说明 |
|---|---|---|---|
| 1 | 账号密码 + 算式验证码登录 | **需第三方前端可调用服务**（后端无 CORS） | 后端 `oa.upingbio.cn` 无任何 `Access-Control-Allow-Origin`，浏览器不能直连 → 需 CORS 代理；否则降级本地会话 |
| 2 | 浏览列表（审批/客户/产品/公告/问答/附件/订单…） | **浏览器原生可替代** | 数据源换成静态 JSON 或经代理的接口 |
| 3 | 搜索 / 分段筛选 / 抽屉筛选 | **浏览器原生可替代** | 纯前端状态 |
| 4 | **文件上传（选文件）** | **需第三方前端可调用服务** | 原：`AndroidBridge.pickFiles` → 浏览器用 `<input type="file">` + 拖拽 |
| 5 | **文件上传（拍照）** | **浏览器原生可替代** | `<input type="file" accept="image/*" capture="environment">`（移动端直接调相机） |
| 6 | **上传落盘并拿 URL** | **需第三方前端可调用服务** | 原：`AndroidBridge.uploadFileBase64` → multipart 打到 `/api/index/upload`。静态站无自建后端 → 改用 Cloudinary 免签上传 / Cloudflare R2（S3 兼容） |
| 7 | **转发（文件）** | **浏览器原生可替代** | 原：`AndroidBridge.shareFile(url,name)` 下载后系统分享 → `navigator.share({files})`，降级：可分享 URL + 复制 |
| 8 | **转发（文本/链接）** | **浏览器原生可替代** | `navigator.share({title,text,url})`，降级 `navigator.clipboard.writeText` |
| 9 | 多文件打包 zip 转发 | **浏览器原生可替代** | 原：`AndroidBridge.shareZip` 原生打包 → 浏览器用 JSZip 打包后走 Web Share |
| 10 | 文件下载到本机 | **浏览器原生可替代** | `<a download>` / Blob |
| 11 | PDF 内嵌预览 | **浏览器原生可替代** | 原 pdf.js 渲染 canvas → 浏览器直接用 pdf.js（同源 CDN 或本地 lib）+ `<iframe>` |
| 12 | docx 高保真预览 | **浏览器原生可替代** | 原 mammoth / docx-preview → 浏览器同样可用 |
| 13 | 导出 Excel / 导出 PDF | **浏览器原生可替代** | SheetJS / jsPDF + html2canvas，纯前端 |
| 14 | 记住账号密码 | **浏览器原生可替代** | localStorage（仅账号密码，不存文件） |
| 15 | 收藏夹（文件夹 + 左滑操作） | **浏览器原生可替代** | localStorage 存**元数据**（id/名称/URL），不存文件字节 |
| 16 | 消息未读轮询 + 响铃 + 震动 | **部分可替代** | 轮询 → `setInterval` 或 `visibilitychange` 时拉取；响铃 → Web Audio；**震动**：`navigator.vibrate` 仅 Android Chrome 支持，iOS Safari 不支持 → 降级仅响铃/角标 |
| 17 | 消息提示音 | **浏览器原生可替代** | Web Audio 播放内置音频 |
| 18 | 物理返回键 | **浏览器原生可替代** | `history.pushState` + `popstate` |
| 19 | Toast 提示 | **浏览器原生可替代** | 自绘 toast |
| 20 | 打开外部链接 / 系统浏览器 | **浏览器原生可替代** | `window.open` / `<a target="_blank">` |
| 21 | 调用系统应用打开 Office 文件（WPS） | **纯静态架构下无法实现** | 浏览器只能下载或跳转 Office Online 查看器 |
| 22 | 写入公共 Download/优品OA 目录 | **纯静态架构下无法实现** | 浏览器沙箱无法指定系统目录；降级为普通下载到浏览器默认目录 |
| 23 | 桌面版内嵌页（`/home/index/main.html`） | **纯静态架构下无法实现**（需登录会话 + 无 CORS） | 降级：本站桌面端视图即为「桌面版」 |
| 24 | 剪贴板复制（复制勾选、复制文本） | **浏览器原生可替代** | `navigator.clipboard`，降级 `document.execCommand` |
| 25 | 省市区三级联动 | **浏览器原生可替代** | 本地静态行政区划数据 |

---

## 3. 手机端关键视觉参数

> 说明：源码包内**不含截图**，以下参数全部从 `index.html` + `style.css` 反推（与代码逐条对应）。

### 3.1 色彩
| 用途 | 值 |
|---|---|
| **主色** | `#1E6FFF` |
| 主色浅（渐变另一端） | `#4A9BFF` |
| 页面背景 | `#f5f6f8` |
| 卡片背景 | `#fff` |
| 主文字 | `#333` / `#1f2329` |
| 次要文字 | `#8a8f99` / `#4e5969` |
| 分割线 | `#e8ecf2` / `#f2f4f8` |
| 成功 | `#52c41a` / `#07c160` / `#00b42a` |
| 警告 | `#d48806` / `#ff9500` |
| 危险 | `#ff4d4f` / `#f53f3f` |
| 未读角标 | `#FF3B30` |
| 报价强调 | `#f59e0b` / 绿 `#22c55e` |

### 3.2 字体层级
| 位置 | 字号 |
|---|---|
| 登录 Logo | 38px（其中「OA」26px，白底蓝字圆角胶囊） |
| 顶栏标题 | 17px / 600 |
| 卡片标题 | 15px / 600 |
| 正文 | 14px |
| 次要行 | 13px |
| Tab 文案 | 11px |
| 表单输入 | 15–16px |

### 3.3 尺寸 / 圆角
| 组件 | 参数 |
|---|---|
| 顶栏 | min-height 48px，`padding-top: env(safe-area-inset-top)` |
| 底部 Tab 栏 | height 56px，`padding-bottom: env(safe-area-inset-bottom)`，上边框 1px |
| 卡片 | `margin:10px 12px`；`border-radius:12px`；`box-shadow:0 1px 4px rgba(0,0,0,.05)` |
| 登录表单卡 | `width:84%; max-width:400px; border-radius:18px` |
| 登录按钮 | `border-radius:12px; padding:13px 0; letter-spacing:4px` |
| 宫格 | `grid-template-columns:repeat(4,1fr)`；≥600px 变 6 列 |
| 上传按钮 | **height 44px**（`.att-btn`）— 满足 ≥44×44 |
| 分段控件 | `background:#eef1f5; border-radius:10px; padding:3px` |
| 头像节点 | 34px 圆形 |

### 3.4 导航模式
- 手机端：**底部固定 4 Tab**（首页/审批/客户/我的）+ 顶栏（标题 + 🔔 铃铛带角标 + 「桌面版」按钮）+ 子页面顶栏左侧「‹ 返回」
- 顶栏主色实色，Tab 栏白底

### 3.5 断点（源码已有）
- `max-width:360px`：缩小标签宽度、宫格 3 列
- `min-width:600px`：宫格 6 列，容器 `max-width:640px` 居中
- `orientation:landscape and max-height:480px`：压缩顶栏/Tab
- `max-width:370px`：PDF 工具按钮、客户卡片微调
- 容器宽度限制用 `width:calc(100% - 24px)`，无 px 固定宽

---

## 4. 上传与转发的源码触发路径

### 4.1 上传
```
UI: 附件管理页 renderFilesPage() (app.js:2723)
    .att-btn.att-btn-main  → App.pickFilesUpload(false)   「＋ 上传文件」
    .att-btn.att-btn-ghost → App.pickFilesUpload(true)    「📷 拍照上传」

↓ pickFilesUpload(camera)  (app.js:~1100)
    pickFile(cb, accept, multiple, camera)
      原生路径： API.pickFilesNative(accept, multiple)
                → AndroidBridge.pickFiles(accept, multiple, cbId)
                → ACTION_GET_CONTENT / EXTRA_ALLOW_MULTIPLE
                → 读字节 → base64 → {files:[{name,size,b64}], skipped:[]}
      拍照路径： API.pickCameraNative() → AndroidBridge.pickCamera

↓ onFilesUploadPicked(list)  (app.js:~1105)
    校验：扩展名 ∈ APPROVE_FILE_EXTS(17 种)；size ≤ APPROVE_FILE_MAX = 10MB
    → API.uploadFileBase64(b64, name, '/api/index/upload', 'file')
    → AndroidBridge.uploadFileBase64Async → multipart POST（带 Cookie + X-Requested-With）
    → 返回 {code:0, data:{id, filepath, name, filesize, fileext}}
    → App.loadFiles() 刷新列表
```
其他上传入口：审批表单附件（`.att-row` / `afterPickFiles` / `afterDelFile`）、售后申请附件。

### 4.2 转发
```
单个说明书： App.shareDoc(gi, id)                     (app.js:2594)
收藏夹单个： App.shareFavDoc(i, folderId)             (app.js:~2606)
勾选转发  ： App.shareChecked(folderId)               (app.js:2689)
打包转发  ： App.sharePackFav(folderId)               (app.js:2709)
订单附件  ： App.shareOrderFile(url, name)            (app.js:4409)
合同 PDF  ： AndroidBridge.shareBase64File(...)

统一落点：
  AndroidBridge.shareFile(url, name)
      → 子线程 downloadToFile(url)（带 Referer + Cookie，防盗链）
      → ShareProvider content:// URI
      → Intent.ACTION_SEND + createChooser「转发说明书」
  AndroidBridge.shareZip(jsonList, zipName)
      → 逐份下载 → ZipOutputStream → ACTION_SEND「勾选转发 / 文件夹打包」
```
