// 考试模块 - 从 JSON 文件加载 + 筛选搜索 + 前端分页
// 数据来源：static/data/exams.json（HTTP 服务器 / GitHub Pages）
// file:// 协议下 fetch 不可用时显示空状态，建议使用本地服务器预览。
const state = { category: "all", status: "all", query: "" };
const PAGE_SIZE = 5;
let allItems = [];
let filteredItems = [];
let currentPage = 1;
let paginationNav;
let resultCount, searchInput, emptyState;

const STATUS_LABEL = {
  open: "可报名",
  pending: "未开始",
  closed: "报名截止",
  unknown: "待核验",
  done: "已结束"
};
const STATUS_ICON = {
  open: "i-unlock",
  pending: "i-clock",
  closed: "i-lock",
  unknown: "i-clock",
  done: "i-check"
};
const LIST_STATUS_ORDER = { pending: 0, open: 1, closed: 2, unknown: 3, done: 4 };
const CAROUSEL_STATUS_ORDER = { open: 0, pending: 1, closed: 2, done: 2 };

function escapeHtml(value) {
  return CampBriefContent.escapeHtml(value);
}

function safeExternalUrl(value) {
  return CampBriefContent.safeHttpUrl(value);
}

// 结构化生命周期兜底；自然语言展示字段不参与状态计算。
function getStatus(item) {
  return CampBriefContent.effectiveStatus(item, { kind: "exam", requireLifecycle: true });
}

function compareExams(a, b, statusOrder = LIST_STATUS_ORDER) {
  const statusDiff = (statusOrder[getStatus(a)] ?? 99) - (statusOrder[getStatus(b)] ?? 99);
  if (statusDiff) return statusDiff;

  const prestigeDiff = (EXAM_PRESTIGE[a.id] || 0) - (EXAM_PRESTIGE[b.id] || 0);
  if (prestigeDiff) return -prestigeDiff;

  return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
}

// 初始化 DOM 元素
function initDOM() {
  resultCount = document.getElementById("resultCount");
  searchInput = document.getElementById("searchInput");
  emptyState = document.getElementById("emptyState");
  paginationNav = document.querySelector(".pagination");
}

// 从 exams.json 加载考试数据
async function loadExamsData() {
  try {
    const response = await fetch('../../static/data/exams.json', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      if (data.items && data.items.length > 0) return { items: data.items, lastUpdated: data.last_updated };
    }
  } catch (error) {
    // file:// 协议下 fetch 会失败
  }
  return { items: [], lastUpdated: null };
}

// 生成单张考试卡片 HTML
function createCardHTML(item) {
  const itemStatus = getStatus(item);
  const statusClass = itemStatus === 'unknown' ? 'status-pending' : `status-${itemStatus}`;
  const statusText = STATUS_LABEL[itemStatus] || itemStatus;
  const statusIcon = STATUS_ICON[itemStatus] || 'i-clock';

  const detailHref = `detail.html?id=${encodeURIComponent(item.id || '')}`;
  const officialUrl = safeExternalUrl(item.official_site || item.official_url);
  const officialLink = officialUrl
    ? `<a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">${itemStatus === 'open' ? '立即报名' : '访问官网'} <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>`
    : '';

  // 从 timeline 提取报名时间节点
  const regEntry = (item.timeline || []).find(t => t.label && t.label.includes('报名'));
  const regTime = regEntry ? regEntry.value : '';

  return `
    <article class="card" data-category="${escapeHtml(item.category)}" data-status="${escapeHtml(itemStatus)}" data-search="${escapeHtml(`${item.search || ''} ${item.name || ''}`)}">
      <div class="card-main">
        <div class="card-head">
          <h2 class="card-title">${escapeHtml(item.name)}</h2>
          <span class="badge status-badge ${statusClass}"><svg class="icon-sm icon"><use href="#${statusIcon}"/></svg>${statusText}</span>
        </div>
        <div class="meta-line">
          <span class="badge badge-prize"><svg class="icon-sm icon"><use href="#i-medal"/></svg>${escapeHtml(item.fee)}</span>
          <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${escapeHtml(item.schedule)}</span>
          ${regTime ? `<span class="meta-item"><svg class="icon-sm icon"><use href="#i-clock"/></svg>报名：${escapeHtml(regTime)}</span>` : ''}
        </div>
        <p class="desc">${escapeHtml(item.summary)}</p>
        <div class="actions">
          <a href="${detailHref}" class="btn btn-primary"><svg class="icon-sm icon"><use href="#i-doc"/></svg>查看详情</a>
          ${officialLink}
        </div>
      </div>
    </article>
  `;
}

// 接收全部数据，初始化列表
function setItems(items) {
  allItems = items;
  currentPage = 1;
  applyFilters();
}

// 渲染当前页的卡片
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

// 渲染分页控件
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

// 初始化筛选事件
function initFilters() {
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

  CampBriefPagination.bind(paginationNav, targetPage => {
    if (targetPage === currentPage) return;
    currentPage = targetPage;
    renderPage();
    const cardsTop = document.getElementById("cards");
    CampBriefPagination.scrollToFirstCard(cardsTop);
  });

  searchInput.addEventListener("input", event => {
    state.query = event.target.value.trim().toLowerCase();
    currentPage = 1;
    applyFilters();
  });
}

function applyFilters() {
  filteredItems = allItems.filter(item => {
    const categoryOk = state.category === "all" || item.category === state.category;
    const itemStatus = getStatus(item);
    const statusOk = state.status === "all" || itemStatus === state.status;
    const searchOk = !state.query || `${item.name} ${item.summary} ${item.search || ""}`.toLowerCase().includes(state.query);
    return categoryOk && statusOk && searchOk;
  }).sort(compareExams);
  if (resultCount) resultCount.textContent = `${filteredItems.length} 个考试通知`;
  renderPage();
}

// ===== 精选考试轮播 =====
// 规则：只收 lifecycle 有效的可报名或明确未来期次；按状态和含金量排序，上限 15 个。
const EXAM_PRESTIGE = {
  'cet-202612': 5, 'kaoyan-2026': 5, 'cpa-2026': 5, 'guokao-2026': 5,
  'ruankao-202611': 4, 'ntce-202610': 4, 'ielts': 4, 'toefl': 4,
  'catti-202611': 3, 'intermediate-accounting-2026': 3, 'baoyan-2026': 3,
  'ncre-202609': 2, 'pat-202609': 2, 'acca-202609': 2, 'acca-202612': 2,
  'psc': 1, 'shiye': 1
};
function pickCarouselItems(items) {
  // 候选：有效 open + scheduled pending
  let candidates = items.filter(item => CampBriefContent.isCarouselCandidate(item, "exam"));
  candidates.sort((a, b) => compareExams(a, b, CAROUSEL_STATUS_ORDER));
  return candidates.slice(0, 15);
}

function renderCarouselCard(item) {
  const prestige = EXAM_PRESTIGE[item.id] || 0;
  const tagClass = prestige >= 4 ? 'tag-featured' : 'tag-normal';
  const tagText = prestige >= 5 ? '强烈推荐' : prestige >= 4 ? '推荐' : '关注';
  const regEntry = (item.timeline || []).find(t => t.label && t.label.includes('报名'));
  const regText = regEntry ? regEntry.value : '';
  const href = `detail.html?id=${encodeURIComponent(item.id || '')}`;

  return `
    <a class="carousel-card" href="${href}" aria-label="查看详情">
      <span class="carousel-card-tag ${tagClass}">${tagText}</span>
      <div class="carousel-card-head">
      <h3 class="carousel-card-title">${escapeHtml(item.name)}</h3>
      </div>
      <div class="carousel-card-meta">
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${escapeHtml(item.schedule)}</span>
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-medal"/></svg>${escapeHtml(item.fee)}</span>
      </div>
      ${regText ? `<div class="carousel-card-meta"><span class="meta-item"><svg class="icon-sm icon"><use href="#i-clock"/></svg>报名：${escapeHtml(regText)}</span></div>` : ''}
      <p class="carousel-card-desc">${escapeHtml(item.summary)}</p>
    </a>
  `;
}

function initExamCarousel(items) {
  const container = document.querySelector('[data-carousel]');
  if (!container || typeof Carousel === 'undefined') return;
  const carouselItems = pickCarouselItems(items);
  if (carouselItems.length < 3) { container.hidden = true; return; }
  container.hidden = false;
  Carousel.init(container, {
    items: carouselItems,
    renderCard: renderCarouselCard,
    autoPlay: true,
    interval: 6000
  });
}

// 主初始化函数
async function init() {
  initDOM();
  initFilters();
  if (typeof FilterScroll !== "undefined") FilterScroll.initAll();

  const container = document.getElementById('cards');
  container.innerHTML = '<div class="loading-state" role="status" style="text-align:center;padding:40px;color:var(--text-secondary,#666);">正在加载考试数据...</div>';

  const { items, lastUpdated } = await loadExamsData();
  
  CampBriefContent.updateSortPill(lastUpdated);
  
  if (items.length === 0) {
    container.innerHTML = '';
    emptyState.hidden = false;
    if (resultCount) resultCount.textContent = '0 个考试通知';
    return;
  }

  setItems(items);
  initExamCarousel(items);
}

document.addEventListener('DOMContentLoaded', init);
