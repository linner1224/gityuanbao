# 验证记录

验证日期：2026-09-15

## 自动测试

运行命令：

```powershell
python -m unittest discover -s tests -v
```

覆盖内容：

- RSS 标题、摘要、链接跟踪参数与发布时间清理。
- 相同输入生成稳定 ID。
- 异常日期保持 `publishedAt = null`。
- 相同输入连续导入不产生重复记录，第二次 `newCount = 0`。
- 模拟 TechCrunch AI 单源超时后，整体状态为 `partial`，旧记录仍保留，其他来源继续导入。

状态：已验证。

## 固定夹具重放

运行命令：

```powershell
python scripts/fetch_news.py --from-fixtures --output <临时目录>/news.json --status <临时目录>/status.json
```

夹具包含量子位、TechCrunch AI 和 OpenAI 官方博客的真实 RSS 响应。输出写入临时目录，不覆盖线上数据。

状态：已验证。

## 线上数据与部署

- 演示地址：<https://linner1224.github.io/gityuanbao/>
- 源码地址：<https://github.com/linner1224/gityuanbao>
- 首页响应：HTTP 200。
- 页面标题：`Git源宝每日 AI 资讯分享`。
- GitHub Pages：HTTPS 已启用，构建方式为 GitHub Actions。

状态：已验证。

## 自动更新记录

工作流：`Update news and deploy Pages`

已观察到 6 次 `schedule` 事件连续成功，时间分别为 2026-09-15 12:39、13:02、13:35、14:01、14:35 和 15:02 UTC。最近一次运行：<https://github.com/linner1224/gityuanbao/actions/runs/34985694529>。

状态：已验证。GitHub Actions 的计划任务可能有数分钟调度延迟。

## 页面与交互

- 320、375、390、414、768px：页面宽度等于视口宽度，无横向溢出。
- 手机端可见按钮、链接、输入框与选择框：触控范围不小于 44px。
- 固定视频背景：正常模式清晰播放并覆盖视口；减少动态效果模式隐藏视频并显示海报。
- 分页：每页 15 条，筛选条件变化后回到第一页。
- 外部 RSS 文本：使用 `textContent` 创建内容，不通过 `innerHTML` 注入。
- 仓库敏感文件检查：未提交 `.env`、密钥或凭据文件。

状态：已验证。

## 待验证

- 资讯 JSON 加载失败状态已经实现，但尚未保留一次真实断网或损坏 JSON 的人工截图与操作记录。

除上述一项外，任务书要求的核心链路与交付材料均已验证。
