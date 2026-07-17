"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const CampBriefContent = require("../assets/js/content-utils.js");
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "temporal-status-cases.json"), "utf8"));

for (const entry of cases) {
  test(entry.name, () => {
    assert.equal(
      CampBriefContent.effectiveStatus(entry.item, { kind: entry.kind, now: entry.now }),
      entry.expected
    );
  });
}

test("invalid calendar date is rejected and stored status is preserved", () => {
  const item = {
    status: "open",
    lifecycle: {
      mode: "scheduled",
      time_zone: "Asia/Shanghai",
      registration_end: "2026-02-31"
    }
  };
  assert.ok(CampBriefContent.lifecycleIssues(item).length > 0);
  assert.equal(CampBriefContent.effectiveStatus(item, { kind: "exam", now: "2026-07-15T00:00:00Z" }), "open");
});

test("invalid calendar date inside an offset instant is rejected", () => {
  const item = {
    status: "open",
    lifecycle: {
      mode: "scheduled",
      registration_end: "2026-02-31T23:59:00+08:00"
    }
  };
  assert.ok(CampBriefContent.lifecycleIssues(item).length > 0);
});

test("scheduled open status requires a registration end", () => {
  const item = {
    status: "open",
    lifecycle: {
      mode: "scheduled",
      time_zone: "Asia/Shanghai",
      event_end: "2026-08-31"
    }
  };
  assert.match(CampBriefContent.lifecycleIssues(item).join(" "), /registration_end/);
  assert.equal(
    CampBriefContent.effectiveStatus(item, {
      kind: "competition",
      requireLifecycle: true,
      now: "2026-07-15T00:00:00Z"
    }),
    "unknown"
  );
});

test("date-only lifecycle requires an explicit time zone", () => {
  const item = {
    status: "open",
    lifecycle: { mode: "scheduled", registration_end: "2026-07-15" }
  };
  assert.match(CampBriefContent.lifecycleIssues(item).join(" "), /time_zone/);
});

test("unstructured open status becomes unverified on public pages", () => {
  assert.equal(
    CampBriefContent.effectiveStatus(
      { status: "open", signup: "即日起报名" },
      { kind: "competition", requireLifecycle: true, now: "2026-07-15T00:00:00Z" }
    ),
    "unknown"
  );
});

test("manual status expires after review_after", () => {
  const item = {
    status: "open",
    lifecycle: {
      mode: "manual",
      verified_at: "2026-07-15T18:00:00+08:00",
      review_after: "2026-07-18T18:00:00+08:00"
    }
  };
  assert.equal(CampBriefContent.effectiveStatus(item, { now: "2026-07-17T00:00:00Z" }), "open");
  assert.equal(CampBriefContent.effectiveStatus(item, { now: "2026-07-19T00:00:00Z" }), "unknown");
  assert.equal(CampBriefContent.isCarouselCandidate(item, "exam", { now: "2026-07-19T00:00:00Z" }), false);
});

test("only scheduled pending items may enter a carousel", () => {
  assert.equal(CampBriefContent.isCarouselCandidate({ status: "pending" }, "competition"), false);
  assert.equal(
    CampBriefContent.isCarouselCandidate(
      {
        status: "pending",
        lifecycle: {
          mode: "scheduled",
          time_zone: "Asia/Shanghai",
          registration_start: "2026-08-01"
        }
      },
      "competition",
      { now: "2026-07-15T00:00:00Z" }
    ),
    true
  );
  assert.equal(
    CampBriefContent.isCarouselCandidate(
      {
        status: "pending",
        lifecycle: {
          mode: "scheduled",
          time_zone: "Not/AZone",
          registration_start: "2026-08-01"
        }
      },
      "competition",
      { now: "2026-07-15T00:00:00Z" }
    ),
    false
  );
});

test("homepage board ordering uses publication time before priority", () => {
  const items = [
    { id: "older-headline", published: "2026-07-16T23:59:00+08:00", priority: 4 },
    { id: "newer-major", published: "2026-07-17T00:01:00+08:00", priority: 3 }
  ];

  assert.deepEqual(
    items.sort(CampBriefContent.compareByPublishedThenPriority).map(item => item.id),
    ["newer-major", "older-headline"]
  );
});

test("homepage board ordering uses priority when publication times are equal", () => {
  const items = [
    { id: "major", published: "2026-07-17T09:00:00+08:00", priority: 3 },
    { id: "headline", published: "2026-07-17T09:00:00+08:00", priority: 4 }
  ];

  assert.deepEqual(
    items.sort(CampBriefContent.compareByPublishedThenPriority).map(item => item.id),
    ["headline", "major"]
  );
});
