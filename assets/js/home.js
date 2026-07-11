// 首页展板 - 数据渲染（含分页）
// 说明：竞赛看板使用当前示例数据；考试和每日资讯看板分别从 data/exams.json、
// data/daily-news.json 加载，避免首页与栏目页展示两套不一致的信息。
// 每日资讯在 file:// 直接打开时会回退 SAMPLE.news；考试信息必须以数据文件为准。
// 每页最多 PAGE_SIZE 条，底部按钮翻页。
// 每日资讯看板规则：仅显示 priority 为 4、3、2 的消息；按北京时间自然日优先，
// 同一自然日内按优先级 4 → 3 → 2 排列。

const PAGE_SIZE = 5;

const SAMPLE = {
  competitions: [
    {
      title: "2026 校园 AI 创新挑战赛",
      status: "open",
      statusLabel: "可参赛",
      date: "2026.04.17 - 09.13",
      prize: "¥100,000 奖金",
      desc: "面向真实校园场景构建 AI 工具，团队可提交原型、演示和实施笔记。"
    },
    {
      title: "网络安全攻防挑战赛",
      status: "pending",
      statusLabel: "未开始",
      date: "2026.08.01 - 10.20",
      prize: "¥50,000 奖金",
      desc: "涵盖 Web、逆向、密码学和实战防御技能的结构化安全挑战。"
    },
    {
      title: "创意应用设计大赛",
      status: "closed",
      statusLabel: "已截止",
      date: "2026.03.12 - 06.01",
      prize: "¥30,000 奖金",
      desc: "为学生生活与公共服务设计实用应用，报名已截止，详情仍可查看。"
    },
    {
      title: "简豹年度作品展",
      status: "done",
      statusLabel: "已完赛",
      date: "2026.01.10 - 04.30",
      prize: "¥20,000 奖金",
      desc: "汇集优秀校园产品与原型，可浏览入围作品和存档评审记录。"
    },
    {
      title: "全国大学生数学建模竞赛",
      status: "open",
      statusLabel: "可参赛",
      date: "2026.09.06 - 09.09",
      prize: "国家级荣誉",
      desc: "三天三夜挑战真实建模问题，涵盖工程、经济、社会等领域。"
    },
    {
      title: "ACM-ICPC 亚洲区域赛",
      status: "pending",
      statusLabel: "未开始",
      date: "2026.10.15 - 10.16",
      prize: "国际认证",
      desc: "5 小时解决 10-12 道算法题，团队三人协作编程竞赛。"
    },
    {
      title: "全国大学生电子设计竞赛",
      status: "open",
      statusLabel: "可参赛",
      date: "2026.08.05 - 08.08",
      prize: "国家级荣誉",
      desc: "四天三夜完成硬件设计与制作，涵盖模电、数电和嵌入式方向。"
    }
  ],
  news: [
    {
      day: "10", month: "07月",
      title: "教育部发布 2026 年下半年高校学科竞赛目录",
      desc: "新增 3 项 AI 相关赛事，涵盖大模型应用与智能体开发方向。",
      priority: 3,
      date: "2026-07-10"
    },
    {
      day: "09", month: "07月",
      title: "多所高校秋季学期开设大模型应用通识课",
      desc: "清华、浙大等校将生成式 AI 列为新生通识必修内容。",
      priority: 2,
      date: "2026-07-09"
    },
    {
      day: "08", month: "07月",
      title: "GitHub 学生包新增 AI 计算额度",
      desc: "认证学生每月可领取额外 GPU 时长用于学习与项目实践。",
      priority: 2,
      date: "2026-07-08"
    },
    {
      day: "07", month: "07月",
      title: "「智能科学与技术」被列为新增交叉学科",
      desc: "硕博点申报指南预计 8 月公布，相关培养方案征求意见中。",
      priority: 3,
      date: "2026-07-07"
    },
    {
      day: "06", month: "07月",
      title: "国家大学生创新创业训练计划 2026 年度申报启动",
      desc: "国家级、省级、校级三级立项同步开放，截止日期 9 月 30 日。",
      priority: 2,
      date: "2026-07-06"
    },
    {
      day: "05", month: "07月",
      title: "CSP 认证 8 月场次开放报名",
      desc: "计算机软件能力认证考试面向高校学生，成绩可替代部分校招笔试。",
      priority: 1,
      date: "2026-07-05"
    }
  ]
};

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
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

function getNewsDetailHref(basePath, item){
  const params = new URLSearchParams({
    url: item.url || "",
    title: item.title || "",
    published: item.published || item.date || ""
  });
  return `${basePath}?${params.toString()}`;
}

function metaItem(iconRef, text){
  return el("span", "meta-item",
    `<svg class="icon-sm icon"><use href="${iconRef}"/></svg>${escapeHtml(text)}`);
}

function emptyNode(){
  return el("div", "feed-empty", "暂无内容，敬请期待");
}

/* ---- 单条目渲染 ---- */
// 跳转目标：竞赛/考试看板跳到对应栏目列表页；资讯看板跳到 detail.html?url=xxx
function buildCompetitionItem(item){
  const article = el("article", "feed-item");
  article.dataset.href = "pages/competitions/index.html";
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
  // 资讯条目跳转到 detail.html?url=xxx；无 url 时回退到栏目列表页
  article.dataset.href = item.url
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
const NEWS_PRIORITY_ALLOWED = [4, 3, 2];

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
  return list
    .filter(item => NEWS_PRIORITY_ALLOWED.includes(item.priority))
    .sort((a, b) => {
      const dateDiff = getNewsDateKey(b.date).localeCompare(getNewsDateKey(a.date));
      if(dateDiff) return dateDiff;
      const priorityDiff = b.priority - a.priority;
      if(priorityDiff) return priorityDiff;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
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
    // file:// 协议下 fetch 会失败，继续走 SAMPLE 回退
  }
  // 回退：SAMPLE.news（兼容 file:// 直接打开 HTML）
  return SAMPLE.news.slice();
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

  renderPage("competitions", SAMPLE.competitions, buildCompetitionItem);
  setCount("competitions", SAMPLE.competitions.length);
  bindPager("competitions", SAMPLE.competitions, buildCompetitionItem);
  observeBoards();

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
