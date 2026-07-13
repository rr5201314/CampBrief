// 技术板块 - 聚合两类数据源：
//   1. data/daily-news.json 中 category=tech 的条目
//   2. data/github-trending.json 中的 GitHub 趋势条目（subcategory=github）
// 子分类：ai-frontier（AI 前沿）/ hardware（硬件与芯片）/ software（软件与系统）/ industry（产业与商业）/ github（GitHub 趋势）
const state = { subcategory: "all", date: "all", customDate: "", query: "" };
const PAGE_SIZE = 5;
let allItems = [];
let filteredItems = [];
let currentPage = 1;
let paginationNav;
let resultCount, searchInput, emptyState;
let dateModal, customDateInput, customDateOption;

const escapeHtml = value => CampBriefContent.escapeHtml(value);
const safeExternalUrl = value => CampBriefContent.safeHttpUrl(value);

const SUBCATEGORY_LABELS = {
  "ai-frontier": { text: "AI 前沿", icon: "i-bot" },
  "hardware": { text: "硬件与芯片", icon: "i-chip" },
  "software": { text: "软件与系统", icon: "i-code" },
  "industry": { text: "产业与商业", icon: "i-status" },
  "github": { text: "GitHub 趋势", icon: "i-github" }
};

function initDOM() {
  resultCount = document.getElementById("resultCount");
  searchInput = document.getElementById("searchInput");
  emptyState = document.getElementById("emptyState");
  paginationNav = document.querySelector(".pagination");
  dateModal = document.getElementById("dateModal");
  customDateInput = document.getElementById("customDateInput");
  customDateOption = document.querySelector('[data-filter-group="date"] [data-value="custom"]');
}

// 从 daily-news.json 和 github-trending.json 加载技术类条目并合并
async function loadTechData() {
  const techItems = [];

  try {
    const response = await fetch('../../data/daily-news.json', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        // 只取 category=tech 的条目
        techItems.push(...data.items.filter(item => item.category === 'tech'));
      }
    }
  } catch (error) {
    // file:// 协议下 fetch 会失败
  }

  try {
    const response = await fetch('../../data/github-trending.json', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        // GitHub 趋势条目已经是 tech/github 格式
        techItems.push(...data.items.filter(item => item.category === 'tech' && item.subcategory === 'github'));
      }
    }
  } catch (error) {
    // file:// 协议或文件缺失时忽略
  }

  return techItems;
}

// 生成卡片 HTML
function createCardHTML(item) {
  const date = new Date(item.published);
  const { statusClass, statusText } = CampBriefContent.getTimeBadge(item.published);

  const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;

  const priority = item.priority || 1;
  const priorityBadge = priority >= 4
    ? '<span class="badge badge-hot"><svg class="icon-sm icon"><use href="#i-trophy"/></svg>头条</span>'
    : priority >= 3
    ? '<span class="badge badge-hot"><svg class="icon-sm icon"><use href="#i-trophy"/></svg>重磅</span>'
    : priority >= 2
    ? '<span class="badge badge-important"><svg class="icon-sm icon"><use href="#i-status"/></svg>重要</span>'
    : '';

  // 子分类标签
  const sub = item.subcategory || 'software';
  const subInfo = SUBCATEGORY_LABELS[sub] || SUBCATEGORY_LABELS.software;
  const subBadge = `<span class="badge badge-prize"><svg class="icon-sm icon"><use href="#${subInfo.icon}"/></svg>${subInfo.text}</span>`;
  const sourceUrl = safeExternalUrl(item.url);

  return `
    <article class="card" data-subcategory="${escapeHtml(sub)}" data-published="${escapeHtml(item.published || '')}" data-priority="${priority}" data-search="${escapeHtml(`${item.title || ''} ${item.summary || ''}`)}">
      <div class="card-main">
        <div class="card-head">
          <h2 class="card-title">${escapeHtml(item.title)}</h2>
          <span class="badge status-badge ${statusClass}"><svg class="icon-sm icon"><use href="#i-clock"/></svg>${statusText}</span>
        </div>
        <div class="meta-line">
          ${priorityBadge}
          ${subBadge}
          <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${formattedDate}</span>
          <span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${escapeHtml(item.source)}</span>
        </div>
        <p class="desc">${escapeHtml(item.summary)}</p>
        <div class="actions">
          <a href="detail.html?id=${encodeURIComponent(item.id || '')}" class="btn btn-primary"><svg class="icon-sm icon"><use href="#i-doc"/></svg>查看详情</a>
          ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener" class="btn btn-secondary">阅读原文 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>` : ''}
        </div>
      </div>
    </article>
  `;
}

function setItems(items) {
  allItems = items;
  currentPage = 1;
  applyFilters();
}

function renderPage() {
  const container = document.getElementById('cards');
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    container.innerHTML = '';
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    container.innerHTML = pageItems.map(item => createCardHTML(item)).join('');
  }
  renderPagination();
}

function renderPagination() {
  if (!paginationNav) return;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  if (currentPage > totalPages) {
    currentPage = totalPages;
    renderPage();
    return;
  }

  if (totalPages <= 1) {
    paginationNav.hidden = true;
    paginationNav.innerHTML = '';
    return;
  }
  paginationNav.dataset.totalPages = String(totalPages);
  paginationNav.innerHTML = CampBriefPagination.render({ currentPage, totalPages });
  paginationNav.hidden = false;
}

function initFilters() {
  document.querySelectorAll("[data-filter-group]").forEach(group => {
    group.addEventListener("click", event => {
      const option = event.target.closest(".option");
      if (!option) return;
      const key = group.dataset.filterGroup;
      if (key === "date" && option.dataset.value === "custom") {
        openDateModal();
        // 日期自定义占位：暂不支持，后续可扩展
        return;
      }
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

  CampBriefPagination.bind(paginationNav, targetPage => {
    if (targetPage === currentPage) return;
    currentPage = targetPage;
    renderPage();
    const cardsTop = document.getElementById("cards");
    CampBriefPagination.scrollToFirstCard(cardsTop);
  });

  if (searchInput) {
    searchInput.addEventListener("input", event => {
      state.query = event.target.value.trim().toLowerCase();
      currentPage = 1;
      applyFilters();
    });
  }
}

function applyFilters() {
  filteredItems = allItems.filter(item => {
    const subOk = state.subcategory === "all" || item.subcategory === state.subcategory;
    const dateOk = matchesDateFilter(item);
    const searchOk = !state.query || `${item.title} ${item.summary} ${item.detail || ""}`.toLowerCase().includes(state.query);
    return subOk && dateOk && searchOk;
  });
  // 时效标签优先，保证 24小时条目始终排在 3天条目前；同一时效区间内再按优先级和发布时间排序。
  const now = new Date();
  filteredItems.sort((a, b) => CampBriefContent.compareByTimeBadgeThenPriority(a, b, now));
  if (resultCount) resultCount.textContent = `${filteredItems.length} 条技术动态`;
  renderPage();
}

// ===== 技术板块轮播 =====
// 规则：近3天 priority>=4 的技术条目；不足3个补充 priority>=3；上限15个。
function pickTechCarouselItems(items) {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const recent = items.filter(item => {
    const d = new Date(item.published);
    return d >= threeDaysAgo && d <= now;
  });
  let result = recent.filter(i => (i.priority || 1) >= 4);
  if (result.length < 3) {
    const p3 = recent.filter(i => (i.priority || 1) === 3 && !result.find(r => r.id === i.id));
    result = result.concat(p3);
  }
  result.sort((a, b) => new Date(b.published) - new Date(a.published));
  return result.slice(0, 15);
}

function matchesDateFilter(item) {
  if (state.date === "all") return true;
  if (state.date === "custom") {
    return !state.customDate || CampBriefContent.naturalDayKey(item.published) === state.customDate;
  }

  const publishedAt = new Date(item.published);
  const now = new Date();
  const rangeHours = { "24h": 24, "3d": 24 * 3, "7d": 24 * 7, "30d": 24 * 30 }[state.date];
  if (!rangeHours) return true;
  const rangeStart = new Date(now.getTime() - rangeHours * 60 * 60 * 1000);
  return publishedAt >= rangeStart && publishedAt <= now;
}

function setActiveDateOption(value) {
  document.querySelectorAll('[data-filter-group="date"] .option').forEach(option => {
    const isActive = option.dataset.value === value;
    option.classList.toggle("active", isActive);
    option.setAttribute("aria-pressed", String(isActive));
  });
}

function openDateModal() {
  if (!dateModal || !customDateInput) return;
  customDateInput.value = state.customDate;
  dateModal.hidden = false;
  document.body.classList.add("is-date-modal-open");
  customDateOption?.setAttribute("aria-expanded", "true");
  customDateInput.focus();
}

function closeDateModal() {
  if (!dateModal) return;
  dateModal.hidden = true;
  document.body.classList.remove("is-date-modal-open");
  customDateOption?.setAttribute("aria-expanded", "false");
}

function initDatePicker() {
  const dateGroup = document.querySelector('[data-filter-group="date"]');
  if (!dateModal || !customDateInput || !dateGroup) return;

  dateGroup.addEventListener("click", event => {
    const option = event.target.closest('[data-value="custom"]');
    if (!option) return;
    event.stopImmediatePropagation();
    openDateModal();
  }, true);

  dateModal.addEventListener("click", event => {
    if (event.target.closest("[data-date-modal-close]")) closeDateModal();
  });

  document.getElementById("applyCustomDateButton")?.addEventListener("click", () => {
    if (!customDateInput.value) return;
    state.date = "custom";
    state.customDate = customDateInput.value;
    setActiveDateOption("custom");
    currentPage = 1;
    applyFilters();
    closeDateModal();
  });

  document.getElementById("clearDateButton")?.addEventListener("click", () => {
    state.date = "all";
    state.customDate = "";
    setActiveDateOption("all");
    currentPage = 1;
    applyFilters();
    closeDateModal();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !dateModal.hidden) closeDateModal();
  });
}

function renderTechCarouselCard(item) {
  const date = new Date(item.published);
  const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const priority = item.priority || 1;
  const tagClass = priority >= 4 ? 'tag-featured' : 'tag-normal';
  const tagText = priority >= 4 ? '头条' : priority >= 3 ? '重磅' : '重要';
  const sub = item.subcategory || 'software';
  const subInfo = SUBCATEGORY_LABELS[sub] || SUBCATEGORY_LABELS.software;

  return `
    <a class="carousel-card" href="detail.html?id=${encodeURIComponent(item.id || '')}">
      <span class="carousel-card-tag ${tagClass}">${tagText}</span>
      <div class="carousel-card-head">
        <h3 class="carousel-card-title">${escapeHtml(item.title)}</h3>
      </div>
      <div class="carousel-card-meta">
        <span class="badge badge-prize"><svg class="icon-sm icon"><use href="#${subInfo.icon}"/></svg>${subInfo.text}</span>
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${formattedDate}</span>
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${escapeHtml(item.source)}</span>
      </div>
      <p class="carousel-card-desc">${escapeHtml(item.summary)}</p>
    </a>
  `;
}

function initTechCarousel(items) {
  const container = document.querySelector('[data-carousel]');
  if (!container || typeof Carousel === 'undefined') return;
  const carouselItems = pickTechCarouselItems(items);
  if (carouselItems.length < 3) { container.hidden = true; return; }
  container.hidden = false;
  Carousel.init(container, {
    items: carouselItems,
    renderCard: renderTechCarouselCard,
    autoPlay: true
  });
}

async function init() {
  initDOM();
  initFilters();
  initDatePicker();
  if (typeof FilterScroll !== "undefined") FilterScroll.initAll();

  const container = document.getElementById('cards');
  container.innerHTML = '<div class="loading-state" style="text-align: center; padding: 40px; color: var(--text-secondary, #666);">正在加载技术动态...</div>';

  container.firstElementChild?.setAttribute("role", "status");
  const items = await loadTechData();

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 40px; color: var(--text-secondary, #666);">暂无技术动态</div>';
    if (resultCount) resultCount.textContent = '0 条技术动态';
    return;
  }

  setItems(items);
  initTechCarousel(items);
}

document.addEventListener('DOMContentLoaded', init);
