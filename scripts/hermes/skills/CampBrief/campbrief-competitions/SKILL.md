---
name: campbrief-competitions
description: 维护竞赛数据；脚本批量校验，Hermes 只处理例外并安全发布.
---

# CampBrief 竞赛模块自动化维护

## 角色与结果

你是 CampBrief（面向大学生的信息聚合站）的竞赛信息维护员。每次执行都要完成一轮完整的采集→筛选→合并→校验→发布流程。

你的结果是"站内竞赛数据已更新并推送到 GitHub"，而不是"采集脚本跑完了"。

## 数据源

| 源 | 采集方式 | 可靠性 |
|---|---|---|
| 我爱竞赛网 52jingsai.com | `scripts/collect-52jingsai.py --detail` | ✅ 静态 HTML，GBK 编码，需逐条抓详情页 |
| 赛氪 saikr.com | `scripts/collect-saikr.py` | ✅ SSR HTML，UTF-8，列表页一次拿全字段 |

两个源并行采集，先交给 `maintenance-gate.py` 与已发布数据批量对照，再只把新增、变化或错误任务交给 Hermes。赛氪标题前缀和 `status_hint` 只是候选线索，采集器的启发式 `status` 不得直接写入发布数据；最终状态必须来自可靠的结构化 lifecycle。

## 仓库路径

本文件不注册到 Hermes skill 目录，也不依赖 skill config 注入。把 cron 提示词中“执行此流程”后面的本文件绝对路径原样赋给 `SKILL_FILE`，再由文件位置确定仓库根目录：

```bash
# SKILL_FILE 的值必须直接取自本次 cron 提示词，不得猜测或复用旧路径
REPO="$(cd "$(dirname "$SKILL_FILE")/../../../../.." && pwd)" || exit 1
test -f "$REPO/AGENTS.md" || exit 1
```

## 执行步骤

严格按以下顺序执行。

### 0. 同步并保护工作区

```bash
cd "$REPO" || exit 1
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "工作区有未提交的跟踪文件改动，停止自动任务"
  exit 1
fi
git pull --ff-only || exit 1
git push || exit 1

mkdir -p local-notes || exit 1
LOCK_DIR="$REPO/local-notes/.campbrief-automation.lock"
if ! mkdir "$LOCK_DIR"; then
  echo "另一个 CampBrief 自动任务仍在运行，停止本次任务"
  exit 75
fi
```

只有工作区干净、`git pull --ff-only` 和 `git push` 都成功，且成功取得全局锁后，才可以继续。

### 1. 采集新竞赛数据

并行运行两个采集脚本，分别抓取我爱竞赛网和赛氪的竞赛列表：

```bash
# 先删除旧批次，避免本次源失败时误读上次结果
rm -f "$REPO/local-notes/competitions-52jingsai.json" "$REPO/local-notes/competitions-saikr.json"

# 源 1：我爱竞赛网（含详情页，较慢）
python3 "$REPO/scripts/collect-52jingsai.py" \
  --max 30 --detail \
  --output "$REPO/local-notes/competitions-52jingsai.json"

# 源 2：赛氪热门排行榜（列表页一次拿全字段，较快）
python3 "$REPO/scripts/collect-saikr.py" \
  --max 50 \
  --output "$REPO/local-notes/competitions-saikr.json"
```

两个脚本各自独立输出，采集完成后一律继续进入 gate，不在此处提前结束：
- 两个源均为空、输出缺失或格式错误时，由 gate 形成来源异常任务，不得在 gate 前改动现有数据
- 单个源失败时由 gate 只交接该来源，另一个来源仍正常批量去重
- 52jingsai 部分详情页失败是正常的，只有列表页全部失败才视为源失败
- 赛氪的 `status_hint` 字段是整段公告摘要（已截断到 200 字），只进入兜底任务辅助查找官方事实，不直接写入发布数据或决定状态

### 1.1 脚本批量判定与 Hermes 短路

采集结束后先运行统一 gate。它会批量完成候选与已发布数据的稳定 ID/URL/名称去重、结构化状态同步、数据校验和异常去重；调度频率不由本 skill 定义。

```bash
mkdir -p "$REPO/local-notes/maintenance"
HANDOFF="$REPO/local-notes/maintenance/competitions-handoff.json"
STATE="$REPO/local-notes/maintenance/competitions-state.json"
GATE_RC=0
python3 "$REPO/scripts/maintenance-gate.py" \
  --scope competitions --fix --touch-last-updated \
  --candidate-pool "52jingsai=$REPO/local-notes/competitions-52jingsai.json" \
  --candidate-pool "saikr=$REPO/local-notes/competitions-saikr.json" \
  --report "$HANDOFF" --state "$STATE" || GATE_RC=$?

if [ "$GATE_RC" -eq 20 ]; then
  rmdir "$LOCK_DIR"
  exit 1
fi

if [ "$GATE_RC" -eq 0 ]; then
  DECISION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["decision"])' "$HANDOFF")
  if [ "$DECISION" = "script_changes_ready" ]; then
    python3 "$REPO/scripts/validate-competitions.py" || { rmdir "$LOCK_DIR"; exit 1; }
    python3 "$REPO/scripts/check-carousel-health.py" || { rmdir "$LOCK_DIR"; exit 1; }
    git -C "$REPO" diff --check || { rmdir "$LOCK_DIR"; exit 1; }
    git add -- data/competitions.json
    if ! git diff --cached --quiet; then
      git commit -m "chore(competitions): batch maintenance $(date +%Y-%m-%d)" || { rmdir "$LOCK_DIR"; exit 1; }
    fi
    git pull --ff-only || { rmdir "$LOCK_DIR"; exit 1; }
    git push || { rmdir "$LOCK_DIR"; exit 1; }
  fi
  rm -f "$REPO/local-notes/competitions-52jingsai.json" "$REPO/local-notes/competitions-saikr.json"
  rmdir "$LOCK_DIR"
  echo "批量脚本已完成，未产生新的 Hermes 兜底任务：$DECISION"
  exit 0
fi

if [ "$GATE_RC" -ne 10 ]; then
  rmdir "$LOCK_DIR"
  exit 1
fi
```

只有退出码为 `10` 时才进入后续 Hermes 处理。此时只读取 `$HANDOFF` 的 `tasks`；`suppressed` 是近期已经交接过且内容未变化的异常，不重复处理。不得重新通读两个原始候选池。

### 2. 读取已有数据

只读取这两个文件：

- `$HANDOFF` —— 本次新增或内容变化的异常任务，候选原文位于各任务的 `payload`
- `$REPO/data/competitions.json` —— 当前已发布数据

### 3. 合并去重与分类

只对 `$HANDOFF.tasks` 中的 `candidate_review`、`candidate_change`、`status_review` 和 `lifecycle_error` 执行以下处理；`source_error` 只诊断对应源，不扫描其他已通过脚本处理的条目；`validation_error` 只按 payload 的命令与输出修复对应数据或配置，无法安全修复时停止发布：

**去重规则（跨源 + 既有数据）：**
- 按竞赛名称模糊匹配（去掉括号内容、标点后比较）
- 名称相似度 > 80% 视为重复，跳过
- 完全相同的 URL 也视为重复
- **跨源冲突处理**：同一竞赛可能同时被 52jingsai 和 saikr 收录。若赛氪条目的 `organizer` 更完整或 `name` 更规范（含届次/年份），优先采用赛氪版本；否则保留 52jingsai 版本。合并时保留更完整的字段，不要简单丢弃任一条目。

**链接校验（硬性要求）：**
每条竞赛必须至少有一个有效链接（`official_site` 或 `official_url`）。两个都为空的条目**禁止写入数据文件**，直接丢弃。这是前端详情页"查看官方信息/查看信息来源"按钮的数据源，没有链接用户无法跳转。

**分类标注（tier + prestige）：使用参考表批量对照**

先运行批量分类脚本，对照参考表自动标注：

```bash
python3 "$REPO/scripts/classify-competitions.py" --apply
```

脚本逻辑：以主办方为主、竞赛名称为辅，对照 `scripts/competition-tier-ref.json` 参考表自动分配 tier 和 prestige。

**脚本未命中的条目**：需要手动核验。搜索该主办方/竞赛的含金量背景，确认 tier 和 prestige 后补全到参考表 `scripts/competition-tier-ref.json`，然后重新运行脚本。

参考表结构：
- `organizers`：主办方名 → tier + prestige
- `competitions`：竞赛关键词 → tier + prestige
- 新增条目时保持已有格式，prestige 按 1-10 标准评分

**领域标注（fields）：**
根据竞赛名称和主办方自动标注，可多选：
- `computer`：含"编程"、"程序设计"、"软件"、"IT"、"计算机"、"三维"、"数字化"
- `ai`：含"人工智能"、"AI"、"机器学习"、"深度学习"
- `language`：含"英语"、"翻译"、"词汇"、"外语"
- `design`：含"设计"、"艺术"、"创意"、"广告"
- `innovation`：含"创业"、"创新"、"创客"
- 其他字段参照 `data/competitions.json` 的 `fields` 列表

**状态判断（status）：**
- `pending`：明确尚未开始报名。
- `open`：当前可以报名；边报名边比赛仍归 `open`。
- `closed`：报名已截止，比赛尚未开始或结束时间未知。
- `ongoing`：报名已截止，比赛/评审仍在进行。
- `done`：比赛/评审全部结束。

**结构化生命周期（每次执行必做）：**

- `lifecycle` 是状态计算的唯一时间事实源；标题、`signup`、`schedule`、`summary` 只负责展示，不得由前端或 LLM直接解析后改状态。
- 有明确时间时用 `mode=scheduled`，按来源填写 `registration_start`、`registration_end`、`event_start`、`event_end`。日期格式只允许 `YYYY-MM-DD` 或带偏移的 ISO8601；日期值必须配 IANA `time_zone`。若状态为 `open`，必须有可靠的 `registration_end`，只有开始时间或比赛时间不能支撑持续显示“可报名”。
- 明确为全年滚动时用 `mode=rolling`；来源只给当前状态、无法得到可靠时间边界时用 `mode=manual`。两者必须填写带时区的 `verified_at` 和 `review_after`，复核有效期不得超过 72 小时。复核到期后前端显示“待核验”。
- 无年份日期仅在赛事名称或公告明确给出所属年份时才可结构化；否则保留展示文本，不得猜年份。
- 只有 `registration_end` 已过时应变为 `closed`，绝不能直接当作 `done`；有 `event_start`/`event_end` 时才可继续计算 `ongoing`/`done`。
- 新增或更新为 `open` 的条目必须同时写入有效 lifecycle，否则公开页面只显示“待核验”，且不会进入首页或轮播。

写入数据后运行 `python3 "$REPO/scripts/check-temporal-status.py" --scope competitions --fix`，让确定性脚本同步状态，并在报告中列出全部状态变化。

**ID 生成：**
- 我爱竞赛网新条目：`comp-52jingsai-{hash}`，hash 由名称+URL 计算 SHA-256 前 12 位
- 赛氪新条目：`comp-saikr-{hash}`，hash 由名称+URL 计算 SHA-256 前 12 位
- 已有条目：保留原 ID 不变

### 4. 写入数据文件

把合并后的数据写入 `$REPO/data/competitions.json`。保持字段顺序一致：

**无论是否有新内容，每次执行都必须更新 `last_updated` 为当前时间（ISO8601 带时区）。** 这是前端显示"最近更新时间"的依据。即使无新竞赛入库、无状态变更，也必须写入当前时间戳并提交。

```json
{
  "last_updated": "2026-07-15T09:00:00+08:00",
  "source": "CampBrief Auto",
  "total": 105,
  "tiers": [...],
  "fields": [...],
  "status_map": {...},
  "items": [
    {
      "id": "52jingsai-a1b2c3d4e5f6",
      "name": "竞赛名称",
      "tier": "hobby",
      "fields": ["language"],
      "status": "open",
      "lifecycle": {
        "mode": "scheduled",
        "time_zone": "Asia/Shanghai",
        "registration_end": "2026-08-06",
        "verified_at": "2026-07-15T09:00:00+08:00"
      },
      "signup": "即日起至8月6日",
      "schedule": "",
      "summary": "来源：我爱竞赛网。",
      "search": "",
      "official_url": "https://www.52jingsai.com/article-xxx.html",
      "official_site": "",
      "organizer": "主办方名称",
      "prestige": 3
    }
  ]
}
```

**prestige 评分（1-10）：**
- `official` tier：默认 8-10
- `enterprise` tier：默认 5-7
- `hobby` tier：默认 3-5

**总量上限 500 条**：超出则从 prestige 最低的开始裁剪。

写完后运行校验：

```bash
python3 -m json.tool "$REPO/data/competitions.json" >/dev/null || { rmdir "$LOCK_DIR"; exit 1; }
python3 "$REPO/scripts/check-temporal-status.py" --scope competitions --fix || { rmdir "$LOCK_DIR"; exit 1; }
python3 "$REPO/scripts/validate-competitions.py" || { rmdir "$LOCK_DIR"; exit 1; }
python3 "$REPO/scripts/check-carousel-health.py" || { rmdir "$LOCK_DIR"; exit 1; }
git -C "$REPO" diff --check || { rmdir "$LOCK_DIR"; exit 1; }
```

校验脚本会检查：链接完整性（至少一个链接）、id 非空且不重复、name 非空。有不合格条目时会报错，必须修复后才能提交。

### 5. 推送并清空临时文件

```bash
cd "$REPO"
git add -- data/competitions.json
if git diff --cached --quiet; then
  echo "无变更，跳过提交"
else
  git commit -m "chore(competitions): auto update $(date +%Y-%m-%d)" || { rmdir "$LOCK_DIR"; exit 1; }
fi
git pull --ff-only || { rmdir "$LOCK_DIR"; exit 1; }
git push || { rmdir "$LOCK_DIR"; exit 1; }
python3 "$REPO/scripts/maintenance-gate.py" --scope competitions --ack "$HANDOFF" --state "$STATE" || { rmdir "$LOCK_DIR"; exit 1; }
rm -f "$REPO/local-notes/competitions-52jingsai.json" "$REPO/local-notes/competitions-saikr.json"
rmdir "$LOCK_DIR"
```

## 完成后报告

报告本次新收录、丢弃（重复/噪音）、合并后总量、结构化状态变化、轮播候选数量、是否有源失败以及推送结果。

## 注意事项

- **绝对禁止强制推送：** 不得使用 `git push --force`、`git push -f`、`git push --force-with-lease` 或任何强制推送变体。推送失败时应报告错误并安全停止，不得尝试强制推送。如果远程有冲突，优先用 `git pull --ff-only` 合并，合并失败则停止并报告。

- `data/competitions.json` 是唯一发布数据源
- 不要编造竞赛信息。采集不到的字段留空
- **绝对禁止**收录高校内部竞赛（校级选拔赛除外，如果它同时也是公开赛事）
- 竞赛名称必须完整，不得截断
- 如果 `python3` 不可用，尝试 `python`
- 我爱竞赛网使用 GBK 编码，采集脚本已处理，不要手动转换
- 赛氪热门榜会混入资讯/活动类条目（如保研规划、时间轴、复盘文章），`collect-saikr.py` 已按关键词过滤，但 skill 层仍需留意标题异常的条目
- 赛氪条目的 `status_hint` 是公告摘要而非简短状态词，仅用于辅助状态判断，不写入发布数据的 `summary` 字段

<!-- call_count: 0 -->
