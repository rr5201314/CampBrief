// 内容型板块共用工具：以北京时间自然日分组，保证首页、资讯与技术列表排序一致。
const CampBriefContent = (function () {
  "use strict";

  function naturalDayKey(value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
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

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeHttpUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  // 资讯和技术列表共用的时效标签。阈值与日期筛选保持一致，避免不同列表页出现相同日期却显示不同徽章。
  function getTimeBadgeRank(value, referenceTime = new Date()) {
    const publishedAt = new Date(value);
    const diffHours = (referenceTime - publishedAt) / (1000 * 60 * 60);

    if (diffHours < 24) return 0;
    if (diffHours < 72) return 1;
    if (diffHours < 168) return 2;
    if (diffHours < 720) return 3;
    return 4;
  }

  function getTimeBadge(value, referenceTime = new Date()) {
    const badgeRank = getTimeBadgeRank(value, referenceTime);
    const badges = [
      { statusClass: "status-open", statusText: "24小时" },
      { statusClass: "status-pending", statusText: "3天" },
      { statusClass: "status-pending", statusText: "7天" },
      { statusClass: "status-closed", statusText: "30天" },
      { statusClass: "status-done", statusText: "更早" }
    ];
    return badges[badgeRank];
  }

  // 先按时效标签排序，保证 24小时/3天/7天/30天/更早不会在分页间交错；同一时效区间内再按优先级和发布时间排序。
  function compareByTimeBadgeThenPriority(a, b, referenceTime = new Date()) {
    const badgeDiff = getTimeBadgeRank(a.published || a.date, referenceTime) - getTimeBadgeRank(b.published || b.date, referenceTime);
    if (badgeDiff) return badgeDiff;

    const priorityDiff = (b.priority || 1) - (a.priority || 1);
    if (priorityDiff) return priorityDiff;

    return new Date(b.published || b.date || 0).getTime() - new Date(a.published || a.date || 0).getTime();
  }

  // 将 ISO8601 时间戳格式化为 "MM.DD HH:mm 更新"
  function formatLastUpdated(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);
    const p = type => parts.find(item => item.type === type)?.value || "";
    return `${p("month")}.${p("day")} ${p("hour")}:${p("minute")} 更新`;
  }

  // 更新页面 .sort-pill 为实际更新时间
  function updateSortPill(isoString) {
    const pill = document.querySelector(".sort-pill");
    if (!pill) return;
    const text = formatLastUpdated(isoString);
    if (text) pill.textContent = text;
  }

  return Object.freeze({ naturalDayKey, compareByTimeBadgeThenPriority, escapeHtml, safeHttpUrl, getTimeBadge, formatLastUpdated, updateSortPill });
})();
