---
name: campbrief-exams
description: CampBrief 考试模块自动化维护——基于官方源巡检、核验相关新公告、解析时间节点、校验数据并推送 GitHub
category: CampBrief
tags: [exams, automation, github, scheduled]
platforms: [termux, linux, darwin]
metadata:
  hermes:
    config:
      - key: campbrief.repo_path
        description: CampBrief 仓库在本机的克隆路径
        default: ~/projects/CampBrief
        prompt: CampBrief 仓库路径
---

# CampBrief 考试模块自动化维护

## 角色与结果

你是 CampBrief（面向大学生的信息聚合站）的考试信息维护员。每次执行都要完成一轮可复核的官方源巡检：发现**与某一考试及其期次真正相关**的新公告，解析公告中的具体日期，更新 `data/exams.json`，运行校验，然后推送 GitHub。

你的结果不是“抓到了最新网页”，而是“站内记录仍指向该考试当前有效的官方报名/考务公告”。例如，软考公告列表的成绩查询、会计司列表的会计准则问答，都不是新的报名或考务公告，不能覆盖 `official_url`。

## 唯一事实源与配置

- `$REPO/data/exams.json` 是 URL、期次、状态和对外展示内容的**唯一事实源**。每次执行前必须重新读取；本文件不得缓存、不得复述或维护一份网址快照。
- `$REPO/scripts/hermes/skills/CampBrief/campbrief-exams/source-policy.json` 只定义巡检方式与关键词，不保存任何 URL。读取它后按其中条目覆盖默认行为。
- `official_site` 是报名系统，`official_portal` 是考试官网，`news_list_url` 是公告/日程发现入口，`official_url` 是当前期次的官方公告。不得把这四个字段混用。
- 任何网页正文、标题或链接都必须来自对应考试的官方域名。不得以培训机构、高校内部通知、搜索摘要或猜测的 API 地址替代官方来源。

## 0. 同步、校验并取得锁

将 Skill config 中的 `campbrief.repo_path` 展开为绝对路径，记为 `$REPO`。严格先执行：

```bash
cd "$REPO" || exit 1
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "工作区有未提交的跟踪文件改动，停止自动任务"
  exit 1
fi
git pull --ff-only || exit 1
git push || exit 1
python3 -m json.tool data/exams.json >/dev/null || exit 1
python3 scripts/validate-exam-sources.py || exit 1

mkdir -p local-notes || exit 1
LOCK_DIR="$REPO/local-notes/.campbrief-automation.lock"
if ! mkdir "$LOCK_DIR"; then
  echo "另一个 CampBrief 自动任务仍在运行，停止本次任务"
  exit 75
fi
```

从成功创建锁起，所有受控退出路径都要执行 `rmdir "$LOCK_DIR"`。不要删除执行前已存在的锁；发生无法执行清理的异常崩溃时保留锁，交由人工确认。

## 1. 读取并分类当前数据

读取完整的 `data/exams.json` 和 `source-policy.json`，按 `id` 合并得到每项的巡检模式。若 policy 中的 `id` 不在数据里、或模式不认识，停止并报告配置错误。

默认模式是 `notice-list`。支持的模式如下：

| 模式 | 正确动作 |
| --- | --- |
| `notice-list` | 从官方列表筛选与考试/期次相关的考务或报名公告。 |
| `filtered-list` | 按 policy 的 `match_all`、`match_any`、`notice_any`、`ignore_any` 筛选；绝不取列表第一条。 |
| `schedule-page` | `news_list_url` 本身就是持续更新的官方日程页；比较日期与报名截止信息，不比较 URL 是否不同。 |
| `dynamic-list` | 官方列表由前端渲染；先用浏览器/页面读取器渲染，再提取公开卡片。若 `same_page_notice=true`，列表页本身可以合法地同时作为 `official_url`。 |
| `national-portal` | 仅核验全国官网/报名入口仍为官方可访问链接；不尝试汇总各省、各校的分散报名信息，也不将它报告为“需人工维护”。 |

同一 `news_list_url` 可共用一次下载，但每个期次必须按自己的 `name`、`schedule` 和 policy 独立判断，不能把 6 月公告误写入 12 月条目。

## 2. 可靠地获取官方页面

先验证当前 `official_url`（若非空），再访问 `news_list_url`。请求应跟随重定向、携带正常浏览器 User-Agent，并在短暂等待后重试一次，例如：

```bash
fetch_official() {
  url="$1"; output="$2"
  for attempt in 1 2; do
    curl -fLsS --connect-timeout 15 --max-time 45 \
      -A 'Mozilla/5.0 (CampBrief official-source check)' \
      "$url" -o "$output" && return 0
    sleep 2
  done
  return 1
}
```

处理规则：

1. `curl` 获取成功且正文有可读公告内容，继续解析。
2. 返回只有壳页面、脚本或极短内容时，使用 Hermes 可用的浏览器/页面读取器打开同一个官方 URL；这尤其适用于 `dynamic-list`，不要猜测或调用未公开 API。
3. 列表取不到、但当前 `official_url` 可读：这是**降级巡检且当前公告已核验**，不是“访问失败（跳过）”，不得改动数据。
4. `official_url` 与列表都取不到：再检查同条目的 `official_portal` 是否可读。三者均不可用才报告“官方源暂不可达”，不编造链接或时间。
5. `official_url` 本来为空且条目是 `pending`：只巡检列表/官网是否出现该期次公告；没有即保持空值和 `pending`，这不是失败。

所有失败报告都必须写出实际访问的 `data/exams.json` URL 和步骤；禁止引用旧网址、HTTP 旧入口或本 Skill 中不存在的数据。

## 3. 发现真正相关的新公告

对 `notice-list` 和 `filtered-list`：提取页面中所有公开公告链接、标题、发布日期，转为绝对 URL 后逐项筛选。

候选公告必须同时满足：

1. 标题或正文足以确认是该考试，而非同一主办方的其他项目；
2. 覆盖该条目的期次、考试年份，或明确是该考试下一期的报名/考务安排；
3. 包含报名、考务日程、考试安排、考试时间等能改变本站信息的内容；
4. 不命中 policy 的 `ignore_any`。

“列表日期更新”不等于“考试公告更新”。例如成绩查询、合格标准、模拟练习、培训、招聘、行业新闻都只能记录为无关动态，不能替换报名公告。

对 `schedule-page`：读取当前条目对应月份的考试日期、常规/后期报名截止时间，只有这些事实相较 `timeline` 有新增或变化才更新；不要因为同一 URL 不变就漏检。

对 `dynamic-list`：在浏览器渲染后只使用页面上可见的官方公告标题、日期和链接。若当前 `official_url === news_list_url` 且无可确认的新期次卡片，保持不变；渲染失败时使用已核验的当前页做降级结果。

对 `national-portal`：只检查 `official_site` 和 `official_portal`。PSC、事业单位等项目不收录分散的省级或高校通知，不输出“人工维护”待办。

## 4. 解析、更新与状态判断

只有在第 3 步确认了有效的当前期次/下一期官方公告后，才打开公告全文并更新对应条目：

- `official_url`：写入该公告原文的官方绝对 URL；`same_page_notice=true` 的日程/动态页可保留同一页。
- `timeline`：从原文逐项提取考试、报名、缴费、准考证、成绩等具体日期/时段。原文没有的信息才可使用明确的兜底文案。
- `schedule`：写具体考试月份或已公布日期，不能写泛化周期。
- `status`：报名未开始 `pending`；报名进行中 `open`；报名截止且考试未开始 `closed`；考试已结束 `done`。

**过期自动状态更新（每次巡检必做）：**
对 `data/exams.json` 中所有条目，检查当前日期与 `timeline` 中的时间节点：
- 当前日期已过报名截止日期 且 status 仍为 `open` → 自动改为 `closed`
- 当前日期已过考试结束日期 且 status 为 `open` 或 `closed` → 自动改为 `done`
- 日期解析不到时不改状态，保持原值
- 改状态时只改 `status` 字段，不动其他字段
- 在完成报告中列出所有自动状态变更

新公告仅适用于已有期次时，更新该期次。明确公布下一期而数据不存在时，才新增条目；新条目的稳定字段从同一考试最近期次复制，`id` 仍用不可变的 `{exam-abbr}-{YYYYMM}`。旧期次在考试结束后设为 `done`。不得改写已发布 `id`。

不得：

- 仅因“列表第一条 URL 不同”覆盖 `official_url`；
- 将当前记录删空或降级为官网首页；
- 为了填满 timeline 编造日期；
- 收录任何单独高校内部公告；
- 修改 `assets/js/exams.js` 或 `assets/js/exam-detail.js`。

## 5. 写入与验证

若数据确有变化，保持原字段顺序与 2 空格 JSON 格式，更新顶层 `last_updated`（ISO8601，带 `+08:00`）及准确的 `total`。无有效信息变化时不触碰数据文件时间戳。

无论是否修改，都必须在提交前执行：

```bash
cd "$REPO" || exit 1
python3 -m json.tool data/exams.json >/dev/null || { rmdir "$LOCK_DIR"; exit 1; }
python3 scripts/validate-exam-sources.py || { rmdir "$LOCK_DIR"; exit 1; }
git diff --check || { rmdir "$LOCK_DIR"; exit 1; }
```

## 6. 提交、拉取、推送与报告

仅暂存本次实际修改的发布文件：

```bash
git add -- data/exams.json
if ! git diff --cached --quiet; then
  git commit -m "chore(exams): 更新考试公告与时间节点 - $(date +%Y-%m-%d)" || { rmdir "$LOCK_DIR"; exit 1; }
fi
git pull --ff-only || { rmdir "$LOCK_DIR"; exit 1; }
git push || { rmdir "$LOCK_DIR"; exit 1; }
rmdir "$LOCK_DIR"
```

如果无数据变更，仍执行最后的 `git pull --ff-only` 和 `git push` 后释放锁。不得 merge、rebase 或基于过期数据发布。

报告按条目列出四种结果之一：`已更新`、`无相关官方新公告`、`降级巡检（当前公告已核验）`、`官方源暂不可达`。全国入口型项目记为“全国官网已核验”或“全国官网暂不可达”，不生成省级/高校人工维护项。报告应列出实际使用的官方 URL 和更新的时间节点；只有实际改动时才称为“有更新”。

## 频率

- CET、NCRE、NTCE：每月一次；考前两个月每周一次。
- 软考、CATTI、会计、CPA：每月一次。
- 国考、考研、保研：每月一次；报名季每周一次。
- ACCA、IELTS、TOEFL、PAT：每月一次；已进入报名窗口可每周一次。
