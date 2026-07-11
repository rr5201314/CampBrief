// 考试详情页 - 通过 ?id= 参数定位考试，渲染详情
// 详情内容无字数限制，支持可选字段：subjects / requirements / prep_tips
(function () {
  "use strict";

  const CATEGORY_LABELS = {
    english: { text: "英语类", icon: "i-doc" },
    computer: { text: "计算机类", icon: "i-code" },
    accounting: { text: "会计类", icon: "i-medal" },
    teacher: { text: "教师类", icon: "i-check" },
    "civil-service": { text: "公务员类", icon: "i-status" },
    postgrad: { text: "考研类", icon: "i-trophy" }
  };

  const STATUS_LABEL = {
    open: { text: "可报名", icon: "i-unlock", cls: "status-open" },
    pending: { text: "未开始", icon: "i-clock", cls: "status-pending" },
    closed: { text: "不可报名", icon: "i-lock", cls: "status-closed" },
    done: { text: "已结束", icon: "i-check", cls: "status-done" }
  };

  function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || "";
  }

  async function loadData() {
    try {
      const response = await fetch("../../data/exams.json", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) return data.items;
      }
    } catch (e) {
      // file:// 协议下 fetch 会失败
    }
    return [];
  }

  function escapeHtml(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderNotFound(message) {
    const el = document.getElementById("examDetail");
    el.innerHTML = `
      <div class="exam-detail-empty">
        <svg class="icon"><use href="#i-info"/></svg>
        <h2>未找到该考试</h2>
        <p>${escapeHtml(message)}</p>
        <a href="index.html" class="btn btn-primary">返回考试列表</a>
      </div>
    `;
  }

  // 渲染信息网格项
  function infoItem(icon, label, value) {
    if (!value) return "";
    return `
      <div class="exam-info-item">
        <span class="exam-info-icon"><svg class="icon-sm icon"><use href="#${icon}"/></svg></span>
        <div class="exam-info-text">
          <span class="exam-info-label">${label}</span>
          <span class="exam-info-value">${escapeHtml(value)}</span>
        </div>
      </div>
    `;
  }

  // 渲染一个详情段落（有内容才渲染）
  function section(icon, title, contentHtml) {
    if (!contentHtml) return "";
    return `
      <section class="exam-section">
        <h2 class="exam-section-title">
          <svg class="icon-sm icon"><use href="#${icon}"/></svg>
          ${escapeHtml(title)}
        </h2>
        <div class="exam-section-body">${contentHtml}</div>
      </section>
    `;
  }

  function renderDetail(item) {
    const el = document.getElementById("examDetail");
    const cat = CATEGORY_LABELS[item.category] || { text: item.category, icon: "i-info" };
    const status = STATUS_LABEL[item.status] || { text: item.status, icon: "i-clock", cls: "" };

    document.title = `${item.name} - CampBrief 考试`;

    // 考试科目列表
    let subjectsHtml = "";
    if (Array.isArray(item.subjects) && item.subjects.length > 0) {
      subjectsHtml = "<ul class=\"exam-subject-list\">" +
        item.subjects.map(s => `<li>${escapeHtml(s)}</li>`).join("") +
        "</ul>";
    }

    // 重要时间节点列表（每条标注以官方公告为准）
    let timelineHtml = "";
    if (Array.isArray(item.timeline) && item.timeline.length > 0) {
      timelineHtml = '<div class="exam-timeline">' +
        item.timeline.map(t => `
          <div class="exam-timeline-item">
            <span class="exam-timeline-label">${escapeHtml(t.label)}</span>
            <span class="exam-timeline-value">${escapeHtml(t.value)}</span>
          </div>
        `).join("") +
        '</div>';
    }

    // 各详情段落
    const formatSection = section("i-doc", "考试形式",
      item.format ? `<p>${escapeHtml(item.format)}</p>` : "");
    const durationSection = section("i-clock", "考试时长",
      item.duration ? `<p>${escapeHtml(item.duration)}</p>` : "");
    const subjectsSection = section("i-grid", "考试科目", subjectsHtml);
    const requirementsSection = section("i-check", "报名条件",
      item.requirements ? `<p>${escapeHtml(item.requirements)}</p>` : "");
    const scoringSection = section("i-status", "成绩与证书",
      item.scoring ? `<p>${escapeHtml(item.scoring)}</p>` : "");
    const timelineSection = section("i-calendar", "重要时间节点", timelineHtml);

    // 信息网格
    const infoGrid = `
      <div class="exam-info-grid">
        ${infoItem("i-medal", "报名费", item.fee)}
        ${infoItem("i-calendar", "考试时间", item.schedule)}
      </div>
    `;

    // 操作按钮：立即报名→official_site，考试官网→official_portal，查看官方公告→official_url
    const primaryLabel = item.status === "open" ? "立即报名" : "访问报名系统";
    const actions = `
      <div class="exam-detail-actions">
        ${item.official_site ? `<a href="${escapeHtml(item.official_site)}" target="_blank" rel="noopener" class="btn btn-primary">${primaryLabel} <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>` : ""}
        ${item.official_portal ? `<a href="${escapeHtml(item.official_portal)}" target="_blank" rel="noopener" class="btn btn-secondary"><svg class="icon-sm icon"><use href="#i-globe"/></svg>考试官网</a>` : ""}
        ${item.official_url ? `<a href="${escapeHtml(item.official_url)}" target="_blank" rel="noopener" class="btn btn-secondary"><svg class="icon-sm icon"><use href="#i-doc"/></svg>查看官方公告</a>` : ""}
        <a href="index.html" class="btn btn-secondary"><svg class="icon-sm icon"><use href="#i-chevron-left"/></svg>返回列表</a>
      </div>
    `;

    // 醒目官方提示框
    const officialCallout = item.official_url ? `
      <div class="exam-official-callout">
        <svg class="icon"><use href="#i-info"/></svg>
        <div>
          <strong>以下内容为 CampBrief 整理的要点摘要，报名、时间、政策等关键信息请务必以官方原文为准。</strong>
          <a href="${escapeHtml(item.official_url)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">查看官方公告 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>
        </div>
      </div>
    ` : `
      <div class="exam-official-callout">
        <svg class="icon"><use href="#i-info"/></svg>
        <div><strong>以下内容为 CampBrief 整理的要点摘要，具体政策请以${item.official_portal ? `<a href="${escapeHtml(item.official_portal)}" target="_blank" rel="noopener">官方渠道</a>` : '官方渠道'}为准。</strong></div>
      </div>
    `;

    el.innerHTML = `
      ${officialCallout}
      <div class="exam-detail-meta">
        <span class="badge badge-prize"><svg class="icon-sm icon"><use href="#${cat.icon}"/></svg>${cat.text}</span>
        <span class="badge status-badge ${status.cls}"><svg class="icon-sm icon"><use href="#${status.icon}"/></svg>${status.text}</span>
      </div>
      <h1 class="exam-detail-title">${escapeHtml(item.name)}</h1>
      <p class="exam-detail-summary">${escapeHtml(item.summary || "")}</p>
      ${infoGrid}
      ${formatSection}
      ${durationSection}
      ${subjectsSection}
      ${requirementsSection}
      ${scoringSection}
      ${timelineSection}
      ${actions}
      <p class="exam-detail-notice">以上信息由 CampBrief 整理，具体报名时间和政策请以<a href="${escapeHtml(item.official_url || item.official_portal || item.official_site || "#")}" target="_blank" rel="noopener">官方公告</a>为准。</p>
    `;
  }

  async function init() {
    const id = getUrlParam("id");
    if (!id) {
      renderNotFound("缺少考试 ID 参数。");
      return;
    }

    const items = await loadData();
    const item = items.find(it => it.id === id);

    if (!item) {
      renderNotFound("该考试可能已下线，或链接有误。");
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
