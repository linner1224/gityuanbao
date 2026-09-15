# 提交信息

- 姓名：提交前填写
- 实际投入时间：提交前填写
- 演示地址：<https://linner1224.github.io/gityuanbao/>
- 源码地址：<https://github.com/linner1224/gityuanbao>
- 未完成或未验证事项：资讯加载失败状态尚缺一次真实断网或损坏 JSON 的人工操作记录；姓名与实际投入时间待填写。

## 提交内容

- 完整源码、图片、视频、数据样例和 GitHub Actions 配置。
- `README.md`：本地运行、部署、技术选择、数据源、更新方式、成本与限制。
- `docs/development-notes.md`：工具、关键决策、自选亮点和问题定位过程。
- `docs/verification-record.md`：自动测试、夹具、容错、响应式和线上运行记录。
- `docs/acceptance-checklist.md`：逐项验收状态。

## 快速复现

```powershell
python -m unittest discover -s tests -v
python scripts/fetch_news.py --from-fixtures
python -m http.server 8000
```

浏览器打开 `http://localhost:8000`。如需导出今日简报，点击“导出今日 PDF”，并在浏览器打印窗口中选择“另存为 PDF”。
