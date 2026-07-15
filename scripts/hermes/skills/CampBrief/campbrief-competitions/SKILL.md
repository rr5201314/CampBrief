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

**分类标注（tier）：**
- `official`：教育部认可赛事（含"教育部"、"全国大学生"、"挑战杯"、"互联网+"等关键词）
- `enterprise`：名企主办赛事（含"华为"、"腾讯"、"阿里"、"百度"、"字节"等）
- `hobby`：兴趣练手赛事（其他）

**领域标注（fields）：**
根据竞赛名称和描述自动标注，可多选：
- `computer`：含"编程"、"程序设计"、"软件"、"IT"、"计算机"
- `ai`：含"人工智能"、"AI"、"机器学习"、"深度学习"
- `language`：含"英语"、"翻译"、"词汇"、"外语"
- `design`：含"设计"、"艺术"、"创意"、"广告"
- `innovation`：含"创业"、"创新"、"创客"
- 其他字段参照 `data/competitions.json` 的 `fields` 列表

**状态判断（status）：**
- 标题含"截止"且日期已过 → `done`
- 标题含"报名"且未过期 → `open`
- 默认 → `pending`

**ID 生成：**
- 新条目：`52jingsai-{hash}`，hash 由名称+URL 计算 SHA-256 前 12 位
- 已有条目：保留原 ID 不变

### 4. 写入数据文件

把合并后的数据写入 `$REPO/data/competitions.json`。保持字段顺序一致：

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
```

校验通过后重新读一次，确认 JSON 合法、`items` 数量与 `total` 一致。

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
