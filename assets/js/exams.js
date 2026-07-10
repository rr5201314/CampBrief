// 考试模块 - 筛选与搜索
const state = { category: "all", status: "all", query: "" };
const cards = [...document.querySelectorAll(".card")];
const resultCount = document.getElementById("resultCount");
const searchInput = document.getElementById("searchInput");

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

function applyFilters(){
  let visible = 0;
  cards.forEach(card => {
    const categoryOk = state.category === "all" || card.dataset.category === state.category;
    const statusOk = state.status === "all" || card.dataset.status === state.status;
    const searchOk = !state.query || card.dataset.search.toLowerCase().includes(state.query);
    const show = categoryOk && statusOk && searchOk;
    card.hidden = !show;
    if (show) visible += 1;
  });
  resultCount.textContent = `${visible} 个考试通知`;
}
