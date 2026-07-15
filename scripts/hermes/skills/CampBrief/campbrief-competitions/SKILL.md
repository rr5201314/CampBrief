---
name: campbrief-competitions
description: CampBrief 竞赛模块自动化维护——从我爱竞赛网采集新竞赛、合并去重、分类标注、校验数据并推送 GitHub
category: CampBrief
tags: [competitions, automation, github, scheduled]
platforms: [termux, linux, darwin]
metadata:
  hermes:
    config:
      - key: campbrief.repo_path
        description: CampBrief 仓库在本机的克隆路径
        default: ~/projects/CampBrief
        prompt: CampBrief 仓库路径
---

# CampBrief 竞赛模块自动化维护

## 角色与结果

你是 CampBrief（面向大学生的信息聚合站）的竞赛信息维护员。每次执行都要完成一轮完整的采集→筛选→合并→校验→发布流程。

你的结果是"站内竞赛数据已更新并推送到 GitHub"，而不是"采集脚本跑完了"。

## 数据源

| 源 | 采集方式 | 可靠性 |
|---|---|---|
| 我爱竞赛网 52jingsai.com | `scripts/collect-52jingsai.py --detail` | ✅ 静态 HTML，GBK 编码 |
| 赛氪 saikr.com | ❌ Node.js 渲染，暂不支持 | — |

当前唯一自动化源是我爱竞赛网。赛氪待后续接入浏览器自动化。

## 仓库路径

下方 Skill config 中注入的 `campbrief.repo_path` 是仓库根目录。后续所有路径都基于它，记为 `$REPO`。如果配置值以 `~` 开头，先展开为家目录绝对路径再使用。

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

运行采集脚本，抓取我爱竞赛网的竞赛列表和详情：

```bash
python3 "$REPO/scripts/collect-52jingsai.py" \
  --max 30 --detail \
  --output "$REPO/local-notes/competitions-raw.json"
```

脚本会输出到 `local-notes/competitions-raw.json`。读取结果：
- `total == 0` 时停止本次任务并报告，不得动现有数据
- 部分条目详情页失败是正常的，只有列表页全部失败才停止

### 2. 读取已有数据

读取这两个文件：

- `$REPO/local-notes/competitions-raw.json` —— 本次采集结果
- `$REPO/data/competitions.json` —— 当前已发布数据

### 3. 合并去重与分类

对采集到的每条竞赛，执行以下处理：

**去重规则：**
- 按竞赛名称模糊匹配（去掉括号内容、标点后比较）
- 名称相似度 > 80% 视为重复，跳过
- 完全相同的 URL 也视为重复

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
- 标题含"截止"且日期已过 → `done`
- 标题含"报名"且未过期 → `open`
- 默认 → `pending`

**过期自动状态更新（每次执行必做）：**
对 `data/competitions.json` 中所有条目，检查当前日期：
- `signup` 字段包含截止日期 且 当前日期已过该日期 且 status 为 `open` → 自动改为 `done`
- `schedule` 字段包含比赛结束时间 且 当前日期已过 且 status 为 `open` 或 `ongoing` → 自动改为 `done`
- 日期解析不到时不改状态，保持原值
- 改状态时只改 `status` 字段，不动其他字段
- 在完成报告中列出所有自动状态变更

**ID 生成：**
- 新条目：`52jingsai-{hash}`，hash 由名称+URL 计算 SHA-256 前 12 位
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
python3 -m json.tool "$REPO/data/competitions.json" >/dev/null
python3 "$REPO/scripts/validate-competitions.py"
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
rm -f "$REPO/local-notes/competitions-raw.json"
rmdir "$LOCK_DIR"
```

## 完成后报告

用一两句话说明：本次新收录几条、丢弃几条（重复/噪音）、合并后总量、是否有源失败、推送是否成功。

## 注意事项

- `data/competitions.json` 是唯一发布数据源
- 不要编造竞赛信息。采集不到的字段留空
- **绝对禁止**收录高校内部竞赛（校级选拔赛除外，如果它同时也是公开赛事）
- 竞赛名称必须完整，不得截断
- 如果 `python3` 不可用，尝试 `python`
- 我爱竞赛网使用 GBK 编码，采集脚本已处理，不要手动转换

<!-- call_count: 0 -->
