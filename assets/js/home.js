// 首页展板 - 示例数据与渲染（含分页）
// 说明：当前为占位示例数据，后续接入真实数据源时替换 SAMPLE 即可。
// 渲染逻辑兼容 file:// 直接打开（不依赖 fetch）。
// 每页最多 PAGE_SIZE 条，底部按钮翻页。

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
      title: "CampBrief 年度作品展",
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
  exams: [
    {
      title: "2026 年下半年中小学教师资格考试",
      status: "closed",
      statusLabel: "报名已截止",
      date: "报名 07.05 - 07.08",
      org: "教育部考试中心",
      desc: "笔试报名已结束，10 月底举行笔试，已报名考生请留意准考证打印通知。"
    },
    {
      title: "2026 年下半年全国大学英语四六级考试",
      status: "open",
      statusLabel: "报名中",
      date: "报名 09.05 - 09.25",
      org: "教育部教育考试院",
      desc: "笔试与口试报名同步进行，需在报名系统完成资格审核与缴费。"
    },
    {
      title: "全国计算机等级考试（NCRE）9 月次",
      status: "pending",
      statusLabel: "待开考",
      date: "考试 09.26 - 09.28",
      org: "教育部教育考试院",
      desc: "考前一周开放准考证打印，建议尽早确认考点与场次。"
    },
    {
      title: "2027 年全国硕士研究生招生考试",
      status: "open",
      statusLabel: "预报名",
      date: "预报名 09.24 - 09.27",
      org: "教育部",
      desc: "应届本科毕业生可参加预报名，正式报名于 10 月进行。"
    },
    {
      title: "2026 年下半年全国大学英语四六级口语考试",
      status: "pending",
      statusLabel: "待报名",
      date: "报名 10.10 - 10.18",
      org: "教育部教育考试院",
      desc: "口语考试为选考科目，需先完成笔试报名方可报考。"
    },
    {
      title: "全国计算机等级考试（NCRE）12 月次",
      status: "pending",
      statusLabel: "待开考",
      date: "考试 12.05 - 12.07",
      org: "教育部教育考试院",
      desc: "年度最后一次 NCRE 考试，建议未通过的同学抓紧报名。"
    }
  ],
  news: [
    {
      day: "10", month: "07月",
      title: "教育部发布 2026 年下半年高校学科竞赛目录",
      desc: "新增 3 项 AI 相关赛事，涵盖大模型应用与智能体开发方向。"
    },
    {
      day: "09", month: "07月",
      title: "多所高校秋季学期开设大模型应用通识课",
      desc: "清华、浙大等校将生成式 AI 列为新生通识必修内容。"
    },
    {
      day: "08", month: "07月",
      title: "GitHub 学生包新增 AI 计算额度",
      desc: "认证学生每月可领取额外 GPU 时长用于学习与项目实践。"
    },
    {
      day: "07", month: "07月",
      title: "「智能科学与技术」被列为新增交叉学科",
      desc: "硕博点申报指南预计 8 月公布，相关培养方案征求意见中。"
    },
    {
      day: "06", month: "07月",
      title: "国家大学生创新创业训练计划 2026 年度申报启动",
      desc: "国家级、省级、校级三级立项同步开放，截止日期 9 月 30 日。"
    },
    {
      day: "05", month: "07月",
      title: "CSP 认证 8 月场次开放报名",
      desc: "计算机软件能力认证考试面向高校学生，成绩可替代部分校招笔试。"
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

function metaItem(iconRef, text){
  return el("span", "meta-item",
    `<svg class="icon-sm icon"><use href="${iconRef}"/></svg>${escapeHtml(text)}`);
}

function emptyNode(){
  return el("div", "feed-empty", "暂无内容，敬请期待");
}

/* ---- 单条目渲染 ---- */
function buildCompetitionItem(item){
  const article = el("article", "feed-item");
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
  const date = el("div", "news-date",
    `<span class="news-month">${escapeHtml(item.month)}</span><span class="news-day">${escapeHtml(item.day)}日</span>`);
  const body = el("div", "feed-item-body");
  body.appendChild(el("h3", "feed-item-title", escapeHtml(item.title)));
  body.appendChild(el("p", "feed-item-desc", escapeHtml(item.desc)));
  article.appendChild(date);
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

  // 触发 feed-item stagger 入场
  const items = wrap.querySelectorAll(".feed-item");
  items.forEach((node, i) => {
    node.style.transitionDelay = `${i * 60}ms`;
    // 双 rAF 确保 transition-delay 生效后再加状态类
    requestAnimationFrame(() => requestAnimationFrame(() => {
      node.classList.add("is-in");
    }));
  });
  // 入场结束后清除 delay，避免 hover 抬升有延迟
  setTimeout(() => {
    items.forEach(node => { node.style.transitionDelay = ""; });
  }, (items.length - 1) * 60 + 600);

  if(info) info.textContent = `${pageState[key] + 1} / ${totalPages}`;
  if(prevBtn) prevBtn.disabled = pageState[key] === 0;
  if(nextBtn) nextBtn.disabled = pageState[key] >= totalPages - 1;
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

/* ---- 初始化 ---- */
renderPage("competitions", SAMPLE.competitions, buildCompetitionItem);
renderPage("exams", SAMPLE.exams, buildExamItem);
renderPage("news", SAMPLE.news, buildNewsItem);
setCount("competitions", SAMPLE.competitions.length);
setCount("exams", SAMPLE.exams.length);
setCount("news", SAMPLE.news.length);
bindPager("competitions", SAMPLE.competitions, buildCompetitionItem);
bindPager("exams", SAMPLE.exams, buildExamItem);
bindPager("news", SAMPLE.news, buildNewsItem);
observeBoards();

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
