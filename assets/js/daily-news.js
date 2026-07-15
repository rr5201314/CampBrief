// 每日资讯模块 - 从 JSON 文件加载 + 前端分页
const state = { category: "all", date: "all", customDate: "", query: "" };
const PAGE_SIZE = 5;
let allItems = [];
let filteredItems = [];
let currentPage = 1;
let cards = [];
let paginationNav;
let resultCount, searchInput, emptyState;
let dateModal, calendarGrid, calendarYearValue, calendarMonthValue;
let calendarYearMenu, calendarMonthMenu, calendarYearTrigger, calendarMonthTrigger;
let calendarNextButton, customDateOption;
let calendarCursor = new Date();

const escapeHtml = value => CampBriefContent.escapeHtml(value);
const safeExternalUrl = value => CampBriefContent.safeHttpUrl(value);

// 初始化 DOM 元素
function initDOM() {
  resultCount = document.getElementById("resultCount");
  searchInput = document.getElementById("searchInput");
  emptyState = document.getElementById("emptyState");
  paginationNav = document.querySelector(".pagination");
  dateModal = document.getElementById("dateModal");
  calendarGrid = document.getElementById("calendarGrid");
  calendarYearValue = document.getElementById("calendarYearValue");
  calendarMonthValue = document.getElementById("calendarMonthValue");
  calendarYearMenu = document.getElementById("calendarYearMenu");
  calendarMonthMenu = document.getElementById("calendarMonthMenu");
  calendarYearTrigger = document.getElementById("calendarYearTrigger");
  calendarMonthTrigger = document.getElementById("calendarMonthTrigger");
  calendarNextButton = document.querySelector('[data-calendar-nav="next"]');
  customDateOption = document.querySelector('[data-filter-group="date"] [data-value="custom"]');
}

// 获取新闻数据。发布数据仅以 JSON 文件为准，避免旧内嵌数据与线上内容不一致。
async function loadNewsData() {
  try {
    const response = await fetch('../../data/daily-news.json', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      if (data.items && data.items.length > 0) return { items: data.items, lastUpdated: data.last_updated };
    }
  } catch (error) {
    // file:// 直接打开时无法加载 JSON；显示空状态而非旧数据。
  }
  return { items: [], lastUpdated: null };
}

// 获取条目的分类列表（兼容旧数据：categories 数组优先，回退到 category 字符串）
function getCategories(item) {
  if (Array.isArray(item.categories) && item.categories.length > 0) return item.categories;
  return item.category ? [item.category] : [];
}

// 所有发布资讯均有不可变 ID，详情页只依此定位，避免共享 URL 或标题微调导致串页。
function getNewsDetailHref(item) {
  return `detail.html?id=${encodeURIComponent(item.id || "")}`;
}

// 生成卡片 HTML
function createCardHTML(item) {
  const date = new Date(item.published);
  const { statusClass, statusText } = CampBriefContent.getTimeBadge(item.published);
  
  const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  
  const priority = item.priority || 1;
  // priority 4：头条（放轮播 + 重磅标签）；3：重磅；2：重要；1：无标签
  const priorityBadge = priority >= 4
    ? '<span class="badge badge-hot"><svg class="icon-sm icon"><use href="#i-trophy"/></svg>头条</span>'
    : priority >= 3
    ? '<span class="badge badge-hot"><svg class="icon-sm icon"><use href="#i-trophy"/></svg>重磅</span>'
    : priority >= 2
    ? '<span class="badge badge-important"><svg class="icon-sm icon"><use href="#i-status"/></svg>重要</span>'
    : '';
  const categoryLabels = { ai: 'AI 资讯', competition: '竞赛', exam: '考试', sports: '体育', fun: '每日速览' };
  const categoryIcons = { ai: 'i-bot', competition: 'i-trophy', exam: 'i-exam', sports: 'i-sports', fun: 'i-bulb' };
  const cats = getCategories(item);
  const categoryBadges = cats.map(c => {
    const label = categoryLabels[c] || c;
    const icon = categoryIcons[c] || 'i-bot';
    return `<span class="badge badge-prize"><svg class="icon-sm icon"><use href="#${icon}"/></svg>${escapeHtml(label)}</span>`;
  }).join('');
  const sourceUrl = safeExternalUrl(item.url);
  
  return `
    <article class="card" data-category="${escapeHtml(cats.join(' '))}" data-published="${escapeHtml(item.published || '')}" data-priority="${priority}" data-search="${escapeHtml(`${item.title || ''} ${item.summary || ''}`)}">
      <div class="card-main">
        <div class="card-head">
          <h2 class="card-title">${escapeHtml(item.title)}</h2>
          <span class="badge status-badge ${statusClass}"><svg class="icon-sm icon"><use href="#i-clock"/></svg>${statusText}</span>
        </div>
        <div class="meta-line">
          ${priorityBadge}
          ${categoryBadges}
          <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${formattedDate}</span>
          <span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${escapeHtml(item.source)}</span>
        </div>
        <p class="desc">${escapeHtml(item.summary)}</p>
        <div class="actions">
          <a href="${getNewsDetailHref(item)}" class="btn btn-primary"><svg class="icon-sm icon"><use href="#i-doc"/></svg>查看详情</a>
          ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener" class="btn btn-secondary">阅读原文 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>` : ''}
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
  cards = [...document.querySelectorAll(".card")];
  renderPagination();
}

// 渲染分页控件
function renderPagination() {
  if (!paginationNav) return;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  // 超出总页数时回到最后一页（筛选后页数变少的情况）
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
  return;

}

// 初始化筛选事件
function initFilters() {
  document.querySelectorAll("[data-filter-group]").forEach(group => {
    group.addEventListener("click", event => {
      const option = event.target.closest(".option");
      if (!option) return;
      const key = group.dataset.filterGroup;
      if (key === "date" && option.dataset.value === "custom") {
        openDateModal();
        return;
      }
      state[key] = option.dataset.value;
      group.querySelectorAll(".option").forEach(item => {
        const isActive = item === option;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });
      if (key === "date") {
        state.customDate = "";
        closeDateModal();
      }
      currentPage = 1;
      applyFilters();
    });
  });

  // 分页点击：事件委托
  CampBriefPagination.bind(paginationNav, targetPage => {
    if (targetPage === currentPage) return;
    currentPage = targetPage;
    renderPage();
    const cardsTop = document.getElementById("cards");
    CampBriefPagination.scrollToFirstCard(cardsTop);
  });
}

// 初始化日期选择器
function initDatePicker() {
  if (!dateModal) return;
  
  dateModal.addEventListener("click", event => {
    if (event.target.closest("[data-date-modal-close]")) {
      closeDateModal();
      return;
    }

    const yearMenuTrigger = event.target.closest("[data-calendar-year-menu-toggle]");
    if (yearMenuTrigger) {
      toggleCalendarYearMenu();
      return;
    }

    const yearOption = event.target.closest("[data-calendar-year]");
    if (yearOption) {
      calendarCursor = new Date(Number(yearOption.dataset.calendarYear), calendarCursor.getMonth(), 1);
      closeCalendarMenus();
      renderCalendar();
      return;
    }

    const monthMenuTrigger = event.target.closest("[data-calendar-month-menu-toggle]");
    if (monthMenuTrigger) {
      toggleCalendarMonthMenu();
      return;
    }

    const monthOption = event.target.closest("[data-calendar-month]");
    if (monthOption) {
      calendarCursor = new Date(calendarCursor.getFullYear(), Number(monthOption.dataset.calendarMonth) - 1, 1);
      closeCalendarMenus();
      renderCalendar();
      return;
    }

    const navigation = event.target.closest("[data-calendar-nav]");
    if (navigation) {
      const targetMonth = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + (navigation.dataset.calendarNav === "next" ? 1 : -1), 1);
      if (targetMonth.getFullYear() > getLatestCalendarYear()) return;
      calendarCursor = targetMonth;
      closeCalendarMenus();
      renderCalendar();
      return;
    }

    const day = event.target.closest("[data-calendar-date]");
    if (day) {
      state.date = "custom";
      state.customDate = day.dataset.calendarDate;
      setActiveDateOption("custom");
      currentPage = 1;
      applyFilters();
      closeDateModal();
    }
  });

  document.getElementById("clearDateButton").addEventListener("click", () => {
    state.customDate = "";
    state.date = "all";
    setActiveDateOption("all");
    currentPage = 1;
    applyFilters();
    closeDateModal();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !dateModal.hidden) closeDateModal();
  });

  searchInput.addEventListener("input", event => {
    state.query = event.target.value.trim().toLowerCase();
    currentPage = 1;
    applyFilters();
  });
}

function applyFilters() {
  filteredItems = allItems.filter(item => {
    // 技术类条目已迁移到技术板块，每日资讯不显示
    if (item.category === "tech") return false;
    const categoryOk = state.category === "all" || getCategories(item).includes(state.category);
    const dateOk = matchesDateFilter(item);
    const searchOk = !state.query || `${item.title} ${item.summary} ${item.detail || ""}`.toLowerCase().includes(state.query);
    return categoryOk && dateOk && searchOk;
  });
  // 时效标签优先，保证 24小时条目始终排在 3天条目前；同一时效区间内再按优先级和发布时间排序。
  const now = new Date();
  filteredItems.sort((a, b) => CampBriefContent.compareByTimeBadgeThenPriority(a, b, now));
  if (resultCount) resultCount.textContent = `${filteredItems.length} 条资讯`;
  renderPage();
}

function matchesDateFilter(item) {
  if (state.date === "all") return true;
  if (state.date === "custom") return !state.customDate || toLocalDate(item.published) === state.customDate;

  const publishedAt = new Date(item.published);
  const now = new Date();
  const rangeHours = { "24h": 24, "3d": 24 * 3, "7d": 24 * 7, "30d": 24 * 30 }[state.date];
  if (!rangeHours) return true;
  const rangeStart = new Date(now.getTime() - rangeHours * 60 * 60 * 1000);
  return publishedAt >= rangeStart && publishedAt <= now;
}

function toLocalDate(value) {
  return CampBriefContent.naturalDayKey(value);
}

function setActiveDateOption(value) {
  document.querySelectorAll('[data-filter-group="date"] .option').forEach(option => {
    const isActive = option.dataset.value === value;
    option.classList.toggle("active", isActive);
    option.setAttribute("aria-pressed", String(isActive));
  });
}

function openDateModal() {
  const selectedDate = state.customDate ? parseLocalDate(state.customDate) : new Date();
  calendarCursor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  dateModal.hidden = false;
  document.body.classList.add("is-date-modal-open");
  customDateOption.setAttribute("aria-expanded", "true");
  renderCalendar();
  document.getElementById("dateModalClose").focus();
}

function closeDateModal() {
  dateModal.hidden = true;
  document.body.classList.remove("is-date-modal-open");
  customDateOption.setAttribute("aria-expanded", "false");
  closeCalendarMenus();
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const today = toLocalDate(new Date());

  calendarYearValue.textContent = `${year}年`;
  calendarMonthValue.textContent = `${month + 1}月`;
  calendarNextButton.disabled = year === getLatestCalendarYear() && month === 11;
  renderCalendarYearMenu();
  renderCalendarMonthMenu();
  calendarGrid.replaceChildren();

  for (let index = 0; index < firstWeekday; index += 1) {
    const blank = document.createElement("span");
    blank.className = "calendar-blank";
    blank.setAttribute("aria-hidden", "true");
    calendarGrid.append(blank);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const button = document.createElement("button");
    button.className = "calendar-day";
    button.type = "button";
    button.dataset.calendarDate = value;
    button.textContent = String(day);
    button.setAttribute("aria-label", `${year}年${month + 1}月${day}日`);
    button.classList.toggle("is-today", value === today);
    button.classList.toggle("is-selected", value === state.customDate);
    calendarGrid.append(button);
  }
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toggleCalendarYearMenu() {
  const willOpen = calendarYearMenu.hidden;
  closeCalendarMonthMenu();
  calendarYearMenu.hidden = !willOpen;
  calendarYearTrigger.setAttribute("aria-expanded", String(willOpen));
}

function closeCalendarYearMenu() {
  calendarYearMenu.hidden = true;
  calendarYearTrigger.setAttribute("aria-expanded", "false");
}

function toggleCalendarMonthMenu() {
  const willOpen = calendarMonthMenu.hidden;
  closeCalendarYearMenu();
  calendarMonthMenu.hidden = !willOpen;
  calendarMonthTrigger.setAttribute("aria-expanded", String(willOpen));
}

function closeCalendarMonthMenu() {
  calendarMonthMenu.hidden = true;
  calendarMonthTrigger.setAttribute("aria-expanded", "false");
}

function closeCalendarMenus() {
  closeCalendarYearMenu();
  closeCalendarMonthMenu();
}

function renderCalendarYearMenu() {
  const latestYear = getLatestCalendarYear();
  calendarYearMenu.replaceChildren(...Array.from({ length: 5 }, (_, index) => {
    const year = latestYear - index;
    const option = document.createElement("button");
    const selected = year === calendarCursor.getFullYear();
    option.className = "calendar-year-option";
    option.type = "button";
    option.dataset.calendarYear = String(year);
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(selected));
    option.innerHTML = `<span>${year}年</span><svg class="icon-sm icon" aria-hidden="true"><use href="#i-check"/></svg>`;
    option.classList.toggle("is-selected", selected);
    return option;
  }));
}

function renderCalendarMonthMenu() {
  calendarMonthMenu.replaceChildren(...Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const option = document.createElement("button");
    const selected = month === calendarCursor.getMonth() + 1;
    option.className = "calendar-month-option";
    option.type = "button";
    option.dataset.calendarMonth = String(month);
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(selected));
    option.innerHTML = `<span>${month}月</span><svg class="icon-sm icon" aria-hidden="true"><use href="#i-check"/></svg>`;
    option.classList.toggle("is-selected", selected);
    return option;
  }));
}

function getLatestCalendarYear() {
  return new Date().getFullYear();
}

// ===== 头条资讯轮播 =====
// 规则：近3天 priority>=4 的消息放轮播；不足3个则补充 priority>=3 的；上限15个。
function pickNewsCarouselItems(items) {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  // 近3天
  const recent = items.filter(item => {
    const d = new Date(item.published);
    return d >= threeDaysAgo && d <= now;
  });
  // priority >= 4 优先
  let result = recent.filter(i => (i.priority || 1) >= 4);
  // 不足3个则补充 priority >= 3
  if (result.length < 3) {
    const p3 = recent.filter(i => (i.priority || 1) === 3 && !result.find(r => r.id === i.id));
    result = result.concat(p3);
  }
  // 按发布时间降序
  result.sort((a, b) => new Date(b.published) - new Date(a.published));
  return result.slice(0, 15);
}

function renderNewsCarouselCard(item) {
  const date = new Date(item.published);
  const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const priority = item.priority || 1;
  const tagClass = priority >= 4 ? 'tag-featured' : 'tag-normal';
  const tagText = priority >= 4 ? '头条' : '重磅';
  const categoryLabels = { ai: 'AI', tech: '技术', competition: '竞赛', exam: '考试', sports: '体育', fun: '每日速览' };
  const cats = getCategories(item);
  const catText = cats.map(c => categoryLabels[c] || c).join(' · ');

  return `
    <a class="carousel-card" href="${getNewsDetailHref(item)}">
      <span class="carousel-card-tag ${tagClass}">${tagText}</span>
      <div class="carousel-card-head">
        <h3 class="carousel-card-title">${escapeHtml(item.title)}</h3>
      </div>
      <div class="carousel-card-meta">
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${formattedDate}</span>
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${escapeHtml(item.source)}</span>
        ${catText ? `<span class="meta-item"><svg class="icon-sm icon"><use href="#i-list"/></svg>${escapeHtml(catText)}</span>` : ''}
      </div>
      <p class="carousel-card-desc">${escapeHtml(item.summary)}</p>
    </a>
  `;
}

function initNewsCarousel(items) {
  const container = document.querySelector('[data-carousel]');
  if (!container || typeof Carousel === 'undefined') return;
  const carouselItems = pickNewsCarouselItems(items);
  if (carouselItems.length < 3) { container.hidden = true; return; }
  container.hidden = false;
  Carousel.init(container, {
    items: carouselItems,
    renderCard: renderNewsCarouselCard,
    autoPlay: true,
    interval: 5000
  });
}

// 主初始化函数
async function init() {
  initDOM();
  initFilters();
  initDatePicker();
  if (typeof FilterScroll !== "undefined") FilterScroll.initAll();
  
  // 显示加载状态
  const container = document.getElementById('cards');
  container.innerHTML = '<div class="loading-state" style="text-align: center; padding: 40px; color: var(--text-secondary, #666);">正在加载资讯...</div>';
  
  // 加载数据
  container.firstElementChild?.setAttribute("role", "status");
  const { items, lastUpdated } = await loadNewsData();
  
  CampBriefContent.updateSortPill(lastUpdated);
  
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 40px; color: var(--text-secondary, #666);">暂无资讯数据</div>';
    if (resultCount) resultCount.textContent = '0 条资讯';
    return;
  }

  // 初始化列表（内部会触发 applyFilters + renderPage）
  setItems(items);
  initNewsCarousel(items);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
