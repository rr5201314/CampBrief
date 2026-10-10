"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const now = "2026-10-10T12:00:00Z";
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return Date.parse(now); }
}
const context = vm.createContext({ Date: FixedDate, document: { addEventListener() {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/js/tech.js"), "utf8"), context);
const pick = items => Array.from(context.pickTechCarouselItems(items), item => item.id);
const item = (id, priority = 2, published = "2026-10-10T09:00:00Z") => ({ id, priority, published, url: "https://example.com/shared" });

test("tech carousel fills three slots with the newest important items", () => {
  const items = [
    item("older", 2, "2026-10-08T09:00:00Z"),
    item("latest", 2, "2026-10-10T11:00:00Z"),
    item("third", 2, "2026-10-09T09:00:00Z"),
    item("second", 2, "2026-10-10T10:00:00Z")
  ];
  const before = JSON.stringify(items);
  assert.deepEqual(pick(items), ["latest", "second", "third"]);
  assert.equal(JSON.stringify(items), before);
});

test("important fallback preserves headline and major items without changing priorities", () => {
  const items = [
    item("headline", 4, "2026-10-08T09:00:00Z"),
    item("major", 3, "2026-10-09T09:00:00Z"),
    item("fallback"), item("extra", 2, "2026-10-08T10:00:00Z")
  ];
  assert.deepEqual(pick(items), ["fallback", "major", "headline"]);
  assert.deepEqual(items.map(i => i.priority), [4, 3, 2, 2]);
});

test("sufficient headline and major items exclude important fallback", () => {
  assert.deepEqual(pick([item("one", 4), item("two", 3), item("three", 3), item("excluded")]), ["one", "two", "three"]);
});

test("fallback excludes old, future, invalid and low-priority entries", () => {
  assert.deepEqual(pick([
    item("valid"), item("old", 2, "2026-10-07T11:59:59Z"),
    item("future", 2, "2026-10-10T12:00:01Z"), item("invalid", 2, "bad-date"),
    item("ordinary", 1)
  ]), ["valid"]);
});

test("tech carousel still caps selection at fifteen items", () => {
  assert.equal(pick(Array.from({ length: 20 }, (_, i) => item(`headline-${i}`, 4))).length, 15);
});
