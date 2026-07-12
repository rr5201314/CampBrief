// 首页展板 - 数据渲染（含分页）
// 竞赛、考试和每日资讯分别读取各自栏目使用的真实数据文件。
// 每日资讯看板仅展示近 3 天、优先级大于 2 的条目。
// 每页最多 PAGE_SIZE 条，底部按钮翻页。
// 每日资讯看板按北京时间自然日分组，同一自然日内按优先级降序排列。

const PAGE_SIZE = 5;

// 首页看板不保留演示内容：数据不可用时显示空状态，避免展示过期信息。

const STATUS_CLASS = {
  open: "status-open",
  pending: "status-pending",
  closed: "status-closed",
  done: "status-done"
};

// 分页状态
const pageState = { competitions: 0, exams: 0, news: 0 };

function el(tag, cls, html){
  const node = document.createElement(tag);
  if(cls) node.className = cls;
  if(html != null) node.innerHTML = html;
  return node;
}

function escapeHtml(s){
  return CampBriefContent.escapeHtml(s);
}

function getNewsDetailHref(basePath, item){
  return `${basePath}?id=${encodeURIComponent(item.id || "")}`;
}

function metaItem(iconRef, text){
  return el("span", "meta-item",
    `<svg class="icon-sm icon"><use href="${iconRef}"/></svg>${escapeHtml(text)}`);
}

function emptyNode(){
  const node = el("div", "feed-empty", "暂无内容，敬请期待");
  node.setAttribute("role", "status");
  return node;
}

function setBoardLoading(key){
  const wrap = document.querySelector(`[data-feed="${key}"]`);
  if(!wrap) return;
  wrap.innerHTML = "";
  const node = el("div", "feed-empty", "正在加载…");
  node.setAttribute("role", "status");
  wrap.appendChild(node);
}

/* ---- 单条目渲染 ---- */
// 跳转目标：竞赛/考试看板跳到对应栏目列表页；资讯看板按不可变 ID 进入详情页。
function buildCompetitionItem(item){
  const article = el("article", "feed-item");
  article.dataset.href = item.id
    ? "pages/competitions/detail.html?id=" + encodeURIComponent(item.id)
    : "pages/competitions/index.html";
  const body = el("div", "feed-item-body");
  const top = el("div", "feed-item-top");
  top.appendChild(el("h3", "feed-item-title", escapeHtml(item.title)));
  top.appendChild(el("span", "badge status-badge " + (STATUS_CLASS[item.status] || ""),
    `<svg class="icon-sm icon"><use href="#i-clock"/></svg>${escapeHtml(item.statusLabel)}`));
  body.appendChild(top);
  const meta = el("div", "meta-line");
  meta.appendChild(metaItem("#i-calendar", item.date));
  if(item.prize){
    meta.appendChild(el("span", "badge badge-prize",
      `<svg class="icon-sm icon"><use href="#i-medal"/></svg>${escapeHtml(item.prize)}`));
  }
  body.appendChild(meta);
  body.appendChild(el("p", "feed-item-desc", escapeHtml(item.desc)));
  article.appendChild(body);
  return article;
}

function buildExamItem(item){
  const article = el("article", "feed-item");
  article.dataset.href = item.id
    ? "pages/exams/detail.html?id=" + encodeURIComponent(item.id)
    : "pages/exams/index.html";
  const body = el("div", "feed-item-body");
  const top = el("div", "feed-item-top");
  top.appendChild(el("h3", "feed-item-title", escapeHtml(item.title)));
  top.appendChild(el("span", "badge status-badge " + (STATUS_CLASS[item.status] || ""),
    `<svg class="icon-sm icon"><use href="#i-clock"/></svg>${escapeHtml(item.statusLabel)}`));
  body.appendChild(top);
  const meta = el("div", "meta-line");
  meta.appendChild(metaItem("#i-calendar", item.date));
  if(item.org){
    meta.appendChild(metaItem("#i-org", item.org));
  }
  body.appendChild(meta);
  body.appendChild(el("p", "feed-item-desc", escapeHtml(item.desc)));
  article.appendChild(body);
  return article;
}

function buildNewsItem(item){
  const article = el("article", "feed-item");
  // 资讯条目按不可变 ID 进入详情；缺少 ID 时回退到栏目列表页。
  article.dataset.href = item.id
    ? getNewsDetailHref("pages/daily-news/detail.html", item)
    : "pages/daily-news/index.html";
  const head = el("div", "news-head");
  const date = el("div", "news-date",
    `<span class="news-month">${escapeHtml(item.month)}</span><span class="news-day">${escapeHtml(item.day)}日</span>`);
  head.appendChild(date);
  // 重要程度标签：priority 4=头条，3=重磅，2=重要
  const priority = item.priority || 1;
  if(priority >= 4){
    head.appendChild(el("span", "badge badge-hot",
      `<svg class="icon-sm icon"><use href="#i-trophy"/></svg>头条`));
  } else if(priority >= 3){
    head.appendChild(el("span", "badge badge-hot",
      `<svg class="icon-sm icon"><use href="#i-trophy"/></svg>重磅`));
  } else if(priority >= 2){
    head.appendChild(el("span", "badge badge-important",
      `<svg class="icon-sm icon"><use href="#i-status"/></svg>重要`));
  }
  article.appendChild(head);
  const body = el("div", "feed-item-body");
  body.appendChild(el("h3", "feed-item-title", escapeHtml(item.title)));
  body.appendChild(el("p", "feed-item-desc", escapeHtml(item.desc)));
  article.appendChild(body);
  return article;
}

/* ---- 分页渲染 ---- */
function renderPage(key, list, builder){
  const wrap = document.querySelector(`[data-feed="${key}"]`);
  const pager = document.querySelector(`[data-pager="${key}"]`);
  const info = document.querySelector(`[data-page="${key}"]`);
  const prevBtn = pager ? pager.querySelector('[data-action="prev"]') : null;
  const nextBtn = pager ? pager.querySelector('[data-action="next"]') : null;

  wrap.innerHTML = "";

  if(!list.length){
    wrap.appendChild(emptyNode());
    if(info) info.textContent = "0 / 0";
    if(prevBtn) prevBtn.disabled = true;
    if(nextBtn) nextBtn.disabled = true;
    return;
  }

  const totalPages = Math.ceil(list.length / PAGE_SIZE);
  if(pageState[key] >= totalPages) pageState[key] = totalPages - 1;
  if(pageState[key] < 0) pageState[key] = 0;

  const start = pageState[key] * PAGE_SIZE;
  const slice = list.slice(start, start + PAGE_SIZE);
  slice.forEach(item => wrap.appendChild(builder(item)));

  if(info) info.textContent = `${pageState[key] + 1} / ${totalPages}`;
  if(prevBtn) prevBtn.disabled = pageState[key] === 0;
  if(nextBtn) nextBtn.disabled = pageState[key] >= totalPages - 1;
}

/* ---- 三看板 feed-item 同步逐条入场 ---- */
// scene: "scroll" 首屏滚动入场（较快）；"pager" 翻页后入场（更快）
function triggerFeedItemsIn(scene){
  const allItems = document.querySelectorAll(".board-list .feed-item");
  if(!allItems.length) return;
  // 首屏滚动：间隔 180ms；翻页：间隔 90ms
  const STEP = scene === "pager" ? 90 : 180;
  const DURATION = 700;
  allItems.forEach(node => {
    const itemsInBoard = node.closest(".board-list").querySelectorAll(".feed-item");
    const idx = Array.from(itemsInBoard).indexOf(node);
    node.style.transitionDelay = `${idx * STEP}ms`;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    allItems.forEach(node => node.classList.add("is-in"));
  }));
  const cleanupDelay = (PAGE_SIZE - 1) * STEP + DURATION + 100;
  setTimeout(() => {
    allItems.forEach(node => { node.style.transitionDelay = ""; });
  }, cleanupDelay);
}

function setCount(key, n){
  const node = document.querySelector(`[data-count="${key}"]`);
  if(node) node.textContent = `${n} 条`;
}

/* ---- 绑定分页按钮 ---- */
function bindPager(key, list, builder){
  const pager = document.querySelector(`[data-pager="${key}"]`);
  if(!pager) return;
  pager.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if(!btn || btn.disabled) return;
    const totalPages = Math.ceil(list.length / PAGE_SIZE);
    if(btn.dataset.action === "prev" && pageState[key] > 0){
      pageState[key]--;
    } else if(btn.dataset.action === "next" && pageState[key] < totalPages - 1){
      pageState[key]++;
    }
    renderPage(key, list, builder);
    // 翻页后触发该看板新内容逐条入场（更快节奏）
    triggerFeedItemsIn("pager");
  });
}

/* ---- 展板滚动入场 ---- */
function observeBoards(){
  // 容器先现，看板后现
  const main = document.querySelector(".home-main");
  const boards = document.querySelectorAll(".board");
  if(!("IntersectionObserver" in window)){
    if(main) main.classList.add("is-visible");
    boards.forEach(b => b.classList.add("is-visible"));
    return;
  }
  // 容器：更早触发（threshold 5%）
  if(main){
    const mainIo = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          entry.target.classList.add("is-visible");
          mainIo.unobserve(entry.target);
        }
      });
    }, { threshold:0.05, rootMargin:"0px 0px -40px 0px" });
    mainIo.observe(main);
  }
  // 看板：稍晚触发（threshold 15%）
  if(boards.length){
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold:0.15, rootMargin:"0px 0px -40px 0px" });
    boards.forEach(b => io.observe(b));
  }
}

/* ---- 每日资讯看板规则：自然日优先、优先级次之 ---- */
// 显示 priority 为 4、3、2 的消息（4=头条，3=重磅，2=重要），不显示 priority 为 1 的消息。
// 先按北京时间自然日倒序；同一自然日内按 4 → 3 → 2，再按发布时间倒序。
const HOME_NEWS_MIN_PRIORITY = 3;
const COMPETITION_STATUS_ORDER = { open: 0, pending: 1, ongoing: 2, done: 3 };
const COMPETITION_TIER_ORDER = { official: 0, enterprise: 1, hobby: 2 };
const COMPETITION_STATUS_LABEL = {
  pending: "未开始",
  open: "可报名",
  ongoing: "比赛中",
  done: "已完赛"
};

const EXAM_STATUS_LABEL = {
  open: "可报名",
  pending: "未开始",
  closed: "报名截止",
  done: "已结束"
};

function officialSourceName(item){
  const url = item.official_url || item.official_portal || item.official_site || "";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if(host.endsWith("neea.edu.cn")) return "教育部教育考试院";
    if(host.endsWith("cpta.com.cn")) return "中国人事考试网";
    if(host.endsWith("ruankao.org.cn")) return "中国计算机技术职业资格网";
    if(host.endsWith("patest.cn")) return "PAT 官网";
    if(host.endsWith("mof.gov.cn")) return "财政部会计财务评价中心";
    if(host.endsWith("cicpa.org.cn")) return "中国注册会计师协会";
    if(host.endsWith("accaglobal.com.cn")) return "ACCA 中国";
    if(host.endsWith("chsi.com.cn")) return "中国研究生招生信息网";
    if(host.endsWith("scs.gov.cn")) return "国家公务员局";
    if(host.endsWith("cltt.org")) return "国家普通话水平测试网";
    if(host.endsWith("fltonline.cn")) return "高校外语专业教学测试办公室";
  } catch(error) {
    // URL 缺失或格式异常时保留通用官方来源标识。
  }
  return "官方渠道";
}

async function loadExamBoardData(){
  try {
    const response = await fetch("data/exams.json", { cache: "no-store" });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if(!Array.isArray(data.items)) throw new Error("考试数据格式无效");
    // 首页只承担“现在能行动”的提醒：仅展示当前可报名项目。
    // 待报名、报名截止和已结束项目仍可在完整考试栏目中查询。
    return data.items
      .filter(item => item.status === "open")
      .map(item => ({
        id: item.id || "",
        title: item.name || "未命名考试",
        status: item.status || "pending",
        statusLabel: EXAM_STATUS_LABEL[item.status] || "待确认",
        date: item.schedule || "时间待官方公布",
        org: officialSourceName(item),
        desc: item.summary || "请以官方公告为准。"
      }));
  } catch(error) {
    console.warn("无法加载考试数据：", error);
    return [];
  }
}

function compareHomeCompetitions(a, b) {
  const statusDiff = (COMPETITION_STATUS_ORDER[a.status] ?? 99) - (COMPETITION_STATUS_ORDER[b.status] ?? 99);
  if (statusDiff) return statusDiff;

  const tierDiff = (COMPETITION_TIER_ORDER[a.tier] ?? 99) - (COMPETITION_TIER_ORDER[b.tier] ?? 99);
  if (tierDiff) return tierDiff;

  const prestigeDiff = (b.prestige || 0) - (a.prestige || 0);
  if (prestigeDiff) return prestigeDiff;

  return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
}

async function loadCompetitionBoardData(){
  try {
    const response = await fetch("data/competitions.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error("竞赛数据格式无效");

    return data.items
      .filter(item => item.status !== "done")
      .sort(compareHomeCompetitions)
      .map(item => ({
        id: item.id || "",
        title: item.name || "未命名竞赛",
        status: item.status || "pending",
        statusLabel: (data.status_map?.[item.status]?.label) || COMPETITION_STATUS_LABEL[item.status] || "待确认",
        date: item.signup || item.schedule || "时间待官方公布",
        prize: (data.tiers || []).find(tier => tier.key === item.tier)?.label || "",
        desc: item.summary || "请以官方公告为准。"
      }));
  } catch (error) {
    console.warn("无法加载竞赛数据", error);
    return [];
  }
}

function renderCompetitionBoard(list){
  renderPage("competitions", list, buildCompetitionItem);
  setCount("competitions", list.length);
  bindPager("competitions", list, buildCompetitionItem);
  triggerFeedItemsIn("pager");
}

function renderExamBoard(list){
  renderPage("exams", list, buildExamItem);
  setCount("exams", list.length);
  bindPager("exams", list, buildExamItem);
  triggerFeedItemsIn("pager");
}

function getNewsDateKey(value){
  const date = new Date(value);
  if(!Number.isNaN(date.getTime())){
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const part = type => parts.find(item => item.type === type)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }
  const match = String(value || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : "";
}

function formatNewsDate(value){
  const match = getNewsDateKey(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(!match) return { month: "日期待补充", day: "—" };
  return {
    month: `${match[2].padStart(2, "0")}月`,
    day: match[3].padStart(2, "0")
  };
}

function applyNewsRules(list){
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  return list
    .filter(item => {
      const published = new Date(item.date || item.published || "");
      return (item.priority || 1) >= HOME_NEWS_MIN_PRIORITY
        && !Number.isNaN(published.getTime())
        && published >= threeDaysAgo
        && published <= now;
    })
    .sort(CampBriefContent.compareByNaturalDayThenPriority);
}

// 从 daily-news.json 加载资讯数据并映射为看板所需格式
async function loadNewsBoardData(){
  // 优先 fetch JSON（GitHub Pages / 本地 HTTP 服务器均可）
  try {
    const response = await fetch('data/daily-news.json', { cache: 'no-store' });
    if(response.ok){
      const data = await response.json();
      if(data.items && data.items.length > 0){
        return data.items.map(it => {
          const date = it.published || it.date || "";
          // 资讯数据使用 published（ISO 8601）；兼容旧数据的 date 字段。
          const displayDate = formatNewsDate(date);
          return {
            id: it.id || "",
            title: it.title,
            desc: it.summary,
            priority: it.priority || 1,
            date,
            day: displayDate.day,
            month: displayDate.month,
            url: it.url || ""
          };
        });
      }
    }
  } catch(error) {
    console.warn("无法加载每日资讯数据", error);
  }
  return [];
}

function renderNewsBoard(list){
  const news = applyNewsRules(list);
  renderPage("news", news, buildNewsItem);
  setCount("news", news.length);
  bindPager("news", news, buildNewsItem);
  // 资讯看板数据异步到位后单独触发入场
  triggerFeedItemsIn("pager");
}

/* ---- 初始化 ---- */
function initHome(){
  // 标记 JS 就绪，启用 Hero 入场动画（避免 CSS 未解析时元素闪现）
  document.body.classList.add("js-ready");

  observeBoards();

  setBoardLoading("competitions");
  setBoardLoading("exams");
  setBoardLoading("news");

  // 竞赛看板与竞赛栏目共用同一份真实数据，条目直达对应详情页。
  loadCompetitionBoardData().then(items => renderCompetitionBoard(items));

  // 考试看板与考试栏目共用同一份真实数据文件。
  loadExamBoardData().then(items => renderExamBoard(items));

  // 资讯看板：异步加载 + 优先级规则
  loadNewsBoardData().then(items => renderNewsBoard(items));

  // 看板条目点击跳转：委托到 .home-main，点击带 data-href 的 feed-item 即跳转
  const boards = document.getElementById("boards");
  if(boards){
    boards.addEventListener("click", e => {
      const item = e.target.closest(".feed-item[data-href]");
      if(!item) return;
      const href = item.dataset.href;
      if(href) window.location.href = href;
    });
  }

  // 首屏渲染后触发三看板同步逐条入场（滚动场景节奏）
  triggerFeedItemsIn("scroll");

  // 快速开始按钮 - 平滑滚动到看板区
  const startBtn = document.getElementById("startBtn");
  if(startBtn){
    startBtn.addEventListener("click", () => {
      const boards = document.getElementById("boards");
      if(boards) boards.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    // Hero 按钮涟漪
    startBtn.addEventListener("click", (e) => {
      const rect = startBtn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.style.width = ripple.style.height = size + "px";
      ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
      ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
      startBtn.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    });
  }
}

// 等待 DOM 就绪 + 双 rAF 确保 CSS 初始状态（opacity:0）已应用，再渲染与触发入场
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", () => {
    requestAnimationFrame(() => requestAnimationFrame(initHome));
  });
} else {
  requestAnimationFrame(() => requestAnimationFrame(initHome));
}
