// 通用筛选条横向拖拽滚动组件
// 用法：在 .options 外层包一个 <div class="filter-scroll" data-filter-scroll>，
// 页面脚本调用 FilterScroll.initAll() 即可启用鼠标拖拽、触摸滑动和滚轮横向滚动。
const FilterScroll = (function () {
  "use strict";

  const DRAG_THRESHOLD = 5;
  const MAX_SAMPLES = 5;
  const FRICTION = 0.005; // px/ms²
  const VELOCITY_CUTOFF = 0.02; // px/ms

  function init(container) {
    const options = container.querySelector(".options");
    if (!options) return null;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let isDown = false;
    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    let samples = [];
    let lastX = 0;
    let lastTime = 0;
    let rafId = null;

    function stopInertia() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function startInertia(initialVelocity) {
      if (reduceMotion || Math.abs(initialVelocity) < 0.05) return;
      stopInertia();
      let v = initialVelocity;
      let lastTs = performance.now();
      function step(ts) {
        const dt = ts - lastTs;
        lastTs = ts;
        v -= Math.sign(v) * FRICTION * dt;
        if (Math.abs(v) < VELOCITY_CUTOFF) { rafId = null; return; }
        container.scrollLeft += v * dt;
        rafId = requestAnimationFrame(step);
      }
      rafId = requestAnimationFrame(step);
    }

    // 底部滑块（提示可拖拽，并支持拖拽定位）
    const slider = document.createElement("div");
    slider.className = "filter-slider";
    slider.innerHTML = '<div class="filter-slider-track"><div class="filter-slider-thumb"></div></div>';
    container.after(slider);
    const sliderTrack = slider.querySelector(".filter-slider-track");
    const sliderThumb = slider.querySelector(".filter-slider-thumb");

    function updateSlider() {
      const maxScroll = Math.max(0, options.scrollWidth - container.clientWidth);
      const isScrollable = maxScroll > 1;
      slider.hidden = !isScrollable;
      if (!isScrollable) return;
      const viewWidth = container.clientWidth;
      const trackWidth = options.scrollWidth;
      const ratio = viewWidth / trackWidth;
      const thumbWidth = Math.max(40, ratio * sliderTrack.clientWidth);
      sliderThumb.style.width = `${thumbWidth}px`;
      const progress = maxScroll > 0 ? container.scrollLeft / maxScroll : 0;
      const maxThumbX = sliderTrack.clientWidth - thumbWidth;
      sliderThumb.style.transform = `translateX(${progress * maxThumbX}px)`;
    }

    function updateFade() {
      const maxScroll = Math.max(0, options.scrollWidth - container.clientWidth);
      container.classList.toggle("is-scrollable", maxScroll > 1);
      container.classList.toggle("is-scroll-start", container.scrollLeft <= 1);
      container.classList.toggle("is-scroll-end", container.scrollLeft >= maxScroll - 1);
      updateSlider();
    }

    container.addEventListener("scroll", updateFade, { passive: true });

    container.addEventListener("wheel", (e) => {
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(delta) < 1) return;
      // 只有存在横向滚动空间时才阻止默认滚轮行为
      const maxScroll = options.scrollWidth - container.clientWidth;
      if (maxScroll <= 1) return;
      e.preventDefault();
      stopInertia();
      container.scrollLeft += delta * 0.6;
    }, { passive: false });

    function onMouseDown(e) {
      if (e.button !== 0) return;
      isDown = true;
      dragging = false;
      startX = e.clientX;
      startScroll = container.scrollLeft;
      samples = [];
      lastX = e.clientX;
      lastTime = performance.now();
      container.classList.add("is-dragging");
      stopInertia();
    }

    function onMouseMove(e) {
      if (!isDown) return;
      const diff = startX - e.clientX;
      if (!dragging && Math.abs(diff) > DRAG_THRESHOLD) {
        dragging = true;
      }
      if (dragging) {
        e.preventDefault();
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 0) {
          samples.push((lastX - e.clientX) / dt);
          if (samples.length > MAX_SAMPLES) samples.shift();
        }
        lastX = e.clientX;
        lastTime = now;
        container.scrollLeft = startScroll + diff;
      }
    }

    function onMouseUp() {
      if (!isDown) return;
      isDown = false;
      container.classList.remove("is-dragging");
      if (dragging) {
        const avgV = samples.length
          ? samples.reduce((a, b) => a + b, 0) / samples.length
          : 0;
        startInertia(avgV);
      }
      // 延迟清除拖拽标记，确保 click 事件能识别到刚发生的拖拽并阻止
      setTimeout(() => { dragging = false; }, 50);
    }

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    // 触摸拖拽：手机端完全交给浏览器原生横向滚动，避免脚本接管导致的卡顿/惯性失效
    const isCoarse = window.matchMedia("(max-width: 600px)").matches || window.matchMedia("(pointer: coarse)").matches;
    if (!isCoarse) {
      let touchStartX = 0;
      let touchStartScroll = 0;
      let touchActive = false;
      let touchMoved = false;
      let touchSamples = [];
      let touchLastX = 0;
      let touchLastTime = 0;

      container.addEventListener("touchstart", (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartScroll = container.scrollLeft;
        touchActive = true;
        touchMoved = false;
        touchSamples = [];
        touchLastX = touchStartX;
        touchLastTime = performance.now();
        stopInertia();
      }, { passive: true });

      container.addEventListener("touchmove", (e) => {
        if (!touchActive) return;
        const clientX = e.touches[0].clientX;
        const diff = touchStartX - clientX;
        if (Math.abs(diff) > DRAG_THRESHOLD) touchMoved = true;
        const now = performance.now();
        const dt = now - touchLastTime;
        if (dt > 0) {
          touchSamples.push((touchLastX - clientX) / dt);
          if (touchSamples.length > MAX_SAMPLES) touchSamples.shift();
        }
        touchLastX = clientX;
        touchLastTime = now;
        container.scrollLeft = touchStartScroll + diff;
      }, { passive: true });

      container.addEventListener("touchend", () => {
        touchActive = false;
        if (touchMoved) {
          const avgV = touchSamples.length
            ? touchSamples.reduce((a, b) => a + b, 0) / touchSamples.length
            : 0;
          startInertia(avgV);
        }
      });
    }

    // 拖拽时阻止按钮点击触发筛选
    options.addEventListener("click", (e) => {
      if (dragging || (isDown && Math.abs(startX - (e.clientX || 0)) > DRAG_THRESHOLD)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // 滑块拖拽定位
    let sliderDragging = false;
    function setScrollFromSlider(clientX) {
      const maxScroll = Math.max(0, options.scrollWidth - container.clientWidth);
      const rect = sliderTrack.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      container.scrollLeft = ratio * maxScroll;
    }
    function onSliderDown(e) {
      e.preventDefault();
      sliderDragging = true;
      stopInertia();
      const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
      setScrollFromSlider(clientX);
      document.addEventListener("mousemove", onSliderMove);
      document.addEventListener("mouseup", onSliderUp);
    }
    function onSliderMove(e) {
      if (!sliderDragging) return;
      setScrollFromSlider(e.clientX);
    }
    function onSliderUp() {
      sliderDragging = false;
      document.removeEventListener("mousemove", onSliderMove);
      document.removeEventListener("mouseup", onSliderUp);
    }
    sliderTrack.addEventListener("mousedown", onSliderDown);

    // 窗口变化时重新计算渐变状态
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateFade, 200);
    });

    updateFade();
    return { update: updateFade, destroy: stopInertia };
  }

  function initAll(scope) {
    (scope || document).querySelectorAll("[data-filter-scroll]").forEach(init);
  }

  return { init, initAll };
})();
