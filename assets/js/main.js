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

// 设备平台检测：给 body 加 data-platform 标识，供 CSS 针对性适配
(function detectPlatform() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  // iOS: iPhone / iPad / iPod，以及 Mac 上的触屏（iPadOS 桌面模式）
  const isIOS = /iPhone|iPad|iPod/.test(ua) ||
    (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) {
    document.body.dataset.platform = "ios";
    return;
  }
  if (/Android/.test(ua)) {
    document.body.dataset.platform = "android";
    return;
  }
  document.body.dataset.platform = "desktop";
})();

// 手机端导航栏滚动提示（右侧渐变）
(function initNavScrollHint() {
  const nav = document.querySelector(".topbar .nav");
  if (!nav) return;

  function updateHint() {
    const hasVirtualOffset = nav.dataset.navVirtualMax !== undefined;
    const maxScroll = hasVirtualOffset
      ? Number(nav.dataset.navVirtualMax)
      : nav.scrollWidth - nav.clientWidth;
    const currentScroll = hasVirtualOffset
      ? Number(nav.dataset.navVirtualOffset)
      : nav.scrollLeft;
    nav.classList.toggle("is-scrollable", maxScroll > 2);
    nav.classList.toggle("is-scroll-end", currentScroll >= maxScroll - 2);
  }

  nav.addEventListener("scroll", updateHint, { passive: true });
  nav.addEventListener("navvirtualscroll", updateHint);
  window.addEventListener("resize", updateHint, { passive: true });
  // 延迟一帧等布局稳定
  requestAnimationFrame(updateHint);
})();

// 手机端导航横滑：原生滚动在部分浏览器触底时会产生橡皮筋回弹。
// 以 transform 移动菜单轨道，边界只有数值限位，不会触发浏览器横向回弹。
(function initBoundedMobileNavDrag() {
  const nav = document.querySelector(".topbar .nav");
  if (!nav) return;

  const track = document.createElement("div");
  track.className = "nav-scroll-track";
  Array.from(nav.childNodes).forEach(node => track.appendChild(node));
  nav.appendChild(track);

  const mobileQuery = window.matchMedia("(max-width: 860px)");
  const DRAG_THRESHOLD = 6;
  const CLICK_SUPPRESS_MS = 320;
  let drag = null;
  let suppressClickUntil = 0;
  let offset = 0;

  function maxOffset() {
    return Math.max(0, track.scrollWidth - nav.clientWidth);
  }

  function clampOffset(value) {
    return Math.min(maxOffset(), Math.max(0, value));
  }

  function applyOffset(value) {
    offset = clampOffset(value);
    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    nav.dataset.navVirtualOffset = String(offset);
    nav.dataset.navVirtualMax = String(maxOffset());
    nav.dispatchEvent(new Event("navvirtualscroll"));
  }

  function getTouch(touches, identifier) {
    return Array.from(touches).find(touch => touch.identifier === identifier);
  }

  function clearDrag() {
    if (!drag) return;
    const completedDrag = drag.axis === "x" && drag.moved;
    drag = null;

    if (completedDrag) {
      suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;
    }
  }

  nav.addEventListener("touchstart", event => {
    if (!mobileQuery.matches || maxOffset() <= 0) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    drag = {
      touchId: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      startOffset: offset,
      axis: null,
      moved: false
    };
  }, { passive: true });

  // 监听 window 能让手指滑出导航边界后仍持续执行限位。
  window.addEventListener("touchmove", event => {
    if (!drag) return;
    const touch = getTouch(event.touches, drag.touchId);
    if (!touch) return;

    const deltaX = touch.clientX - drag.startX;
    const deltaY = touch.clientY - drag.startY;
    if (!drag.axis) {
      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= DRAG_THRESHOLD) drag.axis = "y";
        return;
      }

      // 在确认横向意图的第一帧就取消默认滚动，避免浏览器先产生一小段橡皮筋位移。
      if (event.cancelable) event.preventDefault();
      if (Math.abs(deltaX) < DRAG_THRESHOLD) return;
      drag.axis = "x";
    }
    if (drag.axis !== "x") return;

    if (event.cancelable) event.preventDefault();
    applyOffset(drag.startOffset - deltaX);
    drag.moved = true;
  }, { passive: false });

  window.addEventListener("touchend", event => {
    if (drag && getTouch(event.changedTouches, drag.touchId)) clearDrag();
  });
  window.addEventListener("touchcancel", event => {
    if (drag && getTouch(event.changedTouches, drag.touchId)) clearDrag();
  });

  function syncViewport() {
    if (mobileQuery.matches) {
      applyOffset(offset);
      return;
    }
    offset = 0;
    track.style.transform = "";
    delete nav.dataset.navVirtualOffset;
    delete nav.dataset.navVirtualMax;
    nav.dispatchEvent(new Event("navvirtualscroll"));
  }

  window.addEventListener("resize", syncViewport, { passive: true });
  if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", syncViewport);
  else mobileQuery.addListener(syncViewport);
  requestAnimationFrame(syncViewport);

  // 拖动结束后不触发起始菜单项的点击；轻触不受影响。
  nav.addEventListener("click", event => {
    if (performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();

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
