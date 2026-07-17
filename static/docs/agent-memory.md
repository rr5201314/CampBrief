# Agent 共享记忆

本文件是 简豹 项目的**工程决策记录**，供所有参与开发的 agent（TRAE、Codex、Hermes ）共享读取和维护。

> 为什么需要这个文件：各 agent 的本地记忆互不可见，容易导致规则不同步。本文件随仓库版本管理，任何 agent 做了影响他人的工程决策后都应同步到此，其他 agent 开工前也应先读这里。

维护规则：

- 只记录**跨会话需要保留的工程决策、参数约定、数据规则**，不记录一次性任务进度。
- 改动代码或数据结构后，若涉及此处已有规则，必须同步更新本文件。
- 与 `AGENTS.md`（项目规范）的分工：`AGENTS.md` 写稳定的原则性约定；本文件写具体的参数、排序规则、字段约定等易变但需要一致的细节。

---

## Engineering Conventions

- Public JSON data and project documentation are grouped under `static/`: runtime data lives in `static/data/`, and maintained documentation lives in `static/docs/`. Root-level `data/` and `docs/` directories must not be recreated.
- All animations respect `prefers-reduced-motion` media query for accessibility
- Scroll-triggered animations use IntersectionObserver with unobserve after single trigger
- Animation timing functions use `cubic-bezier(.4,0,.2,1)` for natural motion
- Stagger animations use incremental delays (e.g., 60ms per feed item, .1s/.2s/.3s for board sections)
- Homepage boards use the carousel only at `max-width: 768px`; desktop always restores the three-column board grid when the viewport grows past that breakpoint.
- On the mobile homepage carousel, the active board is full-size while adjacent previews are dimmed and scaled down; each switch animates the outgoing and incoming boards.
- Mobile carousel offsets are calculated from each board's layout position, so the first and last boards remain centered even when flex-track overflow excludes end padding from `scrollWidth`.
- Mobile navigation uses a transform-based menu track at `max-width: 860px`: CSS keeps vertical panning native, while `main.js` clamps the track offset to `[0, maxOffset]`. The navigation itself must not be a native horizontal scroll container and must not use `scroll-snap` or inertia, because edge hits must stop, never rebound.

## Hard Constraints

- Animations must work with `file://` protocol (no external dependencies)
- Mobile devices get simplified animation versions (degraded experience)

## 列表页统一规则（与每日资讯对齐）

- **每页数量**：所有列表页（每日资讯/技术/考试/竞赛）统一 `PAGE_SIZE = 5`
- **稳定 ID**：所有模块的条目用不可变 `id` 定位详情页（资讯 `news-<hash>`、竞赛/考试用各自 `id`），不再用 URL 定位
- **排序基准**：资讯/技术列表先按时效标签分组（24小时 → 3天 → 7天 → 30天 → 更早），同一时效区间内按优先级降序、发布时间降序；首页资讯看板按实际发布时间降序，仅在发布时间相同时按优先级降序；考试/竞赛按各自业务状态优先级排序
- **数据加载**：无离线回退副本，列表页直接读取真实 JSON 数据文件
- **输出安全**：所有模块统一用 `CampBriefContent.escapeHtml` 转义文本、`safeHttpUrl` 校验外链
- **加载/空状态**：列表页有显式加载态，空状态带 `role="status"`，筛选按钮同步 `aria-pressed`
- **分页交互**：四个列表页共享 `CampBriefPagination`；保留相邻页码与首尾页、省略号，并提供受总页数约束的“跳至第 N 页”输入（不显示“第 X / X 页”）。翻页后将新页首张卡片精确定位在吸顶导航下方 20px（窄屏为页面顶部 24px），窄屏分页控件自动换行。

## 考试模块数据规则

- `static/data/exams.json` 为考试目录（稳定参考信息），每项含详情字段：`format`/`duration`/`subjects`/`requirements`/`scoring`/`timeline`
- 四个 URL 字段分工：
  - `official_site`（稳定）：考试报名系统官网，详情页"立即报名/访问报名系统"按钮指向
  - `official_portal`（稳定）：考试项目官网，详情页"考试官网"按钮指向
  - `news_list_url`（稳定）：官方考试动态列表或日程页，agent 自动化从此处发现相关公告 URL
  - `official_url`（每期更新）：本期报名公告原文，详情页"查看官方公告"按钮指向，agent 从此抓取 timeline
- agent 维护流程：
  1. 读取 `static/data/exams.json` 作为 URL 唯一事实源，并按 `scripts/hermes/skills/CampBrief/campbrief-exams/source-policy.json` 的巡检模式处理
  2. 访问 `news_list_url` → 按考试名称、期次和考务/报名关键词筛选相关公告；不得将列表第一条、无关动态或渲染失败视为新公告
  3. 抓取确认相关的公告 URL → 解析时间节点 → 更新对应期次的 `official_url` 和 `timeline`；日程页或动态列表可合法作为 `official_url`
  4. 如有新一期，更新/新增对应期次；PSC、事业单位等仅保留全国官方入口，不采集各省或高校分散通知
- `timeline`（重要时间节点）数据来源：agent 主动从官方通知原文提取具体信息（日期、时段等）
  - 原文有具体信息时，直接填写（如"2026年上半年为 6月13日 9:00-11:20"）
  - 原文确实没有该信息时，才用"以官方公告为准"或"以所在学校通知为准"作为兜底
  - 不要偷懒给所有条目统一加"以官方公告为准"，必须先尝试提取原文信息
- 详情页不含 `prep_tips`（备考建议）字段——已移除
- 详情页顶部有醒目官方提示框（callout），底部有 notice，双重引导用户去官方渠道核实
- 时效性报名通知（每次考试不同）后续放入 `static/data/exam-notices.json`（方案B，待实现）
- 信息网格的"考试时间"字段需填写具体考试月份（如"2026年6月"），而非通用周期（如"每年6月、12月"）
- 考试和竞赛模块的状态标签需去除"阶段"后缀（如"可报名阶段"改为"可报名"）
- **结构化生命周期**：考试/竞赛状态只由可选 `lifecycle` 计算；`timeline`、`signup`、`schedule`、标题和摘要仅用于展示，禁止解析自然语言后直接改状态。
  - `mode=scheduled`：可用 `registration_start` / `registration_end` / `event_start` / `event_end`；值必须是 `YYYY-MM-DD` 或带偏移的 ISO8601。使用日期值时必须提供 IANA `time_zone`，结束日期包含当天。若 `status=open`，必须提供 `registration_end`，避免条目永久停留在“可报名”。
  - `mode=rolling|manual`：必须提供带时区的 `verified_at` 和 `review_after`，两者间隔不得超过 72 小时；超过 `review_after` 后前端派生为 `unknown`（待核验），不再展示“可报名”。72 小时是每日定时任务连续失败时的安全宽限，不是 skill 的执行频率配置。
  - 公开页面对没有 lifecycle 的 `status=open` 同样派生为 `unknown`；`unknown` 是前端安全状态，不写回 JSON。
  - 考试状态链：pending → open → closed → done。竞赛状态链：pending → open → closed → ongoing → done；边报名边比赛仍优先 open。
- **考试排序规则**（`compareExams`）：列表用 `LIST_STATUS_ORDER`（未开始 pending > 可报名 open > 报名截止 closed > 待核验 unknown > 已结束 done），轮播用 `CAROUSEL_STATUS_ORDER`（可报名 open > 未开始 pending > 已结束），再按含金量 `EXAM_PRESTIGE` 降序，最后按名称
- 考试列表筛选状态分组：未开始 / 可报名 / 报名截止 / 待核验 / 已结束；`closed` 只表示报名已截止，不能与考试已结束的 `done` 混淆。
- 卡片主按钮为「查看详情」，次按钮为官网/报名

## 竞赛模块数据规则

- `static/data/competitions.json` 为竞赛目录，包含三类赛事：教育部认可赛事（84项）、名企主办赛事、兴趣练手赛事
- 三级筛选体系：一级（赛事层次：教育部认可/名企主办/兴趣练手）、二级（专业领域：人工智能/机器人/计算机等13类）、三级（比赛状态：未开始/可报名/报名截止/比赛中/待核验/已完赛）
- 边报名边比赛的赛事优先归入「可报名」状态
- 每个赛事在 JSON 中通过 `tags` 数组支持一赛多领域分类
- **排序规则**（`compareCompetitions`）：状态优先（可报名 open > 未开始 pending > 比赛中 ongoing > 报名截止 closed > 待核验 unknown > 已完赛 done）→ 赛事层次（教育部 official > 名企 enterprise > 兴趣 hobby）→ 含金量 `prestige` 降序 → 名称
- 卡片主按钮为「查看详情」，次按钮为官网/报名（统一为资讯形式）
- 首页竞赛看板读取 `static/data/competitions.json` 真实数据，卡片点击进入对应详情页
- **首页竞赛看板筛选**：仅展示 lifecycle 有效且派生状态为 `open`（可报名）的赛事；缺少 lifecycle 的旧 `open` 显示为“待核验”，不进入首页或轮播
- **首页竞赛看板徽章**：赛事层级徽章（教育部认可/名企主办/兴趣练手）置于标题栏右侧，并排在状态徽章（如“可报名”）左侧；报名时间单独保留在下一行

### 竞赛采集源

| 源 | 脚本 | 编码 | 是否抓详情页 | ID 前缀 |
|---|---|---|---|---|
| 我爱竞赛网 52jingsai.com | `scripts/collect-52jingsai.py --detail` | GBK | 是（逐条抓详情页补主办方/截止日期） | `comp-52jingsai-` |
| 赛氪 saikr.com | `scripts/collect-saikr.py` | UTF-8 | 否（列表页一次拿全字段） | `comp-saikr-` |

- 赛氪采集 URL：`https://www.saikr.com/index/hot/contest`（SSR HTML，约 50 条热门竞赛）
- 赛氪列表页卡片 class 为 `item`，含 `name`/`organizer`/`views`/`followers`/`cover`/`status_hint` 六个字段
- `status_hint` 是公告摘要（已截断到 200 字），仅用于辅助状态判断，不写入发布数据
- 赛氪热门榜会混入资讯类条目（保研规划、时间轴等），`collect-saikr.py` 已按关键词过滤
- 跨源去重：同一竞赛可能被两个源同时收录，合并时优先采用 `organizer` 更完整或 `name` 更规范的版本
- ID 生成：`comp-{源名}-{SHA-256(name|url) 前 12 位}`，与源名绑定，避免跨源 ID 冲突

## 轮播组件规则

- 通用轮播组件位于 `assets/js/carousel.js`，四个模块（竞赛/考试/每日资讯/技术）各自在列表页顶部展示精选轮播
- 轮播模式：**滚轮缓慢滑动**（非分页切换），鼠标滚轮驱动水平位移，松开后1.5秒恢复自动平移
- 自动播放改为连续缓慢平移（12 px/秒），到末尾循环回开头
- 交互：滚轮、触摸拖拽、左右箭头按钮（平滑滚动 80% 视口宽度）、鼠标拖拽卡片（5px阈值判断）、底部滑动条拖拽定位
- 鼠标悬停时暂停自动平移
- 轮播卡片数量限制：3-15 个；少于 3 个时隐藏轮播区域；超过 15 个时只取前 15 个
- **考试轮播**：只收 lifecycle 有效且派生为 open 的条目，以及 `mode=scheduled`、派生为 pending 的明确未来期次；按"可报名>未开始"和含金量排序，上限 15。少于 3 个直接隐藏，不用雅思/托福或其他过期条目凑数
- **竞赛轮播**：同样只收 lifecycle 有效的 open，以及 `mode=scheduled` 的 pending；open 优先，上限 15。模糊年度 pending 和未结构化 open 不进入轮播
- **每日资讯轮播**：近3天内 priority>=4 的消息；不足3个时补充 priority>=3 的；按发布时间降序，上限15
- **资讯补位身份**：juya 拆分条目可能共享 URL，轮播补位与去重必须按稳定 `id`，不得按 URL
- **轮播长期巡检**：`python scripts/check-carousel-health.py` 只读报告四模块候选数量、是否隐藏、ID 完整性、数据集更新时间和考试/竞赛 lifecycle 覆盖；默认超过 36 小时未更新即警告，`--strict` 可将健康警告升级为失败
- 轮播卡片区域禁止文本选择和原生拖拽（`user-select:none` + `dragstart` 拦截）
- 拖拽超过5px阈值时阻止链接跳转（`suppressClick` 标记），正常点击仍可跳转
- 支持惯性滑动：快速拖拽松手后根据速度衰减继续滑动，边界停止

## 每日资讯优先级规则

- priority 4：头条（首页看板显示 + 资讯页轮播 + "头条"标签）
- priority 3：重磅（首页看板显示 + "重磅"标签）
- priority 2：重要（资讯列表页显示 + "重要"标签，不上首页看板）
- priority 1：普通（仅资讯列表页显示，首页看板不显示）
- **降级规则**：当 priority>=4 的条目超过 10 个时，最旧的（published 最早）降级为 priority 3；agent 维护数据时执行此规则
- 首页看板（home.js）显示近 3 天、priority 为 4/3 的消息（priority 2 不上首页看板），按实际发布时间降序、同一发布时间再按优先级降序
- 资讯与技术卡片的时间标签由 `CampBriefContent.getTimeBadge` 统一生成，并与日期筛选条件对齐：<24小时（24小时，蓝）、24–<72小时（3天，灰）、72–<168小时（7天，灰）、<30天（30天，浅灰）、≥30天（更早，最淡）

## 技术板块与每日资讯的分工

- **技术板块**（`pages/tech/`）：展示 `category=tech` 的条目，按 `subcategory` 分类筛选
  - 5 个子分类：`ai-frontier`（AI 前沿）/ `hardware`（硬件与芯片）/ `software`（软件与系统）/ `industry`（产业与商业）/ `github`（GitHub 趋势）
  - 数据源：
    - 技术动态：`static/data/daily-news.json` 中 `category=tech` 的条目
    - GitHub 趋势：`static/data/github-trending.json` 中 `category=tech/subcategory=github` 的条目（榜单形式，每个条目含 `repos` 数组）
  - 前端合并两个数据源后统一渲染、筛选、分页
  - 技术板块轮播：近3天 priority>=4，不足3个补 priority>=3，上限15
- **技术详情页**：`pages/tech/detail.html`，从 `daily-news.json` 和 `github-trending.json` 合并后按不可变 `id` 查找
  - 普通技术动态：显示标题、摘要、正文、原文链接
  - GitHub 趋势榜单：检测到 `repos` 数组时渲染 Top 10 项目卡片列表，每张卡片含排名、仓库名（链接）、语言、Stars/Forks/新增、中文概括、解决问题说明
- **每日资讯板块**：不显示 `category=tech` 的条目（前端过滤），只保留 AI 日常、体育、每日速览（内部分类值为 `fun`）。每日速览可收录轻量综合资讯、人物故事、历史文化和有知识增量的社会现象，不要求内容必须轻松有趣；严肃事件须客观、克制呈现。
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

## 自动化采集架构（脚本优先，Hermes 例外兜底）

- 四个内容任务统一先运行 `scripts/maintenance-gate.py`。采集、稳定 ID/URL 去重、结构校验、scheduled 状态同步、来源可达性和轮播健康度由脚本批量处理；Hermes 只读取 `local-notes/maintenance/*-handoff.json` 中本次新增或内容变化的 `tasks`。
- gate 退出码：`0` 表示不需要 Hermes 判断（`decision=no_action` 直接结束，`script_changes_ready` 自动校验并发布）；`10` 表示需要 Hermes 定向兜底；`20` 表示 gate 自身失败并安全停止。
- gate 报告与异常去重状态只保存在被忽略的 `local-notes/maintenance/`。Hermes 成功处理、校验并推送后必须用 `--ack` 确认本批任务；未 ack 的任务下次继续交接。已 ack 且内容未变化的异常在冷却期内不重复交接，内容指纹变化则立即重新交接。冷却期不是执行频率。
- 资讯原文链接先由 `scripts/check-daily-news-links.py` 批量去重、并发探测：非 juya 与 juya 分别使用来源排除/包含参数。`ok` 不交接，只有 `broken`、`restricted`、`error` 生成 `link_review`；Hermes 只复核任务 payload 中的 URL 和 `ids`。
- 考试来源先由 `scripts/collect-exam-notices.py` 对相同 `news_list_url` 合并下载并按 `source-policy.json` 匹配。唯一新候选、多候选、零命中、动态页面内容变化、页面壳和网络错误才交给 Hermes；脚本不解析正文日期。
- 采集脚本中的标题或 `status_hint` 启发式结果只作为候选线索，不得直接写入发布状态。状态事实仍只能来自可靠 lifecycle；自然语言日期不得参与自动状态计算。
- GitHub Trending 采集后不得在 gate 前让 Hermes 通读榜单；gate 只为缺少 `chinese_summary`/`solves_what` 的 repo 生成 `content_completion`。补写后必须通过 `scripts/validate-github-trending.py`。
- 完整协议和命令见 `static/docs/maintenance-workflow.md`。

### Hermes cron 当前配置（2026-07-15）

手机上的 Hermes agent 已配置以下四个定时任务，所有内容板块至少每天巡检一次（技术板块由 daily-news 中的技术源和 GitHub Trending 流程维护）。具体执行频率只在 cron 配置中维护，不复制到流程文件。cron 的职责是**按绝对路径读取对应 `SKILL.md` 并严格执行其中完整流程**；业务规则、采集参数、校验和推送行为维护在这些文件内，而不是复制到 cron prompt 中。

- 这些 `SKILL.md` 没有注册到 Hermes Agent 的 skill 目录，不会发生 skill config 注入。每个流程必须把 cron prompt 中指向自身的绝对路径记为 `SKILL_FILE`，向上五级推导 `$REPO`，并用 `$REPO/AGENTS.md` 验证根目录。

- `campbrief-daily-news`

  ```text
  读取 /data/data/com.termux/files/home/projects/CampBrief/scripts/hermes/skills/CampBrief/campbrief-daily-news/SKILL.md，按照其中的完整流程执行。
  ```

- `campbrief-exams`

  ```text
  读取 /data/data/com.termux/files/home/projects/CampBrief/scripts/hermes/skills/CampBrief/campbrief-exams/SKILL.md，按照其中的完整流程执行。
  ```

- `campbrief-competitions`

  ```text
  读取 /data/data/com.termux/files/home/projects/CampBrief/scripts/hermes/skills/CampBrief/campbrief-competitions/SKILL.md，按照其中的完整流程执行。
  ```

- `campbrief-daily-news-juya`

  ```text
  读取 /data/data/com.termux/files/home/projects/CampBrief/scripts/hermes/skills/CampBrief/campbrief-daily-news-juya/SKILL.md，按照其中的完整流程执行。
  ```

### 运行边界与流程

- **Hermes（手机，cron）** 是唯一的日常执行端；GitHub 仅作为远程仓库和 GitHub Pages 发布来源。
- `campbrief-daily-news`：先同步并确认工作区干净 → 采集非 juya RSS、同步 GitHub 趋势、批量检查非 juya 原文链接 → gate 去重与校验。退出码 `0` 直接结束或发布确定性变更；仅退出码 `10` 由 Hermes 处理 handoff 中的新候选、缺失中文字段、来源错误和链接异常 → 校验、提交、**再次 `git pull --ff-only` → `git push`** → ack 并清空本次候选池。
- `campbrief-daily-news-juya`：独立采集 juya 日报并只检查 juya 原文链接，随后执行同一 gate 协议；仅 handoff 中的新日报才拆分和编辑。它与前者共用发布文件 `static/data/daily-news.json`，不共用候选池与 gate state。
- `campbrief-exams`：先由脚本合并下载官方入口并按考试/期次批量匹配，再由 gate 同步状态、校验和去除重复异常；Hermes 只处理 handoff 中的唯一新候选、多候选、零命中、动态页变化或来源错误。URL 的唯一事实源是 `static/data/exams.json`；巡检规则在 `scripts/hermes/skills/CampBrief/campbrief-exams/source-policy.json`，skill 不维护网址快照。PSC、事业单位等仅保留全国官方入口，不采集各省/高校分散通知。
- `campbrief-competitions`：两个采集器输出先由 gate 按稳定 ID、规范化 URL 和名称批量去重，并确定性同步有可靠 lifecycle 的状态；Hermes 只处理新增/变化候选、来源失败和缺少可靠状态边界的条目。
- 考试/竞赛维护在写入展示文本和 lifecycle 后，必须调用 `scripts/check-temporal-status.py --scope <exams|competitions> --fix` 确定性同步状态；LLM 不得自行比较自然语言日期。完整本地只读验证入口为 `python scripts/check-project.py`。
- 任务必须在 `git status --porcelain --untracked-files=no` 无输出、开始时 `git pull --ff-only` 与遗留提交重试 `git push` 都成功后才继续；每次最终推送前还必须再次执行 `git pull --ff-only`。任一拉取或推送失败时安全停止，保留本地提交与候选池，禁止合并、变基或基于过期数据发布。
- 四个 skill 使用 `local-notes/.campbrief-automation.lock` 互斥访问同一工作树；已有锁时新任务以退出码 75 停止，绝不删除别的任务的锁。正常完成或受控提前停止必须释放自己的锁；异常崩溃留下的锁必须由人工确认后清理，优先保证不发生并发写入。

### 候选池规则

- 候选池仅存在于手机的被忽略目录 `local-notes/candidate-pools/`：非 juya 使用 `daily-news-YYYY-MM-DD.json`，juya 使用 `juya-YYYY-MM-DD.json`。历史 `static/data/daily-news-raw.json` 不再参与手机自动化，也不是发布数据。
- `scripts/collect-daily-news.py` 每次运行只保留**北京时间今天和前一天**发布且可解析日期的条目；前一天只用于采集延迟或上一次任务失败后的兜底。
- 候选池为空、缺失、格式错误或带采集错误时不得在 gate 前直接结束；交给 gate 生成可 ack、可抑制、可按内容变化重新触发的来源任务。
- 只有数据校验、提交和 `git push` 全部成功后，才删除本次候选池文件；失败时保留用于重试和排查。候选池永不提交到 Git。

### GitHub Actions 配置

- `.github/workflows/` 目录已清空，不再使用 GitHub Actions 做任何自动化采集。日常采集、编辑、校验和发布全部由手机 Hermes cron 完成。GitHub 仅作为远程仓库和 GitHub Pages 发布来源。

### 采集脚本参数

- 无参数：采集全部源。
- `--exclude "juya AI 日报"`：排除指定源（逗号分隔多个）。
- `--only "juya AI 日报"`：只采集指定源；仅与同一 `--output` 的候选合并。
- `--output PATH`：候选池输出路径；相对路径以仓库根目录为基准。手机 cron 必须输出到 `local-notes/candidate-pools/`。

### GitHub 趋势采集
- 脚本：`scripts/collect-github-trending.py`
- 输出：`static/data/github-trending.json`
- 数据源：GitHub 官方 Trending 页面（`https://github.com/trending?since=daily|weekly|monthly`），HTML 抓取 + 正则解析
- 榜单类型与采集频率：
  - 日榜：每天采集，标题如「7月12日 GitHub趋势日榜」
  - 周榜：每周一采集，标题如「7月第2周 GitHub趋势周榜」
  - 月榜：每月1日采集，标题如「7月 GitHub趋势月榜」
- 每个榜单条目含 `repos` 数组（Top 10 项目），每个 repo 含 name/url/language/stars/forks/stars_delta/description/chinese_summary/solves_what
- ID 格式：`github-{daily|weekly|monthly}-{YYYY-MM-DD}`，稳定不变
- 优先级规则：
  - 周榜/月榜：固定 `priority=4`（最高，进入首页看板和轮播）
  - 日榜：默认 `priority=2`，由 agent 根据项目质量判断是否调整
- `chinese_summary` 和 `solves_what` 由脚本留空；`campbrief-daily-news` 必须在手机端基于 README、仓库描述或官网补全，无法核验时不编造
- 运行参数：
  - 无参数：按日期自动判断采集哪些榜单
  - `--force-all`：强制采集全部三种榜单（初始化用）
  - `--force daily|weekly|monthly`：强制只采集指定类型
- 由 `campbrief-daily-news` 在手机端运行；无需 API Token（直接抓取 HTML 页面）
- 数据保留 90 天，超出自动清理
- 该数据为结构化数据，由脚本直接产出最终 JSON，不进入 `daily-news-raw.json` 候选池


## Lessons Learned

- 入场动画需使用 `backwards` 模式避免覆盖 hover/active 交互状态
- koa-connect wrapper caused ctx leaks, so native rewrite is required
