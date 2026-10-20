# PROGRESS.md — 实现进度

> 按约束 3：每完成一页/一功能打勾。双端视图分离，手机端先行并对照源码校验，再实现桌面端。

## Phase A 盘点

- [x] `INVENTORY.md` — 页面/视图清单（35 个文件全部读过：index.html、style.css、api.js、app.js 结构、MainActivity.java、doc.js）、功能清单（26 项按三分法标注）、手机端关键视觉参数（主色/字号/圆角/断点/导航模式）、上传与转发的源码触发路径
- [x] `CAPABILITY_MAP.md` — `AndroidBridge` 全部 26 个方法逐项映射 + 上传链路 + 转发链路 + 纯静态无法实现的 6 项（L-1～L-6）及降级

## Phase B 架构决策

- [x] `ARCHITECTURE.md` — 20 条决策 + 目录结构 + 双端结构差异表 + 6 条假设（A1～A6）
- [x] 工程脚手架：Vite 5 + React 18 + TypeScript，`npm install` 成功

## Phase C 实现

### 共享业务逻辑层（src/core）
- [x] `breakpoint.ts` — 断点常量 `MOBILE_MAX = 768` + `useDevice()`
- [x] `config.ts` — 环境变量读取 + 已配置上传提供方优先级 + 凭证获取途径文案
- [x] `types.ts` — 领域类型（字段名沿用真实接口：`create_time`/`goods_no`/`admin_name`…）
- [x] `demoData.ts` — 演示数据集（8 产品/12 客户/10 审批/6 公告/6 问答/6 消息/8 通讯录/3 附件）
- [x] `api.ts` — 数据源双模式（`VITE_OA_PROXY` → 真实后端；否则演示数据）+ 上传附件元数据持久化
- [x] `upload.ts` — ★ 真实上传：三提供方（Cloudinary/Uploadcare/R2 预签名）+ XHR 真实进度 + 批量串行 + `UploadUnconfiguredError` 明确降级
- [x] `share.ts` — ★ 真实转发：Web Share(files/url) → 剪贴板 → execCommand → 下载 四级降级 + JSZip 打包多文件转发 + Office Online 查看器
- [x] `session.ts` — 会话/记住密码/收藏夹（只存元数据与公网 URL）
- [x] `filetype.ts` `util.ts` — 文件类型徽标、校验（沿用 APP 的 17 种扩展名 + 10MB 上限）、下载、toast 总线

### 手机端（≤768px，复刻 APP）
- [x] `mobile.css` — 逐条对齐 `style.css`：主色 `#1E6FFF`、顶栏 48px、Tab 56px、卡片 12px 圆角、宫格 4 列、分段控件、客户卡片、附件按钮 44px、底部面板、Toast、安全区、360px/横屏断点
- [x] `MobileLogin.tsx` — 渐变背景 + Logo + 三字段 + 算式验证码 + 记住密码 + 版本号（对齐 `#login-view`）
- [x] `MobileHome.tsx` — 快捷审批宫格(8) + 办公入口宫格(16) + 我的待办（对齐 `renderHome` 顺序）
- [x] `MobileApprove.tsx` — 分段(全部/待审批/已通过/已拒绝) + 列表卡 + 详情(流程节点/通过/拒绝)（对齐 `renderApprove`）
- [x] `MobileCustomer.tsx` — 分段(我的客户/公海/废弃) + 搜索 + 等级 chips + 客户卡 + 客户功能宫格(8)（对齐 `renderCustomer`）
- [x] `MobileMine.tsx` — 渐变头部 + 财务菜单(9) + 常用功能 + 账号 + 版本号 + 上传服务状态（对齐 `renderMine`）
- [x] `MobileFiles.tsx` — ★ 上传文件 / 📷 拍照上传（44px 按钮）+ 真实上传进度 + 打开/转发/下载/移除 + 未配置降级面板
- [x] `MobileProduct.tsx` — ★ 产品列表 + 详情 + 说明书 预览/收藏/转发/打包转发 + 收藏夹选择面板
- [x] `MobileContent.tsx` — 企业公告 / 问答知识 / 消息中心 / 通讯录 + 演示占位页
- [x] `MobileApp.tsx` — 顶栏(铃铛+桌面版) + 容器 + 底部 4 Tab + 子页返回 + Toast

### 桌面端（>768px，独立设计）
- [x] `desktop.css` — 侧边栏 240px + 顶栏 60px + `max-width:1200px` + 三栏/双栏 grid + 悬停态 + 拖拽区 + 表格 + 登录左右分栏；**无底部 Tab**
- [x] `DesktopLogin.tsx` — 左右分栏登录（与手机端两套独立视图）
- [x] `DesktopHome.tsx` — 三栏工作台（左：快捷审批+入口 / 中：统计4卡+待办 / 右：公告+消息）
- [x] `DesktopApprove.tsx` — master-detail 双栏 + 意见输入 + 确认模态
- [x] `DesktopCustomer.tsx` — 三栏（左常驻筛选 / 中列表 / 右详情）
- [x] `DesktopFiles.tsx` — ★ 拖拽上传区 + 真实上传进度 + 文件表格 + 批量打包转发 + 转发模态（复制链接/系统分享/浏览器打开）
- [x] `DesktopProduct.tsx` — 左列表/右详情 + 说明书 预览/收藏/转发/打包转发
- [x] `DesktopContent.tsx` — 公告/问答/消息（双栏）/ 通讯录（表格）/ 演示占位
- [x] `DesktopApp.tsx` — 侧边栏导航(分 4 组) + 顶栏(搜索/铃铛/用户菜单) + 内容区 + 手机版切换

### 工程与部署
- [x] `scripts/gen-demo-assets.mjs` — 生成 16 份真实 PDF 说明书 + 真实 xlsx + favicon
- [x] `.github/workflows/deploy.yml` — push main 自动构建发布（官方 Actions）
- [x] `.env.example` + `workers/oa-proxy.js`（CORS 代理 + AWS SigV4 预签名）
- [x] `README.md` — Quick Start / 凭证配置 / 部署步骤 / 已知限制 / 自检结果

## Phase D 自检

- [x] `scripts/verify.mjs` 无头 Chrome 实测，**28/28 通过**（截图在 `verify-shots/`）
- [x] 修复 1：未配置上传服务的提示改为**进页面即显示**（原来只在点击后出现）
- [x] 修复 2：`tsconfig.node.json` 的 emit 配置冲突

## Phase E 交付

- [x] `deploy.yml` 语法正确，含 `VITE_BASE` 子路径说明与 CNAME 说明
- [x] README 含 Quick Start / 凭证配置 / GitHub Pages 部署步骤 / 已知限制
- [x] **项目已可运行**
