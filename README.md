# CampBrief

CampBrief 是一个面向大学生的信息聚合网站，目标是帮助学生更高效地发现竞赛、技术趋势、AI 学习资源和每日资讯。

项目当前处于早期建设阶段，已完成首页和竞赛模块 demo，后续会逐步补齐更多栏目与数据更新流程。

## 功能规划

- 竞赛信息：聚合适合大学生参与的比赛、活动和挑战赛。
- 技术趋势：整理值得关注的开源项目、开发工具和技术动态。
- AI 学习：收集课程、实训、教程和学习路径。
- 每日资讯：筛选和整理适合学生关注的信息简报。

## 当前进度

- 首页：基础页面已完成。
- 竞赛模块：已完成静态 demo，支持分类筛选、状态筛选和关键词搜索。
- 其他模块：页面与内容仍在规划中。
- 数据来源：当前为示例数据，后续会接入更稳定的数据整理流程。

## 技术栈

- HTML
- CSS
- JavaScript

当前版本保持纯静态结构，方便通过 GitHub Pages 发布。未来如果迁移到云服务器，也可以直接作为静态站点托管。

## 本地预览

可以直接打开根目录下的 `index.html` 查看页面。

如果希望使用本地静态服务器预览，也可以在项目根目录运行：

```bash
python -m http.server 4173
```

然后访问：

```text
http://127.0.0.1:4173/
```

## 项目结构

```text
CampBrief/
├── index.html
├── assets/
│   ├── css/
│   ├── js/
│   └── images/
├── pages/
│   ├── competitions/
│   │   └── index.html
│   ├── tech/
│   │   └── index.html
│   ├── daily-news/
│   │   └── index.html
│   └── about/
│       └── index.html
├── AGENTS.md
└── README.md
```

## 部署

当前推荐使用 GitHub Pages 部署：

1. 将仓库推送到 GitHub。
2. 在仓库设置中开启 GitHub Pages。
3. 选择从主分支的根目录发布。

后续迁移到云服务器时，可以将仓库中的静态文件放到 Web 服务根目录，由 Nginx、Caddy 或其他静态文件服务托管。

## 开发说明

更详细的项目结构约定、命名规范和后续可维护性原则见 `AGENTS.md`。

## License

MIT License © 2026 CampBrief
