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

// 获取新闻数据（优先 fetch JSON 文件，回退内嵌数据）
// JSON 文件由 Hermes 自动化定时更新，是最新数据来源；
// 内嵌 NEWS_DATA 仅用于 file:// 协议预览（fetch 不可用时回退）。
async function loadNewsData() {
  // 优先从 JSON 文件加载（GitHub Pages / 本地 HTTP 服务器均可）
  try {
    const response = await fetch('../../data/daily-news.json', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      if (data.items && data.items.length > 0) return data.items;
    }
  } catch (error) {
    // file:// 协议下 fetch 会失败，继续走内嵌回退
  }

  // 回退：使用内嵌数据（兼容 file:// 直接打开 HTML）
  if (typeof NEWS_DATA !== 'undefined' && NEWS_DATA.items && NEWS_DATA.items.length > 0) {
    return NEWS_DATA.items;
  }

  return [];
}

// 获取条目的分类列表（兼容旧数据：categories 数组优先，回退到 category 字符串）
function getCategories(item) {
  if (Array.isArray(item.categories) && item.categories.length > 0) return item.categories;
  return item.category ? [item.category] : [];
}

// URL 不能作为资讯唯一标识：日报拆分出的多条资讯会共享同一个原文地址。
// 将标题和发布时间一并传给详情页，确保回查到的是用户点击的那一条。
function getNewsDetailHref(item) {
  const params = new URLSearchParams({
    url: item.url || "",
    title: item.title || "",
    published: item.published || item.date || ""
  });
  return `detail.html?${params.toString()}`;
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
  // priority 4：头条（放轮播 + 重磅标签）；3：重磅；2：重要；1：无标签
  const priorityBadge = priority >= 4
    ? '<span class="badge badge-hot"><svg class="icon-sm icon"><use href="#i-trophy"/></svg>头条</span>'
    : priority >= 3
    ? '<span class="badge badge-hot"><svg class="icon-sm icon"><use href="#i-trophy"/></svg>重磅</span>'
    : priority >= 2
    ? '<span class="badge badge-important"><svg class="icon-sm icon"><use href="#i-status"/></svg>重要</span>'
    : '';
  const categoryLabels = { ai: 'AI 资讯', competition: '竞赛', exam: '考试', sports: '体育', fun: '趣闻' };
  const categoryIcons = { ai: 'i-bot', competition: 'i-trophy', exam: 'i-exam', sports: 'i-sports', fun: 'i-bulb' };
  const cats = getCategories(item);
  const categoryBadges = cats.map(c => {
    const label = categoryLabels[c] || c;
    const icon = categoryIcons[c] || 'i-bot';
    return `<span class="badge badge-prize"><svg class="icon-sm icon"><use href="#${icon}"/></svg>${label}</span>`;
  }).join('');
  
  return `
    <article class="card" data-category="${cats.join(' ')}" data-published="${item.published}" data-priority="${priority}" data-search="${item.title} ${item.summary}">
      <div class="card-main">
        <div class="card-head">
          <h2 class="card-title">${item.title}</h2>
          <span class="badge status-badge ${statusClass}"><svg class="icon-sm icon"><use href="#i-clock"/></svg>${statusText}</span>
        </div>
        <div class="meta-line">
          ${priorityBadge}
          ${categoryBadges}
          <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${formattedDate}</span>
          <span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${item.source}</span>
        </div>
        <p class="desc">${item.summary}</p>
        <div class="actions">
          <a href="${getNewsDetailHref(item)}" class="btn btn-primary"><svg class="icon-sm icon"><use href="#i-doc"/></svg>查看详情</a>
          <a href="${item.url}" target="_blank" rel="noopener" class="btn btn-secondary">阅读原文 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>
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
  paginationNav.hidden = false;

  const buttons = [];
  buttons.push(`<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}" aria-label="上一页"><svg class="icon-sm icon"><use href="#i-chevron-left"/></svg></button>`);

  // 页码按钮：最多显示 7 个，过多时中间用省略号
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

// 计算要显示的页码（带省略号）
function computePageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
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
  if (paginationNav) {
    paginationNav.addEventListener("click", event => {
      const btn = event.target.closest(".page-btn");
      if (!btn || btn.disabled) return;
      const target = Number(btn.dataset.page);
      if (!target || target === currentPage) return;
      currentPage = target;
      renderPage();
      // 滚回列表顶部
      const cardsTop = document.getElementById("cards");
      if (cardsTop) cardsTop.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
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
  // 按优先级降序，同优先级按发布时间降序
  filteredItems.sort((a, b) => {
    const pa = a.priority || 1, pb = b.priority || 1;
    if (pa !== pb) return pb - pa;
    return new Date(b.published) - new Date(a.published);
  });
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
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
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
// 规则：近7天 priority>=4 的消息放轮播；不足3个则补充 priority>=3 的；上限10个，超过取最近10条
function pickNewsCarouselItems(items) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // 近7天
  const recent = items.filter(item => {
    const d = new Date(item.published);
    return d >= sevenDaysAgo && d <= now;
  });
  // priority >= 4 优先
  let result = recent.filter(i => (i.priority || 1) >= 4);
  // 不足3个则补充 priority >= 3
  if (result.length < 3) {
    const p3 = recent.filter(i => (i.priority || 1) === 3 && !result.find(r => r.url === i.url));
    result = result.concat(p3);
  }
  // 按发布时间降序
  result.sort((a, b) => new Date(b.published) - new Date(a.published));
  // 上限10
  return result.slice(0, 10);
}

function renderNewsCarouselCard(item) {
  const date = new Date(item.published);
  const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const priority = item.priority || 1;
  const tagClass = priority >= 4 ? 'tag-featured' : 'tag-normal';
  const tagText = priority >= 4 ? '头条' : '重磅';
  const categoryLabels = { ai: 'AI', tech: '技术', competition: '竞赛', exam: '考试', sports: '体育', fun: '趣闻' };
  const cats = getCategories(item);
  const catText = cats.map(c => categoryLabels[c] || c).join(' · ');

  return `
    <a class="carousel-card" href="${getNewsDetailHref(item)}">
      <span class="carousel-card-tag ${tagClass}">${tagText}</span>
      <div class="carousel-card-head">
        <h3 class="carousel-card-title">${item.title}</h3>
      </div>
      <div class="carousel-card-meta">
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${formattedDate}</span>
        <span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${item.source}</span>
        ${catText ? `<span class="meta-item"><svg class="icon-sm icon"><use href="#i-list"/></svg>${catText}</span>` : ''}
      </div>
      <p class="carousel-card-desc">${item.summary}</p>
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
  
  // 显示加载状态
  const container = document.getElementById('cards');
  container.innerHTML = '<div class="loading-state" style="text-align: center; padding: 40px; color: var(--text-secondary, #666);">正在加载资讯...</div>';
  
  // 加载数据
  const items = await loadNewsData();
  
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
