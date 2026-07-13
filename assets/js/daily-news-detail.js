// 资讯详情页 - 通过不可变 ID 定位条目，渲染详情
(function () {
  "use strict";

  const CATEGORY_LABELS = {
    ai: { text: "AI", icon: "i-bot" },
    tech: { text: "技术更新", icon: "i-code" },
    competition: { text: "竞赛动态", icon: "i-trophy" },
    exam: { text: "考试动态", icon: "i-exam" },
    sports: { text: "体育", icon: "i-sports" },
    fun: { text: "每日速览", icon: "i-bulb" }
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
      // file:// 直接打开时无法加载 JSON；显示空状态而非旧数据。
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
    return CampBriefContent.escapeHtml(text);
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

  // 获取条目的分类列表（兼容旧数据：categories 数组优先，回退到 category 字符串）
  function getCategories(item) {
    if (Array.isArray(item.categories) && item.categories.length > 0) return item.categories;
    return item.category ? [item.category] : [];
  }

  function renderDetail(item) {
    item = { ...item, url: CampBriefContent.safeHttpUrl(item.url) };
    const el = document.getElementById("newsDetail");
    const cats = getCategories(item);
    const categoryBadges = cats.map(c => {
      const cat = CATEGORY_LABELS[c] || { text: c, icon: "i-info" };
      return `<span class="badge badge-prize"><svg class="icon-sm icon"><use href="#${cat.icon}"/></svg>${escapeHtml(cat.text)}</span>`;
    }).join('');
    const dateText = formatDate(item.published || item.date);
    const detailText = item.detail || item.summary || "";

    document.title = `${item.title} - 简豹资讯`;

    el.innerHTML = `
      <div class="news-detail-meta">
        ${categoryBadges}
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
    const targetId = getUrlParam("id");
    if (!targetId) {
      renderNotFound("缺少资讯 ID 参数。");
      return;
    }

    const items = await loadData();
    const item = items.find(it => it.id === targetId);

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
