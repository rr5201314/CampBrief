# Agent 共享记忆

本文件是 简豹 项目的**工程决策记录**，供所有参与开发的 agent（TRAE、Codex、Hermes ）共享读取和维护。

> 为什么需要这个文件：各 agent 的本地记忆互不可见，容易导致规则不同步。本文件随仓库版本管理，任何 agent 做了影响他人的工程决策后都应同步到此，其他 agent 开工前也应先读这里。

维护规则：

- 只记录**跨会话需要保留的工程决策、参数约定、数据规则**，不记录一次性任务进度。
- 改动代码或数据结构后，若涉及此处已有规则，必须同步更新本文件。
- 与 `AGENTS.md`（项目规范）的分工：`AGENTS.md` 写稳定的原则性约定；本文件写具体的参数、排序规则、字段约定等易变但需要一致的细节。

---

## Engineering Conventions

- All animations respect `prefers-reduced-motion` media query for accessibility
- Scroll-triggered animations use IntersectionObserver with unobserve after single trigger
- Animation timing functions use `cubic-bezier(.4,0,.2,1)` for natural motion
- Stagger animations use incremental delays (e.g., 60ms per feed item, .1s/.2s/.3s for board sections)

## Hard Constraints

- Animations must work with `file://` protocol (no external dependencies)
- Mobile devices get simplified animation versions (degraded experience)

## 列表页统一规则（与每日资讯对齐）

- **每页数量**：所有列表页（每日资讯/技术/考试/竞赛）统一 `PAGE_SIZE = 5`
- **稳定 ID**：所有模块的条目用不可变 `id` 定位详情页（资讯 `news-<hash>`、竞赛/考试用各自 `id`），不再用 URL 定位
- **排序基准**：先按北京时间自然日分组倒序，同日按优先级降序，再按发布时间降序（资讯/技术/首页看板统一）；考试/竞赛按各自业务状态优先级排序
- **数据加载**：无离线回退副本，列表页直接读取真实 JSON 数据文件
- **输出安全**：所有模块统一用 `CampBriefContent.escapeHtml` 转义文本、`safeHttpUrl` 校验外链
- **加载/空状态**：列表页有显式加载态，空状态带 `role="status"`，筛选按钮同步 `aria-pressed`

## 考试模块数据规则

- `data/exams.json` 为考试目录（稳定参考信息），每项含详情字段：`format`/`duration`/`subjects`/`requirements`/`scoring`/`timeline`
- 三个 URL 字段分工：
  - `official_site`（稳定）：考试报名系统官网，详情页"立即报名/访问报名系统"按钮指向
  - `news_list_url`（稳定）：官方考试动态列表页，agent 自动化从此处发现最新公告 URL
  - `official_url`（每期更新）：本期报名公告原文，详情页"查看官方公告"按钮指向，agent 从此抓取 timeline
- agent 维护流程：
  1. 访问 `news_list_url` → 提取列表第一条链接 → 得到最新公告 URL
  2. 抓取最新公告 URL → 解析时间节点 → 更新 `official_url` 和 `timeline`
  3. 如有新一期，`official_url` 换成新的，`timeline` 重新填充
- `timeline`（重要时间节点）数据来源：agent 主动从官方通知原文提取具体信息（日期、时段等）
  - 原文有具体信息时，直接填写（如"2026年上半年为 6月13日 9:00-11:20"）
  - 原文确实没有该信息时，才用"以官方公告为准"或"以所在学校通知为准"作为兜底
  - 不要偷懒给所有条目统一加"以官方公告为准"，必须先尝试提取原文信息
- 详情页不含 `prep_tips`（备考建议）字段——已移除
- 详情页顶部有醒目官方提示框（callout），底部有 notice，双重引导用户去官方渠道核实
- 时效性报名通知（每次考试不同）后续放入 `data/exam-notices.json`（方案B，待实现）
- 信息网格的"考试时间"字段需填写具体考试月份（如"2026年6月"），而非通用周期（如"每年6月、12月"）
- 考试和竞赛模块的状态标签需去除"阶段"后缀（如"可报名阶段"改为"可报名"）
- **考试排序规则**（`compareExams`）：列表用 `LIST_STATUS_ORDER`（未开始 pending > 可报名 open > 已结束 closed/done），轮播用 `CAROUSEL_STATUS_ORDER`（可报名 open > 未开始 pending > 已结束），再按含金量 `EXAM_PRESTIGE` 降序，最后按名称
- 考试列表筛选状态分组：未开始 / 可报名 / 已结束（closed 和 done 合并为"已结束"）
- 卡片主按钮为「查看详情」，次按钮为官网/报名

## 竞赛模块数据规则

- `data/competitions.json` 为竞赛目录，包含三类赛事：教育部认可赛事（84项）、名企主办赛事、兴趣练手赛事
- 三级筛选体系：一级（赛事层次：教育部认可/名企主办/兴趣练手）、二级（专业领域：人工智能/机器人/计算机等13类）、三级（比赛状态：未开始/可报名/比赛中/已完赛）
- 边报名边比赛的赛事优先归入「可报名」状态
- 每个赛事在 JSON 中通过 `tags` 数组支持一赛多领域分类
- **排序规则**（`compareCompetitions`）：状态优先（可报名 open > 未开始 pending > 比赛中 ongoing > 已完赛 done）→ 赛事层次（教育部 official > 名企 enterprise > 兴趣 hobby）→ 含金量 `prestige` 降序 → 名称
- 卡片主按钮为「查看详情」，次按钮为官网/报名（统一为资讯形式）
- 首页竞赛看板读取 `data/competitions.json` 真实数据，卡片点击进入对应详情页

## 轮播组件规则

- 通用轮播组件位于 `assets/js/carousel.js`，三个模块（竞赛/考试/每日资讯）各自在列表页顶部展示精选轮播
- 轮播模式：**滚轮缓慢滑动**（非分页切换），鼠标滚轮驱动水平位移，松开后1.5秒恢复自动平移
- 自动播放改为连续缓慢平移（12 px/秒），到末尾循环回开头
- 交互：滚轮、触摸拖拽、左右箭头按钮（平滑滚动 80% 视口宽度）、鼠标拖拽卡片（5px阈值判断）、底部滑动条拖拽定位
- 鼠标悬停时暂停自动平移
- 轮播卡片数量限制：3-15 个；少于 3 个时隐藏轮播区域；超过 15 个时只取前 15 个
- **考试轮播**：筛选 status=open/pending，按"可报名>未开始"状态优先级（`CAROUSEL_STATUS_ORDER`）排序，再按含金量（`EXAM_PRESTIGE` 映射表）降序；不足 3 个时用雅思/托福常驻凑数；上限 15
- **竞赛轮播**：从真实数据 `allItems` 提取（不再用 DOM），筛选 status=open/pending，open 优先；上限 15
- **每日资讯轮播**：近3天内 priority>=4 的消息；不足3个时补充 priority>=3 的；按发布时间降序，上限15
- 轮播卡片区域禁止文本选择和原生拖拽（`user-select:none` + `dragstart` 拦截）
- 拖拽超过5px阈值时阻止链接跳转（`suppressClick` 标记），正常点击仍可跳转
- 支持惯性滑动：快速拖拽松手后根据速度衰减继续滑动，边界停止

## 每日资讯优先级规则

- priority 4：头条（首页看板显示 + 资讯页轮播 + "头条"标签）
- priority 3：重磅（首页看板显示 + "重磅"标签）
- priority 2：重要（资讯列表页显示 + "重要"标签，不上首页看板）
- priority 1：普通（仅资讯列表页显示，首页看板不显示）
- **降级规则**：当 priority>=4 的条目超过 10 个时，最旧的（published 最早）降级为 priority 3；agent 维护数据时执行此规则
- 首页看板（home.js）显示近 3 天、priority 为 4/3 的消息（priority 2 不上首页看板）
- 资讯卡片时间标签与筛选条件对齐：<24小时（24小时，蓝）、<7天（7天，灰）、<30天（30天，浅灰）、≥30天（更早，最淡）

## 技术板块与每日资讯的分工

- **技术板块**（`pages/tech/`）：展示 `category=tech` 的条目，按 `subcategory` 分类筛选
  - 4 个子分类：`ai-frontier`（AI 前沿）/ `hardware`（硬件与芯片）/ `software`（软件与系统）/ `industry`（产业与商业）
  - 第 5 个分类 `github`（GitHub 趋势）为占位，后续接入独立数据源
  - 数据源：复用 `data/daily-news.json`，前端过滤 `category=tech`
  - 技术板块轮播：近3天 priority>=4，不足3个补 priority>=3，上限15
- **技术详情页**：`pages/tech/detail.html`，仅展示 `category=tech` 条目，显示 `subcategory` 标签和优先级标签（头条/重磅/重要），导航高亮"技术"，返回链接指向技术列表
- **每日资讯板块**：不显示 `category=tech` 的条目（前端过滤），只保留 AI 日常、体育、趣闻
- **AI 分类边界**：
  - `ai`（每日资讯）：用户能用上/需要知道的（模型发布、额度重置、价格调整、备案数据、政策动态、AI 应用趣闻）
  - `tech` + `subcategory=ai-frontier`（技术板块）：技术人需要理解的（论文、新架构、模型能力突破、推理技术）
- agent 维护时：硬核 AI 内容标为 `tech` + `subcategory=ai-frontier`；日常 AI 资讯标为 `ai`

## RSS 订阅源
- 采集脚本：`scripts/collect-daily-news.py`，配置在 `SOURCES` 数组中
- juya AI 日报：`https://daily.juya.uk/rss.xml`，特点是一篇日报包含多条 AI 资讯
  - agent 需要从单篇日报中拆分出独立条目，各自有独立的 title/summary/detail
  - 拆分后多条共享同一 URL，去重时按 title 去重（非 URL 去重）
  - markdown 备份：`https://github.com/jujuyaya/juya-ai-daily/tree/main/BACKUP`
  - B 站 juya up 主公开资料

## 自动化采集架构（GitHub Actions + Hermes）

### 分工
- **GitHub Actions（云端，无人值守）**：定时采集 RSS 候选池，push 到仓库，发飞书通知
- **Hermes（手机，cron 定时）**：两个定时任务对应两个采集批次，拉取最新仓库，对候选池做 AI 筛选/摘要/分类，校验后推送，处理完清空候选池

### 事件触发机制（cron 定时，两批次）
1. GitHub Actions 云端定时采集候选池 → push 到仓库
2. Hermes（手机）设两个 cron 定时任务，对应两个批次：
   - 早间批次（如 08:30）：处理 GitHub Actions 08:00 采集的候选（排除 juya）
   - 午间批次（如 13:30）：处理 GitHub Actions 13:00 采集的 juya AI 日报
3. Hermes 每次执行 skill：git pull → 读取候选池 → 编辑筛选 → 校验 → push → **清空候选池**
4. 清空候选池确保两个批次各自只处理本批新候选，不会重复处理

### 为什么用 cron 而非事件触发
飞书 `im.message.receive_v1` 事件只对**用户**发的消息触发，**机器人发的消息不触发**该事件。
所以 GitHub Actions 自定义机器人发的 @ 消息，nienie 收不到事件。改为 nenie 用 cron 定时拉取仓库，
检查候选池是否有待处理条目。GitHub Actions 的飞书通知仅作提醒，不作为触发机制。

### GitHub Actions 配置
- workflow 文件：`.github/workflows/collect-news.yml`
- 定时任务（cron 用 UTC，北京 = UTC+8）：
  - `0 0 * * *`（北京 08:00）：采集全部源，排除 juya AI 日报（该源中午才更新）
  - `0 5 * * *`（北京 13:00）：只采集 juya AI 日报，`--only` 模式合并到已有候选池
- 支持手动触发（workflow_dispatch），可选批次 morning/noon/full
- 采集后自动 commit + push `data/daily-news-raw.json`
- 发飞书通知（机器人 webhook 存 GitHub Secret `FEISHU_WEBHOOK`）

### 采集脚本参数
- 无参数：采集全部源
- `--exclude "juya AI 日报"`：排除指定源（逗号分隔多个）
- `--only "juya AI 日报"`：只采集指定源，合并到已有候选池（同源旧条目被新数据覆盖）

### 飞书通知
- 脚本：`scripts/notify-feishu.py`
- 读 `data/daily-news-raw.json` 摘要，发到飞书群
- 消息含关键词 "CampBrief"（满足飞书自定义机器人安全设置）
- 消息末尾提示「收到通知后，在群里 @nienie 发送：执行 campbrief-daily-news」
- webhook URL 从环境变量 `FEISHU_WEBHOOK` 或 `--webhook` 参数读取
- 注意：飞书应用机器人收不到其他机器人发的消息事件，必须真人 @ nienie

### Hermes skill 衔接
- 步骤 0：`git pull --ff-only` 拉取最新候选池
- 步骤 1：判断候选池 `candidates` 是否非空且 `collected_at` 是今天，是则跳过本地采集，直接进入编辑流程
- 步骤 8：处理成功后清空候选池（写空结构），确保下次定时任务只处理新候选
- 兜底：如果 GitHub Actions 没跑或 pull 失败，Hermes 仍可本地跑采集脚本

### Hermes 侧配置要求
- nienie 设两个 cron 定时任务（如 08:30 和 13:30），分别对应两个采集批次
- 每次触发执行 campbrief-daily-news skill
- 候选池为空时（已处理过或 GitHub Actions 没跑），skill 会尝试本地采集作为兜底

### 敏感信息
- 飞书 webhook URL 只存 GitHub Secrets，不进仓库文件
- workflow 文件里只引用 `${{ secrets.FEISHU_WEBHOOK }}`，日志自动打码

## Lessons Learned

- 入场动画需使用 `backwards` 模式避免覆盖 hover/active 交互状态
- koa-connect wrapper caused ctx leaks, so native rewrite is required
