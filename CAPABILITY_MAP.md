# CAPABILITY_MAP.md — 原生能力 → 浏览器方案映射

> 逐项列出 APP 中每个依赖 Android 原生的功能，标注：
> `[B]` 浏览器原生可替代 / `[S]` 需第三方前端可调用服务 / `[X]` 纯静态架构下无法实现

---

## 一、`AndroidBridge` 方法逐项映射

`AndroidBridge` 定义于 `MainActivity.java` 的内部类 `JsBridge`（第 244–1329 行）。

| # | 原生桥方法 | 行号 | 原用途 | 分类 | 浏览器方案 |
|---|---|---|---|---|---|
| 1 | `openUrl(url)` | 246 | 内嵌 WebViewActivity 打开链接 | `[B]` | `window.open(url,'_blank','noopener')` / `<a target="_blank" rel="noopener">`，自域用前端路由 |
| 2 | `toast(msg)` | 264 | 原生 Toast | `[B]` | 自绘 toast 组件（固定底部，1.8s 消失） |
| 3 | `downloadFile(url,name)` | 277 | 带 Cookie 下载说明书到 `Download/优品OA` | `[B]`* | `<a download>` + Blob；**落盘目录由浏览器决定**（见限制 L-1） |
| 4 | `zipFiles(jsonList,zipName)` | 352 | 多份说明书打包 zip 落盘 | `[B]` | JSZip 前端打包 → Blob 下载 |
| 5 | `shareFile(url,name)` | 371 | 下载后系统分享单文件 | `[B]` | `navigator.share({files:[File]})`；降级：复制可分享 URL / 打开 URL |
| 6 | `shareZip(jsonList,name)` | 408 | 打包 zip 后系统分享 | `[B]` | JSZip 打包成 `File` → `navigator.share({files:[zipFile]})`；降级下载 zip |
| 7 | `openFileWith(url,name)` | 485 | 下载后用 WPS/PDF 阅读器打开 | `[X]`→降级 | 浏览器内 pdf.js 预览；Office 文件降级为「下载 + 用 Office Online 查看器打开」（限制 L-2） |
| 8 | `readFileBase64Async(url,cb)` | 540 | 带会话读服务端文件为 base64（≤8MB） | `[S]` | 同源/有 CORS 时直接 `fetch().arrayBuffer()`；跨域需代理（`VITE_OA_PROXY`），否则只读本站静态资源 |
| 9 | `shareBase64File(name,b64,mime)` | 615 | H5 生成 PDF 后系统分享 | `[B]` | base64 → `File` → `navigator.share({files})` |
| 10 | `saveBase64File(name,b64)` | 683 | 保存 H5 生成的 PDF 到 Download | `[B]`* | Blob + `<a download>`（目录不可控，限制 L-1） |
| 11 | `playMsgSound()` | 883 | 播放 `res/raw/msg.mp3` | `[B]` | Web Audio / `<audio>` 播放内置音频（**不使用 `res/raw` 二进制**，改用同音效的合成音或打包音频文件） |
| 12 | `getBaseUrl()` | 909 | 返回 BASE | `[B]` | 编译期常量 `import.meta.env` |
| 13 | `startMsgPoll()` / `stopMsgPoll()` | 916/925 | 原生 Handler 每 10s 轮询未读 | `[B]` | `setInterval` + `visibilitychange` 补偿；后台节流（限制 L-3） |
| 14 | `setMsgViewing(bool)` | 939 | 查看消息时静音 | `[B]` | 前端状态位 |
| 15 | `uploadFileBase64(b64,name,path,field)` | 1063 | **multipart 上传到 `/api/index/upload`** | `[S]` | **Cloudinary 免签上传 / Cloudflare R2（S3 兼容）**，见「二、上传链路」 |
| 16 | `uploadFileBase64Async(...)` | 1069 | 异步版上传 | `[S]` | 同上（`fetch` 本身即异步，天然不阻塞） |
| 17 | `pickFiles(accept,multiple,cb)` | 1081 | 跳转系统文件管理器选择 | `[B]` | `<input type="file" multiple>` + 拖拽区 + File API |
| 18 | `pickCamera(cb)` | 1103 | 跳转相机拍照 | `[B]` | `<input type="file" accept="image/*" capture="environment">` |
| 19 | `getCaptchaBase64()` | 1154 | 取算式验证码图（带会话） | `[S]` | 需代理；无代理时降级为**本地生成算式验证码**（demo 模式，明确标注） |
| 20 | `httpGet/httpPost/httpGetPlain/httpPostPlain` | 1177–1196 | 同步 HTTP 通道（共享 Cookie，绕过跨域） | `[S]` | 需 CORS 代理（`VITE_OA_PROXY` + 附带的 Cloudflare Worker）；无代理时用静态演示数据 |
| 21 | `httpGetAsync/httpPostAsync/...` | 1243–1260 | 异步 HTTP 通道 | `[S]` | 同上 |
| 22 | 物理返回键 `onKeyDown` | 1456 | 返回上一级 / 退后台 | `[B]` | `history.pushState` + `popstate` + 前端导航栈 |
| 23 | `vibrateOnce()` | 997 | 新消息震动 150ms | `[B]`**部分** | `navigator.vibrate(150)`；**iOS Safari 不支持**（限制 L-4） |
| 24 | `onJsAlert/Confirm/Prompt` | 156–215 | 原生对话框兜底 | `[B]` | 自绘弹层（APP 本身已因 WebView 不弹对话框而自绘） |
| 25 | `ShareProvider`（content://） | — | Android 7+ 文件分享 URI | — | 不需要（Web Share 直接吃 `File`） |
| 26 | `WebViewActivity` 内嵌桌面版页 | — | 打开 `/home/index/main.html` | `[X]`→降级 | 需登录会话 + 无 CORS；**本站桌面端视图即「桌面版」** |

---

## 二、上传链路（重点）

### 原链路
```
input/拍照 → 原生选择器 → Uri → base64 → AndroidBridge.uploadFileBase64Async
          → multipart/form-data POST https://oa.upingbio.cn/api/index/upload
          → {code:0, data:{id, filepath, name, filesize, fileext}}
```

### 新链路（纯静态，真实可用）
```
<input type="file" multiple> 或 拖拽区 或 capture=environment
  → File API 拿到真实 File 对象
  → 校验：扩展名白名单(17 种) + 大小 ≤ 10MB（沿用 APP 阈值）
  → 上传到第三方对象存储（三选一，按配置优先级）
      ① Cloudinary 免签上传   POST https://api.cloudinary.com/v1_1/<cloud>/auto/upload
                             字段：file, upload_preset, folder
                             只需 cloud name + unsigned preset（均非密钥，可安全放前端）
      ② Uploadcare 直传        POST https://upload.uploadcare.com/base/
                             字段：UPLOADCARE_PUB_KEY, file
      ③ Cloudflare R2 / S3    PUT <presignUrl>  （预签名 URL 由附带的可选 Worker 签发，
                                                Worker 源码随仓库提供，用户自部署）
  → 拿到真实公网可访问 URL（secure_url / cdnUrl / R2 public URL）
  → 写入附件列表（内存 + 会话元数据），立即可预览 / 下载 / 转发
```

**凭证缺失时的降级（明确，不静默）**：
`UploadProviderUnconfiguredError` → UI 显示「上传服务未配置」面板，含 env 变量名与获取途径链接；**不发假请求、不写 localStorage、不改 UI 假装成功**。

**硬约束遵守**：
- ❌ 不用 localStorage / sessionStorage / 内存对象「存储」文件或模拟上传
- ❌ 上传按钮不只是 alert / 打日志
- 上传全程有真实 XHR/fetch 请求、真实进度（`XMLHttpRequest.upload.onprogress`）、真实返回 URL

---

## 三、转发链路（重点）

| 场景 | 方案 | 降级 |
|---|---|---|
| 转发**文本 / 链接** | `navigator.share({title, text, url})` | `navigator.clipboard.writeText()` → 再降级 `document.execCommand('copy')` |
| 转发**单个文件**（已有 URL） | `navigator.share({files:[File]})`（先把 URL fetch 成 File） | 复制可分享 URL；再降级：新窗口打开该 URL |
| 转发**刚上传的本地文件** | 直接 `navigator.share({files:[file]})`（本地已有 File，无需回下载） | 复制上传后拿到的公网 URL |
| 转发**多个文件** | JSZip 打包成 `优品OA-转发-<n>份.zip` → `navigator.share({files:[zip]})` | 下载 zip 到本机 |
| 桌面端（多数无 Web Share） | 复制可分享 URL + 显示二维码 | 直接打开 URL |

**刷新即丢失的方案一律不采用**：所有转发目标都是**公网 URL**（上传服务返回的持久 URL）或**真实 File 对象**，不依赖内存引用。

---

## 四、其余原生/系统能力

| 能力 | 分类 | 方案 |
|---|---|---|
| PDF 内嵌阅读 | `[B]` | 复用 pdf.js（`lib/pdf.min.js` 同源打包），canvas 连续滚动，版式对齐 APP |
| docx 高保真预览 | `[B]` | 复用 `docx-preview` / `mammoth`（同源打包） |
| 导出 Excel | `[B]` | SheetJS（`xlsx.full.min.js`）纯前端生成 |
| 导出 PDF | `[B]` | jsPDF + html2canvas |
| 记住账号密码 | `[B]` | localStorage（**仅凭据与元数据，绝不存文件字节**） |
| 收藏夹 | `[B]` | localStorage 存**元数据**（id/标题/**公网 URL**），不存字节 |
| 左滑操作（重命名/删除） | `[B]` | Pointer Events 手势（`touch-action: pan-y`） |
| 省市区三级联动 | `[B]` | 本地静态行政区划 JSON |
| 会话失效守卫 | `[B]` | 统一响应拦截，跳登录页 |
| 安全区适配 | `[B]` | `env(safe-area-inset-*)`（沿用 APP 写法） |

---

## 五、纯静态架构下无法实现（写入 README「已知限制」）

| 编号 | 能力 | 原因 | 降级交互 |
|---|---|---|---|
| **L-1** | 写入指定系统目录（`Download/优品OA`） | 浏览器沙箱不能指定落盘路径 | 触发浏览器标准下载，落到用户默认下载目录；文件名保持「货号-标题.pdf」 |
| **L-2** | 调用本机 WPS / PDF 阅读器打开文件 | 浏览器不能启动本机应用 | PDF 站内 pdf.js 预览；Office 文件提供「下载」+「用 Office Online 查看器打开」 |
| **L-3** | 后台持续轮询未读（原生 Handler 不受节流） | 浏览器后台标签 `setInterval` 被节流到 ≥1min | 前台 15s 轮询 + `visibilitychange` 回前台立即补拉；后台提醒不保证实时 |
| **L-4** | 新消息震动 | iOS Safari 无 Vibration API | Android Chrome 生效；iOS 仅响铃 + 角标 |
| **L-5** | 直连真实 OA 后端 | 后端无 CORS 响应头（实测 403 且无 `Access-Control-Allow-Origin`） | 默认用内置演示数据；配置 `VITE_OA_PROXY`（附 Cloudflare Worker）后接真实后端 |
| **L-6** | 系统级算式验证码（依赖后端会话） | 同上 | 无代理时登录页改为本地生成的算式验证码，并在界面标注「演示模式」 |
