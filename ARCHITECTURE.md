# ARCHITECTURE.md — 架构决策

> 每条决策 = 一行理由。写决策，不写问题。

## 决策一览

| # | 决策项 | 结论 | 理由 |
|---|---|---|---|
| D1 | 技术栈 | **Vite 5 + React 18 + TypeScript** | 双端需要两套独立组件树，组件化是最直接的表达方式；Vite 产物为纯静态，满足 GitHub Pages 直托管 |
| D2 | 不用 SSR / 不用后端 | 纯静态 | 硬约束：GitHub Pages 只能托管静态文件 |
| D3 | 双端分离方式 | **`useDevice()` 钩子 + 两套独立组件树**（`src/mobile/` 与 `src/desktop/`），`App.tsx` 二选一渲染 | 「禁止只靠媒体查询把一套 DOM 挤成两副样子」——两套 DOM 各自独立，只在 `core/` 共享业务逻辑 |
| D4 | 断点 | `mobile ≤768px`，`desktop >768px`；常量 `BREAKPOINT.MOBILE_MAX = 768`，`matchMedia('(max-width: 768px)')` | 硬约束要求断点显式写入代码 |
| D5 | 样式组织 | `src/styles/tokens.css`（设计令牌）+ `mobile/mobile.css` + `desktop/desktop.css`，**各自独立、互不引用** | 视图层分离延伸到样式层，避免互相污染 |
| D6 | 移动端布局 | 顶栏(48px) + 滚动容器 + 底部 4 Tab(56px)，单列，`width:calc(100% - 24px)` | 逐条对齐 `style.css` 实测值 |
| D7 | 桌面端布局 | 左侧边栏(240px) + 顶栏(60px) + 内容区 `max-width:1200px`，主列表页为 **master-detail 双栏 / 工作台三栏** | 硬约束：多栏、宽容器 1100–1280px、桌面级导航、悬停态 |
| D8 | 桌面端去掉底部 Tab | 是，改为侧边栏 | 硬约束：「桌面端无手机端底部 Tab 栏残留」 |
| D9 | 上传服务 | **Cloudinary 免签上传（主）→ Uploadcare（次）→ Cloudflare R2 S3 兼容（三，需自部署 Worker 预签名）** | 三者都支持纯前端直传、无需自建后端；Cloudinary 的 `upload_preset` 与 Uploadcare 的 `pub_key` 本就是设计给前端暴露的，不含密钥 |
| D10 | 上传进度 | `XMLHttpRequest.upload.onprogress`（不用 fetch，fetch 无上传进度） | 需要真实进度反馈 |
| D11 | 转发 | `navigator.share({files})` → 降级 `navigator.share({url})` → 降级剪贴板复制 → 再降级 `execCommand` | 硬约束：Web Share API 优先，降级明确 |
| D12 | 多文件转发 | JSZip 前端打包成 zip 后走 Web Share | 对齐 APP 的 `shareZip` |
| D13 | 数据源 | **可插拔**：`core/api.ts` 依据 `VITE_OA_PROXY` 是否存在决定走「代理 → 真实后端」还是「内置演示数据集」 | 后端实测无 CORS，静态站必须能在无后端时完整可用 |
| D14 | 真实后端接入 | 附带 `workers/oa-proxy.js`（Cloudflare Worker），部署后填 `VITE_OA_PROXY` 即可 | 让「接真实后端」成为可选的一步配置，而非重构 |
| D15 | 会话存储 | localStorage 只存**会话标记 + 账号 + 收藏夹元数据（URL 字符串）** | 硬约束禁止用 localStorage 存文件字节 |
| D16 | 字体/尺寸 | 全部 `rem` / `clamp()`，容器用 `calc()` 与百分比，无固定 px 宽 | 硬约束：禁止固定宽度容器与 px 固定字体 |
| D17 | 点击区 | 手机端所有交互元素 `min-height/min-width: 44px` | 硬约束：≥44×44px |
| D18 | PDF / docx | pdf.js 与 docx-preview 从 `app-source/lib/` 复制到 `public/lib/`，同源加载 | 复用原 APP 已验证的渲染管线，行为一致 |
| D19 | 部署 | `.github/workflows/deploy.yml`：push main → `npm ci` → `npm run build` → upload-pages → deploy；`base` 由 `VITE_BASE` 注入 | GitHub Pages 官方推荐流程，支持项目页子路径 |
| D20 | 路由 | 不用 react-router，用 `history.pushState` + 前端导航栈 | 产物最简；且需精确控制返回栈（对齐 APP 的 `navStack`） |

---

## 目录结构

```
youpin-oa-web/
├─ .github/workflows/deploy.yml      # push main 自动构建发布
├─ .env.example                      # 上传服务凭证模板
├─ index.html                        # Vite 入口
├─ package.json  vite.config.ts  tsconfig.json  tsconfig.node.json
├─ workers/oa-proxy.js               # 可选：接真实 OA 后端的 CORS 代理
├─ public/
│  ├─ lib/pdf.min.js  pdf.worker.min.js  docx-preview.min.js  mammoth.min.js
│  ├─ data/demo.json                 # 内置演示数据集
│  └─ favicon.svg
└─ src/
   ├─ main.tsx
   ├─ App.tsx                        # 设备判定 → 渲染 MobileApp 或 DesktopApp
   ├─ core/                          # ===== 业务逻辑层（双端共享）=====
   │   ├─ types.ts                   # 领域类型
   │   ├─ breakpoint.ts              # 断点常量 + useDevice()
   │   ├─ config.ts                  # 环境变量读取（base / proxy / 上传凭证）
   │   ├─ api.ts                     # 数据源：proxy | demo
   │   ├─ upload.ts                  # 真实上传（Cloudinary / Uploadcare / R2）
   │   ├─ share.ts                   # 真实转发（Web Share / 剪贴板 / zip）
   │   ├─ session.ts                 # 会话、记住密码、收藏夹元数据
   │   ├─ filetype.ts                # 文件类型徽标（沿用 APP 的 FILE_TYPE_MAP）
   │   └─ util.ts                    # esc / fmtTime / fmtSize / toast 事件总线
   ├─ mobile/                        # ===== 手机端视图层（≤768px）=====
   │   ├─ MobileApp.tsx              # 登录 / 主壳 路由
   │   ├─ MobileShell.tsx            # 顶栏 + 容器 + 底部 Tab
   │   ├─ MobileLogin.tsx
   │   ├─ MobileHome.tsx
   │   ├─ MobileApprove.tsx
   │   ├─ MobileCustomer.tsx
   │   ├─ MobileMine.tsx
   │   ├─ MobileFiles.tsx            # ★ 上传
   │   ├─ MobileProduct.tsx          # ★ 说明书 预览/收藏/转发
   │   ├─ MobileNote.tsx  MobileArticle.tsx  MobileMessage.tsx  MobileMail.tsx
   │   └─ mobile.css
   ├─ desktop/                       # ===== 桌面端视图层（>768px）=====
   │   ├─ DesktopApp.tsx
   │   ├─ DesktopShell.tsx           # 侧边栏 + 顶栏 + 内容区
   │   ├─ DesktopLogin.tsx
   │   ├─ DesktopHome.tsx            # 三栏工作台
   │   ├─ DesktopApprove.tsx         # master-detail 双栏
   │   ├─ DesktopCustomer.tsx        # 筛选 + 列表 + 详情 三栏
   │   ├─ DesktopFiles.tsx           # 拖拽上传 + 文件表格
   │   ├─ DesktopProduct.tsx
   │   └─ desktop.css
   └─ styles/tokens.css              # 设计令牌（主色/间距/字号/圆角）
```

---

## 双端结构差异（关键，逐组件写明）

| 组件 | 手机端（≤768px） | 桌面端（>768px） |
|---|---|---|
| 导航 | 底部固定 4 Tab（56px）+ 顶栏 48px | 左侧边栏 240px（可折叠）+ 顶栏 60px；**无底部 Tab** |
| 容器 | 单列，`margin:10px 12px`，无 max-width | `max-width:1200px` 居中，多栏 grid |
| 首页 | 两段 4 列宫格（快捷审批 / 办公入口）+ 待办卡 | **三栏**：左=快捷审批，中=统计卡+待办，右=公告+消息 |
| 审批 | 分段控件 + 单列卡片列表，点进详情全屏 | **双栏 master-detail**：左列表（可滚动）+ 右详情面板；悬停高亮 |
| 客户 | 分段 + 搜索 + chips + 单列卡片 | **三栏**：左=筛选面板（常驻），中=列表，右=详情 |
| 附件 | 搜索 + 两个 44px 上传按钮 + 卡片列表 | **拖拽上传区（大热区）** + 文件**表格**（名称/大小/时间/操作列） |
| 交互 | 点击态 `:active`，触摸滚动 | **悬停态 `:hover`**（行高亮、按钮浮起、卡片阴影加深）+ 鼠标尺寸（32–40px 控件） |
| 转发 | 底部弹出分享面板（Web Share） | 模态：公网链接 + 复制链接 + 在浏览器打开 + 系统分享按钮 |

---

## 假设（信息不足时按最合理工程判断自行补全，记录于此）

- **A1｜无截图**：源码包内不含任何截图（仅有 launcher 图标）。手机端视觉参数（主色 `#1E6FFF`、顶栏 48px、Tab 56px、卡片 12px 圆角、宫格 4 列等）**全部从 `index.html` + `style.css` 反推**，与源码逐条对应。
- **A2｜后端无 CORS**：实测 `https://oa.upingbio.cn` 对带 `Origin` 的跨域请求返回 **403 且无任何 `Access-Control-Allow-Origin` 响应头**，因此判定浏览器无法直连。数据层默认走内置演示数据集；`VITE_OA_PROXY` + 附带 Worker 提供真实接入路径。
- **A3｜演示数据形状**：演示数据集按 `api.js` 中真实接口返回结构（`{code,msg,data,totalRow}`）与字段名（`create_time`、`goods_no`、`admin_name` 等）构造，保证真实接入时视图层零改动。
- **A4｜上传服务默认未配置**：Cloudinary / Uploadcare 需用户注册后填 env（免费额度足够）。未配置时 UI 明确显示「上传服务未配置」面板与获取途径，不假装成功、不崩溃。
- **A5｜部署形态**：默认按**项目页** `https://<user>.github.io/<repo>/` 处理，`base` 从 `VITE_BASE` 注入；若用自定义域名（CNAME）则设 `VITE_BASE=/`。已在 README 与 workflow 双向说明。
- **A6｜审批/客户等业务规模**：原 APP 的 `app.js` 有 6488 行、覆盖 40+ 子页面。本次重构按用户给定的核心场景（**浏览内容、上传文件、转发内容**）落地全部 4 个主 Tab + 高频子页（附件管理、产品管理、企业公告、问答知识、消息中心、通讯录），其余低频子页在桌面端侧边栏保留入口并明确标注「演示模式」。

