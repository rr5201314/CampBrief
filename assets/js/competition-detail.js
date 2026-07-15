// 竞赛详情页：通过 ?id= 参数定位赛事，并基于公开静态数据渲染。
// 可选字段：about / format / participants / requirements / awards / fee / timeline。
(function () {
  "use strict";

  const TIER_LABEL = {
    official: { text: "教育部认可赛事", icon: "i-check", cls: "tier-official" },
    enterprise: { text: "名企主办赛事", icon: "i-trophy", cls: "tier-enterprise" },
    hobby: { text: "兴趣练手赛事", icon: "i-info", cls: "tier-hobby" }
  };

  const STATUS_LABEL = {
    pending: { text: "未开始", icon: "i-clock", cls: "status-pending" },
    open: { text: "可报名", icon: "i-unlock", cls: "status-open" },
    closed: { text: "报名截止", icon: "i-lock", cls: "status-closed" },
    ongoing: { text: "比赛中", icon: "i-status", cls: "status-ongoing" },
    unknown: { text: "待核验", icon: "i-clock", cls: "status-pending" },
    done: { text: "已完赛", icon: "i-check", cls: "status-done" }
  };

  const FIELD_GUIDE = {
    innovation: { label: "创新创业", ability: "发现真实问题、提出创新方案并完成项目表达" },
    computer: { label: "计算机 / 信息技术", ability: "编程、系统设计与工程实践" },
    engineering: { label: "工程 / 机电 / 自动化", ability: "工程设计、方案实现与技术调试" },
    ai: { label: "人工智能", ability: "数据分析、模型应用与智能系统构建" },
    robot: { label: "机器人", ability: "软硬件协同、控制与机器人系统实践" },
    science: { label: "数理 / 化学 / 地学", ability: "理论分析、实验设计或科学建模" },
    design: { label: "设计 / 艺术 / 传媒", ability: "创意表达、视觉设计或交互呈现" },
    language: { label: "外语", ability: "语言理解、表达与跨文化沟通" },
    business: { label: "商科 / 金融 / 管理", ability: "市场洞察、经营分析与商业决策" },
    medical: { label: "医学 / 生命科学", ability: "专业知识、实验研究与健康场景分析" },
    civil: { label: "建筑 / 土木 / 测绘", ability: "工程方案、空间设计与项目管理" },
    vocational: { label: "职业技能", ability: "规范操作、岗位技能与综合实践" }
  };

  function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  async function loadData() {
    try {
      const response = await fetch("../../data/competitions.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return Array.isArray(data.items) ? data.items : [];
    } catch (error) {
      console.warn("加载竞赛数据失败", error);
      return [];
    }
  }

  function escapeHtml(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeExternalUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function renderNotFound(message) {
    const el = document.getElementById("competitionDetail");
    el.innerHTML = `
      <div class="exam-detail-empty">
        <svg class="icon"><use href="#i-info"/></svg>
        <h2>未找到该竞赛</h2>
        <p>${escapeHtml(message)}</p>
        <a href="index.html" class="btn btn-primary">返回竞赛列表</a>
      </div>
    `;
  }

  function infoItem(icon, label, value) {
    if (!value) return "";
    return `
      <div class="exam-info-item">
        <span class="exam-info-icon"><svg class="icon-sm icon"><use href="#${icon}"/></svg></span>
        <div class="exam-info-text">
          <span class="exam-info-label">${escapeHtml(label)}</span>
          <span class="exam-info-value">${escapeHtml(value)}</span>
        </div>
      </div>
    `;
  }

  function section(icon, title, contentHtml, extraClass) {
    if (!contentHtml) return "";
    return `
      <section class="exam-section ${extraClass || ""}">
        <h2 class="exam-section-title">
          <svg class="icon-sm icon"><use href="#${icon}"/></svg>
          ${escapeHtml(title)}
        </h2>
        <div class="exam-section-body">${contentHtml}</div>
      </section>
    `;
  }

  function fieldLabels(item) {
    return (item.fields || []).map(field => (FIELD_GUIDE[field] || { label: field }).label);
  }

  function fieldAbilities(item) {
    return (item.fields || [])
      .map(field => FIELD_GUIDE[field] && FIELD_GUIDE[field].ability)
      .filter(Boolean)
      .slice(0, 3);
  }

  function joinWithChineseComma(values) {
    if (!values.length) return "综合实践";
    if (values.length === 1) return values[0];
    if (values.length === 2) return `${values[0]}与${values[1]}`;
    return `${values.slice(0, -1).join("、")}与${values[values.length - 1]}`;
  }

  function renderTimeline(timeline) {
    if (!Array.isArray(timeline) || !timeline.length) return "";
    return `<div class="exam-timeline">${timeline.map(item => `
      <div class="exam-timeline-item">
        <span class="exam-timeline-label">${escapeHtml(item.label)}</span>
        <span class="exam-timeline-value">${escapeHtml(item.value)}</span>
      </div>
    `).join("")}</div>`;
  }

  function renderDetail(item) {
    const el = document.getElementById("competitionDetail");
    const tier = TIER_LABEL[item.tier] || { text: item.tier || "赛事", icon: "i-info", cls: "tier-hobby" };
    const itemStatus = CampBriefContent.effectiveStatus(item, { kind: "competition", requireLifecycle: true });
    const status = STATUS_LABEL[itemStatus] || { text: itemStatus || "状态待更新", icon: "i-clock", cls: "status-pending" };
    const officialUrl = safeExternalUrl(item.official_site);
    const sourceUrl = safeExternalUrl(item.official_url);
    const isThirdPartySource = sourceUrl && sourceUrl.includes('52jingsai');
    const labels = fieldLabels(item);
    const abilities = fieldAbilities(item);
    const fieldsText = joinWithChineseComma(labels);
    const abilitiesText = joinWithChineseComma(abilities);

    document.title = `${item.name} - 简豹竞赛`;

    const fieldBadges = labels.map(label =>
      `<span class="badge field-badge">${escapeHtml(label)}</span>`
    ).join("");

    const about = item.about || item.description || item.summary || "本页暂未收录赛事简介，请查看官方渠道了解详情。";
    const format = item.format ||
      `赛事围绕${fieldsText}方向设置赛道或任务，常见形式包括命题实践、作品或方案提交、答辩展示、现场比拼等。实际赛制、组队人数和提交材料会随当届规则调整。`;
    const participants = item.participants ||
      `适合对${fieldsText}感兴趣，愿意完成项目、作品或专项任务的在校学生。是否需要校内选拔、是否允许跨专业或跨校组队，请以本届通知为准。`;
    const requirements = item.requirements ||
      `报名前建议先核对参赛对象、报名入口、赛道选择、组队要求和作品规范；涉及校赛、院系推荐或资格审核的，应同步关注学校公开发布的报名安排。`;

    const timelineHtml = renderTimeline(item.timeline);
    const aboutSection = section("i-doc", "比赛是做什么的", `<p>${escapeHtml(about)}</p>`, "competition-section--about");
    const focusSection = section("i-grid", "会锻炼哪些能力", `
      <p>该赛事重点关注${escapeHtml(abilitiesText)}等能力。不同赛道的考核重点可能不同，选题前应先阅读当届赛题与评价标准。</p>
    `);
    const formatSection = section("i-trophy", "参赛时会做什么", `<p>${escapeHtml(format)}</p>`);
    const participantsSection = section("i-users", "适合谁参加", `<p>${escapeHtml(participants)}</p>`);
    const requirementsSection = section("i-check", "报名前先确认", `<p>${escapeHtml(requirements)}</p>`);
    const organizerSection = section("i-users", "主办方", item.organizer ? `<p>${escapeHtml(item.organizer)}</p>` : "");
    const timelineSection = section("i-calendar", "重要时间节点", timelineHtml);
    const awardsSection = section("i-medal", "奖项设置", item.awards ? `<p>${escapeHtml(item.awards)}</p>` : "");
    const feeSection = section("i-medal", "报名费用", item.fee ? `<p>${escapeHtml(item.fee)}</p>` : "");

    const infoGrid = `
      <div class="exam-info-grid competition-info-grid">
        ${infoItem("i-users", "主办方", item.organizer)}
        ${infoItem("i-unlock", "报名时间", item.signup)}
        ${infoItem("i-calendar", "比赛时间", item.schedule)}
        ${infoItem("i-medal", "赛事层次", tier.text)}
      </div>
    `;

    const primaryLabel = itemStatus === "open" ? "前往报名 / 官网" : "访问赛事官网";
    const officialCallout = `
      <div class="exam-official-callout">
        <svg class="icon"><use href="#i-info"/></svg>
        <div>
          <strong>比赛通知、报名资格、赛题和时间可能变化；提交前请以主办方公开发布的当届规则为准。</strong>
          ${officialUrl ? `<a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">查看官方信息 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>` : ""}
          ${(isThirdPartySource && !officialUrl) ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">查看信息来源 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>` : ""}
        </div>
      </div>
    `;

    const actions = `
      <div class="exam-detail-actions">
        ${officialUrl ? `<a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">${primaryLabel} <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>` : ""}
        <a href="index.html" class="btn btn-secondary"><svg class="icon-sm icon"><use href="#i-chevron-left"/></svg>返回列表</a>
      </div>
    `;

    el.innerHTML = `
      ${officialCallout}
      <div class="exam-detail-meta">
        <span class="badge tier-badge ${tier.cls}"><svg class="icon-sm icon"><use href="#${tier.icon}"/></svg>${escapeHtml(tier.text)}</span>
        <span class="badge status-badge ${status.cls}"><svg class="icon-sm icon"><use href="#${status.icon}"/></svg>${escapeHtml(status.text)}</span>
        ${fieldBadges}
      </div>
      <h1 class="exam-detail-title">${escapeHtml(item.name)}</h1>
      <p class="exam-detail-summary">${escapeHtml(item.summary || about)}</p>
      ${infoGrid}
      ${aboutSection}
      ${focusSection}
      ${formatSection}
      ${participantsSection}
      ${requirementsSection}
      ${organizerSection}
      ${timelineSection}
      ${awardsSection}
      ${feeSection}
      ${actions}
      <p class="exam-detail-notice">本页为简豹整理的基础介绍；具体报名入口、资格和赛制以${officialUrl ? `<a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">赛事官方渠道</a>` : "主办方公开信息"}为准。</p>
    `;
  }

  async function init() {
    const id = getUrlParam("id");
    if (!id) {
      renderNotFound("缺少竞赛 ID 参数。");
      return;
    }

    const items = await loadData();
    const item = items.find(entry => entry.id === id);
    if (!item) {
      renderNotFound(items.length ? "该竞赛可能已下线，或链接有误。" : "竞赛数据暂时无法加载，请稍后重试。");
      return;
    }
    renderDetail(item);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
