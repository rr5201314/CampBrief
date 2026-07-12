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

  function compareByNaturalDayThenPriority(a, b) {
    const dayDiff = naturalDayKey(b.published || b.date).localeCompare(naturalDayKey(a.published || a.date));
    if (dayDiff) return dayDiff;

    const priorityDiff = (b.priority || 1) - (a.priority || 1);
    if (priorityDiff) return priorityDiff;

    const publishedDiff = new Date(b.published || b.date || 0).getTime() - new Date(a.published || a.date || 0).getTime();
    if (publishedDiff) return publishedDiff;

    return 0;
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

  return Object.freeze({ naturalDayKey, compareByNaturalDayThenPriority, escapeHtml, safeHttpUrl });
})();
