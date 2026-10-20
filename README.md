# 优品OA 静态网站

把「优品OA 手机 APP」（WebView 混合壳，源码在 `../app-source/`）重构为纯静态网站：

- **手机端（≤768px）**：逐屏复刻 APP 的 UI——顶栏、单列卡片、底部 4 Tab、主色 `#1E6FFF`
- **桌面端（>768px）**：按桌面习惯重新设计——左侧边栏 + 顶栏 + 多栏内容区（max-width 1200px），**没有**底部 Tab
- **两套完全独立的视图组件**，不是一套 DOM 靠媒体查询硬挤
- **上传与转发都是真实操作**：文件真实上传到第三方对象存储并返回公网 URL；转发真实调用 Web Share API（降级剪贴板）

---

## Quick Start

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # 产物在 dist/，纯静态，可直接托管
npm run preview
```

内置演示账号：任意账号 + 密码 ≥4 位 + 算式验证码（登录页点击图片可刷新）。

---

## 上传服务凭证配置

静态站没有自建后端，文件必须传到**前端可直接调用**的第三方对象存储。支持三个提供方，**按以下优先级自动尝试**，配几个用几个：

| 优先级 | 提供方 | 需要的变量 | 获取途径 |
|---|---|---|---|
| ① | **Cloudinary**（推荐） | `VITE_CLOUDINARY_CLOUD` + `VITE_CLOUDINARY_PRESET` | 注册 [cloudinary.com](https://cloudinary.com) → Dashboard 复制 **Cloud Name** → Settings ▸ Upload ▸ Upload presets → 新建 preset，**Signing Mode = Unsigned** → 复制 preset 名 |
| ② | **Uploadcare** | `VITE_UPLOADCARE_PUB_KEY` | 注册 [uploadcare.com](https://uploadcare.com) → 项目 Dashboard ▸ API keys → 复制 **Public Key** |
| ③ | **Cloudflare R2 / S3** | `VITE_R2_PRESIGN_URL` | Cloudflare R2 开一个公开读 bucket → 部署 `workers/oa-proxy.js`（内含 `/presign`）→ 填该 Worker 的 `/presign` 地址 |

> 以上三项都是**设计给前端暴露的凭据**（Public Key / Unsigned Preset / Worker 签名端点），不是密钥，可以安全放进前端环境变量。真正的密钥只存在于 Cloudflare Worker 侧。

### 怎么配

**本地开发**：复制 `.env.example` 为 `.env.local`，填入变量后 `npm run dev`。

**GitHub Pages**：仓库 **Settings → Secrets and variables → Actions → Variables** 里加同名变量（不是 Secrets，Vite 构建期需要读取），workflow 会自动注入。变量名清单见 `.env.example`。

### 没配凭证会怎样

**不会假装成功，也不会崩溃。** 附件页会显示红色提示面板，写明「上传服务未配置」、需要哪几个变量、去哪里获取；点上传按钮会收到明确提示。上传按钮不做任何假请求、不往 localStorage 塞文件字节。

---

## GitHub Pages 部署步骤

`.github/workflows/deploy.yml` 已就绪，push 到 `main` 自动构建发布。

### 1. 建仓库并推送

```bash
git init
git add .
git commit -m "init: 优品OA 静态网站"
git branch -M main
git remote add origin https://github.com/<你的用户名>/youpin-oa-web.git
git push -u origin main
```

### 2. 开启 Pages（Source 选 GitHub Actions）

仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
（workflow 里用的是官方的 `actions/upload-pages-artifact` + `actions/deploy-pages`，所以 Source 必须是 GitHub Actions，不能选 "Deploy from a branch"。）

首次推送后 Action 会自动跑；如未跑，到 **Actions** 页手动 **Run workflow**。

### 3. 配置子路径 base（关键）

项目页地址是 `https://<用户名>.github.io/<仓库名>/`，Vite 必须知道子路径，否则 JS/CSS 404 白屏。

在仓库 **Settings → Secrets and variables → Actions → Variables** 新建：

| 变量名 | 值 |
|---|---|
| `VITE_BASE` | `/youpin-oa-web/`（**替换成你的仓库名**，前后斜杠都要） |

workflow 里的默认值是 `vars.VITE_BASE \|\| '/youpin-oa-web/'`，没配变量时会用这个默认值——**如果你的仓库名不是 `youpin-oa-web`，一定要配 `VITE_BASE`**。

也可以直接改 `.github/workflows/deploy.yml` 第 38 行的默认值。

### 4. 自定义域名（可选）

1. 在仓库根目录加一个 `CNAME` 文件，内容只有一行：`oa.yourdomain.com`
2. 在 `public/` 下也放一份（workflow 会把它一起带进 `dist/`）
3. DNS 加 CNAME 记录指向 `<用户名>.github.io`
4. **Settings → Pages → Custom domain** 填入并等 DNS 校验通过，勾选 *Enforce HTTPS*
5. 因为域名在根路径，把 `VITE_BASE` 设为 `/`

---

## 接真实数据（代理 + 你的 OA 账号）【推荐真实数据路线】

演示数据只是占位。**要让站点显示你公司的真实 OA 数据**，走这条路线：部署一个 Cloudflare Worker 代理，然后在网页里用你自己的 OA 账号登录即可。

### 为什么必须走代理

实测后端 `https://oa.upingbio.cn`：

- 对跨域请求返回 **403 且无任何 `Access-Control-Allow-Origin`** → 浏览器跨域被拦，GitHub Pages 站点读不到它的响应；
- 数据接口要求**登录会话** → 纯静态站点无法替你持有 OA 登录态。

`workers/oa-proxy.js` 用 Cloudflare KV 维护了「有状态会话」：浏览器只持有一个随机 `sessionId`（放在 `x-oa-session` 头里），代理侧保存 OA 的登录 Cookie 并透传，使「取验证码 → 登录 → 拉数据」三步共用同一 OA 会话。**OA 的 Cookie 绝不下发到浏览器**，安全。

### 步骤一：部署代理（Cloudflare Workers）

```bash
# 1) 安装并登录 wrangler
npm i -g wrangler && wrangler login

# 2) 创建 KV 命名空间（保存 OA 会话），把返回的 id 填进 wrangler.toml
wrangler kv namespace create OA_SESSIONS

# 3) 部署
wrangler deploy
#   部署后得到地址，例如 https://youpin-oa-proxy.<你的子域>.workers.dev
```

> 可选：上传服务想用 Cloudflare R2 时，代理还内置 `/presign` 预签名端点（见 `.env.example` 的 `VITE_R2_PRESIGN_URL`）。

### 步骤二：告诉站点代理地址

仓库 **Settings → Secrets and variables → Actions → Variables** 加：

| 变量名 | 值 |
|---|---|
| `VITE_OA_PROXY` | `https://youpin-oa-proxy.<你的子域>.workers.dev` |

也可本地 `.env.local` 加 `VITE_OA_PROXY=...` 后 `npm run dev` 自测。重新部署后生效。

### 步骤三：用真实账号登录

打开站点 → 登录页会显示**后端下发的真实验证码图片**（不再是本地算式）→ 输入你的 OA 账号、密码、图中字符 → 登录。之后审批 / 客户 / 产品 / 公告等全部是真实数据。

退出登录会清掉本地 `sessionId`；OA 服务端会话由后端自行过期。

### 本地 / 线上自测（无需重新构建）

站点支持运行时覆盖代理地址：`https://<你的pages>/?oa_proxy=https://<你的worker>`。便于先验证链路再正式配置。

### 本地端到端验证脚本

`scripts/oa-mock.mjs` 模拟了「有状态会话 Worker + 最小 OA 后端」，`scripts/verify-realdata.mjs` 用无头 Chrome 跑通整条链路（取验证码 → 登录 → 拉真实列表）。复跑：

```bash
npm run build && cd dist && python -m http.server 4173 &
node scripts/verify-realdata.mjs "http://127.0.0.1:4173"
```

### 注意事项

- **响应形态兼容**：真实后端返回结构未知，数据层 `src/core/api.ts` 对 `{data:[...]}` / `{data:{list:[...]}}` / `{list:[...]}` 等做了最大兼容解析；若你的后端字段名与演示数据不同，按需在 `src/core/types.ts` + `api.ts` 对应映射处微调即可。
- **生产环境**：把 `workers/oa-proxy.js` 里的 `ALLOWED_ORIGINS` 从 `['*']` 改成你的 Pages 域名，避免代理被滥用。
- **账号安全**：你的 OA 密码只在登录时由本人在网页输入，仅用于本次代理登录，不写死在代码、也不落地存储；会话 Cookie 仅存于 Worker KV。

---

## 已知限制

> 逐项对应 `CAPABILITY_MAP.md` 第五节的 L-1 ～ L-6，每条都给了最接近的降级交互，**没有留空或静默跳过**。

| # | 限制 | 原因 | 降级交互 |
|---|---|---|---|
| **L-1** | 无法写入指定系统目录（原 APP 写 `Download/优品OA/`） | 浏览器沙箱不能指定落盘路径 | 触发浏览器标准下载，落到用户默认下载目录；文件名保持「货号-产品标题.pdf」 |
| **L-2** | 无法调用本机 WPS / PDF 阅读器打开文件 | 浏览器不能启动本机应用 | PDF：浏览器新标签直接预览；Office 文件：提供「下载」+「用 Office Online 查看器打开」 |
| **L-3** | 后台持续轮询未读消息（原 APP 用原生 Handler 不受节流） | 浏览器后台标签 `setInterval` 被节流到 ≥1 分钟 | 前台 15 秒轮询 + `visibilitychange` 回前台立即补拉；后台提醒不保证实时 |
| **L-4** | 新消息震动 | iOS Safari 无 Vibration API | 仅 Android Chrome 生效；iOS 降级为响铃 + 角标 |
| **L-5** | 直连真实 OA 后端 | 后端无 CORS 响应头 | 默认用内置演示数据；配 `VITE_OA_PROXY` 后接真实后端 |
| **L-6** | 系统级算式验证码（依赖后端会话） | 同上 | 无代理时登录页改为**本地生成的算式验证码**，界面明确标注「演示模式」 |

其它说明：

- 附件列表里「移除」只移除本机记录，不影响对象存储里的文件
- 收藏夹在 localStorage 里只存**元数据（名称 + 公网 URL）**，从不存文件字节
- 纯静态架构下无法实现「用系统应用打开」和「写入公共下载目录」，已在交互层给出等价替代

---

## 自检结果（Phase D）

> 由 `scripts/verify.mjs` 用无头 Chrome 实测（375px / 390px / 1440px），**28/28 通过**，截图在 `verify-shots/`。

- [x] 375px 与 390px 宽度下手机端无横向滚动（`scrollWidth === clientWidth`），UI 与 `app-source` 源码参数一致（无截图文件，视觉参数从 `index.html` + `style.css` 反推，逐条对应）
- [x] 1440px 下桌面端是多栏布局：首页三栏（300px / 500px / 320px），容器 `max-width:1200px`，实际 1152px
- [x] 桌面端无手机端底部 Tab 栏残留（`.m-tabbar` 不存在）；手机端无多栏并排（宫格固定 4 列）
- [x] 文件选择 → 上传 → 获得 URL 链路真实可用（`uploadFile()` 走真实 XHR，带 `upload.onprogress` 进度；凭证缺失时明确降级为「未配置」面板，不假装成功、不崩溃）
- [x] 转发有真实方案：`navigator.share({files})` → `navigator.share({url})` → `navigator.clipboard` → `execCommand` 降级链；多文件用 JSZip 打包后分享；所有转发物是公网 URL 或真实 File，刷新不丢
- [x] 无 localStorage 存文件字节、无假上传按钮、无假转发弹窗（localStorage 只存会话与收藏夹元数据）
- [x] `npm run build` 成功（`tsc --noEmit && vite build`），产物 `dist/` 为纯静态文件
- [x] `.github/workflows/deploy.yml` 存在且语法正确（官方 Actions，push main 自动构建发布）

复跑自检：

```bash
npm run build
cd dist && python -m http.server 4173
node scripts/verify.mjs "http://127.0.0.1:4173/" "C:/Program Files/Google/Chrome/Application/chrome.exe"
```

---

## 项目结构

```
├─ .github/workflows/deploy.yml   GitHub Pages 自动部署
├─ .env.example                   环境变量模板（上传服务凭证 / base / 代理）
├─ index.html  vite.config.ts  tsconfig.json
├─ workers/oa-proxy.js            可选：CORS 代理 + R2 预签名 Worker
├─ scripts/
│  ├─ gen-demo-assets.mjs         生成演示用 PDF / xlsx / favicon
│  └─ verify.mjs                  无头 Chrome 双端自检（28 项）
├─ public/data/                   演示数据与说明书 PDF
└─ src/
   ├─ App.tsx                     断点判定 → 渲染 MobileApp / DesktopApp
   ├─ core/                       ★ 业务逻辑层（双端共享）
   │  ├─ breakpoint.ts            断点常量（768px）+ useDevice()
   │  ├─ config.ts                环境变量与上传提供方
   │  ├─ api.ts                   数据源（代理 → 真实后端 / 演示数据）
   │  ├─ upload.ts                ★ 真实上传（Cloudinary / Uploadcare / R2）
   │  ├─ share.ts                 ★ 真实转发（Web Share / 剪贴板 / zip）
   │  ├─ session.ts               会话 + 收藏夹（只存元数据）
   │  ├─ demoData.ts  filetype.ts  types.ts  util.ts
   ├─ mobile/                     ★ 手机端视图层（≤768px）—— 独立组件树
   └─ desktop/                    ★ 桌面端视图层（>768px）—— 独立组件树
```

设计文档：`INVENTORY.md`（源码盘点）、`CAPABILITY_MAP.md`（原生能力映射）、`ARCHITECTURE.md`（架构决策与假设）、`PROGRESS.md`（实现进度）。
