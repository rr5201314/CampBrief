// 技术板块 - 从 daily-news.json 读取 category=tech 的条目，按 subcategory 分类
// 子分类：ai-frontier（AI 前沿）/ hardware（硬件与芯片）/ software（软件与系统）/ industry（产业与商业）
// GitHub 趋势分类为占位，后续接入独立数据源
const state = { subcategory: "all", date: "all", customDate: "", query: "" };
const PAGE_SIZE = 8;
let allItems = [];
let filteredItems = [];
let currentPage = 1;
let paginationNav;
let resultCount, searchInput, emptyState;

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
}

// 从 daily-news.json 加载技术类条目
async function loadTechData() {
  try {
    const response = await fetch('../../data/daily-news.json', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        // 只取 category=tech 的条目
        return data.items.filter(item => item.category === 'tech');
      }
    }
  } catch (error) {
    // file:// 协议下 fetch 会失败
  }
  return [];
}

// 生成卡片 HTML
function createCardHTML(item) {
  const date = new Date(item.published);
  const now = new Date();
  const diffHours = (now - date) / (1000 * 60 * 60);

  // 时间标签对齐筛选条件：24小时 / 7天 / 30天 / 更早
  let statusClass = 'status-done';
  let statusText = '更早';

  if (diffHours < 24) {
    statusClass = 'status-open';
    statusText = '24小时';
  } else if (diffHours < 168) {
    statusClass = 'status-pending';
    statusText = '7天';
  } else if (diffHours < 720) {
    statusClass = 'status-closed';
    statusText = '30天';
  }

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

  return `
    <article class="card" data-subcategory="${sub}" data-published="${item.published}" data-priority="${priority}" data-search="${item.title} ${item.summary}">
      <div class="card-main">
        <div class="card-head">
          <h2 class="card-title">${item.title}</h2>
          <span class="badge status-badge ${statusClass}"><svg class="icon-sm icon"><use href="#i-clock"/></svg>${statusText}</span>
        </div>
        <div class="meta-line">
          ${priorityBadge}
          ${subBadge}
          <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${formattedDate}</span>
          <span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${item.source}</span>
        </div>
        <p class="desc">${item.summary}</p>
        <div class="actions">
          <a href="detail.html?url=${encodeURIComponent(item.url)}" class="btn btn-primary"><svg class="icon-sm icon"><use href="#i-doc"/></svg>查看详情</a>
          <a href="${item.url}" target="_blank" rel="noopener" class="btn btn-secondary">阅读原文 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>
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
  paginationNav.hidden = false;

  const buttons = [];
  buttons.push(`<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}" aria-label="上一页"><svg class="icon-sm icon"><use href="#i-chevron-left"/></svg></button>`);

  const pageNumbers = computePageNumbers(currentPage, totalPages);
  pageNumbers.forEach(p => {
    if (p === '...') {
      buttons.push(`<span class="page-ellipsis">…</span>`);
    } else {
      buttons.push(`<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`);
    }
  });

  buttons.push(`<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}" aria-label="下一页"><svg class="icon-sm icon"><use href="#i-chevron-right"/></svg></button>`);
  paginationNav.innerHTML = buttons.join('');
}

function computePageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

function initFilters() {
  document.querySelectorAll("[data-filter-group]").forEach(group => {
    group.addEventListener("click", event => {
      const option = event.target.closest(".option");
      if (!option) return;
      const key = group.dataset.filterGroup;
      if (key === "date" && option.dataset.value === "custom") {
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

  if (paginationNav) {
    paginationNav.addEventListener("click", event => {
      const btn = event.target.closest(".page-btn");
      if (!btn || btn.disabled) return;
      const target = Number(btn.dataset.page);
      if (!target || target === currentPage) return;
      currentPage = target;
      renderPage();
      const cardsTop = document.getElementById("cards");
      if (cardsTop) cardsTop.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

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
  // 按优先级降序，同优先级按发布时间降序
  filteredItems.sort((a, b) => {
    const pa = a.priority || 1, pb = b.priority || 1;
    if (pa !== pb) return pb - pa;
    return new Date(b.published) - new Date(a.published);
  });
  if (resultCount) resultCount.textContent = `${filteredItems.length} 条技术动态`;
  renderPage();
}

function matchesDateFilter(item) {
  if (state.date === "all") return true;
  const publishedAt = new Date(item.published);
  const now = new Date();
  const rangeHours = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 }[state.date];
  if (!rangeHours) return true;
  const rangeStart = new Date(now.getTime() - rangeHours * 60 * 60 * 1000);
  return publishedAt >= rangeStart && publishedAt <= now;
}

// ===== 技术板块轮播 =====
// 规则：近7天 priority>=3 的技术条目；不足3个补充 priority>=2；上限10个
function pickTechCarouselItems(items) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recent = items.filter(item => {
    const d = new Date(item.published);
    return d >= sevenDaysAgo && d <= now;
  });
  let result = recent.filter(i => (i.priority || 1) >= 3);
  if (result.length < 3) {
    const p2 = recent.filter(i => (i.priority || 1) === 2 && !result.find(r => r.url === i.url));
    result = result.concat(p2);
  }
  result.sort((a, b) => new Date(b.published) - new Date(a.published));
  return result.slice(0, 10);
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
    <a class="carousel-card" href="detail.html?url=${encodeURIComponent(item.url)}">
      <span class="carousel-card-tag ${tagClass}">${tagText}</span>
      <div class="carousel-card-head">
        <h3 class="carousel-card-title">${item.title}</h3>
      </div>
      <div class="carousel-card-meta">
        <span class="badge badge-prize"><svg class="icon-sm icon"><use href="#${subInfo.icon}"/></svg>${subInfo.text}</span>
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${formattedDate}</span>
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${item.source}</span>
      </div>
      <p class="carousel-card-desc">${item.summary}</p>
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

  const container = document.getElementById('cards');
  container.innerHTML = '<div class="loading-state" style="text-align: center; padding: 40px; color: var(--text-secondary, #666);">正在加载技术动态...</div>';

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
