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

  const DATA_TIMEOUT_MS = 20000;

  // 与列表页一致：带超时的请求。原实现直接 await fetch(...)，网络停滞时
  // Promise 永不落定，详情页会一直空白且不报错。
  async function fetchJsonWithTimeout(url, timeoutMs = DATA_TIMEOUT_MS, attempts = 2) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { cache: "default", signal: controller.signal });
        clearTimeout(timer);
        if (response.status === 404) return null;
        if (response.ok) return await response.json();
      } catch (error) {
        clearTimeout(timer);
      }
    }
    return undefined; // 超时或网络失败
  }

  let loadFailed = false;

  async function loadData() {
    // 详情页同样优先 fetch JSON
    const data = await fetchJsonWithTimeout("../../static/data/daily-news.json");
    if (data === undefined) loadFailed = true;
    if (data && Array.isArray(data.items) && data.items.length > 0) return data.items;
    return [];
  }

  function monthString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  // 归档月份清单（几百字节）：只遍历真实存在的归档。
  // 旧实现从"上个月"起逐月试到 404，会顺带下载多个完整归档（每个 ~170KB gzip）。
  async function archiveMonthsToTry() {
    const index = await fetchJsonWithTimeout("../../static/data/daily-news-archives.json", 8000, 1);
    if (index && Array.isArray(index.archives)) {
      const months = index.archives.filter(m => typeof m === "string" && /^\d{4}-\d{2}$/.test(m));
      if (months.length > 0) return months.sort().reverse();
    }
    const fallback = [];
    const now = new Date();
    for (let step = 1; step <= 12; step += 1) {
      fallback.push(monthString(new Date(now.getFullYear(), now.getMonth() - step, 1)));
    }
    return fallback;
  }

  async function findInArchives(targetId) {
    const months = await archiveMonthsToTry();
    for (const month of months) {
      const data = await fetchJsonWithTimeout(`../../static/data/daily-news-archive-${month}.json`);
      if (data && Array.isArray(data.items)) {
        const item = data.items.find(it => it.id === targetId);
        if (item) return item;
      }
    }
    return null;
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
    let item = items.find(it => it.id === targetId);

    // 主数据没取到（超时/网络失败）时不当作"不存在"，避免误报"内容已归档"
    if (!item && !loadFailed) {
      item = await findInArchives(targetId);
    }

    if (!item) {
      renderNotFound(loadFailed ? "资讯加载超时，请检查网络后刷新重试。" : "内容不存在或已归档。");
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
