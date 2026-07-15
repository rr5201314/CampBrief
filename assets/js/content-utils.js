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

  const LIFECYCLE_BOUNDARIES = ["registration_start", "registration_end", "event_start", "event_end"];
  const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const OFFSET_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

  function isValidCalendarDate(value) {
    if (!DATE_ONLY_RE.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function isValidTimeZone(value) {
    if (!value) return false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
      return true;
    } catch (_) {
      return false;
    }
  }

  function boundaryType(value) {
    if (typeof value !== "string") return "invalid";
    if (isValidCalendarDate(value)) return "date";
    if (
      OFFSET_INSTANT_RE.test(value) &&
      isValidCalendarDate(value.slice(0, 10)) &&
      !Number.isNaN(Date.parse(value))
    ) return "instant";
    return "invalid";
  }

  function lifecycleIssues(item) {
    const lifecycle = item && item.lifecycle;
    if (!lifecycle) return [];
    if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) return ["lifecycle 必须是对象"];

    const issues = [];
    const mode = lifecycle.mode;
    if (!["scheduled", "rolling", "manual"].includes(mode)) {
      issues.push("lifecycle.mode 必须是 scheduled、rolling 或 manual");
      return issues;
    }
    if (mode !== "scheduled") {
      if (boundaryType(lifecycle.verified_at) !== "instant") {
        issues.push(`${mode} lifecycle 必须提供带时区的 verified_at`);
      }
      if (boundaryType(lifecycle.review_after) !== "instant") {
        issues.push(`${mode} lifecycle 必须提供带时区的 review_after`);
      }
      if (
        boundaryType(lifecycle.verified_at) === "instant" &&
        boundaryType(lifecycle.review_after) === "instant" &&
        Date.parse(lifecycle.verified_at) >= Date.parse(lifecycle.review_after)
      ) {
        issues.push("verified_at 必须早于 review_after");
      }
      if (
        boundaryType(lifecycle.verified_at) === "instant" &&
        boundaryType(lifecycle.review_after) === "instant" &&
        Date.parse(lifecycle.review_after) - Date.parse(lifecycle.verified_at) > 72 * 60 * 60 * 1000
      ) {
        issues.push("manual/rolling 的复核有效期不得超过 72 小时");
      }
      return issues;
    }

    const populated = LIFECYCLE_BOUNDARIES.filter(field => lifecycle[field]);
    if (populated.length === 0) issues.push("scheduled lifecycle 至少需要一个时间边界");
    if (item.status === "open" && !lifecycle.registration_end) {
      issues.push("scheduled 的 open 状态必须提供 registration_end");
    }

    const types = new Map();
    populated.forEach(field => {
      const type = boundaryType(lifecycle[field]);
      types.set(field, type);
      if (type === "invalid") issues.push(`${field} 必须是 YYYY-MM-DD 或带时区的 ISO8601 时间`);
    });

    if ([...types.values()].includes("date") && !isValidTimeZone(lifecycle.time_zone)) {
      issues.push("使用日期值时必须提供有效的 lifecycle.time_zone");
    }
    if (lifecycle.verified_at && boundaryType(lifecycle.verified_at) !== "instant") {
      issues.push("verified_at 必须是带时区的 ISO8601 时间");
    }

    [["registration_start", "registration_end"], ["event_start", "event_end"]].forEach(([start, end]) => {
      if (!lifecycle[start] || !lifecycle[end]) return;
      const startType = types.get(start);
      const endType = types.get(end);
      if (startType === "date" && endType === "date" && lifecycle[start] > lifecycle[end]) {
        issues.push(`${start} 不能晚于 ${end}`);
      }
      if (startType === "instant" && endType === "instant" && Date.parse(lifecycle[start]) > Date.parse(lifecycle[end])) {
        issues.push(`${start} 不能晚于 ${end}`);
      }
      if (
        startType !== endType &&
        !issues.some(issue => issue.includes("time_zone")) &&
        (startType === "date" || endType === "date")
      ) {
        const startDay = startType === "date"
          ? lifecycle[start]
          : dateKeyInTimeZone(new Date(lifecycle[start]), lifecycle.time_zone);
        const endDay = endType === "date"
          ? lifecycle[end]
          : dateKeyInTimeZone(new Date(lifecycle[end]), lifecycle.time_zone);
        if (startDay > endDay) issues.push(`${start} 不能晚于 ${end}`);
      }
    });
    return issues;
  }

  function dateKeyInTimeZone(value, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(value);
    const part = type => parts.find(entry => entry.type === type)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  function boundaryStarted(value, now, timeZone) {
    if (!value) return false;
    return boundaryType(value) === "date"
      ? dateKeyInTimeZone(now, timeZone) >= value
      : now.getTime() >= Date.parse(value);
  }

  // 结束日期包含当天；精确时间戳则在该时刻之后结束。
  function boundaryPassed(value, now, timeZone) {
    if (!value) return false;
    return boundaryType(value) === "date"
      ? dateKeyInTimeZone(now, timeZone) > value
      : now.getTime() > Date.parse(value);
  }

  // 只读取结构化 lifecycle。展示文本中的自然语言日期绝不参与状态计算。
  function effectiveStatus(item, options = {}) {
    const status = item && item.status;
    const lifecycle = item && item.lifecycle;
    const normalizedOptions = typeof options === "string" ? { kind: options } : options;
    const requireLifecycle = normalizedOptions.requireLifecycle === true;
    if (!lifecycle) return requireLifecycle && status === "open" ? "unknown" : status;
    if (lifecycleIssues(item).length > 0) return requireLifecycle && status === "open" ? "unknown" : status;

    const kind = normalizedOptions.kind === "competition" ? "competition" : "exam";
    const now = new Date(normalizedOptions.now || normalizedOptions.referenceTime || Date.now());
    if (Number.isNaN(now.getTime())) return status;

    if (lifecycle.mode !== "scheduled") {
      return now.getTime() > Date.parse(lifecycle.review_after) && status !== "done"
        ? "unknown"
        : status;
    }

    const timeZone = lifecycle.time_zone;
    const registrationStarted = lifecycle.registration_start
      ? boundaryStarted(lifecycle.registration_start, now, timeZone)
      : true;
    const registrationEnded = lifecycle.registration_end
      ? boundaryPassed(lifecycle.registration_end, now, timeZone)
      : false;
    const eventStarted = lifecycle.event_start
      ? boundaryStarted(lifecycle.event_start, now, timeZone)
      : false;
    const eventEnded = lifecycle.event_end
      ? boundaryPassed(lifecycle.event_end, now, timeZone)
      : false;

    if (eventEnded) return "done";
    if (lifecycle.registration_start && !registrationStarted) return "pending";

    // 边报名边比赛时仍优先显示“可报名”。
    if (lifecycle.registration_end && registrationStarted && !registrationEnded) return "open";

    if (registrationEnded) {
      if (kind === "competition" && eventStarted) return "ongoing";
      return "closed";
    }

    if (kind === "competition" && eventStarted) return "ongoing";
    return status;
  }

  function isCarouselCandidate(item, kind, options = {}) {
    if (!item?.lifecycle || lifecycleIssues(item).length > 0) return false;
    const status = effectiveStatus(item, {
      ...options,
      kind,
      requireLifecycle: true
    });
    return status === "open" || (status === "pending" && item?.lifecycle?.mode === "scheduled");
  }

  return Object.freeze({
    naturalDayKey,
    compareByTimeBadgeThenPriority,
    escapeHtml,
    safeHttpUrl,
    getTimeBadge,
    formatLastUpdated,
    updateSortPill,
    lifecycleIssues,
    effectiveStatus,
    isCarouselCandidate
  });
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = CampBriefContent;
}
