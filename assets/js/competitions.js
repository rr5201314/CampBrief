// 竞赛模块 - 从 static/data/competitions.json 加载并支持三级筛选 + 精选轮播
(function () {
  "use strict";

  const DATA_URL = "../../static/data/competitions.json";
  const state = { tier: "all", field: "all", status: "all", query: "" };
  const PAGE_SIZE = 5;
  let allItems = [];
  let filteredItems = [];
  let currentPage = 1;
  let meta = { tiers: [], fields: [], status_map: {} };

  const cardsContainer = document.getElementById("cards");
  const emptyState = document.getElementById("emptyState");
  const paginationNav = document.querySelector(".pagination");
  const resultCount = document.getElementById("resultCount");
  const searchInput = document.getElementById("searchInput");

  // 状态标签样式映射
  const STATUS_CLASS = {
    pending: "status-pending",
    open: "status-open",
    closed: "status-closed",
    ongoing: "status-ongoing",
    unknown: "status-pending",
    done: "status-done"
  };

  // 赛事层次标签样式映射
  const TIER_CLASS = {
    official: "tier-official",
    enterprise: "tier-enterprise",
    hobby: "tier-hobby"
  };

  const STATUS_SORT_ORDER = { open: 0, pending: 1, ongoing: 2, closed: 3, unknown: 4, done: 5 };
  const TIER_SORT_ORDER = { official: 0, enterprise: 1, hobby: 2 };

  function escapeHtml(text) {
    return CampBriefContent.escapeHtml(text);
  }

  function safeExternalUrl(value) {
    return CampBriefContent.safeHttpUrl(value);
  }

  // 结构化生命周期兜底；自然语言展示字段不参与状态计算。
  function getStatus(item) {
    return CampBriefContent.effectiveStatus(item, { kind: "competition", requireLifecycle: true });
  }

  function compareCompetitions(a, b) {
    const statusDiff = (STATUS_SORT_ORDER[getStatus(a)] ?? 99) - (STATUS_SORT_ORDER[getStatus(b)] ?? 99);
    if (statusDiff) return statusDiff;

    const tierDiff = (TIER_SORT_ORDER[a.tier] ?? 99) - (TIER_SORT_ORDER[b.tier] ?? 99);
    if (tierDiff) return tierDiff;

    const prestigeDiff = (b.prestige || 0) - (a.prestige || 0);
    if (prestigeDiff) return prestigeDiff;

    return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
  }

  async function loadData() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      allItems = data.items || [];
      meta.tiers = data.tiers || [];
      meta.fields = data.fields || [];
      meta.status_map = data.status_map || {};
      meta.last_updated = data.last_updated || null;
    } catch (err) {
      console.warn("无法加载 competitions.json", err);
      allItems = [];
      meta = { tiers: [], fields: [], status_map: {}, last_updated: null };
    }
  }

  function getStatusLabel(status) {
    return (meta.status_map[status] && meta.status_map[status].label) || status;
  }

  function getFieldLabel(key) {
    const f = meta.fields.find(x => x.key === key);
    return f ? f.label : key;
  }

  function getTierLabel(key) {
    const t = meta.tiers.find(x => x.key === key);
    return t ? t.label : key;
  }

  function renderCards(items) {
    cardsContainer.innerHTML = items.map(item => {
      const itemStatus = getStatus(item);
      const statusLabel = getStatusLabel(itemStatus);
      const statusClass = STATUS_CLASS[itemStatus] || "status-pending";
      const tierLabel = getTierLabel(item.tier);
      const tierClass = TIER_CLASS[item.tier] || "tier-hobby";
      const fieldTags = (item.fields || []).slice(0, 3).map(f =>
        `<span class="badge field-badge">${escapeHtml(getFieldLabel(f))}</span>`
      ).join("");
      const metaLine = [];
      if (item.organizer) {
        metaLine.push(`<span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${escapeHtml(item.organizer)}</span>`);
      }
      if (item.signup) {
        metaLine.push(`<span class="meta-item"><svg class="icon-sm icon"><use href="#i-unlock"/></svg>${escapeHtml(item.signup)}</span>`);
      }
      if (item.schedule) {
        metaLine.push(`<span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${escapeHtml(item.schedule)}</span>`);
      }

      const detailHref = `detail.html?id=${encodeURIComponent(item.id || "")}`;
      const officialUrl = safeExternalUrl(item.official_site);
      const sourceUrl = safeExternalUrl(item.official_url);
      const isThirdParty = sourceUrl && sourceUrl.includes("52jingsai");
      let officialAction = "";
      if (officialUrl) {
        officialAction = `<a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">${itemStatus === "open" ? "立即报名" : "访问官网"} <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>`;
      } else if (isThirdParty) {
        officialAction = `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">信息来源 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>`;
      }

      return `
        <article class="card" data-id="${escapeHtml(item.id || "")}" data-tier="${escapeHtml(item.tier || "")}" data-fields="${escapeHtml((item.fields || []).join(","))}" data-status="${escapeHtml(itemStatus || "")}" data-search="${escapeHtml((item.search || item.name || "").toLowerCase())}">
          <div class="card-main">
            <div class="card-head">
              <h2 class="card-title"><a href="${detailHref}" class="card-title-link">${escapeHtml(item.name)}</a></h2>
              <div class="card-badges">
                <span class="badge tier-badge ${tierClass}">${escapeHtml(tierLabel)}</span>
                <span class="badge status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
              </div>
            </div>
            <div class="field-tags">${fieldTags}</div>
            <div class="meta-line">
              ${metaLine.join("")}
            </div>
            <p class="desc">${escapeHtml(item.summary)}</p>
            <div class="actions">
              <a href="${detailHref}" class="btn btn-primary"><svg class="icon-sm icon"><use href="#i-doc"/></svg>查看详情</a>
              ${officialAction}
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderPage() {
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    renderCards(filteredItems.slice(start, start + PAGE_SIZE));

    if (emptyState) {
      emptyState.hidden = filteredItems.length > 0;
    }
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    if (!paginationNav) return;
    if (totalPages <= 1 || filteredItems.length === 0) {
      paginationNav.hidden = true;
      paginationNav.innerHTML = "";
      return;
    }

    paginationNav.dataset.totalPages = String(totalPages);
    paginationNav.innerHTML = CampBriefPagination.render({ currentPage, totalPages });
    paginationNav.hidden = false;
  }

  function applyFilters() {
    const query = state.query;
    filteredItems = allItems.filter(item => {
      const tierOk = state.tier === "all" || item.tier === state.tier;
      const fieldOk = state.field === "all" || (item.fields || []).includes(state.field);
      const statusOk = state.status === "all" || getStatus(item) === state.status;
      const searchOk = !query ||
        (item.search || "").toLowerCase().includes(query) ||
        (item.name || "").toLowerCase().includes(query) ||
        (item.organizer || "").toLowerCase().includes(query);
      return tierOk && fieldOk && statusOk && searchOk;
    }).sort(compareCompetitions);
    if (resultCount) resultCount.textContent = `${filteredItems.length} 个赛事`;
    renderPage();
  }

  function bindFilters() {
    document.querySelectorAll("[data-filter-group]").forEach(group => {
      group.addEventListener("click", event => {
        const option = event.target.closest(".option");
        if (!option) return;
        const key = group.dataset.filterGroup;
        state[key] = option.dataset.value;
        group.querySelectorAll(".option").forEach(item => {
          const isActive = item === option;
          item.classList.toggle("active", isActive);
          item.setAttribute("aria-pressed", String(isActive));
        });
        currentPage = 1;
        applyFilters();
      });
    });

    searchInput.addEventListener("input", event => {
      state.query = event.target.value.trim().toLowerCase();
      currentPage = 1;
      applyFilters();
    });

    CampBriefPagination.bind(paginationNav, targetPage => {
      if (targetPage === currentPage) return;
      currentPage = targetPage;
      renderPage();
      CampBriefPagination.scrollToFirstCard(cardsContainer);
    });
  }

  function initCarousel() {
    const container = document.querySelector("[data-carousel]");
    if (!container || typeof Carousel === "undefined") return;

    // 仅推荐可报名或即将开始的赛事；可报名优先，其次教育部认可、名企主办与含金量。
    let candidates = allItems.filter(item => CampBriefContent.isCarouselCandidate(item, "competition"));
    candidates.sort(compareCompetitions);
    const carouselItems = candidates.slice(0, 15);
    if (carouselItems.length < 3) {
      container.hidden = true;
      return;
    }
    container.hidden = false;

    Carousel.init(container, {
      items: carouselItems,
      renderCard: (item) => {
        const itemStatus = getStatus(item);
        const statusLabel = getStatusLabel(itemStatus);
        const tagClass = itemStatus === "open" ? "tag-featured" : "tag-normal";
        const detailHref = `detail.html?id=${encodeURIComponent(item.id || "")}`;
        const metaLine = [];
        if (item.organizer) {
          metaLine.push(`<span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${escapeHtml(item.organizer)}</span>`);
        }
        if (item.signup) {
          metaLine.push(`<span class="meta-item"><svg class="icon-sm icon"><use href="#i-unlock"/></svg>${escapeHtml(item.signup)}</span>`);
        }
        return `
          <a class="carousel-card" href="${detailHref}" data-carousel-item-id="${escapeHtml(item.id)}" aria-label="查看${escapeHtml(item.name)}详情">
            <span class="carousel-card-tag ${tagClass}">${escapeHtml(statusLabel)}</span>
            <div class="carousel-card-head">
              <h3 class="carousel-card-title">${escapeHtml(item.name)}</h3>
            </div>
            <div class="carousel-card-meta">
              ${metaLine.join("")}
            </div>
            <p class="carousel-card-desc">${escapeHtml(item.summary)}</p>
          </a>
        `;
      },
      autoPlay: true,
      speed: 12
    });
  }

  async function init() {
    bindFilters();
    if (typeof FilterScroll !== "undefined") FilterScroll.initAll();
    cardsContainer.innerHTML = '<div class="loading-state" role="status" style="text-align:center;padding:40px;color:var(--text-secondary,#666);">正在加载竞赛数据...</div>';
    await loadData();
    CampBriefContent.updateSortPill(meta.last_updated);
    applyFilters();
    initCarousel();
  }

  init();
})();
