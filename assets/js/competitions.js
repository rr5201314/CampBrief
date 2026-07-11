// 竞赛模块 - 筛选与搜索 + 精选轮播
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
  resultCount.textContent = `${visible} 个进行中的赛事`;
}

// ===== 精选竞赛轮播 =====
// 规则：从 DOM 卡片提取数据，筛选 status=open/pending，按含金量排序，上限10
function initCompetitionCarousel() {
  const container = document.querySelector('[data-carousel]');
  if (!container || typeof Carousel === 'undefined') return;

  // 从 DOM 卡片提取数据
  const items = cards.map((card, idx) => {
    const titleEl = card.querySelector('.card-title');
    const prizeEl = card.querySelector('.badge-prize');
    const metaItems = card.querySelectorAll('.meta-item');
    const descEl = card.querySelector('.desc');
    return {
      id: idx,
      title: titleEl ? titleEl.textContent.trim() : '',
      status: card.dataset.status || '',
      category: card.dataset.category || '',
      prize: prizeEl ? prizeEl.textContent.trim() : '',
      date: metaItems.length > 0 ? metaItems[0].textContent.trim() : '',
      desc: descEl ? descEl.textContent.trim() : '',
      el: card
    };
  });

  // 筛选 open + pending
  let candidates = items.filter(i => i.status === 'open' || i.status === 'pending');
  // open 优先
  candidates.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return 0;
  });
  // 上限10
  const carouselItems = candidates.slice(0, 10);
  if (carouselItems.length < 3) { container.hidden = true; return; }
  container.hidden = false;

  const STATUS_LABEL = { open: '可报名', pending: '即将开始', closed: '已截止', done: '已完赛' };

  Carousel.init(container, {
    items: carouselItems,
    renderCard: (item) => {
      const tagClass = item.status === 'open' ? 'tag-featured' : 'tag-normal';
      const tagText = item.status === 'open' ? '可报名' : '即将开始';
      return `
        <div class="carousel-card" data-carousel-item-id="${item.id}">
          <span class="carousel-card-tag ${tagClass}">${tagText}</span>
          <div class="carousel-card-head">
            <h3 class="carousel-card-title">${item.title}</h3>
          </div>
          <div class="carousel-card-meta">
            ${item.prize ? `<span class="meta-item"><svg class="icon-sm icon"><use href="#i-medal"/></svg>${item.prize}</span>` : ''}
            ${item.date ? `<span class="meta-item"><svg class="icon-sm icon"><use href="#i-calendar"/></svg>${item.date}</span>` : ''}
          </div>
          <p class="carousel-card-desc">${item.desc}</p>
        </div>
      `;
    },
    autoPlay: true,
    interval: 6000
  });
}

// 初始化轮播
initCompetitionCarousel();
