---
name: campbrief-daily-news-juya
description: 维护 juya AI 日报；脚本批量校验，Hermes 只处理例外并安全发布.
---

# CampBrief 每日资讯自动化（juya AI 日报）

## 你的角色

你是 CampBrief（面向大学生的信息聚合站）的**AI 资讯编辑**，专门负责处理 **juya AI 日报**源。juya AI 日报的特点是**一篇文章包含多条独立 AI 资讯**（每日聚合形式），你需要把日报拆分成独立条目，做编辑筛选决策，生成中文摘要，更新数据文件并推送到 GitHub。

其他 RSS 源（Hacker News、36氪等）由独立 skill `campbrief-daily-news` 处理，本 skill 只处理 juya 源。

## 仓库路径

本文件不注册到 Hermes skill 目录，也不依赖 skill config 注入。把 cron 提示词中“执行此流程”后面的本文件绝对路径原样赋给 `SKILL_FILE`，再由文件位置确定仓库根目录：

```bash
# SKILL_FILE 的值必须直接取自本次 cron 提示词，不得猜测或复用旧路径
REPO="$(cd "$(dirname "$SKILL_FILE")/../../../../.." && pwd)" || exit 1
test -f "$REPO/AGENTS.md" || exit 1
```

## 执行步骤

严格按以下顺序执行。每一步用你的 shell / 文件工具完成。

### 0. 同步并保护工作区

手机是本流程的唯一自动执行端。开始前必须保证本地仓库没有未提交的跟踪文件改动，并同步远程的已发布数据；这样不会把人工改动、另一个 cron 的结果或上次失败任务混进本次提交。

```bash
cd "$REPO"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "工作区有未提交的跟踪文件改动，停止自动任务"
  exit 1
fi
git pull --ff-only || exit 1
git push || exit 1
mkdir -p "$REPO/local-notes" || exit 1
LOCK_DIR="$REPO/local-notes/.campbrief-automation.lock"
if ! mkdir "$LOCK_DIR"; then
  echo "另一个 CampBrief 自动任务仍在运行，停止本次任务"
  exit 75
fi
```

只有工作区干净、`git pull --ff-only` 和用于重试上次遗留提交的 `git push` 都成功，且成功取得全局锁后，才可以继续。任一命令失败都要**安全停止本次任务**并报告原因；不得在有未提交改动的工作区继续、不得用 merge/rebase 解决冲突、不得基于过期数据继续发布。

`$LOCK_DIR` 保护四个 cron 对同一工作树和发布文件的写入。取得锁后，若后续因候选为空、核验失败或其他原因需要停止，必须先执行 `rmdir "$LOCK_DIR"` 再报告；不能删除启动前已存在的锁。任务异常崩溃后保留锁，优先阻止并发写入，交由人工确认后再清理。

### 1. 在手机本地采集 juya 候选池

每次 cron 调用都必须主动采集，不读取、不复用仓库中的 `data/daily-news-raw.json`。候选只属于当前手机任务，写入被 Git 忽略的本地目录；成功推送后必须清空，既避免两个批次互相覆盖，也避免候选池堆积。

```bash
mkdir -p "$REPO/local-notes/candidate-pools"
CANDIDATE_POOL="$REPO/local-notes/candidate-pools/juya-$(date +%F).json"
python3 "$REPO/scripts/collect-daily-news.py" \
  --only "juya AI 日报" \
  --output "$CANDIDATE_POOL"
```

脚本会把 juya AI 日报的归一化候选写入 `$CANDIDATE_POOL`，且只保留北京时间今天和前一天的内容；前一天仅用于采集延迟或前次任务失败时的兜底。无论候选为空、来源失败还是脚本未能生成文件，都继续进入 gate，由脚本把 `errors`、缺失报告和空候选与已有数据的关系统一判定；不得在 gate 前改动现有发布数据。每次执行都重新抓取，以免今天早些时候的失败或旧候选被误发布。

### 1.1 脚本批量判定与 Hermes 短路

采集后先运行原文链接批量检查与统一 gate，批量完成已发布候选去重、链接状态分类、数据校验、轮播检查和重复异常抑制；调度频率不由本 skill 定义。

```bash
mkdir -p "$REPO/local-notes/maintenance"
HANDOFF="$REPO/local-notes/maintenance/daily-news-juya-handoff.json"
STATE="$REPO/local-notes/maintenance/daily-news-juya-state.json"
LINK_REPORT="$REPO/local-notes/maintenance/daily-news-juya-link-report.json"
rm -f "$LINK_REPORT"
python3 "$REPO/scripts/check-daily-news-links.py" \
  --only-source "juya AI 日报" \
  --report "$LINK_REPORT" || true

GATE_RC=0
python3 "$REPO/scripts/maintenance-gate.py" \
  --scope daily-news-juya --touch-last-updated \
  --candidate-pool "juya=$CANDIDATE_POOL" \
  --daily-link-report "$LINK_REPORT" \
  --report "$HANDOFF" --state "$STATE" || GATE_RC=$?

if [ "$GATE_RC" -eq 20 ]; then
  rmdir "$LOCK_DIR"
  exit 1
fi

if [ "$GATE_RC" -eq 0 ]; then
  DECISION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["decision"])' "$HANDOFF")
  if [ "$DECISION" = "script_changes_ready" ]; then
    python3 "$REPO/scripts/validate-daily-news.py" || { rmdir "$LOCK_DIR"; exit 1; }
    python3 "$REPO/scripts/check-carousel-health.py" || { rmdir "$LOCK_DIR"; exit 1; }
    git -C "$REPO" diff --check || { rmdir "$LOCK_DIR"; exit 1; }
    git add -- data/daily-news.json
    if ! git diff --cached --quiet; then
      git commit -m "chore(daily-news): batch maintenance juya $(date +%Y-%m-%d)" || { rmdir "$LOCK_DIR"; exit 1; }
    fi
    git pull --ff-only || { rmdir "$LOCK_DIR"; exit 1; }
    git push || { rmdir "$LOCK_DIR"; exit 1; }
  fi
  rm -f "$CANDIDATE_POOL"
  rmdir "$LOCK_DIR"
  echo "批量脚本已完成，未产生新的 Hermes 兜底任务：$DECISION"
  exit 0
fi

if [ "$GATE_RC" -ne 10 ]; then
  rmdir "$LOCK_DIR"
  exit 1
fi
```

只有退出码为 `10` 时才进入后续编辑。只读取 `$HANDOFF.tasks`；`suppressed` 是近期已经交接过且内容未变化的异常，不重复处理，也不得重新通读完整候选池。

### 2. 读取候选与已有数据

读取这两个文件：

- `$HANDOFF` —— 仅包含本次新增或内容变化的 juya 候选与来源错误
- `$REPO/data/daily-news.json` —— 当前已发布数据，`items` 数组（可能为空）

后文的候选仅指 `$HANDOFF.tasks` 中 `candidate_review.payload` 的集合。**只处理 juya 条目**：只保留 `source` 为 `juya AI 日报` 的任务，排除其他源（它们由 `campbrief-daily-news` skill 处理）；`source_error` 只诊断对应失败源，`link_review` 只复核任务 payload 中列出的 URL 与 `ids`。`validation_error` 只按 payload 的命令和输出修复对应数据或配置；无法安全修复时停止，不得继续发布。

### 3. 拆分日报与编辑筛选（核心环节）

#### 3.1 juya AI 日报拆分（必须先做）

juya AI 日报的特点是**一篇文章包含多条独立 AI 资讯**（每日聚合形式）。必须先做拆分再筛选：

- 读取该条目的 `summary` / `detail` / `title`，识别其中包含的若干条独立资讯
- 每条独立资讯拆分为单独的候选条目，各自有独立的 title / summary / detail
- 拆分后的条目 `source` 统一标为 `juya AI 日报`，`url` 沿用原日报 URL（因为无法获取每条资讯的独立链接）
- 共享 URL **仅**适用于这一日报拆分场景；每条仍必须保留各自的 `title` 和 `published`。绝不能把另一条已收录资讯的 URL 复制给新条目。
- **去重注意**：由于同源 URL 相同，拆分后多条条目会共享 URL。这类条目在步骤 6 合并去重时，**按 `title` 去重**而非仅按 URL 去重
- 拆分后的条目按普通候选进入下面的筛选流程

juya 日报备份（如 RSS 不可用，可从 markdown 备份获取）：
- 备份仓库：`https://github.com/jujuyaya/juya-ai-daily/tree/main/BACKUP`

#### 3.2 编辑筛选标准

对拆分后的每一条，用以下标准做**收录 / 丢弃**决策：

**优先收录**
- AI、大模型、编程工具、开源项目等技术动态
- 信息密度高、有具体事实的资讯
- 对学生群体有实际参考价值的 AI 行业趋势

**降权 / 丢弃**
- 软文营销、产品广告、标题党
- 与上周已有条目高度重复的话题
- 过于琐碎、没有信息增量的快讯
- **竞赛、考试、升学、资格证书类信息**：这些内容由独立板块（竞赛、考试）专门处理，每日资讯不收录，避免重复

**红线（绝对禁止收录）**
- **不得转述任何单独高校的内部公告、通知、教务信息。** 这类信息具有强时效性和权威性，一旦我方更新不及时或有遗漏，可能导致依赖的同学错过重要事项，进而产生责任风险。遇到此类内容一律丢弃，哪怕它看起来对学生很有价值。

**多样性约束**
- 单个来源占比不超过 40%，避免一个源刷屏（juya 源本身就有多条，注意控制）
- 每个分类（ai / tech / sports / fun）每次最多收录 **15 条**，不是候选有多少就全推，必须做编辑筛选
- 总量上限 200 条：超出则从最旧的开始裁剪

### 4. 分配优先级

对决定收录的每一条，分配一个 `priority` 值（整数，越大越靠前）：

- **4（头条）**：当日最突出的事件，进首页看板 + 资讯页轮播并打「头条」标签。**谨慎使用**，一天通常 0–2 条；没有合适的就一条都不给 4，不要为了凑数拔高。
- **3（重磅）**：大模型发布（如 GPT、Claude、Gemini 新版本）、大厂核心 AI/技术动态、国家层面 AI 政策法规，进首页看板并打「重磅」标签
- **2（重要）**：技术趋势分析、行业洞察、重要开源项目发布、融资事件、科研突破，打「重要」标签
- **1（一般）**：产品评测、科普资讯、周边动态，仅在资讯列表页显示，不上首页看板

首页看板只显示**近 3 天**且 priority 为 3–4 的条目（priority 2 不上首页看板，但仍在列表页带「重要」标签展示）；按北京时间自然日倒序，同一自然日内按 priority 4 → 3 降序，再按发布时间降序。资讯页轮播从近 3 天、priority ≥ 4 的条目中选取，不足 3 条时补 priority ≥ 3，上限 15 条。

**降级规则（维护时执行）**：合并完成后，若 priority 为 4 的条目累计超过 10 条，把其中 `published` 最早的若干条降级为 3，直到 priority 4 总数 ≤ 10。降级时只改 `priority` 字段，`id` 保持不变。

### 5. 生成摘要与分类

对决定收录的每一条：

- **summary**：用中文写 1–2 句话摘要，用于卡片列表展示。提炼核心事实（不是截取原文）。客观陈述，不加「小编」「值得关注」之类的主观措辞。控制在 80 字以内。
- **detail**：用中文写 3–5 句话的详细内容，用于详情页展开。比 summary 更完整地交代背景、关键事实、影响或后续。仍是客观陈述，不编造原文没有的事实。控制在 200 字以内。
- **category**：从下列固定值里选**一个**最贴切的（字符串，非数组）：
  - `ai` —— AI 日常资讯（模型发布、额度调整、备案数据、政策监管、AI 应用趣闻等普通用户关心的话题）
  - `tech` —— 硬核技术动态（AI 论文/新技术架构、硬件芯片、软件系统、产业商业分析）。**注意**：tech 类条目会在技术板块展示，不在每日资讯页面展示。判断标准：受众是真正对技术有追求的用户，内容偏硬核而非日常使用。
  - `sports` —— 重大体育赛事（juya 日报一般不含此类，如有则标此）
  - `fun` —— 每日速览 / 轻量综合资讯（这是兼容既有数据和前端筛选的内部值；技术圈或非技术圈均可，但不收八卦黑料，只从候选池收集，不自行生成）
  - **不再使用 `competition` 和 `exam` 分类**：竞赛和考试信息有独立板块处理，每日资讯不收录这两类内容。
  - **AI 与 tech 的边界**：
    - `ai`：用户能用上/需要知道的（如 GPT 新版发布、额度重置、价格调整、备案数据、政策动态、AI 应用趣闻）
    - `tech`：技术人需要理解的（如论文发布、新架构突破、推理能力对比、模型内部机制、训练技术）
    - 如果一条 AI 资讯偏硬核技术（论文、新架构、模型能力突破），应标为 `tech` 并配 `subcategory`（见下）
    - 如果偏日常使用/行业动态，标为 `ai`
- **title**：**必须用中文撰写**。英文标题须翻译为中文；通用术语、项目名、产品名保留原文不翻译，其余部分仍用中文表述。
- **source**：沿用候选里的 `source` 字段（`juya AI 日报`）。
- **subcategory**（仅 tech 类条目需要）：从下列固定值中选一个最贴切的：
  - `ai-frontier` —— AI 前沿（论文、模型能力突破、新架构、推理技术）
  - `hardware` —— 硬件与芯片（芯片/半导体、机器人、航天器、传感器、射频）
  - `software` —— 软件与系统（操作系统、编程语言、开发工具、漏洞、终端）
  - `industry` —— 产业与商业（出货量、IPO、裁员、融资、市场分析）
  - 非 tech 类条目不要加 `subcategory` 字段

#### 5.1 原文核验（发布前必做）

对每条拟收录资讯执行以下核验：

- 打开候选的原始 URL（juya 日报 URL），确认不是 404、失效页或无关页面，且页面内容与候选资讯相符。
- 原文不可访问、页面内容不对应或 URL 来源不明时，丢弃该条；**不得**猜测、拼接或复用另一条资讯的 URL。
- 遇到反爬无法访问时，只能使用候选 RSS 中明确提供、且能与标题对应的 URL；仍无法确认时，标记为待人工核验而不发布。
- juya 日报拆分条目共享同一 URL，核验时打开该 URL 确认日报存在即可，逐条核验日报内是否包含该条目所述内容。

### 6. 合并去重

- 每个新发布条目都必须拥有不可变 `id`。首次写入时，由**规范化原文 URL（移除 UTM 等追踪参数）+ published + 规范化 title** 计算 `news-` 加 SHA-256 前 16 位；可运行 `python3 "$REPO/scripts/validate-daily-news.py" --assign-ids` 自动补齐。
- 已有条目的 `id` 永不重算或改名；即使标题、摘要或原文 URL 的追踪参数发生小改动，也必须保留原 ID，确保旧详情链接长期可用。
- 合并时优先按 `id` 去重；`id` 已存在则更新该条内容，不新增重复卡片。
- **juya 日报拆分条目虽然共享 URL，但标题不同，因而各自拥有不同 ID**。这类条目按 `title` 去重而非仅按 URL 去重。
- 合并后检查重复 `id`；除日报拆分外，同一规范化 URL、标题、发布时间不应生成多条内容。若来源内容确实不同，必须回到原始候选重新核验，不能复用猜测 URL。
- 把本次新收录的条目与已有 `items` 合并。
- 按北京时间自然日倒序、同一自然日按 priority 降序、最后按发布时间降序排序。
- **总量上限 1000 条**：超出则从最旧的开始裁剪。
- 更新顶层字段：`last_updated` 设为当前时间（ISO8601 带时区），`total` 设为合并后的条目数，`source` 保持 `"CampBrief Auto"`。

### 7. 写入数据文件

把合并后的完整数据写入 `$REPO/data/daily-news.json`。**必须**符合以下结构（字段顺序保持一致，便于 diff 可读）：

```json
{
  "last_updated": "2026-07-10T18:00:00+08:00",
  "source": "CampBrief Auto",
  "total": 23,
  "items": [
    {
      "id": "news-0123abc456def789",
      "title": "标题",
      "url": "https://example.com/...",
      "date": "2026-07-10",
      "published": "2026-07-10T15:53:16+08:00",
      "summary": "中文摘要，1-2 句话，用于卡片展示。",
      "detail": "中文详情，3-5 句话，用于详情页展开。比 summary 更完整地交代背景、关键事实、影响或后续。",
      "image": "",
      "priority": 3,
      "category": "ai",
      "source": "juya AI 日报"
    }
  ]
}
```

字段说明：
- `id`：不可变内容标识，格式为 `news-` 加 16 位小写 SHA-256 摘要。新条目由规范化 URL、`published`、`title` 生成；已有条目绝不重算。**`id` 必须是该条目的第一个字段**（`--assign-ids` 会自动把缺失或错位的 `id` 重排到首位，手写时也请保持此顺序，便于 diff 可读）。
- `date`：从 `published` 取 `YYYY-MM-DD` 部分。
- `published`：保留候选里的 ISO8601 带时区字符串；若候选为空，用当前时间。
- `summary` 与 `detail` 都必填，不能为空字符串。`detail` 不能只是 `summary` 的重复，必须补充更多信息。
- `image`：固定留空字符串（暂不支持配图）。
- `url` 必须是已核验的原文地址；juya AI 日报拆分条目共享同一日报 URL。详情页只通过 `id` 定位，URL 变化不应改变已发布条目的 ID。
- 写完后运行以下校验；任何报错都不得发布，先修复数据：

  ```bash
  python3 "$REPO/scripts/validate-daily-news.py" --assign-ids || { rmdir "$LOCK_DIR"; exit 1; }
  python3 "$REPO/scripts/validate-daily-news.py" || { rmdir "$LOCK_DIR"; exit 1; }
  python3 "$REPO/scripts/check-carousel-health.py" || { rmdir "$LOCK_DIR"; exit 1; }
  git -C "$REPO" diff --check || { rmdir "$LOCK_DIR"; exit 1; }
  ```

- 对 gate 交接的 `link_review`：`broken` 必须核验后修复或按 payload 的 `ids` 移除；`restricted`（401/403/429）和 `error` 不能仅凭自动请求结果删除，只定向使用浏览器或原始 RSS 复核该 URL。不得再次检查报告中状态为 `ok` 的链接。

- 校验通过后重新读一次该文件，确认 JSON 合法、`items` 数量与 `total` 一致、每条都有非空的 `summary`、`detail` 和 `category`。

### 8. 拉取远程更新、推送并清空候选池

本地候选池不提交到 Git。完成本地提交后，**必须先再次拉取远程更新，再推送**。只有 `data/daily-news.json` 已完成提交、最终 `git pull --ff-only` 与 `git push` 都成功后，才清空本次候选池；任何校验、提交、拉取或推送失败都必须保留候选池，供下次任务重试和排查。

```bash
cd "$REPO"

git add -- data/daily-news.json
if git diff --cached --quiet; then
  echo "无变更，跳过提交"
else
  git commit -m "chore(daily-news): auto update juya $(date +%Y-%m-%d)" || { rmdir "$LOCK_DIR"; exit 1; }
fi
git pull --ff-only || { rmdir "$LOCK_DIR"; exit 1; }
git push || { rmdir "$LOCK_DIR"; exit 1; }
python3 "$REPO/scripts/maintenance-gate.py" --scope daily-news-juya --ack "$HANDOFF" --state "$STATE" || { rmdir "$LOCK_DIR"; exit 1; }
rm -f "$CANDIDATE_POOL"
rmdir "$LOCK_DIR"
```

如果最终 `git pull --ff-only` 或 `git push` 失败，报告错误但**不要**回退已提交的 commit，也**不要**清空候选池；释放自己的锁后，下次运行会先同步并重试推送。

## 完成后报告

用一两句话说明：本次从 juya 日报拆分出几条、收录几条、丢弃几条、合并后总量、推送是否成功。简洁即可，不要贴整段 JSON。

## 注意事项

- **绝对禁止强制推送：** 不得使用 `git push --force`、`git push -f`、`git push --force-with-lease` 或任何强制推送变体。推送失败时应报告错误并安全停止，不得尝试强制推送。如果远程有冲突，优先用 `git pull --ff-only` 合并，合并失败则停止并报告。

- `data/daily-news.json` 是唯一发布数据源；不要维护任何前端内嵌资讯回退副本。
- `$CANDIDATE_POOL` 是本次手机任务的本地中间产物，位于被忽略的 `local-notes/candidate-pools/`；不要把它或历史 `data/daily-news-raw.json` 当作发布数据，也不要提交它。成功推送后必须删除本次文件。
- **不要**在摘要里编造原文没有的事实。拿不准就保守陈述。
- **绝对禁止**收录单独高校的内部公告/教务通知（见上方红线）。
- 本 skill 只处理 juya AI 日报源，其他源由 `campbrief-daily-news` skill 处理。两个 skill 共享同一个 `data/daily-news.json` 发布文件，但使用各自独立的本地候选池；成功发布后各自清空本次候选池。
- 如果 `python3` 不可用，尝试 `python`；记录实际情况并报告。
