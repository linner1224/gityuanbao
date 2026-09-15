# Git源宝每日 AI 资讯分享

一个以真实 RSS 数据为基础的轻量 AI 新闻阅读站。目前已完成第一条垂直链路：采集 RSS、统一字段、基础去重、保存 JSON，并由静态页面展示。

阅读界面包含今日 5 条速览、浏览器本地已读足迹、隐藏已读、来源透镜、新鲜度标记和三类来源信号雷达，并提供源宝动态提示、随机投喂、一键复制今日速览、每页 15 条分页及今日新闻 PDF 导出。全站使用固定视频环境背景，并为减少动态效果偏好保留静态海报版本。来源透镜只展示订阅数据与采集状态中真实存在的字段，缺失信息明确标注为“未提供”。

“导出今日 PDF”会打开浏览器打印窗口，选择“另存为 PDF”即可保存。简报优先使用当天资讯；当天尚无数据时，会在页眉中明确标注并回退到最近一个收录日。

项目同时包含 GitHub Pages 使用的源宝主题 `404.html`、多尺寸 favicon、1200×630 社交分享图，以及品牌资产生成提示词 `docs/ip-asset-prompts.md`。

## 当前数据源

- 量子位：`https://www.qbitai.com/feed`
- TechCrunch AI：`https://techcrunch.com/category/artificial-intelligence/feed/`
- OpenAI 官方博客：`https://openai.com/blog/rss.xml`

三个来源彼此独立。机器之心 RSSHub、AIHOT、arXiv 等暂不进入首版核心链路。

## 本地运行

要求 Python 3.10 或更高版本，无第三方 Python 依赖。

```powershell
python scripts/fetch_news.py --save-fixtures
python -m http.server 8000
```

访问 `http://localhost:8000`。

采集完成后会更新：

- `data/news.json`：统一格式的新闻记录
- `data/update-status.json`：各来源最近一次运行状态
- `fixtures/*.xml`：真实 RSS 原始响应，仅在使用 `--save-fixtures` 时生成

保存夹具后，可以不联网重放相同输入：

```powershell
python scripts/fetch_news.py --from-fixtures
```

## 数据口径

- 展示时区：`Asia/Shanghai`
- `publishedAt` 表示来源提供的原始发布时间；缺失时保持为空
- `collectedAt` 表示本站采集时间，不用于冒充发布时间
- 摘要来自 RSS 自带的 description、summary 或 content 字段，不使用 AI 补写事实
- 去重主键为“来源 ID + 规范化原文链接”的 SHA-256 摘要
- 每个来源最多保留最近 100 条，避免高容量 feed 挤占全部列表

## 验证状态

详细清单见 `docs/acceptance-checklist.md`。

## 自动更新与部署

`.github/workflows/update-and-deploy.yml` 支持以下触发方式：

- 推送到 `main` 分支时更新并部署
- 每 30 分钟自动更新一次（GitHub Actions 使用 UTC，但该频率不受时区影响）
- 在 GitHub Actions 页面通过 `workflow_dispatch` 手动触发

工作流会先运行解析测试，再采集真实 RSS、提交数据和运行状态，最后把静态文件及图片、视频资源部署到 GitHub Pages。单个来源失败时采集器会保留旧数据，并在 `data/update-status.json` 中记录 `partial` 状态。

首次发布需要在 GitHub 仓库的 `Settings → Pages → Build and deployment` 中将来源设置为 `GitHub Actions`。
