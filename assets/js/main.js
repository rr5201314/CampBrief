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
