// 技术详情页 - 通过不可变 ID 定位条目，渲染详情
// 数据源：
//   1. data/daily-news.json 中 category=tech 的条目
//   2. data/github-trending.json 中 category=tech/subcategory=github 的条目
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
    const techItems = [];

    try {
      const response = await fetch("../../data/daily-news.json", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          // 只在 tech 条目中查找
          techItems.push(...data.items.filter(item => item.category === "tech"));
        }
      }
    } catch (e) {
      // file:// 协议下 fetch 会失败
    }

    try {
      const response = await fetch("../../data/github-trending.json", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          // GitHub 趋势条目已经是 tech/github 格式
          techItems.push(...data.items.filter(item => item.category === "tech" && item.subcategory === "github"));
        }
      }
    } catch (e) {
      // file:// 协议或文件缺失时忽略
    }

    return techItems;
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
    item = { ...item, url: CampBriefContent.safeHttpUrl(item.url) };
    const el = document.getElementById("techDetail");
    const sub = item.subcategory || "software";
    const subInfo = SUBCATEGORY_LABELS[sub] || SUBCATEGORY_LABELS.software;
    const dateText = formatDate(item.published || item.date);

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

    // GitHub 趋势榜单：渲染 Top 10 项目列表
    if (item.repos && item.repos.length > 0) {
      el.innerHTML = renderChartDetail(item, subInfo, dateText, priorityBadge);
      return;
    }

    // 普通技术动态
    const detailText = item.detail || item.summary || "";
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

  function formatNum(n) {
    n = Number(n) || 0;
    if (n >= 10000) return (n / 1000).toFixed(1).replace(".0", "") + "k";
    return String(n);
  }

  function renderChartDetail(item, subInfo, dateText, priorityBadge) {
    const repos = item.repos || [];
    const trendTypeLabel = { daily: "日榜", weekly: "周榜", monthly: "月榜" }[item.trend_type] || "榜单";

    // 根据榜单日期计算 star 增量标签，避免显示"今日"造成实时更新误导
    const d = new Date(item.date);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    let deltaLabel;
    if (item.trend_type === "daily") {
      deltaLabel = `${month}月${day}日`;
    } else if (item.trend_type === "weekly") {
      deltaLabel = `${month}月第${Math.ceil(day / 7)}周`;
    } else {
      deltaLabel = `${month}月`;
    }

    const repoCards = repos.map(repo => {
      const safeUrl = CampBriefContent.safeHttpUrl(repo.url);
      const summary = repo.chinese_summary || repo.description || "暂无描述";
      const solves = repo.solves_what || "";

      return `
        <div class="repo-card">
          <div class="repo-rank">#${repo.rank}</div>
          <div class="repo-content">
            <div class="repo-header">
              <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener" class="repo-name">${escapeHtml(repo.name)}</a>
              <span class="repo-lang">${escapeHtml(repo.language)}</span>
            </div>
            <div class="repo-stats">
              <span class="repo-stat">★ ${formatNum(repo.stars)}</span>
              <span class="repo-stat">⑂ ${formatNum(repo.forks)}</span>
              ${repo.stars_delta > 0 ? `<span class="repo-stat repo-stat-delta">+${formatNum(repo.stars_delta)} ${deltaLabel}</span>` : ""}
            </div>
            <p class="repo-summary">${escapeHtml(summary)}</p>
            ${solves ? `<p class="repo-solves"><svg class="icon-sm icon"><use href="#i-info"/></svg>${escapeHtml(solves)}</p>` : ""}
            ${safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener" class="repo-link">项目地址 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>` : ""}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="news-detail-meta">
        ${priorityBadge}
        <span class="badge badge-prize"><svg class="icon-sm icon"><use href="#${subInfo.icon}"/></svg>${subInfo.text} · ${trendTypeLabel}</span>
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${dateText}</span>
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${escapeHtml(item.source || "")}</span>
      </div>
      <h1 class="news-detail-title">${escapeHtml(item.title)}</h1>
      <p class="news-detail-summary">${escapeHtml(item.summary || "")}</p>
      <div class="repo-list">${repoCards}</div>
      <div class="news-detail-actions">
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="btn btn-primary">查看完整榜单 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>` : ""}
        <a href="index.html" class="btn btn-secondary"><svg class="icon-sm icon"><use href="#i-chevron-left"/></svg>返回列表</a>
      </div>
      <p class="news-detail-notice">以上榜单由简豹自动采集自 GitHub Trending，项目信息以<a href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener">GitHub 官方</a>为准。</p>
    `;
  }

  async function init() {
    const targetId = getUrlParam("id");
    if (!targetId) {
      renderNotFound("缺少技术动态 ID 参数。");
      return;
    }

    const items = await loadData();
    const item = items.find(it => it.id === targetId);

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
