// 资讯详情页 - 通过 ?url= 参数定位条目，渲染详情
(function () {
  "use strict";

  const CATEGORY_LABELS = {
    ai: { text: "AI", icon: "i-bot" },
    tech: { text: "技术更新", icon: "i-code" },
    competition: { text: "竞赛动态", icon: "i-trophy" },
    exam: { text: "考试动态", icon: "i-exam" },
    sports: { text: "体育", icon: "i-sports" },
    fun: { text: "每日趣闻", icon: "i-bulb" }
  };

  function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || "";
  }

  async function loadData() {
    // 详情页同样优先 fetch JSON
    try {
      const response = await fetch("../../data/daily-news.json", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) return data.items;
      }
    } catch (e) {
      // file:// 回退
    }
    // 回退内嵌数据（需 news-data.js 已加载，详情页未引入，返回空）
    if (typeof NEWS_DATA !== "undefined" && NEWS_DATA.items && NEWS_DATA.items.length > 0) {
      return NEWS_DATA.items;
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
    const el = document.getElementById("newsDetail");
    el.innerHTML = `
      <div class="news-detail-empty">
        <svg class="icon"><use href="#i-info"/></svg>
        <h2>未找到该资讯</h2>
        <p>${escapeHtml(message)}</p>
        <a href="index.html" class="btn btn-primary">返回资讯列表</a>
      </div>
    `;
  }

  function renderDetail(item) {
    const el = document.getElementById("newsDetail");
    const cat = CATEGORY_LABELS[item.category] || { text: item.category || "资讯", icon: "i-info" };
    const dateText = formatDate(item.published || item.date);
    const detailText = item.detail || item.summary || "";

    document.title = `${item.title} - CampBrief 资讯`;

    el.innerHTML = `
      <div class="news-detail-meta">
        <span class="badge badge-prize"><svg class="icon-sm icon"><use href="#${cat.icon}"/></svg>${cat.text}</span>
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
      <p class="news-detail-notice">以上内容由 CampBrief 自动整理，请以<a href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener">原文来源</a>为准。</p>
    `;
  }

  async function init() {
    const targetUrl = getUrlParam("url");
    if (!targetUrl) {
      renderNotFound("缺少资讯地址参数。");
      return;
    }

    const items = await loadData();
    const item = items.find(it => it.url === targetUrl) || items.find(it => it.url === decodeURIComponent(targetUrl));

    if (!item) {
      renderNotFound("该资讯可能已更新下线，或链接有误。");
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
