// 每日资讯模块 - 从内嵌数据加载（兼容 GitHub Pages）
const state = { category: "all", date: "all", customDate: "", query: "" };
let cards = [];
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

// 获取新闻数据（从内嵌变量或 fetch）
async function loadNewsData() {
  // 优先使用内嵌数据（兼容 GitHub Pages 和直接打开 HTML）
  if (typeof NEWS_DATA !== 'undefined' && NEWS_DATA.items) {
    return NEWS_DATA.items;
  }
  
  // 备选：尝试从 JSON 文件加载（需要 HTTP 服务器）
  try {
    const response = await fetch('../../data/daily-news.json');
    if (!response.ok) throw new Error('加载失败');
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.warn('无法从 JSON 文件加载，使用内嵌数据');
    return [];
  }
}

// 生成卡片 HTML
function createCardHTML(item) {
  const date = new Date(item.published);
  const now = new Date();
  const diffHours = (now - date) / (1000 * 60 * 60);
  
  let statusClass = 'status-closed';
  let statusText = '本月';
  
  if (diffHours < 24) {
    statusClass = 'status-open';
    statusText = '今天';
  } else if (diffHours < 168) {
    statusClass = 'status-pending';
    statusText = '本周';
  }
  
  const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  
  return `
    <article class="card" data-category="${item.category}" data-published="${item.published}" data-search="${item.title} ${item.summary}">
      <div class="thumb" aria-label="资讯封面占位图">
        <div class="thumb-inner">
          <span class="thumb-icon"><svg class="icon"><use href="#i-image"/></svg></span>
          <span>封面占位图</span>
          <span class="thumb-lines"><span></span><span></span></span>
        </div>
      </div>
      <div class="card-main">
        <div class="card-head">
          <h2 class="card-title">${item.title}</h2>
          <span class="badge status-badge ${statusClass}"><svg class="icon-sm icon"><use href="#i-clock"/></svg>${statusText}</span>
        </div>
        <div class="meta-line">
          <span class="badge badge-prize"><svg class="icon-sm icon"><use href="#i-bot"/></svg>AI</span>
          <span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${formattedDate}</span>
          <span class="meta-item"><svg class="icon-sm icon"><use href="#i-info"/></svg>${item.source}</span>
        </div>
        <p class="desc">${item.summary}</p>
        <div class="actions">
          <a href="${item.url}" target="_blank" class="btn btn-primary">阅读全文 <svg class="icon-sm icon"><use href="#i-arrow"/></svg></a>
          <button class="btn btn-secondary"><svg class="icon-sm icon"><use href="#i-doc"/></svg>查看详情</button>
          <button class="btn btn-secondary"><svg class="icon-sm icon"><use href="#i-grid"/></svg>相关资讯</button>
        </div>
      </div>
    </article>
  `;
}

// 渲染所有卡片
function renderCards(items) {
  const container = document.getElementById('cards');
  container.innerHTML = items.map(item => createCardHTML(item)).join('');
  cards = [...document.querySelectorAll(".card")];
  
  // 更新计数
  if (resultCount) {
    resultCount.textContent = `${items.length} 条资讯`;
  }
  
  applyFilters();
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
      applyFilters();
    });
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
      applyFilters();
      closeDateModal();
    }
  });

  document.getElementById("clearDateButton").addEventListener("click", () => {
    state.customDate = "";
    state.date = "all";
    setActiveDateOption("all");
    applyFilters();
    closeDateModal();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !dateModal.hidden) closeDateModal();
  });

  searchInput.addEventListener("input", event => {
    state.query = event.target.value.trim().toLowerCase();
    applyFilters();
  });
}

function applyFilters() {
  let visible = 0;
  cards.forEach(card => {
    const categoryOk = state.category === "all" || card.dataset.category === state.category;
    const dateOk = matchesDateFilter(card);
    const searchOk = !state.query || card.dataset.search.toLowerCase().includes(state.query);
    const show = categoryOk && dateOk && searchOk;
    card.hidden = !show;
    if (show) visible += 1;
  });
  resultCount.textContent = `${visible} 条资讯`;
  emptyState.hidden = visible !== 0;
}

function matchesDateFilter(card) {
  if (state.date === "all") return true;
  if (state.date === "custom") return !state.customDate || toLocalDate(card.dataset.published) === state.customDate;

  const publishedAt = new Date(card.dataset.published);
  const now = new Date();
  const rangeHours = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 }[state.date];
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
    return;
  }
  
  // 渲染卡片
  renderCards(items);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
