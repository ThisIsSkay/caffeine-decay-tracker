/* Caffeine Decay Tracker — UI and state management.
 *
 * All caffeine math lives in caffeine-model.js.
 * This file handles DOM, persistence, and user interaction.
 */

(function () {

  // ── Constants ───────────────────────────────────────────────

  var STORAGE_KEY_ENTRIES = "caffeine-entries";
  var STORAGE_KEY_HALFLIFE = "caffeine-halflife";
  var DEFAULT_HALFLIFE = 5.0;
  var UPDATE_INTERVAL_MS = 10000;

  // ── DOM references ──────────────────────────────────────────

  var heroValue = document.getElementById("hero-value");
  var heroEmpty = document.getElementById("hero-empty");
  var heroAmount = document.getElementById("hero-amount");
  var dailyConsumed = document.getElementById("daily-consumed");
  var dailyEntries = document.getElementById("daily-entries");
  var halflifeInput = document.getElementById("halflife-input");
  var hlDec = document.getElementById("hl-dec");
  var hlInc = document.getElementById("hl-inc");
  var addForm = document.getElementById("add-form");
  var inputAmount = document.getElementById("input-amount");
  var inputTime = document.getElementById("input-time");
  var inputDate = document.getElementById("input-date");
  var inputLabel = document.getElementById("input-label");
  var intakeList = document.getElementById("intake-list");
  var emptyIntakes = document.getElementById("empty-intakes");
  var projectionList = document.getElementById("projection-list");
  var chartSvg = document.getElementById("chart-svg");
  var editModal = document.getElementById("edit-modal");
  var modalClose = document.getElementById("modal-close");
  var modalCancel = document.getElementById("modal-cancel");
  var modalSave = document.getElementById("modal-save");
  var editAmount = document.getElementById("edit-amount");
  var editTime = document.getElementById("edit-time");
  var editDate = document.getElementById("edit-date");
  var editLabel = document.getElementById("edit-label");

  // ── State ───────────────────────────────────────────────────

  var entries = [];
  var halfLife = DEFAULT_HALFLIFE;
  var editingId = null;

  // ── localStorage helpers ────────────────────────────────────

  function readStored(key, fallback) {
    try {
      var val = localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeStored(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // storage unavailable — app still works this session
    }
  }

  // ── Entry persistence ───────────────────────────────────────

  function saveEntries() {
    writeStored(STORAGE_KEY_ENTRIES, JSON.stringify(entries));
  }

  function loadEntries() {
    var raw = readStored(STORAGE_KEY_ENTRIES, null);
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var valid = [];
      for (var i = 0; i < parsed.length; i++) {
        var e = parsed[i];
        if (e && typeof e === "object" &&
            typeof e.id === "string" &&
            typeof e.doseMg === "number" && Number.isFinite(e.doseMg) && e.doseMg >= 0 &&
            typeof e.intakeTimestamp === "number" && Number.isFinite(e.intakeTimestamp)) {
          valid.push({
            id: e.id,
            doseMg: e.doseMg,
            intakeTimestamp: e.intakeTimestamp,
            label: typeof e.label === "string" ? e.label : ""
          });
        }
      }
      return valid;
    } catch (e) {
      return [];
    }
  }

  function saveHalfLife() {
    writeStored(STORAGE_KEY_HALFLIFE, String(halfLife));
  }

  function loadHalfLife() {
    var raw = readStored(STORAGE_KEY_HALFLIFE, null);
    if (raw === null) return DEFAULT_HALFLIFE;
    var n = parseFloat(raw);
    if (!validateHalfLife(n)) return DEFAULT_HALFLIFE;
    return n;
  }

  // ── ID generation ───────────────────────────────────────────

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── Date/time helpers ───────────────────────────────────────

  function dateToInputValue(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function timeToInputValue(d) {
    var h = String(d.getHours()).padStart(2, "0");
    var m = String(d.getMinutes()).padStart(2, "0");
    return h + ":" + m;
  }

  function inputsToTimestamp(dateStr, timeStr) {
    var parts = dateStr.split("-");
    var timeParts = timeStr.split(":");
    var d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
      parseInt(timeParts[0], 10),
      parseInt(timeParts[1], 10),
      0, 0
    );
    return d.getTime();
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var h = d.getHours();
    var m = String(d.getMinutes()).padStart(2, "0");
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 || 12;
    return h12 + ":" + m + " " + ampm;
  }

  function formatDate(ts) {
    var d = new Date(ts);
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return d.getDate() + " " + months[d.getMonth()];
  }

  function isToday(ts) {
    var now = new Date();
    var d = new Date(ts);
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
  }

  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  // ── Rendering ───────────────────────────────────────────────

  function renderHero() {
    var now = Date.now();
    if (entries.length === 0) {
      heroAmount.style.display = "none";
      heroEmpty.style.display = "";
      return;
    }
    heroAmount.style.display = "";
    heroEmpty.style.display = "none";

    var total = calculateTotalRemaining(entries, now, halfLife);
    if (total === null) total = 0;
    setText(heroValue, total.toFixed(1));
  }

  function renderDailySummary() {
    var now = Date.now();
    var consumed = calculateDailyConsumed(entries, now);
    setText(dailyConsumed, Math.round(consumed).toString());

    var todayCount = 0;
    for (var i = 0; i < entries.length; i++) {
      if (isToday(entries[i].intakeTimestamp)) todayCount++;
    }
    setText(dailyEntries, todayCount.toString());
  }

  function renderIntakeList() {
    var now = Date.now();
    if (entries.length === 0) {
      emptyIntakes.style.display = "";
      var items = intakeList.querySelectorAll(".intake-item");
      for (var k = 0; k < items.length; k++) items[k].remove();
      return;
    }
    emptyIntakes.style.display = "none";

    var sorted = entries.slice().sort(function (a, b) {
      return b.intakeTimestamp - a.intakeTimestamp;
    });

    var html = "";
    for (var i = 0; i < sorted.length; i++) {
      var e = sorted[i];
      var remaining = calculateRemaining(e.doseMg, e.intakeTimestamp, now, halfLife);
      if (remaining === null) remaining = 0;
      var elapsed = now - e.intakeTimestamp;
      var isFuture = elapsed < 0;
      var elapsedStr = formatElapsed(elapsed);
      var dateStr = isToday(e.intakeTimestamp) ? "" : formatDate(e.intakeTimestamp) + " · ";

      html += '<li class="intake-item" data-id="' + e.id + '">';
      html += '<div class="intake-info">';
      html += '<div class="intake-top">';
      html += '<span class="intake-dose">' + e.doseMg + ' mg</span>';
      if (e.label) {
        html += '<span class="intake-label-text">' + escapeHtml(e.label) + '</span>';
      }
      html += '</div>';
      html += '<div class="intake-meta">';
      html += '<span>' + dateStr + formatTime(e.intakeTimestamp) + '</span>';
      if (isFuture) {
        html += '<span class="intake-future">Scheduled</span>';
      } else {
        html += '<span>' + elapsedStr + ' ago</span>';
        html += '<span class="intake-remaining">Remaining: ' + remaining.toFixed(1) + ' mg</span>';
      }
      html += '</div></div>';
      html += '<div class="intake-actions">';
      html += '<button class="btn-icon" aria-label="Edit intake" data-action="edit" data-id="' + e.id + '" type="button">&#9998;</button>';
      html += '<button class="btn-icon danger" aria-label="Delete intake" data-action="delete" data-id="' + e.id + '" type="button">&times;</button>';
      html += '</div></li>';
    }
    intakeList.innerHTML = html + '<li class="empty-message" id="empty-intakes" style="display:none">No caffeine intakes recorded</li>';
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderProjection() {
    var now = Date.now();
    if (entries.length === 0) {
      projectionList.innerHTML = '<div class="empty-message">Add intakes to see projections</div>';
      return;
    }

    var steps = [0, 1, 2, 4, 6, 8, 10, 12];
    var series = generateProjectionSeries(entries, now, halfLife, steps);
    if (!series) return;

    var maxVal = 0;
    for (var i = 0; i < series.length; i++) {
      if (series[i].remaining > maxVal) maxVal = series[i].remaining;
    }
    if (maxVal === 0) maxVal = 1;

    var html = "";
    for (var j = 0; j < series.length; j++) {
      var s = series[j];
      var isNow = s.offsetHours === 0;
      var rowClass = isNow ? "projection-row now" : "projection-row";
      var timeLabel = isNow ? "Now" : formatTime(s.timestamp);
      var pct = (s.remaining / maxVal) * 100;

      html += '<div class="' + rowClass + '">';
      html += '<span class="projection-time">' + timeLabel + '</span>';
      html += '<div class="projection-bar-container"><div class="projection-bar" style="width:' + pct.toFixed(1) + '%"></div></div>';
      html += '<span class="projection-value">' + Math.round(s.remaining) + ' mg</span>';
      html += '</div>';
    }
    projectionList.innerHTML = html;
  }

  function renderChart() {
    var now = Date.now();
    if (entries.length === 0) {
      chartSvg.innerHTML = "";
      return;
    }

    var earliest = entries[0].intakeTimestamp;
    for (var i = 1; i < entries.length; i++) {
      if (entries[i].intakeTimestamp < earliest) earliest = entries[i].intakeTimestamp;
    }

    var hoursBack = Math.max(2, (now - earliest) / (1000 * 60 * 60) + 1);
    var startTs = now - hoursBack * 60 * 60 * 1000;
    var endTs = now + 12 * 60 * 60 * 1000;
    var data = generateChartData(entries, startTs, endTs, halfLife, 200);
    if (!data || data.length === 0) return;

    var svgW = chartSvg.clientWidth || 480;
    var svgH = 180;
    var padL = 40, padR = 10, padT = 10, padB = 24;
    var plotW = svgW - padL - padR;
    var plotH = svgH - padT - padB;

    var maxMg = 0;
    for (var k = 0; k < data.length; k++) {
      if (data[k].remaining > maxMg) maxMg = data[k].remaining;
    }
    if (maxMg === 0) maxMg = 100;
    maxMg = Math.ceil(maxMg / 50) * 50;

    function x(ts) { return padL + ((ts - startTs) / (endTs - startTs)) * plotW; }
    function y(mg) { return padT + plotH - (mg / maxMg) * plotH; }

    var linePts = "";
    var areaPts = padL + "," + (padT + plotH) + " ";
    for (var d = 0; d < data.length; d++) {
      var px = x(data[d].timestamp);
      var py = y(data[d].remaining);
      linePts += px + "," + py + " ";
      areaPts += px + "," + py + " ";
    }
    areaPts += (padL + plotW) + "," + (padT + plotH);

    var nowX = x(now);

    var axisLabels = "";
    var hourStep = (endTs - startTs) / (1000 * 60 * 60);
    var labelInterval = hourStep > 18 ? 4 : hourStep > 10 ? 3 : 2;
    var firstHour = new Date(startTs);
    firstHour.setMinutes(0, 0, 0);
    firstHour.setHours(firstHour.getHours() + 1);
    var labelTs = firstHour.getTime();
    while (labelTs < endTs) {
      var ld = new Date(labelTs);
      if (ld.getHours() % labelInterval === 0) {
        var lx = x(labelTs);
        var h12 = ld.getHours() % 12 || 12;
        var ap = ld.getHours() >= 12 ? "p" : "a";
        axisLabels += '<text class="chart-axis-label" x="' + lx + '" y="' + (svgH - 4) + '" text-anchor="middle">' + h12 + ap + '</text>';
      }
      labelTs += 60 * 60 * 1000;
    }

    var yLabels = "";
    var yStep = maxMg <= 200 ? 50 : maxMg <= 500 ? 100 : 200;
    for (var yv = 0; yv <= maxMg; yv += yStep) {
      var yy = y(yv);
      yLabels += '<text class="chart-axis-label" x="' + (padL - 6) + '" y="' + (yy + 3) + '" text-anchor="end">' + yv + '</text>';
    }

    var doseLines = "";
    for (var di = 0; di < entries.length; di++) {
      var dts = entries[di].intakeTimestamp;
      if (dts >= startTs && dts <= endTs) {
        var dx = x(dts);
        doseLines += '<line class="chart-dose-line" x1="' + dx + '" y1="' + padT + '" x2="' + dx + '" y2="' + (padT + plotH) + '"/>';
      }
    }

    chartSvg.setAttribute("viewBox", "0 0 " + svgW + " " + svgH);
    chartSvg.innerHTML =
      '<polygon class="chart-area" points="' + areaPts + '"/>' +
      '<polyline class="chart-line" points="' + linePts + '"/>' +
      doseLines +
      '<line class="chart-now-line" x1="' + nowX + '" y1="' + padT + '" x2="' + nowX + '" y2="' + (padT + plotH) + '"/>' +
      axisLabels + yLabels;
  }

  function renderAll() {
    renderHero();
    renderDailySummary();
    renderIntakeList();
    renderProjection();
    renderChart();
  }

  // ── Form defaults ──────────────────────────────────────────

  function setFormDefaults() {
    var now = new Date();
    inputDate.value = dateToInputValue(now);
    inputTime.value = timeToInputValue(now);
    inputAmount.value = "";
    inputLabel.value = "";
  }

  // ── Half-life handling ─────────────────────────────────────

  function setHalfLife(val) {
    var n = parseFloat(val);
    if (!validateHalfLife(n)) return;
    halfLife = Math.round(n * 10) / 10;
    halflifeInput.value = halfLife.toFixed(1);
    saveHalfLife();
    renderAll();
  }

  hlDec.addEventListener("click", function () {
    setHalfLife(halfLife - 0.5);
  });

  hlInc.addEventListener("click", function () {
    setHalfLife(halfLife + 0.5);
  });

  halflifeInput.addEventListener("change", function () {
    setHalfLife(halflifeInput.value);
  });

  // ── Add intake ─────────────────────────────────────────────

  addForm.addEventListener("submit", function (e) {
    e.preventDefault();

    var mg = parseFloat(inputAmount.value);
    if (!Number.isFinite(mg) || mg <= 0 || mg > 5000) return;

    var dateStr = inputDate.value;
    var timeStr = inputTime.value;
    if (!dateStr || !timeStr) return;

    var ts = inputsToTimestamp(dateStr, timeStr);
    if (!Number.isFinite(ts)) return;

    entries.push({
      id: generateId(),
      doseMg: Math.round(mg),
      intakeTimestamp: ts,
      label: inputLabel.value.trim()
    });

    saveEntries();
    setFormDefaults();
    inputAmount.focus();
    renderAll();
  });

  // ── Intake list actions ────────────────────────────────────

  intakeList.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;

    var action = btn.getAttribute("data-action");
    var id = btn.getAttribute("data-id");

    if (action === "delete") {
      entries = entries.filter(function (en) { return en.id !== id; });
      saveEntries();
      renderAll();
    } else if (action === "edit") {
      openEditModal(id);
    }
  });

  // ── Edit modal ─────────────────────────────────────────────

  function openEditModal(id) {
    var entry = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === id) { entry = entries[i]; break; }
    }
    if (!entry) return;

    editingId = id;
    var d = new Date(entry.intakeTimestamp);
    editAmount.value = entry.doseMg;
    editDate.value = dateToInputValue(d);
    editTime.value = timeToInputValue(d);
    editLabel.value = entry.label || "";
    editModal.classList.add("visible");
    editAmount.focus();
  }

  function closeEditModal() {
    editModal.classList.remove("visible");
    editingId = null;
  }

  modalClose.addEventListener("click", closeEditModal);
  modalCancel.addEventListener("click", closeEditModal);

  editModal.addEventListener("click", function (e) {
    if (e.target === editModal) closeEditModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && editModal.classList.contains("visible")) {
      closeEditModal();
    }
  });

  modalSave.addEventListener("click", function () {
    if (!editingId) return;

    var mg = parseFloat(editAmount.value);
    if (!Number.isFinite(mg) || mg <= 0 || mg > 5000) return;

    var dateStr = editDate.value;
    var timeStr = editTime.value;
    if (!dateStr || !timeStr) return;

    var ts = inputsToTimestamp(dateStr, timeStr);
    if (!Number.isFinite(ts)) return;

    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === editingId) {
        entries[i].doseMg = Math.round(mg);
        entries[i].intakeTimestamp = ts;
        entries[i].label = editLabel.value.trim();
        break;
      }
    }

    saveEntries();
    closeEditModal();
    renderAll();
  });

  // ── Periodic update ────────────────────────────────────────

  var updateTimer = null;

  function startUpdates() {
    if (updateTimer) clearInterval(updateTimer);
    updateTimer = setInterval(renderAll, UPDATE_INTERVAL_MS);
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      renderAll();
      startUpdates();
    }
  });

  // ── Resize handler for chart ───────────────────────────────

  var resizeRaf = null;
  window.addEventListener("resize", function () {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(function () {
      resizeRaf = null;
      renderChart();
    });
  });

  // ── Initialise ─────────────────────────────────────────────

  entries = loadEntries();
  halfLife = loadHalfLife();
  halflifeInput.value = halfLife.toFixed(1);
  setFormDefaults();
  renderAll();
  startUpdates();

})();
