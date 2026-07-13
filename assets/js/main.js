// 主题切换
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  const savedTheme = localStorage.getItem("campbrief-demo-theme");
  const initialTheme = savedTheme === "x-dark" ? "x-dark" : "x-light";
  document.body.dataset.theme = initialTheme;
  syncThemeToggle();

  themeToggle.addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "x-light" ? "x-dark" : "x-light";
    document.body.dataset.theme = nextTheme;
    localStorage.setItem("campbrief-demo-theme", nextTheme);
    syncThemeToggle();
  });
}

function syncThemeToggle(){
  const isLight = document.body.dataset.theme === "x-light";
  themeToggle.querySelector("span").textContent = isLight ? "浅色模式" : "深色模式";
}

// 列表页共享分页：统一页码窗口、跳页表单和键盘可达性。
window.CampBriefPagination = (() => {
  function getPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
    if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
    return [1, "…", current - 1, current, current + 1, "…", total];
  }

  function render({ currentPage, totalPages }) {
    const pageControls = getPageNumbers(currentPage, totalPages).map(page => {
      if (page === "…") return '<span class="page-ellipsis" aria-hidden="true">…</span>';
      const isCurrent = page === currentPage;
      return `<button class="page-btn ${isCurrent ? "active" : ""}" data-page="${page}" type="button" aria-label="第 ${page} 页" ${isCurrent ? 'aria-current="page"' : ""}>${page}</button>`;
    }).join("");

    return `
      <div class="pagination-controls" role="group" aria-label="页码选择">
        <button class="page-btn page-btn--nav" ${currentPage === 1 ? "disabled" : ""} data-page="${currentPage - 1}" type="button" aria-label="上一页"><svg class="icon-sm icon"><use href="#i-chevron-left"/></svg></button>
        ${pageControls}
        <button class="page-btn page-btn--nav" ${currentPage === totalPages ? "disabled" : ""} data-page="${currentPage + 1}" type="button" aria-label="下一页"><svg class="icon-sm icon"><use href="#i-chevron-right"/></svg></button>
      </div>
      <form class="pagination-jump" data-pagination-jump aria-label="跳转到指定页">
        <label>跳至 <input class="page-jump-input" name="page" type="number" inputmode="numeric" min="1" max="${totalPages}" value="${currentPage}" aria-label="页码"> 页</label>
        <button class="page-jump-submit" type="submit">前往</button>
      </form>
    `;
  }

  function bind(container, onPageChange) {
    if (!container || container.dataset.paginationBound === "true") return;
    container.dataset.paginationBound = "true";

    const changePage = page => {
      const totalPages = Number(container.dataset.totalPages);
      const target = Math.min(totalPages, Math.max(1, Number(page)));
      if (Number.isInteger(target)) onPageChange(target);
    };

    container.addEventListener("click", event => {
      const button = event.target.closest(".page-btn[data-page]");
      if (!button || button.disabled) return;
      changePage(button.dataset.page);
    });

    container.addEventListener("submit", event => {
      const form = event.target.closest("[data-pagination-jump]");
      if (!form) return;
      event.preventDefault();
      changePage(new FormData(form).get("page"));
    });
  }

  function scrollToFirstCard(container) {
    const target = container?.querySelector(".card") || container;
    if (!target) return;

    const topbar = document.querySelector(".topbar");
    const isStickyTopbar = topbar && getComputedStyle(topbar).position === "sticky";
    const topbarOffset = isStickyTopbar ? topbar.getBoundingClientRect().height + 20 : 24;
    const targetTop = target.getBoundingClientRect().top + window.scrollY - topbarOffset;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: reduceMotion ? "auto" : "smooth"
    });
  }

  return { render, bind, scrollToFirstCard };
})();

// 顶部导航栏滚动隐藏 / 上滑显示
const topbar = document.querySelector(".topbar");
if (topbar) {
  let lastScrollY = window.scrollY;
  let ticking = false;
  const threshold = 80;

  function updateTopbar() {
    const currentScrollY = window.scrollY;
    if (currentScrollY <= threshold) {
      topbar.classList.remove("is-hidden");
      topbar.classList.toggle("is-visible", currentScrollY > 0);
    } else if (currentScrollY > lastScrollY) {
      topbar.classList.add("is-hidden");
      topbar.classList.remove("is-visible");
    } else {
      topbar.classList.remove("is-hidden");
      topbar.classList.add("is-visible");
    }
    lastScrollY = currentScrollY;
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(updateTopbar);
      ticking = true;
    }
  }, { passive: true });
}
