# 轻一点 · Loki 图片压缩

[在线使用](https://loki-image-compressor.pages.dev) · [Loki](https://hiloki.cn)

![Loki 小熊猫](dist/static/loki-ip.png)


纯静态站点，使用 Web Worker、Pyodide 与 Pillow 在浏览器内处理图片。图片不会上传到服务器。

本地预览：`python3 -m http.server 8770 --directory dist`

通用工具 `/`；微信制作 `/wechat/`。首次加载约 14 MB 处理引擎。支持 GIF 多帧、PNG/JPEG/WebP 转换、裁剪、指定体积与 ZIP。浏览器支持目录写入时可选保存目录，否则下载 ZIP。

单文件 50 MB、单页素材 150 MB、最多 600 帧、6000 万总像素；刷新或切换页面会清空当前素材和结果，请先下载。压缩达不到目标时会显示提示。图标保持全彩无损 PNG，50 像素原生预览，默认上限 50 KB。

可部署到支持静态文件的网站托管服务。仅部署 dist，禁止包含本地版 data 目录或用户素材。第三方许可见 dist/licenses 和 THIRD-PARTY.md。

## 作者与开源

由 [赛博小熊猫 Loki](https://hiloki.cn) 制作。项目自有代码 MIT；品牌 IP 不包含在 MIT 中，见 BRAND-ASSETS.md。第三方运行时许可保持不变。

## 访问统计

`stats-service/` 是独立的 Cloudflare Worker + D1 服务。今日以北京时间计算。PV 为页面打开事件，UV 为随机浏览器标识的 SHA-256 去重值；不保存原始 IP、图片、文件名或图片内容。浏览器清缓存、换设备或换域名会重复计 UV，因此不是精确人数。累计从上线开始，包含验收访问。禁用存储时只展示汇总，不新增计数。统计失败显示不可用。

记录采用事件 ID 去重及 SQLite 触发器原子计数。仅保留最近 7 天事件与最近日期去重数据；历史 PV 汇总与累计浏览器哈希保留。来源限制与边缘限流只能减少刷量，不能保证统计完全无机器人。

自行部署：创建自己的 D1 数据库，将 stats-service/wrangler.jsonc 的 database_id 改为自己的，执行 schema.sql，再部署 Worker。将 worker.mjs 的 ORIGINS 和 dist/static/stats.js 的 endpoint/production 域名替换为自己的。不要向本项目的线上统计端点发送自己的站点访问。

数据库使用 D1 参数化查询与事务：[官方文档](https://developers.cloudflare.com/d1/worker-api/d1-database/)。
