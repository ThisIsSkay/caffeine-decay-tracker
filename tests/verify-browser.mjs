/**
 * Browser integration tests for the Caffeine Decay Tracker.
 * Verifies UI, calculations, persistence, and edge cases.
 *
 * Requires: Playwright, http-server running on BASE_URL
 * Usage: node tests/verify-browser.mjs
 */

import { chromium } from "playwright";

var BASE = process.env.BASE_URL || "http://localhost:8781";
var passed = 0;
var failed = 0;

function check(label, actual, expected, tolerance) {
  if (tolerance !== undefined) {
    if (typeof actual === "number" && typeof expected === "number" &&
        Math.abs(actual - expected) <= tolerance) {
      passed++;
      console.log("  PASS  " + label);
      return;
    }
  } else if (actual === expected) {
    passed++;
    console.log("  PASS  " + label);
    return;
  }
  failed++;
  console.log("  FAIL  " + label);
  console.log("        expected: " + JSON.stringify(expected));
  console.log("        actual:   " + JSON.stringify(actual));
}

var browser, context, page;

try {
  browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"]
  });
  context = await browser.newContext();
  page = await context.newPage();

  // Install a fake clock so tests are deterministic
  // Aug 31 2026 12:00:00 local time
  await page.clock.install({ time: new Date(2026, 7, 31, 12, 0, 0) });

  // ── Test: Page loads ──────────────────────────────────────
  console.log("\nPage load");
  await page.goto(BASE);
  var title = await page.title();
  check("Page title", title, "Caffeine Decay Tracker");

  var heroText = await page.textContent("#hero-empty");
  check("Empty state message shown", heroText.trim(), "Add your first caffeine intake below");

  // ── Test: Half-life default ───────────────────────────────
  console.log("\nHalf-life");
  var hlValue = await page.$eval("#halflife-input", function (el) { return el.value; });
  check("Default half-life is 5.0", hlValue, "5.0");

  // ── Test: Add first intake ────────────────────────────────
  console.log("\nAdd intake");
  await page.fill("#input-amount", "200");
  await page.fill("#input-time", "08:00");
  await page.fill("#input-date", "2026-08-31");
  await page.fill("#input-label", "Morning Coffee");
  await page.click(".btn-add");

  // At 12:00 with 200mg taken at 08:00, half-life 5h:
  // elapsed = 4h, remaining = 200 × 0.5^(4/5) = 200 × 0.5^0.8
  var expected1 = 200 * Math.pow(0.5, 4 / 5);
  var heroVal = await page.textContent("#hero-value");
  var heroNum = parseFloat(heroVal);
  check("Hero shows correct remaining after 1 intake",
    heroNum, expected1, 0.5);

  // Check daily consumed
  var consumed = await page.textContent("#daily-consumed");
  check("Daily consumed = 200", consumed.trim(), "200");

  // Check intake appears in list
  var intakeItems = await page.$$(".intake-item");
  check("1 intake in list", intakeItems.length, 1);

  // ── Test: Add second intake ───────────────────────────────
  console.log("\nSecond intake");
  await page.fill("#input-amount", "150");
  await page.fill("#input-time", "10:00");
  await page.fill("#input-date", "2026-08-31");
  await page.fill("#input-label", "");
  await page.click(".btn-add");

  // Dose A: 200 × 0.5^(4/5) ≈ 114.87
  // Dose B: 150 × 0.5^(2/5) ≈ 113.56
  var expectedA = 200 * Math.pow(0.5, 4 / 5);
  var expectedB = 150 * Math.pow(0.5, 2 / 5);
  var expectedTotal = expectedA + expectedB;

  heroVal = await page.textContent("#hero-value");
  heroNum = parseFloat(heroVal);
  check("Hero shows correct total after 2 intakes",
    heroNum, expectedTotal, 0.5);

  consumed = await page.textContent("#daily-consumed");
  check("Daily consumed = 350", consumed.trim(), "350");

  intakeItems = await page.$$(".intake-item");
  check("2 intakes in list", intakeItems.length, 2);

  // ── Test: Edit intake ─────────────────────────────────────
  console.log("\nEdit intake");
  var editBtn = await page.$('.btn-icon[data-action="edit"]');
  await editBtn.click();

  // Modal should be visible
  var modalVisible = await page.$eval("#edit-modal", function (el) {
    return el.classList.contains("visible");
  });
  check("Edit modal opens", modalVisible, true);

  // Change amount to 300
  await page.fill("#edit-amount", "300");
  await page.click("#modal-save");

  modalVisible = await page.$eval("#edit-modal", function (el) {
    return el.classList.contains("visible");
  });
  check("Edit modal closes after save", modalVisible, false);

  consumed = await page.textContent("#daily-consumed");
  check("Daily consumed updated to 500", consumed.trim(), "500");

  // ── Test: Delete intake ───────────────────────────────────
  console.log("\nDelete intake");
  var deleteBtn = await page.$('.btn-icon[data-action="delete"]');
  await deleteBtn.click();

  intakeItems = await page.$$(".intake-item");
  check("1 intake after delete", intakeItems.length, 1);

  // ── Test: Change half-life ────────────────────────────────
  console.log("\nChange half-life");
  var heroBefore = parseFloat(await page.textContent("#hero-value"));

  await page.click("#hl-dec"); // 5.0 -> 4.5
  hlValue = await page.$eval("#halflife-input", function (el) { return el.value; });
  check("Half-life decreased to 4.5", hlValue, "4.5");

  var heroAfter = parseFloat(await page.textContent("#hero-value"));
  check("Remaining changed after half-life change", heroBefore !== heroAfter, true);

  // Reset to 5.0
  await page.click("#hl-inc");

  // ── Test: Future entry ────────────────────────────────────
  console.log("\nFuture entry");
  await page.fill("#input-amount", "200");
  await page.fill("#input-time", "14:00");
  await page.fill("#input-date", "2026-08-31");
  await page.fill("#input-label", "Afternoon");
  await page.click(".btn-add");

  // The future dose should show "Scheduled" in the list
  var futureText = await page.textContent(".intake-future");
  check("Future entry shows Scheduled", futureText.trim(), "Scheduled");

  // Hero should not include the future dose
  // Only the remaining entry (200mg at 08:00) should contribute
  heroVal = await page.textContent("#hero-value");
  heroNum = parseFloat(heroVal);
  var expectedWithoutFuture = 200 * Math.pow(0.5, 4 / 5);
  check("Future dose does not inflate hero value",
    heroNum, expectedWithoutFuture, 0.5);

  // ── Test: localStorage persistence ────────────────────────
  console.log("\nPersistence");

  // Reload the page (same fake clock)
  await page.reload();
  await page.waitForSelector("#hero-value");

  intakeItems = await page.$$(".intake-item");
  check("Entries persist after reload", intakeItems.length, 2);

  hlValue = await page.$eval("#halflife-input", function (el) { return el.value; });
  check("Half-life persists after reload", hlValue, "5.0");

  // ── Test: Corrupted localStorage ──────────────────────────
  console.log("\nCorrupted storage");
  await page.evaluate(function () {
    localStorage.setItem("caffeine-entries", "NOT_VALID_JSON!!{[}");
    localStorage.setItem("caffeine-halflife", "banana");
  });
  await page.reload();
  await page.waitForSelector(".app");

  intakeItems = await page.$$(".intake-item");
  check("Corrupted entries → empty list", intakeItems.length, 0);

  hlValue = await page.$eval("#halflife-input", function (el) { return el.value; });
  check("Corrupted half-life → default 5.0", hlValue, "5.0");

  // ── Test: Empty state after clear ─────────────────────────
  console.log("\nEmpty state");
  var emptyVis = await page.$eval("#hero-empty", function (el) {
    return el.style.display !== "none";
  });
  check("Empty message visible with no entries", emptyVis, true);

  // ── Test: Projection section exists ───────────────────────
  console.log("\nProjection");
  // Add an entry to see projections
  await page.fill("#input-amount", "200");
  await page.fill("#input-time", "12:00");
  await page.fill("#input-date", "2026-08-31");
  await page.click(".btn-add");

  var projRows = await page.$$(".projection-row");
  check("Projection rows rendered", projRows.length > 0, true);

  var nowRow = await page.$(".projection-row.now");
  check("Now row exists in projection", nowRow !== null, true);

  // ── Test: Chart SVG has content ───────────────────────────
  console.log("\nChart");
  var chartContent = await page.$eval("#chart-svg", function (el) {
    return el.innerHTML.length;
  });
  check("Chart SVG has content", chartContent > 0, true);

  // ── Test: Mobile width ────────────────────────────────────
  console.log("\nMobile viewport");
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(100);

  var bodyWidth = await page.evaluate(function () {
    return document.body.scrollWidth;
  });
  var viewportWidth = await page.evaluate(function () {
    return window.innerWidth;
  });
  check("No horizontal overflow at 375px", bodyWidth <= viewportWidth, true);

  // ── Test: Console errors ──────────────────────────────────
  console.log("\nConsole errors");
  var errors = [];
  page.on("pageerror", function (err) { errors.push(err.message); });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  await page.waitForSelector(".app");
  check("No JS errors on page", errors.length, 0);

} catch (err) {
  console.error("Test runner error:", err);
  failed++;
} finally {
  if (browser) await browser.close();
}

console.log("\n" + "─".repeat(50));
console.log("Results: " + passed + " passed, " + failed + " failed");
if (failed > 0) {
  console.log("SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("ALL TESTS PASSED");
}
