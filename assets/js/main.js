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
