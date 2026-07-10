// 每日资讯模块 - 筛选与搜索
const state = { category: "all", date: "all", customDate: "", query: "" };
const cards = [...document.querySelectorAll(".card")];
const resultCount = document.getElementById("resultCount");
const searchInput = document.getElementById("searchInput");
const emptyState = document.getElementById("emptyState");
const dateModal = document.getElementById("dateModal");
const calendarGrid = document.getElementById("calendarGrid");
const calendarYearValue = document.getElementById("calendarYearValue");
const calendarMonthValue = document.getElementById("calendarMonthValue");
const calendarYearMenu = document.getElementById("calendarYearMenu");
const calendarMonthMenu = document.getElementById("calendarMonthMenu");
const calendarYearTrigger = document.getElementById("calendarYearTrigger");
const calendarMonthTrigger = document.getElementById("calendarMonthTrigger");
const calendarNextButton = document.querySelector('[data-calendar-nav="next"]');
const customDateOption = document.querySelector('[data-filter-group="date"] [data-value="custom"]');
let calendarCursor = new Date();

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

function applyFilters(){
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

function matchesDateFilter(card){
  if (state.date === "all") return true;
  if (state.date === "custom") return !state.customDate || toLocalDate(card.dataset.published) === state.customDate;

  const publishedAt = new Date(card.dataset.published);
  const now = new Date();
  const rangeHours = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 }[state.date];
  if (!rangeHours) return true;
  const rangeStart = new Date(now.getTime() - rangeHours * 60 * 60 * 1000);
  return publishedAt >= rangeStart && publishedAt <= now;
}

function toLocalDate(value){
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function setActiveDateOption(value){
  document.querySelectorAll('[data-filter-group="date"] .option').forEach(option => {
    const isActive = option.dataset.value === value;
    option.classList.toggle("active", isActive);
    option.setAttribute("aria-pressed", String(isActive));
  });
}

function openDateModal(){
  const selectedDate = state.customDate ? parseLocalDate(state.customDate) : new Date();
  calendarCursor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  dateModal.hidden = false;
  document.body.classList.add("is-date-modal-open");
  customDateOption.setAttribute("aria-expanded", "true");
  renderCalendar();
  document.getElementById("dateModalClose").focus();
}

function closeDateModal(){
  dateModal.hidden = true;
  document.body.classList.remove("is-date-modal-open");
  customDateOption.setAttribute("aria-expanded", "false");
  closeCalendarMenus();
}

function renderCalendar(){
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

function parseLocalDate(value){
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toggleCalendarYearMenu(){
  const willOpen = calendarYearMenu.hidden;
  closeCalendarMonthMenu();
  calendarYearMenu.hidden = !willOpen;
  calendarYearTrigger.setAttribute("aria-expanded", String(willOpen));
}

function closeCalendarYearMenu(){
  calendarYearMenu.hidden = true;
  calendarYearTrigger.setAttribute("aria-expanded", "false");
}

function toggleCalendarMonthMenu(){
  const willOpen = calendarMonthMenu.hidden;
  closeCalendarYearMenu();
  calendarMonthMenu.hidden = !willOpen;
  calendarMonthTrigger.setAttribute("aria-expanded", String(willOpen));
}

function closeCalendarMonthMenu(){
  calendarMonthMenu.hidden = true;
  calendarMonthTrigger.setAttribute("aria-expanded", "false");
}

function closeCalendarMenus(){
  closeCalendarYearMenu();
  closeCalendarMonthMenu();
}

function renderCalendarYearMenu(){
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

function renderCalendarMonthMenu(){
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

function getLatestCalendarYear(){
  return new Date().getFullYear();
}
