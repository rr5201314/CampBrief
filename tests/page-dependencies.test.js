"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function htmlFiles() {
  const files = [path.join(root, "index.html")];
  const pages = path.join(root, "pages");
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.endsWith(".html")) files.push(fullPath);
    }
  };
  walk(pages);
  return files;
}

function localTarget(htmlPath, value) {
  if (!value || /^(?:#|https?:|mailto:|tel:|data:|javascript:)/i.test(value)) return null;
  const clean = value.split(/[?#]/, 1)[0];
  if (!clean) return null;
  return clean.startsWith("/")
    ? path.join(root, clean.replace(/^\/+/, ""))
    : path.resolve(path.dirname(htmlPath), clean);
}

test("all local href and src targets exist", () => {
  const missing = [];
  for (const htmlPath of htmlFiles()) {
    const html = fs.readFileSync(htmlPath, "utf8");
    for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
      const target = localTarget(htmlPath, match[1]);
      if (target && !fs.existsSync(target)) {
        missing.push(`${path.relative(root, htmlPath)} -> ${match[1]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("literal fetch targets exist relative to their pages", () => {
  const missing = [];
  for (const htmlPath of htmlFiles()) {
    const html = fs.readFileSync(htmlPath, "utf8");
    const scripts = [...html.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/g)]
      .map(match => localTarget(htmlPath, match[1]))
      .filter(target => target && fs.existsSync(target));
    for (const scriptPath of scripts) {
      const source = fs.readFileSync(scriptPath, "utf8");
      for (const match of source.matchAll(/\bfetch\(\s*["']([^"']+)["']/g)) {
        const target = localTarget(htmlPath, match[1]);
        if (target && !fs.existsSync(target)) {
          missing.push(`${path.relative(root, htmlPath)} -> ${match[1]}`);
        }
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("public data and documentation stay grouped under static", () => {
  assert.equal(fs.existsSync(path.join(root, "data")), false);
  assert.equal(fs.existsSync(path.join(root, "docs")), false);
  assert.equal(fs.existsSync(path.join(root, "static", "data")), true);
  assert.equal(fs.existsSync(path.join(root, "static", "docs")), true);
});

test("pages load content-utils before scripts that use CampBriefContent", () => {
  const failures = [];
  for (const htmlPath of htmlFiles()) {
    const html = fs.readFileSync(htmlPath, "utf8");
    const scripts = [...html.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/g)]
      .map(match => ({ source: match[1], target: localTarget(htmlPath, match[1]) }))
      .filter(entry => entry.target && fs.existsSync(entry.target));
    let utilitiesLoaded = false;
    for (const script of scripts) {
      if (path.basename(script.target) === "content-utils.js") {
        utilitiesLoaded = true;
        continue;
      }
      const source = fs.readFileSync(script.target, "utf8");
      if (source.includes("CampBriefContent.") && !utilitiesLoaded) {
        failures.push(`${path.relative(root, htmlPath)} -> ${script.source}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("daily-news carousel identifies split stories by stable id, not shared URL", () => {
  const source = fs.readFileSync(path.join(root, "assets", "js", "daily-news.js"), "utf8");
  assert.match(source, /!result\.find\(r => r\.id === i\.id\)/);
  assert.doesNotMatch(source, /!result\.find\(r => r\.url === i\.url\)/);
});
