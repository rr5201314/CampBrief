---
name: campbrief-exams
description: CampBrief 考试模块自动化维护——巡检各考试官网公告列表、发现新一期报名通知、解析时间节点、更新 official_url 和 timeline、推送 GitHub
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

## 你的角色

你是 CampBrief（面向大学生的信息聚合站）的**考试信息维护员**。每次被调用时，你要完成一轮「巡检公告列表 → 发现新一期通知 → 解析时间节点 → 更新数据 → 推送 GitHub」的完整流程，保证 `data/exams.json` 中的 `official_url`、`timeline`、`status` 始终反映最新一期考试的真实情况。

你不是手动录入员，而是做**信息核验**：从官方源头抓取最新公告，提取具体时间节点（不偷懒写"以官方公告为准"），并维护考试状态的时效性。

## 仓库路径

下方 Skill config 中注入的 `campbrief.repo_path` 是仓库根目录。后续所有路径都基于它，记为 `$REPO`。如果配置值以 `~` 开头，先展开为家目录绝对路径再使用。

## 数据结构背景

`data/exams.json` 中每个考试条目有 4 个 URL 字段，分工如下：

| 字段 | 稳定性 | 用途 |
|------|--------|------|
| `official_site` | 稳定 | 报名系统官网（详情页"立即报名"按钮指向） |
| `official_portal` | 稳定 | 考试项目官网（详情页"考试官网"按钮指向） |
| `news_list_url` | 稳定 | 官方考试动态列表页（**agent 自动化从此处发现最新公告 URL**） |
| `official_url` | 每期更新 | 本期报名公告原文（详情页"查看官方公告"按钮指向，agent 从此抓取 timeline） |

## 执行步骤

严格按以下顺序执行。每一步用你的 shell / 文件工具完成。

### 0. 同步并保护工作区

考试巡检与两个资讯 cron 共用同一仓库，开始前必须同步远程、重试上次遗留提交，并取得全局锁：

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

任一命令失败都要安全停止；不得用 merge/rebase 解决冲突，也不得基于过期数据发布。取得锁后，若后续因巡检失败、无变更或其他原因需要提前停止，必须先执行 `rmdir "$LOCK_DIR"` 再报告；不能删除启动前已存在的锁。任务异常崩溃后保留锁，优先阻止并发写入，交由人工确认后再清理。

### 1. 读取现有考试数据

读取 `$REPO/data/exams.json`，把全部条目加载到工作记忆中。关注每个条目的：
- `id`：考试唯一标识
- `name`：考试名称（含年份月份）
- `status`：当前状态（done / pending / open / closed）
- `news_list_url`：巡检入口
- `official_url`：当前记录的本期公告 URL
- `timeline`：当前记录的时间节点

### 2. 巡检公告列表（核心环节）

对每个**有 `news_list_url`** 的考试条目执行：

1. 访问 `news_list_url`（官方考试动态列表页）
2. 提取列表第一条（最新一条）链接的 URL，记为 `latest_notice_url`
3. 比较 `latest_notice_url` 与条目当前的 `official_url`：
   - **相同**：说明没有新公告，跳过该条目，不动数据
   - **不同**：说明有新一期公告，进入步骤 3 处理

**特殊情况处理**：
- 如果 `news_list_url` 为空（如省考、事业单位等条目），跳过该条目并在报告中标注"无稳定公告源，需人工维护"
- 如果 `news_list_url` 访问失败（超时、404 等），记录失败原因，跳过该条目，不要编造数据
- 如果列表页结构变化导致无法提取链接，记录"结构异常"，跳过该条目
- **CATTI、ACCA 等特殊情况**：部分考试的 `news_list_url` 指向综合通知列表，需识别其中与本考试相关的最新通知

### 3. 抓取并解析新公告

对步骤 2 中发现有新公告的条目：

1. 访问 `latest_notice_url`（最新公告原文页）
2. 解析公告正文，提取以下信息：
   - **考试时间**：笔试/口试/机考的具体日期和时段（如"2026年6月13日 9:00-11:20"）
   - **报名时间**：报名开始和截止时间（如"3月15日9:00-3月25日17:00"）
   - **准考证打印时间**（如公告中有）
   - **成绩发布时间**（如公告中有）
   - **其他重要时间节点**（如资格审核、缴费截止等）
3. 更新条目字段：
   - `official_url`：替换为 `latest_notice_url`
   - `timeline`：用从公告原文提取的具体信息重新填充（见下方 timeline 规则）
   - `schedule`：更新为具体考试月份（如"2026年12月"），不要用通用周期（如"每年6月、12月"）
4. **状态更新**：根据公告内容和当前日期判断 `status`：
   - 报名尚未开始 → `pending`
   - 报名正在进行 → `open`
   - 报名已截止但考试未开始 → `closed`
   - 考试已结束 → `done`

### 4. timeline 提取规则（重要）

`timeline` 是详情页"重要时间节点"部分展示的数据，**必须尽可能从公告原文提取具体信息**：

- **原文有具体信息时**，直接填写：
  - 正确：`{ "label": "四级笔试", "value": "2026年上半年为 6月13日 9:00-11:20" }`
  - 正确：`{ "label": "报名时间", "value": "3月15日9:00 - 3月25日17:00" }`
  - 正确：`{ "label": "准考证打印", "value": "口试 5月19日9时起，笔试 6月5日9时起" }`
- **原文确实没有该信息时**，才用兜底文案：
  - `{ "label": "报名时间", "value": "各考点时间不同，以所在学校通知为准" }`
  - `{ "label": "成绩发布", "value": "以官方公告为准" }`
- **绝对禁止**：不尝试提取原文信息，给所有条目统一加"以官方公告为准"——这是偷懒行为，必须先尝试提取

每个考试条目的 `timeline` 至少包含以下 label（如公告中有对应信息）：
- 笔试时间（或机考时间）
- 口试时间（如有）
- 报名时间
- 准考证打印时间
- 成绩发布时间（如有）

### 5. 新一期考试条目处理

如果公告是**下一期**考试（如当前是 6 月 CET，新公告是 12 月 CET）：

1. 检查 `data/exams.json` 中是否已有对应期次的条目（如 `cet-202612`）
2. **已有**：更新该条目的 `official_url`、`timeline`、`status`
3. **没有**：创建新条目，字段参考同期其他考试条目结构：
   - `id`：`{exam-abbr}-{YYYYMM}` 格式（如 `cet-202612`）
   - `name`：含年份月份（如"2026年12月全国大学英语四、六级考试 (CET)"）
   - `category`、`fee`、`format`、`duration`、`subjects`、`requirements`、`scoring`：从上一期条目复制（这些字段跨期稳定）
   - `official_site`、`official_portal`、`news_list_url`：从上一期条目复制（稳定字段）
   - `official_url`、`timeline`、`status`、`schedule`：从新公告提取填充
   - `summary`、`search`：根据新期次调整
4. 旧期次条目：如考试已结束，将 `status` 改为 `done`

### 6. 写入数据文件

把更新后的完整数据写入 `$REPO/data/exams.json`。**必须**符合以下结构（字段顺序保持一致，便于 diff 可读）：

```json
{
  "last_updated": "2026-07-11T18:00:00+08:00",
  "source": "CampBrief",
  "total": 30,
  "categories": [
    { "key": "english", "label": "英语类" },
    { "key": "computer", "label": "计算机类" },
    { "key": "accounting", "label": "会计类" },
    { "key": "teacher", "label": "教师类" },
    { "key": "civil-service", "label": "公务员类" },
    { "key": "postgrad", "label": "考研类" }
  ],
  "items": [
    {
      "id": "cet-202606",
      "name": "2026年6月全国大学英语四、六级考试 (CET)",
      "category": "english",
      "status": "done",
      "fee": "笔试 15-50 元/人次（各省不同，六级比四级高 2-5 元），口试 50 元/人次",
      "schedule": "2026年6月",
      "summary": "面向在校大学生的英语水平测试...",
      "search": "英语 四级 六级 cet ...",
      "official_site": "http://cet-bm.neea.edu.cn/",
      "official_portal": "https://cet.neea.edu.cn/",
      "news_list_url": "https://www.neea.edu.cn/html1/category/16093/1124-1.htm",
      "official_url": "https://www.neea.edu.cn/html1/report/2603/2-1.htm",
      "format": "笔试为主，另设英语四、六级口语考试...",
      "duration": "四级 9:00-11:20（140 分钟），六级 15:00-17:25（145 分钟）。",
      "subjects": ["写作（15%）", "听力理解（35%）", "阅读理解（35%）", "翻译（15%）"],
      "requirements": "全日制普通高等院校本科、专科在校生...",
      "scoring": "自近年起不再提供纸质成绩单...",
      "timeline": [
        { "label": "四级笔试", "value": "2026年上半年为 6月13日 9:00-11:20" },
        { "label": "六级笔试", "value": "2026年上半年为 6月13日 15:00-17:25" },
        { "label": "报名时间", "value": "各考点时间不同，以所在学校通知为准" }
      ]
    }
  ]
}
```

更新顶层字段：
- `last_updated`：当前时间（ISO8601 带时区）
- `total`：合并后的条目数
- `source`：保持 `"CampBrief"`

### 7. 提交、拉取远程更新、推送并释放锁

```bash
cd "$REPO"
git add -- data/exams.json
if git diff --cached --quiet; then
  echo "无变更，跳过提交"
else
  git commit -m "chore(exams): 更新考试公告与时间节点 - $(date +%Y-%m-%d)" || { rmdir "$LOCK_DIR"; exit 1; }
fi
git pull --ff-only || { rmdir "$LOCK_DIR"; exit 1; }
git push || { rmdir "$LOCK_DIR"; exit 1; }
rmdir "$LOCK_DIR"
```

如果没有任何变更（所有考试都没有新公告），仍先执行 `git pull --ff-only`，再执行 `git push` 重试上次遗留提交并释放锁，再报告"本次巡检无更新"。最终拉取或推送失败时保留本地提交、释放自己的锁并报告原因。

## 考试与官方网站列表

以下是 `data/exams.json` 中所有考试的 URL 字段汇总，供巡检参考：

### 英语类 (english)

| 考试 ID | 考试名称 | 报名系统 (official_site) | 考试官网 (official_portal) | 公告列表 (news_list_url) |
|---------|---------|------------------------|--------------------------|------------------------|
| cet-202606 / cet-202612 | 大学英语四六级 (CET) | http://cet-bm.neea.edu.cn/ | https://cet.neea.edu.cn/ | https://www.neea.edu.cn/html1/category/16093/1124-1.htm |
| tem-4 / tem-8 | 英语专业四八级 (TEM) | — | http://tem.fltonline.cn/ | http://tem.fltonline.cn/?cat=113 |
| ielts | 雅思 (IELTS) | https://ielts.neea.cn/ | https://ielts-main.neea.cn/ | https://ielts-main.neea.cn/html1/category/1507/1403-1.htm |
| toefl | 托福 (TOEFL) | https://toefl.neea.cn/ | https://toefl-main.neea.cn/ | https://toefl-main.neea.cn/html1/category/16123/94-1.htm |
| catti-202606 / catti-202611 | 翻译专业资格 (CATTI) | http://www.catticenter.com/ | http://www.catticenter.com/ | http://www.cpta.com.cn/notice.html |

### 计算机类 (computer)

| 考试 ID | 考试名称 | 报名系统 (official_site) | 考试官网 (official_portal) | 公告列表 (news_list_url) |
|---------|---------|------------------------|--------------------------|------------------------|
| ncre-202603 / ncre-202609 | 全国计算机等级考试 (NCRE) | https://ncre-bm.neea.edu.cn/ | https://ncre.neea.edu.cn/ | https://ncre.neea.edu.cn/html1/category/1507/872-1.htm |
| ruankao-202605 / ruankao-202611 | 计算机技术与软件专业技术资格 (软考) | https://www.ruankao.org.cn/ | https://www.ruankao.org.cn/ | https://www.ruankao.org.cn/index/work.html |
| pat-202603 / pat-202606 / pat-202609 | 计算机程序设计能力考试 (PAT) | https://www.patest.cn/ | https://www.patest.cn/ | https://www.patest.cn/articles |

### 会计类 (accounting)

| 考试 ID | 考试名称 | 报名系统 (official_site) | 考试官网 (official_portal) | 公告列表 (news_list_url) |
|---------|---------|------------------------|--------------------------|------------------------|
| junior-accounting-2026 | 初级会计职称 | http://kzp.mof.gov.cn/ | http://kzp.mof.gov.cn/ | http://kzp.mof.gov.cn/list.jsp?class_id=01_05 |
| intermediate-accounting-2026 | 中级会计职称 | http://kzp.mof.gov.cn/ | http://kzp.mof.gov.cn/ | http://kzp.mof.gov.cn/list.jsp?class_id=01_05 |
| cpa-2026 | 注册会计师 (CPA) | https://cpaexam.cicpa.org.cn/ | https://www.cicpa.org.cn/ | https://www.cicpa.org.cn/ztzl1/exam/exam_info/ |
| acca-202603 / 202606 / 202609 / 202612 | 特许公认会计师 (ACCA) | https://www.accaglobal.com.cn/ | https://www.accaglobal.com.cn/ | https://www.accaglobal.com.cn/ |

### 教师类 (teacher)

| 考试 ID | 考试名称 | 报名系统 (official_site) | 考试官网 (official_portal) | 公告列表 (news_list_url) |
|---------|---------|------------------------|--------------------------|------------------------|
| ntce-202603 / ntce-202610 | 中小学教师资格考试 (NTCE) | http://ntce.neea.edu.cn/ | https://ntce.neea.edu.cn/ | https://ntce.neea.edu.cn/html1/category/1507/1148-1.htm |
| psc | 普通话水平测试 (PSC) | https://bm.cltt.org/ | https://www.cltt.org/ | https://www.cltt.org/ |

### 公务员类 (civil-service)

| 考试 ID | 考试名称 | 报名系统 (official_site) | 考试官网 (official_portal) | 公告列表 (news_list_url) |
|---------|---------|------------------------|--------------------------|------------------------|
| guokao-2026 | 国家公务员考试 | http://bm.scs.gov.cn/ | http://www.scs.gov.cn/gkIndex.html | http://bm.scs.gov.cn/ |
| shengkao-2026 | 省级公务员考试 | — | — | —（各省不同，需人工维护） |
| shiye | 事业单位招聘 | — | https://www.mohrss.gov.cn/.../index.html | https://www.mohrss.gov.cn/.../index.html |

### 考研类 (postgrad)

| 考试 ID | 考试名称 | 报名系统 (official_site) | 考试官网 (official_portal) | 公告列表 (news_list_url) |
|---------|---------|------------------------|--------------------------|------------------------|
| kaoyan-2026 | 全国硕士研究生招生考试 | https://yz.chsi.com.cn/ | https://yz.chsi.com.cn/ | https://yz.chsi.com.cn/kyzx/jybzc/ |
| baoyan-2026 | 推荐免试研究生（保研） | https://yz.chsi.com.cn/tm | https://yz.chsi.com.cn/tm | https://yz.chsi.com.cn/kyzx/kydt/ |

## 注意事项

- **不要**修改 `assets/js/exam-detail.js` 或 `assets/js/exams.js`，自动化只管 `data/exams.json`
- **不要**转述任何单独高校的内部公告、教务通知（见 AGENTS.md 内容范围约束）。如公告中涉及"各校报名时间的差异"，可保留"以所在学校通知为准"作为兜底
- **不要**在 `timeline` 中编造公告中没有的具体日期。拿不准就保守陈述
- **不要**改变 `id` 的命名规则（`{exam-abbr}-{YYYYMM}`），这是前端路由的依据
- 如 `news_list_url` 指向的列表页结构发生变化，导致无法提取公告链接，**记录异常并在报告中提示人工介入**，不要猜测
- ACCA、CATTI 等考试无传统"报名通知"概念，`news_list_url` 指向综合通知列表，需识别其中与本考试相关的条目
- PSC（普通话水平测试）报名高度分散（各省各校独立组织），自动化可能无法覆盖，需人工维护

## 巡检频率建议

- **CET、NCRE、NTCE**（neea 系统）：每月巡检一次，考前 2 个月加密为每周一次
- **软考、CPA、初级/中级会计**：每月巡检一次
- **考研、国考**：每月巡检一次，9-10 月报名季加密为每周一次
- **ACCA、IELTS、TOEFL**（全年多场）：每月巡检一次
- **省考、事业单位、PSC**：人工维护为主，自动化跳过
