// 技术详情页 - 通过 ?url= 参数定位条目，渲染详情
// 数据源：data/daily-news.json 中 category=tech 的条目
(function () {
  "use strict";

  const SUBCATEGORY_LABELS = {
    "ai-frontier": { text: "AI 前沿", icon: "i-bot" },
    "hardware": { text: "硬件与芯片", icon: "i-chip" },
    "software": { text: "软件与系统", icon: "i-code" },
    "industry": { text: "产业与商业", icon: "i-status" },
    "github": { text: "GitHub 趋势", icon: "i-github" }
  };

  function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || "";
  }

  async function loadData() {
    try {
      const response = await fetch("../../data/daily-news.json", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          // 只在 tech 条目中查找
          return data.items.filter(item => item.category === "tech");
        }
      }
    } catch (e) {
      // file:// 协议下 fetch 会失败
    }
    return [];
  }

  function formatDate(value) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value || "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
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
    const el = document.getElementById("techDetail");
    el.innerHTML = `
      <div class="news-detail-empty">
        <svg class="icon"><use href="#i-info"/></svg>
        <h2>未找到该技术动态</h2>
        <p>${escapeHtml(message)}</p>
        <a href="index.html" class="btn btn-primary">返回技术列表</a>
      </div>
    `;
  }

  function renderDetail(item) {
    const el = document.getElementById("techDetail");
    const sub = item.subcategory || "software";
    const subInfo = SUBCATEGORY_LABELS[sub] || SUBCATEGORY_LABELS.software;
    const dateText = formatDate(item.published || item.date);
    const detailText = item.detail || item.summary || "";

    // 优先级标签
    const priority = item.priority || 1;
    const priorityBadge = priority >= 4
      ? '<span class="badge badge-hot"><svg class="icon-sm icon"><use href="#i-trophy"/></svg>头条</span>'
      : priority >= 3
      ? '<span class="badge badge-hot"><svg class="icon-sm icon"><use href="#i-trophy"/></svg>重磅</span>'
      : priority >= 2
      ? '<span class="badge badge-important"><svg class="icon-sm icon"><use href="#i-status"/></svg>重要</span>'
      : '';

    document.title = `${item.title} - 简豹技术`;

    el.innerHTML = `
      <div class="news-detail-meta">
        ${priorityBadge}
        <span class="badge badge-prize"><svg class="icon-sm icon"><use href="#${subInfo.icon}"/></svg>${subInfo.text}</span>
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${dateText}</span>
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${escapeHtml(item.source || "")}</span>
      </div>
      <h1 class="news-detail-title">${escapeHtml(item.title)}</h1>
      <p class="news-detail-summary">${escapeHtml(item.summary || "")}</p>
      <div class="news-detail-body">${escapeHtml(detailText)}</div>
      <div class="news-detail-actions">
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="btn btn-primary">阅读原文 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>` : ""}
        <a href="index.html" class="btn btn-secondary"><svg class="icon-sm icon"><use href="#i-chevron-left"/></svg>返回列表</a>
      </div>
      <p class="news-detail-notice">以上内容由简豹自动整理，请以<a href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener">原文来源</a>为准。</p>
    `;
  }

  async function init() {
    const targetUrl = getUrlParam("url");
    if (!targetUrl) {
      renderNotFound("缺少技术动态地址参数。");
      return;
    }

    const items = await loadData();
    const item = items.find(it => it.url === targetUrl) || items.find(it => it.url === decodeURIComponent(targetUrl));

    if (!item) {
      renderNotFound("该技术动态可能已更新下线，或链接有误。");
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
