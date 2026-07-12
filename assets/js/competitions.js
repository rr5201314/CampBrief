// 竞赛模块 - 从 data/competitions.json 加载并支持三级筛选 + 精选轮播
(function () {
  "use strict";

  const DATA_URL = "../../data/competitions.json";
  const FALLBACK_DATA = {
    tiers: [
      { key: "all", label: "全部" },
      { key: "official", label: "教育部认可赛事" },
      { key: "enterprise", label: "名企主办赛事" },
      { key: "hobby", label: "兴趣练手赛事" }
    ],
    fields: [
      { key: "all", label: "全部" },
      { key: "innovation", label: "创新创业" },
      { key: "computer", label: "计算机 / 信息技术" },
      { key: "engineering", label: "工程 / 机电 / 自动化" },
      { key: "ai", label: "人工智能" },
      { key: "robot", label: "机器人" },
      { key: "science", label: "数理 / 化学 / 地学" },
      { key: "design", label: "设计 / 艺术 / 传媒" },
      { key: "language", label: "外语" },
      { key: "business", label: "商科 / 金融 / 管理" },
      { key: "medical", label: "医学 / 生命科学" },
      { key: "civil", label: "建筑 / 土木 / 测绘" },
      { key: "vocational", label: "职业技能" }
    ],
    status_map: {
      pending: { label: "未开始" },
      open: { label: "可报名" },
      ongoing: { label: "比赛中" },
      done: { label: "已完赛" }
    },
    items: [
      {
        id: "demo-001",
        name: "数据加载失败示例",
        tier: "official",
        fields: ["computer"],
        status: "open",
        signup: "",
        schedule: "",
        summary: "如果看到这条，说明 competitions.json 加载失败。请检查网络或文件路径。",
        search: "",
        official_site: "",
        organizer: "CampBrief",
        prestige: 5
      }
    ]
  };

  const state = { tier: "all", field: "all", status: "all", query: "" };
  let allItems = [];
  let meta = { tiers: [], fields: [], status_map: {} };

  const cardsContainer = document.getElementById("cards");
  const emptyState = document.getElementById("emptyState");
  const resultCount = document.getElementById("resultCount");
  const searchInput = document.getElementById("searchInput");

  // 状态标签样式映射
  const STATUS_CLASS = {
    pending: "status-pending",
    open: "status-open",
    ongoing: "status-ongoing",
    done: "status-done"
  };

  // 赛事层次标签样式映射
  const TIER_CLASS = {
    official: "tier-official",
    enterprise: "tier-enterprise",
    hobby: "tier-hobby"
  };

  function escapeHtml(text) {
    if (text == null) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function loadData() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      allItems = data.items || [];
      meta.tiers = data.tiers || FALLBACK_DATA.tiers;
      meta.fields = data.fields || FALLBACK_DATA.fields;
      meta.status_map = data.status_map || FALLBACK_DATA.status_map;
    } catch (err) {
      console.warn("加载 competitions.json 失败，使用 fallback 数据", err);
      allItems = FALLBACK_DATA.items;
      meta.tiers = FALLBACK_DATA.tiers;
      meta.fields = FALLBACK_DATA.fields;
      meta.status_map = FALLBACK_DATA.status_map;
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
      const statusLabel = getStatusLabel(item.status);
      const statusClass = STATUS_CLASS[item.status] || "status-pending";
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

      const primaryAction = item.status === "open" && item.official_site
        ? `<a href="${escapeHtml(item.official_site)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">立即报名 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>`
        : item.official_site
          ? `<a href="${escapeHtml(item.official_site)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">访问官网 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>`
          : "";

      return `
        <article class="card" data-id="${escapeHtml(item.id || "")}" data-tier="${escapeHtml(item.tier || "")}" data-fields="${escapeHtml((item.fields || []).join(","))}" data-status="${escapeHtml(item.status || "")}" data-search="${escapeHtml((item.search || item.name || "").toLowerCase())}">
          <div class="card-main">
            <div class="card-head">
              <h2 class="card-title"><a href="detail.html?id=${escapeHtml(item.id || "")}" class="card-title-link">${escapeHtml(item.name)}</a></h2>
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
              ${primaryAction}
              <a href="detail.html?id=${escapeHtml(item.id || "")}" class="btn btn-secondary"><svg class="icon-sm icon"><use href="#i-doc"/></svg>查看详情</a>
            </div>
          </div>
        </article>
      `;
    }).join("");

    if (resultCount) {
      resultCount.textContent = `${items.length} 个赛事`;
    }
    if (emptyState) {
      emptyState.hidden = items.length > 0;
    }
  }

  function applyFilters() {
    const query = state.query;
    const filtered = allItems.filter(item => {
      const tierOk = state.tier === "all" || item.tier === state.tier;
      const fieldOk = state.field === "all" || (item.fields || []).includes(state.field);
      const statusOk = state.status === "all" || item.status === state.status;
      const searchOk = !query ||
        (item.search || "").toLowerCase().includes(query) ||
        (item.name || "").toLowerCase().includes(query) ||
        (item.organizer || "").toLowerCase().includes(query);
      return tierOk && fieldOk && statusOk && searchOk;
    });
    renderCards(filtered);
  }

  function bindFilters() {
    document.querySelectorAll("[data-filter-group]").forEach(group => {
      group.addEventListener("click", event => {
        const option = event.target.closest(".option");
        if (!option) return;
        const key = group.dataset.filterGroup;
        state[key] = option.dataset.value;
        group.querySelectorAll(".option").forEach(item => item.classList.toggle("active", item === option));
        applyFilters();
      });
    });

    searchInput.addEventListener("input", event => {
      state.query = event.target.value.trim().toLowerCase();
      applyFilters();
    });
  }

  function initCarousel() {
    const container = document.querySelector("[data-carousel]");
    if (!container || typeof Carousel === "undefined") return;

    // 从数据中筛选 open / pending，open 优先，按含金量降序，上限 10
    let candidates = allItems.filter(i => i.status === "open" || i.status === "pending");
    candidates.sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      return (b.prestige || 0) - (a.prestige || 0);
    });
    const carouselItems = candidates.slice(0, 10);
    if (carouselItems.length < 3) {
      container.hidden = true;
      return;
    }
    container.hidden = false;

    Carousel.init(container, {
      items: carouselItems,
      renderCard: (item) => {
        const statusLabel = getStatusLabel(item.status);
        const tagClass = item.status === "open" ? "tag-featured" : "tag-normal";
        const metaLine = [];
        if (item.organizer) {
          metaLine.push(`<span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${escapeHtml(item.organizer)}</span>`);
        }
        if (item.signup) {
          metaLine.push(`<span class="meta-item"><svg class="icon-sm icon"><use href="#i-unlock"/></svg>${escapeHtml(item.signup)}</span>`);
        }
        return `
          <div class="carousel-card" data-carousel-item-id="${escapeHtml(item.id)}">
            <span class="carousel-card-tag ${tagClass}">${escapeHtml(statusLabel)}</span>
            <div class="carousel-card-head">
              <h3 class="carousel-card-title">${escapeHtml(item.name)}</h3>
            </div>
            <div class="carousel-card-meta">
              ${metaLine.join("")}
            </div>
            <p class="carousel-card-desc">${escapeHtml(item.summary)}</p>
          </div>
        `;
      },
      autoPlay: true,
      speed: 12
    });
  }

  async function init() {
    bindFilters();
    await loadData();
    applyFilters();
    initCarousel();
  }

  init();
})();
