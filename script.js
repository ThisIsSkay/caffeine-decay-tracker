/* Caffeine Decay Tracker — UI and state management.
 * All pharmacokinetic math lives in caffeine-model.js.
 */

(function () {
  "use strict";

  var model = window.CaffeineModel;
  if (!model) throw new Error("CaffeineModel failed to load");

  var STORAGE_KEY_ENTRIES = "caffeine-entries";
  var STORAGE_KEY_HALFLIFE = "caffeine-halflife";
  var STORAGE_KEY_PRESET = "caffeine-preset";
  var STORAGE_KEY_WEIGHT = "caffeine-weight";
  var STORAGE_KEY_VD = "caffeine-vd";
  var UPDATE_INTERVAL_MS = 10000;

  var entries = [];
  var halfLife = model.DEFAULT_HALF_LIFE_HOURS;
  var activePreset = "typical";
  var bodyWeight = null;
  var vd = model.DEFAULT_VD_L_PER_KG;
  var editingId = null;
  var updateTimer = null;
  var resizeRaf = null;
  var lastFocusedBeforeModal = null;

  var heroValue = document.getElementById("hero-value");
  var heroEmpty = document.getElementById("hero-empty");
  var heroEmptyText = document.getElementById("hero-empty-text");
  var heroAmount = document.getElementById("hero-amount");
  var heroRange = document.getElementById("hero-range");
  var heroModel = document.getElementById("hero-model");
  var dailyConsumed = document.getElementById("daily-consumed");
  var dailyEntries = document.getElementById("daily-entries");
  var halflifeInput = document.getElementById("halflife-input");
  var halflifeError = document.getElementById("halflife-error");
  var hlDec = document.getElementById("hl-dec");
  var hlInc = document.getElementById("hl-inc");
  var addForm = document.getElementById("add-form");
  var formError = document.getElementById("form-error");
  var inputAmount = document.getElementById("input-amount");
  var inputTime = document.getElementById("input-time");
  var inputDate = document.getElementById("input-date");
  var inputLabel = document.getElementById("input-label");
  var intakeList = document.getElementById("intake-list");
  var projectionList = document.getElementById("projection-list");
  var chartSvg = document.getElementById("chart-svg");
  var chartEmpty = document.getElementById("chart-empty");
  var editModal = document.getElementById("edit-modal");
  var modalClose = document.getElementById("modal-close");
  var modalCancel = document.getElementById("modal-cancel");
  var modalSave = document.getElementById("modal-save");
  var editAmount = document.getElementById("edit-amount");
  var editTime = document.getElementById("edit-time");
  var editDate = document.getElementById("edit-date");
  var editLabel = document.getElementById("edit-label");
  var editError = document.getElementById("edit-error");
  var btnClearAll = document.getElementById("btn-clear-all");
  var presetSelect = document.getElementById("preset-select");
  var presetRange = document.getElementById("preset-range");
  var inputWeight = document.getElementById("input-weight");
  var vdSelect = document.getElementById("vd-select");
  var heroConcentration = document.getElementById("hero-concentration");
  var heroConcValue = document.getElementById("hero-conc-value");

  function readStored(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value !== null ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStored(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Storage can be blocked; the current session still works.
    }
  }

  function saveEntries() {
    writeStored(STORAGE_KEY_ENTRIES, JSON.stringify(entries));
  }

  function isSafeEntryId(id) {
    return typeof id === "string" &&
      id.length > 0 &&
      id.length <= 128 &&
      /^[A-Za-z0-9._:-]+$/.test(id);
  }

  function makeRestoredId(index, usedIds) {
    var base = "restored-" + (index + 1);
    var candidate = base;
    var suffix = 2;
    while (usedIds.indexOf(candidate) !== -1) {
      candidate = base + "-" + suffix;
      suffix++;
    }
    return candidate;
  }

  function loadEntries() {
    var raw = readStored(STORAGE_KEY_ENTRIES, null);
    if (!raw) return [];

    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      var valid = [];
      var usedIds = [];
      for (var i = 0; i < parsed.length; i++) {
        var entry = parsed[i];
        if (!entry || typeof entry !== "object") continue;
        if (!model.validateDose(entry.doseMg)) continue;
        if (!model.validateTimestamp(entry.intakeTimestamp)) continue;

        var id = entry.id;
        if (!isSafeEntryId(id) || usedIds.indexOf(id) !== -1) {
          id = makeRestoredId(i, usedIds);
        }
        usedIds.push(id);

        valid.push({
          id: id,
          doseMg: entry.doseMg,
          intakeTimestamp: entry.intakeTimestamp,
          label: typeof entry.label === "string" ? entry.label.slice(0, 60) : ""
        });
      }
      return valid;
    } catch (error) {
      return [];
    }
  }

  function saveHalfLife() {
    writeStored(STORAGE_KEY_HALFLIFE, String(halfLife));
  }

  function loadHalfLife() {
    var raw = readStored(STORAGE_KEY_HALFLIFE, null);
    if (raw === null) return model.DEFAULT_HALF_LIFE_HOURS;
    var value = Number(raw);
    return model.validateHalfLife(value) ? value : model.DEFAULT_HALF_LIFE_HOURS;
  }

  function savePreset() {
    writeStored(STORAGE_KEY_PRESET, activePreset);
  }

  function loadPreset() {
    var raw = readStored(STORAGE_KEY_PRESET, "typical");
    if (raw === "custom" || model.getPresetById(raw)) return raw;
    return "typical";
  }

  function saveWeight() {
    writeStored(STORAGE_KEY_WEIGHT, bodyWeight !== null ? String(bodyWeight) : "");
  }

  function loadWeight() {
    var raw = readStored(STORAGE_KEY_WEIGHT, "");
    if (raw === "") return null;
    var value = Number(raw);
    return model.validateBodyWeight(value) ? value : null;
  }

  function saveVd() {
    writeStored(STORAGE_KEY_VD, String(vd));
  }

  function loadVd() {
    var raw = readStored(STORAGE_KEY_VD, String(model.DEFAULT_VD_L_PER_KG));
    var value = Number(raw);
    return model.validateVd(value) ? value : model.DEFAULT_VD_L_PER_KG;
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function dateToInputValue(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function timeToInputValue(date) {
    return pad2(date.getHours()) + ":" + pad2(date.getMinutes());
  }

  function inputsToTimestamp(dateStr, timeStr) {
    var dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
    var timeMatch = /^(\d{2}):(\d{2})$/.exec(timeStr || "");
    if (!dateMatch || !timeMatch) return null;

    var year = Number(dateMatch[1]);
    var month = Number(dateMatch[2]);
    var day = Number(dateMatch[3]);
    var hour = Number(timeMatch[1]);
    var minute = Number(timeMatch[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

    var date = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (!model.validateTimestamp(date.getTime())) return null;

    // Reject silently-normalized impossible dates and DST spring-forward times.
    if (date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== minute) {
      return null;
    }
    return date.getTime();
  }

  function isSameLocalDate(timestamp, referenceTimestamp) {
    var date = new Date(timestamp);
    var reference = new Date(referenceTimestamp);
    return date.getFullYear() === reference.getFullYear() &&
      date.getMonth() === reference.getMonth() &&
      date.getDate() === reference.getDate();
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(timestamp));
  }

  function formatDate(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: new Date(timestamp).getFullYear() === new Date().getFullYear() ? undefined : "numeric"
    }).format(new Date(timestamp));
  }

  function formatDose(mg) {
    return Number.isInteger(mg) ? String(mg) : mg.toFixed(1).replace(/\.0$/, "");
  }

  function setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function showError(element, message) {
    if (!element) return;
    element.textContent = message || "";
    element.hidden = !message;
  }

  function renderHero() {
    var now = Date.now();
    if (entries.length === 0) {
      heroAmount.hidden = true;
      heroEmpty.hidden = false;
      heroRange.hidden = true;
      heroConcentration.hidden = true;
      setText(heroEmptyText, "Log your first coffee below to see it decay in real time");
      return;
    }

    var sensitivity = model.calculateSensitivity(entries, now, halfLife);
    if (!sensitivity) {
      heroAmount.hidden = true;
      heroEmpty.hidden = false;
      heroRange.hidden = true;
      heroConcentration.hidden = true;
      setText(heroEmptyText, "Unable to calculate with the current saved data");
      return;
    }

    heroAmount.hidden = false;
    heroEmpty.hidden = true;
    heroRange.hidden = false;
    setText(heroValue, sensitivity.selected.toFixed(1));
    setText(heroModel, halfLife.toFixed(1));
    setText(
      heroRange,
      "Adult sensitivity reference (3–8 h): " +
      sensitivity.referenceLow.toFixed(1) + "–" + sensitivity.referenceHigh.toFixed(1) + " mg"
    );

    if (bodyWeight !== null) {
      var conc = model.calculateConcentration(sensitivity.selected, bodyWeight, vd);
      if (conc !== null) {
        heroConcentration.hidden = false;
        setText(heroConcValue, conc.toFixed(2));
      } else {
        heroConcentration.hidden = true;
      }
    } else {
      heroConcentration.hidden = true;
    }
  }

  function renderDailySummary() {
    var now = Date.now();
    setText(dailyConsumed, formatDose(model.calculateDailyConsumed(entries, now)));
    setText(dailyEntries, String(model.calculateDailyEntryCount(entries, now)));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      var replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      };
      return replacements[character];
    });
  }

  function renderIntakeList() {
    var now = Date.now();
    if (entries.length === 0) {
      intakeList.innerHTML =
        '<li class="empty-message" id="empty-intakes">' +
        '<span class="empty-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg></span>' +
        'Nothing logged yet — your intakes will appear here</li>';
      btnClearAll.hidden = true;
      return;
    }

    var sorted = entries.slice().sort(function (a, b) {
      return b.intakeTimestamp - a.intakeTimestamp;
    });

    var html = "";
    for (var i = 0; i < sorted.length; i++) {
      var entry = sorted[i];
      var isFuture = entry.intakeTimestamp > now;
      var remaining = model.calculateRemaining(entry.doseMg, entry.intakeTimestamp, now, halfLife);
      var datePrefix = isSameLocalDate(entry.intakeTimestamp, now) ? "" : formatDate(entry.intakeTimestamp) + " · ";

      html += '<li class="intake-item" data-id="' + escapeHtml(entry.id) + '">';
      html += '<div class="intake-info"><div class="intake-top">';
      html += '<span class="intake-dose">' + formatDose(entry.doseMg) + ' mg</span>';
      if (entry.label) html += '<span class="intake-label-text">' + escapeHtml(entry.label) + '</span>';
      html += '</div><div class="intake-meta">';
      html += '<span>' + datePrefix + formatTime(entry.intakeTimestamp) + '</span>';
      if (isFuture) {
        html += '<span class="intake-future">Scheduled</span>';
      } else {
        html += '<span>' + model.formatElapsed(now - entry.intakeTimestamp) + ' ago</span>';
        html += '<span class="intake-remaining">Remaining: ' + remaining.toFixed(1) + ' mg</span>';
      }
      html += '</div>';
      if (!isFuture && entry.doseMg > 0) {
        var remainingPct = Math.max(0, Math.min(100, remaining / entry.doseMg * 100));
        html += '<div class="intake-bar"><div class="intake-bar-fill" style="width:' + remainingPct.toFixed(1) + '%"></div></div>';
      }
      html += '</div><div class="intake-actions">';
      html += '<button class="btn-icon" aria-label="Edit intake" data-action="edit" data-id="' + escapeHtml(entry.id) + '" type="button">&#9998;</button>';
      html += '<button class="btn-icon danger" aria-label="Delete intake" data-action="delete" data-id="' + escapeHtml(entry.id) + '" type="button">&times;</button>';
      html += '</div></li>';
    }
    intakeList.innerHTML = html;
    btnClearAll.hidden = false;
  }

  function renderProjection() {
    var now = Date.now();
    if (entries.length === 0) {
      projectionList.innerHTML = '<div class="empty-message compact">Add an intake to project the next 12 hours</div>';
      return;
    }

    var steps = [0, 1, 2, 4, 6, 8, 10, 12];
    var series = model.generateProjectionSeries(entries, now, halfLife, steps);
    if (!series) return;

    var maxValue = 0;
    for (var i = 0; i < series.length; i++) {
      maxValue = Math.max(maxValue, series[i].remaining);
    }
    if (maxValue <= 0) maxValue = 1;

    var html = "";
    for (var j = 0; j < series.length; j++) {
      var point = series[j];
      var isNow = point.offsetHours === 0;
      var percentage = Math.max(0, Math.min(100, point.remaining / maxValue * 100));
      html += '<div class="projection-row' + (isNow ? ' now' : '') + '">';
      html += '<span class="projection-time">' + (isNow ? "Now" : formatTime(point.timestamp)) + '</span>';
      html += '<div class="projection-center">';
      html += '<div class="projection-bar-container"><div class="projection-bar" style="width:' + percentage.toFixed(1) + '%"></div></div>';
      html += '<span class="projection-range">3–8 h ref: ' + point.referenceLow.toFixed(1) + '–' + point.referenceHigh.toFixed(1) + ' mg</span>';
      html += '</div>';
      html += '<span class="projection-value">' + point.remaining.toFixed(1) + ' mg</span>';
      html += '</div>';
    }
    projectionList.innerHTML = html;
  }

  function setChartEmpty(isEmpty) {
    // SVG elements lack the HTMLElement `hidden` property, so toggle the attribute.
    if (isEmpty) {
      chartSvg.setAttribute("hidden", "");
    } else {
      chartSvg.removeAttribute("hidden");
    }
    if (chartEmpty) chartEmpty.hidden = !isEmpty;
  }

  function renderChart() {
    var now = Date.now();
    if (entries.length === 0) {
      chartSvg.innerHTML = "";
      setChartEmpty(true);
      return;
    }
    setChartEmpty(false);

    var earliest = entries[0].intakeTimestamp;
    for (var i = 1; i < entries.length; i++) {
      if (entries[i].intakeTimestamp < earliest) earliest = entries[i].intakeTimestamp;
    }

    var hoursBack = Math.max(2, Math.min(48, (now - earliest) / 3600000 + 1));
    var startTimestamp = now - hoursBack * 3600000;
    var endTimestamp = now + 12 * 3600000;
    var data = model.generateChartData(entries, startTimestamp, endTimestamp, halfLife, 200);
    if (!data || data.length === 0) {
      chartSvg.innerHTML = "";
      setChartEmpty(true);
      return;
    }

    var svgWidth = chartSvg.clientWidth || 480;
    var svgHeight = 190;
    var padLeft = 42;
    var padRight = 10;
    var padTop = 10;
    var padBottom = 26;
    var plotWidth = Math.max(1, svgWidth - padLeft - padRight);
    var plotHeight = Math.max(1, svgHeight - padTop - padBottom);

    var maxMg = 0;
    for (var k = 0; k < data.length; k++) {
      maxMg = Math.max(maxMg, data[k].remaining, data[k].fast, data[k].slow);
    }
    if (maxMg <= 0) maxMg = 50;
    maxMg = Math.ceil(maxMg / 50) * 50;

    function x(timestamp) {
      return padLeft + ((timestamp - startTimestamp) / (endTimestamp - startTimestamp)) * plotWidth;
    }
    function y(mg) {
      return padTop + plotHeight - (mg / maxMg) * plotHeight;
    }

    function pointsFor(key) {
      var points = "";
      for (var p = 0; p < data.length; p++) {
        points += x(data[p].timestamp).toFixed(2) + "," + y(data[p][key]).toFixed(2) + " ";
      }
      return points;
    }

    var selectedPoints = pointsFor("remaining");
    var fastPoints = pointsFor("fast");
    var slowPoints = pointsFor("slow");
    var areaPoints = padLeft + "," + (padTop + plotHeight) + " " + selectedPoints + (padLeft + plotWidth) + "," + (padTop + plotHeight);

    var labels = "";
    var totalHours = (endTimestamp - startTimestamp) / 3600000;
    var labelInterval = totalHours > 24 ? 6 : totalHours > 14 ? 4 : 2;
    var labelDate = new Date(startTimestamp);
    labelDate.setMinutes(0, 0, 0);
    labelDate.setHours(labelDate.getHours() + 1);
    var labelTimestamp = labelDate.getTime();
    while (labelTimestamp < endTimestamp) {
      var hour = new Date(labelTimestamp).getHours();
      if (hour % labelInterval === 0) {
        labels += '<text class="chart-axis-label" x="' + x(labelTimestamp).toFixed(2) + '" y="' + (svgHeight - 5) + '" text-anchor="middle">' + escapeHtml(formatTime(labelTimestamp).replace(":00", "")) + '</text>';
      }
      labelTimestamp += 3600000;
    }

    var yLabels = "";
    var gridLines = "";
    var yStep = maxMg <= 200 ? 50 : maxMg <= 500 ? 100 : 200;
    for (var value = 0; value <= maxMg; value += yStep) {
      yLabels += '<text class="chart-axis-label" x="' + (padLeft - 6) + '" y="' + (y(value) + 3).toFixed(2) + '" text-anchor="end">' + value + '</text>';
      if (value > 0) {
        gridLines += '<line class="chart-grid-line" x1="' + padLeft + '" y1="' + y(value).toFixed(2) + '" x2="' + (padLeft + plotWidth) + '" y2="' + y(value).toFixed(2) + '"/>';
      }
    }

    var doseLines = "";
    for (var d = 0; d < entries.length; d++) {
      var doseTimestamp = entries[d].intakeTimestamp;
      if (doseTimestamp >= startTimestamp && doseTimestamp <= endTimestamp) {
        var doseX = x(doseTimestamp).toFixed(2);
        doseLines += '<line class="chart-dose-line" x1="' + doseX + '" y1="' + padTop + '" x2="' + doseX + '" y2="' + (padTop + plotHeight) + '"/>';
      }
    }

    var nowPoint = data[0];
    for (var n = 1; n < data.length; n++) {
      if (Math.abs(data[n].timestamp - now) < Math.abs(nowPoint.timestamp - now)) {
        nowPoint = data[n];
      }
    }

    var nowX = x(now).toFixed(2);
    chartSvg.setAttribute("viewBox", "0 0 " + svgWidth + " " + svgHeight);
    chartSvg.innerHTML =
      '<defs><linearGradient id="chart-area-gradient" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#00e676" stop-opacity="0.22"/>' +
      '<stop offset="1" stop-color="#00e676" stop-opacity="0.01"/>' +
      '</linearGradient></defs>' +
      gridLines +
      '<polygon class="chart-area" points="' + areaPoints + '"/>' +
      '<polyline class="chart-line-reference fast" points="' + fastPoints + '"/>' +
      '<polyline class="chart-line-reference slow" points="' + slowPoints + '"/>' +
      '<polyline class="chart-line" points="' + selectedPoints + '"/>' +
      doseLines +
      '<line class="chart-now-line" x1="' + nowX + '" y1="' + padTop + '" x2="' + nowX + '" y2="' + (padTop + plotHeight) + '"/>' +
      '<circle class="chart-now-dot" cx="' + x(nowPoint.timestamp).toFixed(2) + '" cy="' + y(nowPoint.remaining).toFixed(2) + '" r="3.5"/>' +
      '<text class="chart-now-label" x="' + nowX + '" y="' + (padTop - 3) + '" text-anchor="middle">Now</text>' +
      labels + yLabels;
  }

  function renderAll() {
    renderHero();
    renderDailySummary();
    renderIntakeList();
    renderProjection();
    renderChart();
  }

  function setFormDefaults() {
    var now = new Date();
    inputDate.value = dateToInputValue(now);
    inputTime.value = timeToInputValue(now);
    inputAmount.value = "";
    inputLabel.value = "";
    showError(formError, "");
  }

  function setHalfLife(value) {
    var parsed = Number(value);
    var rounded = Math.round(parsed * 10) / 10;
    if (!model.validateHalfLife(parsed) || !model.validateHalfLife(rounded)) {
      halflifeInput.value = halfLife.toFixed(1);
      showError(halflifeError, "Enter a half-life of at least 0.1 hours.");
      return false;
    }

    halfLife = rounded;
    halflifeInput.value = halfLife.toFixed(1);
    showError(halflifeError, "");
    saveHalfLife();

    var matchedPreset = false;
    for (var i = 0; i < model.HALF_LIFE_PRESETS.length; i++) {
      if (model.HALF_LIFE_PRESETS[i].halfLife === rounded &&
          model.HALF_LIFE_PRESETS[i].id === activePreset) {
        matchedPreset = true;
        break;
      }
    }
    if (!matchedPreset) {
      activePreset = "custom";
      presetSelect.value = "custom";
      setText(presetRange, "Set half-life manually above");
      savePreset();
    }

    renderAll();
    return true;
  }

  hlDec.addEventListener("click", function () {
    setHalfLife(Math.max(0.1, halfLife - 0.5));
  });
  hlInc.addEventListener("click", function () {
    setHalfLife(halfLife + 0.5);
  });
  halflifeInput.addEventListener("change", function () {
    setHalfLife(halflifeInput.value);
  });

  presetSelect.addEventListener("change", function () {
    var selected = presetSelect.value;
    activePreset = selected;
    savePreset();
    if (selected === "custom") {
      setText(presetRange, "Set half-life manually above");
      return;
    }
    var preset = model.getPresetById(selected);
    if (preset) {
      setHalfLife(preset.halfLife);
      setText(presetRange, "Literature range: " + preset.range);
    }
  });

  inputWeight.addEventListener("change", function () {
    var raw = inputWeight.value.trim();
    if (raw === "") {
      bodyWeight = null;
    } else {
      var value = Number(raw);
      if (model.validateBodyWeight(value)) {
        bodyWeight = value;
      } else {
        bodyWeight = null;
        inputWeight.value = "";
      }
    }
    saveWeight();
    renderAll();
  });

  vdSelect.addEventListener("change", function () {
    vd = Number(vdSelect.value);
    saveVd();
    renderAll();
  });

  function validateEntryForm(amountValue, dateValue, timeValue) {
    var dose = Number(amountValue);
    if (!model.validateDose(dose) || dose <= 0) {
      return { error: "Enter a caffeine amount above 0 mg and no more than 5000 mg." };
    }

    var timestamp = inputsToTimestamp(dateValue, timeValue);
    if (timestamp === null) {
      return { error: "Enter a valid local date and time. Some clock times do not exist during daylight-saving changes." };
    }

    return { doseMg: dose, intakeTimestamp: timestamp };
  }

  var quickAdd = document.getElementById("quick-add");
  if (quickAdd) {
    quickAdd.addEventListener("click", function (event) {
      var chip = event.target.closest("[data-mg]");
      if (!chip) return;
      inputAmount.value = chip.getAttribute("data-mg");
      inputLabel.value = chip.getAttribute("data-label");
      showError(formError, "");
      inputAmount.focus();
    });
  }

  addForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var result = validateEntryForm(inputAmount.value, inputDate.value, inputTime.value);
    if (result.error) {
      showError(formError, result.error);
      return;
    }

    entries.push({
      id: generateId(),
      doseMg: result.doseMg,
      intakeTimestamp: result.intakeTimestamp,
      label: inputLabel.value.trim().slice(0, 60)
    });

    saveEntries();
    setFormDefaults();
    inputAmount.focus();
    renderAll();
  });

  intakeList.addEventListener("click", function (event) {
    var button = event.target.closest("[data-action]");
    if (!button) return;

    var action = button.getAttribute("data-action");
    var id = button.getAttribute("data-id");
    if (action === "delete") {
      entries = entries.filter(function (entry) { return entry.id !== id; });
      saveEntries();
      renderAll();
    } else if (action === "edit") {
      openEditModal(id, button);
    }
  });

  btnClearAll.addEventListener("click", function () {
    if (!confirm("Clear all caffeine entries?")) return;
    entries = [];
    saveEntries();
    renderAll();
  });

  function openEditModal(id, trigger) {
    var entry = entries.find(function (candidate) { return candidate.id === id; });
    if (!entry) return;

    editingId = id;
    lastFocusedBeforeModal = trigger || document.activeElement;
    var date = new Date(entry.intakeTimestamp);
    editAmount.value = entry.doseMg;
    editDate.value = dateToInputValue(date);
    editTime.value = timeToInputValue(date);
    editLabel.value = entry.label || "";
    showError(editError, "");
    editModal.hidden = false;
    editModal.classList.add("visible");
    document.body.classList.add("modal-open");
    editAmount.focus();
  }

  function closeEditModal() {
    editModal.classList.remove("visible");
    editModal.hidden = true;
    document.body.classList.remove("modal-open");
    editingId = null;
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === "function") {
      lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
  }

  modalClose.addEventListener("click", closeEditModal);
  modalCancel.addEventListener("click", closeEditModal);
  editModal.addEventListener("click", function (event) {
    if (event.target === editModal) closeEditModal();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !editModal.hidden) closeEditModal();
  });

  modalSave.addEventListener("click", function () {
    if (!editingId) return;
    var result = validateEntryForm(editAmount.value, editDate.value, editTime.value);
    if (result.error) {
      showError(editError, result.error);
      return;
    }

    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === editingId) {
        entries[i].doseMg = result.doseMg;
        entries[i].intakeTimestamp = result.intakeTimestamp;
        entries[i].label = editLabel.value.trim().slice(0, 60);
        break;
      }
    }

    saveEntries();
    closeEditModal();
    renderAll();
  });

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

  window.addEventListener("resize", function () {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(function () {
      resizeRaf = null;
      renderChart();
    });
  });

  var WATCHED_KEYS = [
    STORAGE_KEY_ENTRIES, STORAGE_KEY_HALFLIFE,
    STORAGE_KEY_PRESET, STORAGE_KEY_WEIGHT, STORAGE_KEY_VD
  ];

  window.addEventListener("storage", function (event) {
    if (event.key !== null && WATCHED_KEYS.indexOf(event.key) === -1) {
      return;
    }

    if (!editModal.hidden) closeEditModal();
    entries = loadEntries();
    halfLife = loadHalfLife();
    activePreset = loadPreset();
    bodyWeight = loadWeight();
    vd = loadVd();
    halflifeInput.value = halfLife.toFixed(1);
    presetSelect.value = activePreset;
    inputWeight.value = bodyWeight !== null ? bodyWeight : "";
    vdSelect.value = vd.toFixed(2);
    var preset = model.getPresetById(activePreset);
    setText(presetRange, preset ? "Literature range: " + preset.range : "Set half-life manually above");
    saveEntries();
    renderAll();
  });

  entries = loadEntries();
  halfLife = loadHalfLife();
  activePreset = loadPreset();
  bodyWeight = loadWeight();
  vd = loadVd();
  saveEntries();
  halflifeInput.value = halfLife.toFixed(1);
  presetSelect.value = activePreset;
  inputWeight.value = bodyWeight !== null ? bodyWeight : "";
  vdSelect.value = vd.toFixed(2);
  var initPreset = model.getPresetById(activePreset);
  setText(presetRange, initPreset ? "Literature range: " + initPreset.range : "Set half-life manually above");
  setFormDefaults();
  renderAll();
  startUpdates();
})();
