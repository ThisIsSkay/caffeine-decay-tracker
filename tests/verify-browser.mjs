import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8781);
const base = `http://127.0.0.1:${port}`;
const preferredChromiumPath = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let passed = 0;
let failed = 0;

function check(label, actual, expected, tolerance) {
  let ok = false;
  if (typeof tolerance === "number") {
    ok = typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
  } else {
    ok = Object.is(actual, expected);
  }
  if (ok) {
    passed++;
    console.log("  PASS  " + label);
  } else {
    failed++;
    console.log("  FAIL  " + label);
    console.log("        expected:", expected);
    console.log("        actual:  ", actual);
  }
}

async function pathExists(filePath) {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css" };
const server = http.createServer(async (req, res) => {
  try {
    let pathname = new URL(req.url, base).pathname;
    if (pathname === "/") pathname = "/index.html";
    const filePath = path.resolve(root, "." + pathname);
    if (!filePath.startsWith(root + path.sep)) throw new Error("bad path");
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": types[path.extname(filePath)] || "application/octet-stream", "cache-control":"no-store" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
});

await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));
let browser;
try {
  const launchOptions = { headless: true, args: ["--no-sandbox"] };
  if (await pathExists(preferredChromiumPath)) {
    launchOptions.executablePath = preferredChromiumPath;
  }
  browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({ timezoneId: "Asia/Singapore" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", err => errors.push(err.message));
  await page.clock.install({ time: new Date("2026-08-31T12:00:00+08:00") });

  console.log("\nPage load and defaults");
  await page.goto(base);
  check("page title", await page.title(), "Caffeine Decay Tracker");
  check("default half-life", await page.inputValue("#halflife-input"), "5.0");
  check("empty hero visible", await page.isVisible("#hero-empty"), true);
  check("empty intake message visible", await page.isVisible("#empty-intakes"), true);
  check("clear-all hidden when empty", await page.isHidden("#btn-clear-all"), true);
  check("empty chart has no selected polyline", await page.locator("#chart-svg .chart-line").count(), 0);

  console.log("\nTwo-dose calculation");
  await page.fill("#input-amount", "200");
  await page.fill("#input-date", "2026-08-31");
  await page.fill("#input-time", "08:00");
  await page.fill("#input-label", "Morning coffee");
  await page.click(".btn-add");

  await page.fill("#input-amount", "150");
  await page.fill("#input-date", "2026-08-31");
  await page.fill("#input-time", "10:00");
  await page.click(".btn-add");

  const expected = 200 * Math.pow(0.5, 4/5) + 150 * Math.pow(0.5, 2/5);
  check("hero sums doses independently", parseFloat(await page.textContent("#hero-value")), expected, 0.05);
  check("daily consumed is 350", (await page.textContent("#daily-consumed")).trim(), "350");
  check("daily entry count is 2", (await page.textContent("#daily-entries")).trim(), "2");
  check("two intake rows", await page.locator(".intake-item").count(), 2);
  check("clear-all visible when entries exist", await page.isVisible("#btn-clear-all"), true);

  const fast = 200 * Math.pow(0.5, 4/3) + 150 * Math.pow(0.5, 2/3);
  const slow = 200 * Math.pow(0.5, 4/8) + 150 * Math.pow(0.5, 2/8);
  const rangeText = await page.textContent("#hero-range");
  check("hero shows research sensitivity label", rangeText.includes("Adult sensitivity reference (3–8 h)"), true);
  check("hero range includes rounded fast result", rangeText.includes(fast.toFixed(1)), true);
  check("hero range includes rounded slow result", rangeText.includes(slow.toFixed(1)), true);

  console.log("\nFuture dose semantics");
  await page.fill("#input-amount", "75");
  await page.fill("#input-date", "2026-08-31");
  await page.fill("#input-time", "14:00");
  await page.fill("#input-label", "Scheduled");
  await page.click(".btn-add");
  check("future dose shows Scheduled", (await page.textContent(".intake-future")).trim(), "Scheduled");
  check("future dose excluded from consumed today", (await page.textContent("#daily-consumed")).trim(), "350");
  check("future dose excluded from completed entry count", (await page.textContent("#daily-entries")).trim(), "2");
  check("hero still excludes future dose", parseFloat(await page.textContent("#hero-value")), expected, 0.05);

  console.log("\nDecimal dose and editing");
  const scheduledEdit = page.locator('.intake-item').filter({ hasText: "Scheduled" }).locator('[data-action="edit"]');
  await scheduledEdit.click();
  await page.fill("#edit-amount", "62.5");
  await page.fill("#edit-time", "11:00");
  await page.click("#modal-save");
  check("edit modal closes after save", await page.isHidden("#edit-modal"), true);
  check("decimal dose preserved", (await page.locator(".intake-dose").first().textContent()).includes("62.5 mg"), true);
  check("edited past dose now counts today", parseFloat(await page.textContent("#daily-consumed")), 412.5, 1e-9);

  console.log("\nHalf-life changes and validation");
  const before = parseFloat(await page.textContent("#hero-value"));
  await page.fill("#halflife-input", "8");
  await page.locator("#halflife-input").blur();
  check("custom half-life applied", await page.inputValue("#halflife-input"), "8.0");
  const after = parseFloat(await page.textContent("#hero-value"));
  check("longer half-life increases remaining", after > before, true);
  await page.fill("#halflife-input", "0");
  await page.locator("#halflife-input").blur();
  check("invalid half-life resets to last valid", await page.inputValue("#halflife-input"), "8.0");
  check("invalid half-life produces message", await page.isVisible("#halflife-error"), true);

  console.log("\nPersistence and invalid stored data");
  await page.reload();
  check("entries persist", await page.locator(".intake-item").count(), 3);
  check("half-life persists", await page.inputValue("#halflife-input"), "8.0");

  await page.evaluate(() => {
    localStorage.setItem("caffeine-entries", JSON.stringify([
      { id:"bad-dose", doseMg:999999, intakeTimestamp:Date.now(), label:"bad dose" },
      { id:"bad-date", doseMg:100, intakeTimestamp:1e300, label:"bad date" },
      { id:"good", doseMg:100, intakeTimestamp:Date.now(), label:"good" }
    ]));
    localStorage.setItem("caffeine-halflife", "banana");
  });
  await page.reload();
  check("invalid stored dose/timestamp are filtered", await page.locator(".intake-item").count(), 1);
  check("invalid stored half-life falls back to 5", await page.inputValue("#halflife-input"), "5.0");
  check("remaining stored valid row is good", (await page.textContent(".intake-label-text")).trim(), "good");

  console.log("\nDelete-last empty state regression");
  await page.click('[data-action="delete"]');
  check("zero intake rows after last delete", await page.locator(".intake-item").count(), 0);
  check("empty intake message visible after last delete", await page.isVisible("#empty-intakes"), true);
  check("hero empty visible after last delete", await page.isVisible("#hero-empty"), true);
  check("clear-all hidden after last delete", await page.isHidden("#btn-clear-all"), true);

  console.log("\nCorrupt JSON and wrong stored root types");
  await page.evaluate(() => localStorage.setItem("caffeine-entries", "{not valid json"));
  await page.reload();
  check("invalid JSON restores empty state", await page.locator(".intake-item").count(), 0);
  await page.evaluate(() => localStorage.setItem("caffeine-entries", JSON.stringify({ id:"not-an-array" })));
  await page.reload();
  check("wrong stored root type restores empty state", await page.locator(".intake-item").count(), 0);

  console.log("\nDuplicate IDs and localStorage injection hardening");
  await page.evaluate(() => {
    localStorage.setItem("caffeine-entries", JSON.stringify([
      { id:"dup", doseMg:100, intakeTimestamp:new Date("2026-08-31T08:00:00+08:00").getTime(), label:"first" },
      { id:"dup", doseMg:80, intakeTimestamp:new Date("2026-08-31T09:00:00+08:00").getTime(), label:"second" },
      { id:'\"><img id="xss-probe" src=x onerror="window.__xss=1">', doseMg:50, intakeTimestamp:new Date("2026-08-31T10:00:00+08:00").getTime(), label:'<img id="xss-label" src=x onerror="window.__xss=2">' }
    ]));
  });
  await page.reload();
  check("duplicate/unsafe IDs preserve all valid rows", await page.locator(".intake-item").count(), 3);
  const restoredIds = await page.locator(".intake-item").evaluateAll(rows => rows.map(row => row.getAttribute("data-id")));
  check("restored IDs are unique", new Set(restoredIds).size, 3);
  check("restored IDs are attribute-safe", restoredIds.every(id => /^[A-Za-z0-9._:-]+$/.test(id)), true);
  check("malicious ID did not inject an element", await page.locator("#xss-probe").count(), 0);
  check("malicious label rendered as text, not HTML", await page.locator("#xss-label").count(), 0);
  check("no injected handler executed", await page.evaluate(() => window.__xss), undefined);
  const normalizedStoredIds = await page.evaluate(() => JSON.parse(localStorage.getItem("caffeine-entries")).map(entry => entry.id));
  check("normalized unique IDs persisted", new Set(normalizedStoredIds).size, 3);
  await page.locator('.intake-item [data-action="delete"]').first().click();
  check("deleting one normalized row deletes only one", await page.locator(".intake-item").count(), 2);

  console.log("\nClear-all confirmation flow");
  check("clear-all visible before clear", await page.isVisible("#btn-clear-all"), true);
  page.once("dialog", dialog => dialog.dismiss());
  await page.click("#btn-clear-all");
  check("cancelled clear keeps entries", await page.locator(".intake-item").count(), 2);
  page.once("dialog", dialog => dialog.accept());
  await page.click("#btn-clear-all");
  check("confirmed clear removes all entries", await page.locator(".intake-item").count(), 0);
  check("clear-all hides after clearing", await page.isHidden("#btn-clear-all"), true);
  check("clear-all persists empty array", await page.evaluate(() => localStorage.getItem("caffeine-entries")), "[]");
  check("hero returns to empty state after clear", await page.isVisible("#hero-empty"), true);

  console.log("\nProjection, chart, mobile");
  await page.fill("#input-amount", "200");
  await page.fill("#input-date", "2026-08-31");
  await page.fill("#input-time", "08:00");
  await page.click(".btn-add");
  check("projection rows rendered", (await page.locator(".projection-row").count()) >= 6, true);
  check("projection contains sensitivity references", (await page.textContent(".projection-range")).includes("3–8 h ref"), true);
  check("projection Now matches hero display precision",
    parseFloat(await page.textContent(".projection-row.now .projection-value")),
    parseFloat(await page.textContent("#hero-value")), 1e-12);
  check("chart selected line rendered", await page.locator("#chart-svg .chart-line").count(), 1);
  check("chart reference lines rendered", await page.locator("#chart-svg .chart-line-reference").count(), 2);
  await page.setViewportSize({ width: 375, height: 667 });
  check("no horizontal overflow at 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  console.log("\nCross-tab localStorage synchronization");
  const syncContext = await browser.newContext({ timezoneId: "Asia/Singapore" });
  const syncPageA = await syncContext.newPage();
  const syncPageB = await syncContext.newPage();
  await syncPageA.clock.install({ time: new Date("2026-08-31T12:00:00+08:00") });
  await syncPageB.clock.install({ time: new Date("2026-08-31T12:00:00+08:00") });
  await syncPageA.goto(base);
  await syncPageB.goto(base);
  await syncPageB.fill("#input-amount", "120");
  await syncPageB.fill("#input-date", "2026-08-31");
  await syncPageB.fill("#input-time", "09:00");
  await syncPageB.click(".btn-add");
  await syncPageA.waitForFunction(() => document.querySelectorAll(".intake-item").length === 1);
  check("other tab receives added entry via storage event", await syncPageA.locator(".intake-item").count(), 1);
  check("other tab hero updates after storage event", await syncPageA.isVisible("#hero-amount"), true);
  await syncContext.close();

  console.log("\nBlocked localStorage fallback");
  const blockedContext = await browser.newContext({ timezoneId: "Asia/Singapore" });
  const blockedPage = await blockedContext.newPage();
  await blockedPage.addInitScript(() => {
    const blocked = () => { throw new DOMException("Storage blocked", "SecurityError"); };
    Object.defineProperty(Storage.prototype, "getItem", { configurable: true, value: blocked });
    Object.defineProperty(Storage.prototype, "setItem", { configurable: true, value: blocked });
  });
  await blockedPage.clock.install({ time: new Date("2026-08-31T12:00:00+08:00") });
  await blockedPage.goto(base);
  await blockedPage.fill("#input-amount", "90");
  await blockedPage.fill("#input-date", "2026-08-31");
  await blockedPage.fill("#input-time", "10:00");
  await blockedPage.click(".btn-add");
  check("app still works for current session when storage is blocked", await blockedPage.locator(".intake-item").count(), 1);
  check("hero still calculates when storage is blocked", await blockedPage.isVisible("#hero-amount"), true);
  await blockedContext.close();

  console.log("\nDST local-time validation and ambiguity");
  const dstContext = await browser.newContext({ timezoneId: "America/New_York" });
  const dstPage = await dstContext.newPage();
  await dstPage.clock.install({ time: new Date("2026-03-08T12:00:00-04:00") });
  await dstPage.goto(base);
  await dstPage.fill("#input-amount", "100");
  await dstPage.fill("#input-date", "2026-03-08");
  await dstPage.fill("#input-time", "02:30");
  await dstPage.click(".btn-add");
  check("spring-forward nonexistent 02:30 rejected", await dstPage.isVisible("#form-error"), true);
  check("no row created for nonexistent time", await dstPage.locator(".intake-item").count(), 0);
  await dstContext.close();

  const fallContext = await browser.newContext({ timezoneId: "America/New_York" });
  const fallPage = await fallContext.newPage();
  await fallPage.clock.install({ time: new Date("2026-11-01T12:00:00-05:00") });
  await fallPage.goto(base);
  await fallPage.fill("#input-amount", "100");
  await fallPage.fill("#input-date", "2026-11-01");
  await fallPage.fill("#input-time", "01:30");
  await fallPage.click(".btn-add");
  check("fall-back repeated 01:30 is accepted without crashing", await fallPage.locator(".intake-item").count(), 1);
  check("fall-back entry counts on local calendar date", (await fallPage.textContent("#daily-consumed")).trim(), "100");
  await fallContext.close();

  check("no uncaught JS page errors", errors.length, 0);
  await context.close();
} catch (error) {
  console.error("Browser test runner error:", error);
  failed++;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}

console.log("\n" + "─".repeat(58));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log("ALL BROWSER TESTS PASSED");
