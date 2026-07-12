// 通用轮播组件 - 滚轮缓慢滑动 + 鼠标拖拽 + 滑动条
// 用法：Carousel.init(container, { items, renderCard, autoPlay, speed })
// - items: 卡片数据数组
// - renderCard: (item, index) => HTML 字符串
// - autoPlay: 是否自动缓慢平移（默认 true）
// - speed: 自动平移速度 px/秒（默认 12）
const Carousel = (function () {
  "use strict";

  const MIN_ITEMS = 3;
  const MAX_ITEMS = 15;

  function init(container, options) {
    const items = (options.items || []).slice(0, MAX_ITEMS);
    if (items.length < MIN_ITEMS) {
      container.hidden = true;
      return null;
    }

    const viewport = container.querySelector(".carousel-viewport");
    const track = container.querySelector("[data-carousel-track]");
    const prevBtn = container.querySelector("[data-carousel-prev]");
    const nextBtn = container.querySelector("[data-carousel-next]");
    if (!track || !viewport) return null;

    // 渲染卡片
    track.innerHTML = items.map((item, i) => options.renderCard(item, i)).join("");

    // 动态创建滑动条
    const slider = document.createElement("div");
    slider.className = "carousel-slider";
    slider.innerHTML = '<div class="carousel-slider-track"><div class="carousel-slider-thumb"></div></div>';
    container.appendChild(slider);
    const sliderTrack = slider.querySelector(".carousel-slider-track");
    const sliderThumb = slider.querySelector(".carousel-slider-thumb");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const autoSpeed = options.speed || 12; // px/秒

    let offset = 0;
    let maxOffset = 0;
    let rafId = null;
    let autoPlaying = false;
    let paused = false;
    let lastTs = 0;
    // 拖拽状态标记（拖拽中不恢复自动播放）
    let dragging = false;

    function computeMaxOffset() {
      const trackWidth = track.scrollWidth;
      const viewWidth = viewport.offsetWidth;
      maxOffset = Math.max(0, trackWidth - viewWidth);
      if (offset > maxOffset) offset = maxOffset;
      if (offset < 0) offset = 0;
      applyTransform();
      updateNavState();
      updateSlider();
    }

    function applyTransform() {
      track.style.transform = `translateX(${-offset}px)`;
    }

    function updateNavState() {
      if (prevBtn) prevBtn.disabled = offset <= 0;
      if (nextBtn) nextBtn.disabled = offset >= maxOffset;
    }

    // 更新滑动条 thumb 位置和宽度
    function updateSlider() {
      if (!sliderThumb || maxOffset <= 0) {
        if (slider) slider.style.display = "none";
        return;
      }
      slider.style.display = "";
      const viewWidth = viewport.offsetWidth;
      const trackWidth = track.scrollWidth;
      // thumb 占比 = 可视宽度 / 总宽度
      const ratio = viewWidth / trackWidth;
      const thumbWidth = Math.max(40, ratio * sliderTrack.offsetWidth);
      sliderThumb.style.width = `${thumbWidth}px`;
      // thumb 位置
      const progress = offset / maxOffset;
      const maxThumbX = sliderTrack.offsetWidth - thumbWidth;
      sliderThumb.style.transform = `translateX(${progress * maxThumbX}px)`;
    }

    // 平滑滚动到目标 offset
    function smoothScrollTo(target, duration) {
      const start = offset;
      const delta = target - start;
      if (Math.abs(delta) < 1) return;
      const startTime = performance.now();
      stopAutoPlay();
      function step(ts) {
        const elapsed = ts - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        offset = start + delta * eased;
        applyTransform();
        updateNavState();
        updateSlider();
        if (progress < 1) {
          rafId = requestAnimationFrame(step);
        } else if (!dragging) {
          startAutoPlay();
        }
      }
      rafId = requestAnimationFrame(step);
    }

    // 自动缓慢平移
    function autoStep(ts) {
      if (!autoPlaying || paused || dragging) return;
      if (!lastTs) lastTs = ts;
      const dt = ts - lastTs;
      lastTs = ts;
      offset += (autoSpeed * dt) / 1000;
      if (offset >= maxOffset) offset = 0;
      applyTransform();
      updateNavState();
      updateSlider();
      rafId = requestAnimationFrame(autoStep);
    }

    function startAutoPlay() {
      if (!options.autoPlay || reduceMotion || maxOffset <= 0 || dragging) return;
      stopAutoPlay();
      autoPlaying = true;
      lastTs = 0;
      rafId = requestAnimationFrame(autoStep);
    }

    function stopAutoPlay() {
      autoPlaying = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function clampOffset() {
      if (offset < 0) offset = 0;
      if (offset > maxOffset) offset = maxOffset;
    }

    // 按钮翻一屏
    function scrollBy(delta) {
      let target = offset + delta;
      if (target < 0) target = 0;
      if (target > maxOffset) target = maxOffset;
      smoothScrollTo(target, 500);
    }

    if (prevBtn) prevBtn.addEventListener("click", () => scrollBy(-viewport.offsetWidth * 0.8));
    if (nextBtn) nextBtn.addEventListener("click", () => scrollBy(viewport.offsetWidth * 0.8));

    // 鼠标悬停暂停
    container.addEventListener("mouseenter", () => { paused = true; });
    container.addEventListener("mouseleave", () => { paused = false; });

    // 滚轮驱动
    let wheelTimer = null;
    viewport.addEventListener("wheel", (e) => {
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(delta) < 1) return;
      e.preventDefault();
      stopInertia();
      stopAutoPlay();
      const step = delta * 0.6;
      offset += step;
      clampOffset();
      applyTransform();
      updateNavState();
      updateSlider();
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { if (!dragging) startAutoPlay(); }, 1500);
    }, { passive: false });

    // ===== 鼠标拖拽卡片区域（含惯性） =====
    // 支持在链接卡片上摁住拖拽：移动距离<5px 视为点击，放行默认行为；否则拦截并拖拽
    // 松手时根据最近移动速度做惯性衰减动画
    let mouseStartX = 0;
    let mouseStartOffset = 0;
    let mouseDownOnLink = false;
    let suppressClick = false;
    const DRAG_THRESHOLD = 5;

    // 速度追踪：记录最近若干帧的位移与时间，用于计算松手时的初速度
    let velocity = 0; // px/ms，正方向为向右滚动（即鼠标向左拖）
    let lastMoveX = 0;
    let lastMoveTime = 0;
    const VELOCITY_SAMPLES = [];
    const MAX_SAMPLES = 5;

    // 惯性动画状态
    let inertiaRaf = null;

    function stopInertia() {
      if (inertiaRaf) { cancelAnimationFrame(inertiaRaf); inertiaRaf = null; }
    }

    function startInertia(initialVelocity) {
      stopInertia();
      // initialVelocity: px/ms
      let v = initialVelocity;
      if (Math.abs(v) < 0.05) return; // 速度太小不启动惯性
      const FRICTION = 0.005; // 摩擦系数（px/ms²），值越大停得越快
      let lastTs = performance.now();
      function step(ts) {
        const dt = ts - lastTs;
        lastTs = ts;
        // 速度衰减
        v -= Math.sign(v) * FRICTION * dt;
        // 速度过小或反向，停止
        if (Math.abs(v) < 0.02) {
          inertiaRaf = null;
          startAutoPlay();
          return;
        }
        offset += v * dt;
        // 边界回弹：撞到边界时停止并回弹
        if (offset < 0) {
          offset = 0;
          inertiaRaf = null;
          startAutoPlay();
          return;
        }
        if (offset > maxOffset) {
          offset = maxOffset;
          inertiaRaf = null;
          startAutoPlay();
          return;
        }
        applyTransform();
        updateNavState();
        updateSlider();
        inertiaRaf = requestAnimationFrame(step);
      }
      inertiaRaf = requestAnimationFrame(step);
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      stopInertia();
      mouseStartX = e.clientX;
      mouseStartOffset = offset;
      mouseDownOnLink = !!e.target.closest("a, button");
      dragging = false;
      velocity = 0;
      VELOCITY_SAMPLES.length = 0;
      lastMoveX = e.clientX;
      lastMoveTime = performance.now();
      viewport.classList.add("is-dragging");
      stopAutoPlay();
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }

    function onMouseMove(e) {
      const now = performance.now();
      const clientX = e.clientX;
      const diff = mouseStartX - clientX;
      if (!dragging) {
        if (Math.abs(diff) < DRAG_THRESHOLD) return;
        dragging = true;
        suppressClick = true;
      }
      // 记录速度样本
      const dt = now - lastMoveTime;
      if (dt > 0) {
        const dx = lastMoveX - clientX; // 鼠标向左拖为正（向右滚动）
        const v = dx / dt;
        VELOCITY_SAMPLES.push(v);
        if (VELOCITY_SAMPLES.length > MAX_SAMPLES) VELOCITY_SAMPLES.shift();
      }
      lastMoveX = clientX;
      lastMoveTime = now;
      offset = mouseStartOffset + diff;
      clampOffset();
      applyTransform();
      updateNavState();
      updateSlider();
    }

    function onMouseUp(e) {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      viewport.classList.remove("is-dragging");
      const wasDragging = dragging;
      dragging = false;
      // 计算平均速度作为惯性初速度
      let avgV = 0;
      if (VELOCITY_SAMPLES.length) {
        avgV = VELOCITY_SAMPLES.reduce((a, b) => a + b, 0) / VELOCITY_SAMPLES.length;
      }
      if (wasDragging) {
        setTimeout(() => { suppressClick = false; }, 50);
        // 启动惯性
        if (Math.abs(avgV) > 0.05) {
          startInertia(avgV);
        } else {
          startAutoPlay();
        }
      } else {
        suppressClick = false;
        startAutoPlay();
      }
    }

    // 捕获阶段拦截 click：如果刚发生过拖拽，阻止链接跳转
    track.addEventListener("click", (e) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    track.addEventListener("mousedown", onMouseDown);
    track.addEventListener("dragstart", (e) => e.preventDefault());

    // ===== 触摸拖拽（含惯性） =====
    let touchStartX = 0;
    let touchStartOffset = 0;
    let touchActive = false;
    let touchLastX = 0;
    let touchLastTime = 0;
    let touchVelocity = 0;
    let touchSamples = [];
    let touchMoved = false;

    track.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      touchLastX = touchStartX;
      touchLastTime = performance.now();
      touchStartOffset = offset;
      touchActive = true;
      dragging = true;
      touchVelocity = 0;
      touchSamples.length = 0;
      touchMoved = false;
      stopInertia();
      stopAutoPlay();
    }, { passive: true });
    track.addEventListener("touchmove", (e) => {
      if (!touchActive) return;
      const now = performance.now();
      const clientX = e.touches[0].clientX;
      const dt = now - touchLastTime;
      if (dt > 0) {
        const dx = touchLastX - clientX;
        touchSamples.push(dx / dt);
        if (touchSamples.length > MAX_SAMPLES) touchSamples.shift();
      }
      touchLastX = clientX;
      touchLastTime = now;
      const diff = touchStartX - clientX;
      if (Math.abs(diff) >= DRAG_THRESHOLD) touchMoved = true;
      offset = touchStartOffset + diff;
      clampOffset();
      applyTransform();
      updateNavState();
      updateSlider();
    }, { passive: true });
    track.addEventListener("touchend", () => {
      touchActive = false;
      dragging = false;
      if (touchMoved) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 50);
      }
      let avgV = 0;
      if (touchSamples.length) {
        avgV = touchSamples.reduce((a, b) => a + b, 0) / touchSamples.length;
      }
      if (Math.abs(avgV) > 0.05) {
        startInertia(avgV);
      } else {
        startAutoPlay();
      }
    });

    // ===== 滑动条拖拽定位 =====
    let sliderDragging = false;

    function setOffsetFromSlider(clientX) {
      const rect = sliderTrack.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      offset = ratio * maxOffset;
      clampOffset();
      applyTransform();
      updateNavState();
      updateSlider();
    }

    function onSliderDown(e) {
      e.preventDefault();
      sliderDragging = true;
      dragging = true;
      stopAutoPlay();
      const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
      setOffsetFromSlider(clientX);
      document.addEventListener("mousemove", onSliderMove);
      document.addEventListener("mouseup", onSliderUp);
    }

    function onSliderMove(e) {
      if (!sliderDragging) return;
      setOffsetFromSlider(e.clientX);
    }

    function onSliderUp() {
      sliderDragging = false;
      dragging = false;
      document.removeEventListener("mousemove", onSliderMove);
      document.removeEventListener("mouseup", onSliderUp);
      startAutoPlay();
    }

    sliderTrack.addEventListener("mousedown", onSliderDown);

    // 窗口大小变化
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(computeMaxOffset, 200);
    });

    // 初始化
    requestAnimationFrame(() => {
      computeMaxOffset();
      startAutoPlay();
    });

    return { update: computeMaxOffset, destroy: stopAutoPlay };
  }

  return { init, MIN_ITEMS, MAX_ITEMS };
})();
