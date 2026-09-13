const API_URL = "https://api.raporty.pse.pl/api/price-fcst";
const REFRESH_MS = 60_000;
const ALERT_THRESHOLD = 100;
const DEFAULT_FALL_THRESHOLD = 550;
const DEFAULT_RISE_THRESHOLD = 650;
const state = {
  date: today(),
  range: "minute",
  records: [],
  timer: null,
  fallThreshold: Number(localStorage.getItem("fallThreshold")) || DEFAULT_FALL_THRESHOLD,
  riseThreshold: Number(localStorage.getItem("riseThreshold")) || DEFAULT_RISE_THRESHOLD
};
let wakeLock = null;
let previousCurrentPrice = null;
let audioContext = null;
let alertsEnabled = false;
let priceAlarmTriggered = false;

const $ = (id) => document.getElementById(id);
function today() { return new Date().toISOString().slice(0, 10); }
function setStatus(text, kind) {
  const el = $("connection-status");
  el.textContent = text;
  el.className = `status status-${kind}`;
}
function number(value) {
  const result = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(result) ? result : null;
}
function normalizeRecord(raw) {
  const price = number(raw.cen_fcst ?? raw.cen_cost ?? raw.price ?? raw.value);
  const time = raw.dtime ?? raw.date ?? raw.timestamp ?? raw.periodStart;
  if (price === null || !time) return null;
  return { time: new Date(time), price, period: raw.period ?? "" };
}
async function fetchRecords() {
  const filter = encodeURIComponent(`business_date eq '${state.date}'`);
  const response = await fetch(`${API_URL}?%24filter=${filter}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`API PSE zwróciło HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : (payload.value ?? payload.data ?? []);
  return rows.map(normalizeRecord).filter(Boolean).sort((a, b) => a.time - b.time);
}
function groupRecords(records) {
  if (state.range === "minute") return records;
  const groups = new Map();
  for (const record of records) {
    const key = state.range === "hour"
      ? record.time.toISOString().slice(0, 13)
      : state.range === "day" ? record.time.toISOString().slice(0, 10)
      : record.time.toISOString().slice(0, 7);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    time: group[0].time,
    price: group.reduce((sum, item) => sum + item.price, 0) / group.length,
    period: `${group.length} odczytów`
  }));
}
function formatTime(date) { return date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }); }
function render() {
  const records = groupRecords(state.records);
  $("record-count").textContent = `${records.length} punktów`;
  const now = new Date();
  const current = state.records.find((item) => item.time > now) ?? state.records.at(-1);
  $("current-price").textContent = current ? current.price.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) : "—";
  $("current-period").textContent = current ? (current.period || formatTime(current.time)) : "Brak odczytu";
  $("chart-title").textContent = "Ceny energii w dobie";
  $("data-table").innerHTML = records.slice(-12).reverse().map((r) => `<tr><td>${r.period || formatTime(r.time)}</td><td>${r.price.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}</td></tr>`).join("") || '<tr><td colspan="2" class="muted">Brak danych dla wybranego dnia</td></tr>';
  drawChart(records);
}
function setAlertStatus(text) {
  $("alert-status").textContent = `Alerty: ${text}`;
}
async function enableAlerts() {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Audio nie jest obsługiwane");
  audioContext ??= new AudioContextClass();
  await audioContext.resume();
  alertsEnabled = true;
  $("alert-button").textContent = "Alerty włączone";
  $("alert-button").classList.add("is-active");
  $("alert-button").setAttribute("aria-pressed", "true");
  setAlertStatus("włączone (próg 100 PLN)");
}
function notifyPriceChange(change) {
  if (!alertsEnabled) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = change > 0 ? 880 : 440;
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.22, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.55);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.6);
  if ("vibrate" in navigator) navigator.vibrate([180, 100, 180]);
}
function playPriceAlarm() {
  if (!alertsEnabled || !audioContext) return false;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.03);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  const stopAt = audioContext.currentTime + 3;
  const pulse = setInterval(() => {
    oscillator.frequency.value = oscillator.frequency.value === 660 ? 880 : 660;
  }, 300);
  oscillator.stop(stopAt);
  oscillator.addEventListener("ended", () => clearInterval(pulse), { once: true });
  return true;
}
function playPricePing() {
  if (!alertsEnabled || !audioContext) return false;
  const now = audioContext.currentTime;
  [880, 1175, 880, 1175, 880].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.001, now + index * 0.28);
    gain.gain.exponentialRampToValueAtTime(0.18, now + index * 0.28 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.28 + 0.22);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now + index * 0.28);
    oscillator.stop(now + index * 0.28 + 0.24);
  });
  if ("vibrate" in navigator) navigator.vibrate(80);
  return true;
}
function drawChart(records) {
  const svg = $("chart");
  if (!records.length) { svg.innerHTML = ""; return; }
  const width = 900, height = 300, pad = 38;
  const min = Math.min(...records.map((r) => r.price)), max = Math.max(...records.map((r) => r.price));
  const span = max - min || 1;
  const point = (r, i) => [pad + (i / Math.max(records.length - 1, 1)) * (width - pad * 2), height - pad - ((r.price - min) / span) * (height - pad * 2)];
  const points = records.map(point);
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const yTicks = [0, .25, .5, .75, 1].map((ratio) => {
    const y = height - pad - ratio * (height - pad * 2);
    const value = min + ratio * span;
    return `<line class="grid-line" x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}"/><text class="axis-label" x="4" y="${y + 4}">${value.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}</text>`;
  }).join("");
  const xTicks = [0, .25, .5, .75, 1].map((ratio) => {
    const index = Math.min(records.length - 1, Math.round(ratio * (records.length - 1)));
    const [x] = points[index];
    return `<text class="axis-label" text-anchor="middle" x="${x}" y="${height - 12}">${formatTime(records[index].time)}</text>`;
  }).join("");
  const pointMarks = points.map(([x, y], index) => `<circle class="chart-point" cx="${x}" cy="${y}" r="4" tabindex="0" data-index="${index}"></circle>`).join("");
  svg.innerHTML = `<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#66d9b4" stop-opacity=".28"/><stop offset="1" stop-color="#66d9b4" stop-opacity="0"/></linearGradient></defs>
    ${yTicks}<line class="chart-axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"/><line class="chart-axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/>
    <polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${line}"/>
    ${pointMarks}${xTicks}<text class="axis-title" text-anchor="middle" x="${width / 2}" y="${height - 1}">Czas</text><text class="axis-title" text-anchor="middle" transform="translate(12 ${height / 2}) rotate(-90)">Cena [PLN/MWh]</text>`;
  const tooltip = $("chart-tooltip");
  svg.querySelectorAll(".chart-point").forEach((pointElement) => {
    const show = (event) => {
      const record = records[Number(pointElement.dataset.index)];
      tooltip.textContent = `${formatTime(record.time)} — ${record.price.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} PLN/MWh`;
      tooltip.hidden = false;
      const x = Number.isFinite(event.offsetX) ? event.offsetX : pointElement.cx.baseVal.value;
      const y = Number.isFinite(event.offsetY) ? event.offsetY : pointElement.cy.baseVal.value;
      tooltip.style.left = `${Math.max(4, Math.min(x + 12, svg.clientWidth - 190))}px`;
      tooltip.style.top = `${Math.max(y - 42, 4)}px`;
    };
    pointElement.addEventListener("pointerenter", show);
    pointElement.addEventListener("focus", show);
    pointElement.addEventListener("pointerleave", () => { tooltip.hidden = true; });
    pointElement.addEventListener("blur", () => { tooltip.hidden = true; });
  });
}
async function load() {
  setStatus("Pobieranie…", "loading");
  try {
    state.records = await fetchRecords();
    render();
    const current = state.records.find((item) => item.time > new Date()) ?? state.records.at(-1);
    if (current && previousCurrentPrice !== null) {
      const change = current.price - previousCurrentPrice;
      if (Math.abs(change) >= ALERT_THRESHOLD) notifyPriceChange(change);
      if (!priceAlarmTriggered && previousCurrentPrice > state.fallThreshold && current.price <= state.fallThreshold) {
        playPriceAlarm();
        priceAlarmTriggered = true;
      } else if (current.price > state.fallThreshold) {
        priceAlarmTriggered = false;
      }
      if (previousCurrentPrice <= state.riseThreshold && current.price > state.riseThreshold) {
        playPricePing();
      }
    }
    if (current) previousCurrentPrice = current.price;
    const now = new Date().toLocaleTimeString("pl-PL");
    $("updated-at").textContent = `Ostatnia synchronizacja: ${now}`;
    $("footer-time").textContent = now;
    setStatus("Połączono z PSE", "ok");
  } catch (error) {
    setStatus("Błąd połączenia", "error");
    $("updated-at").textContent = error.message;
  }
}
$("date-input").value = state.date;
$("fall-threshold").value = state.fallThreshold;
$("rise-threshold").value = state.riseThreshold;
$("date-input").addEventListener("change", (event) => { state.date = event.target.value; load(); });
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  document.querySelector(".tab.active").classList.remove("active");
  button.classList.add("active"); state.range = button.dataset.range; render();
}));
function updateWakeLockStatus(text) {
  $("wake-lock-status").textContent = `Ekran: ${text}`;
}
async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    updateWakeLockStatus("standardowo (brak obsługi)");
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    updateWakeLockStatus("aktywny");
    wakeLock.addEventListener("release", () => updateWakeLockStatus("standardowo"));
  } catch {
    updateWakeLockStatus("standardowo");
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") requestWakeLock();
});
function markButton(button, text) {
  button.classList.add("is-active");
  button.textContent = text;
  setTimeout(() => button.classList.remove("is-active"), 1200);
}
$("refresh-button").addEventListener("click", async () => {
  markButton($("refresh-button"), "Pobieranie…");
  setStatus("Pobieranie…", "loading");
  await load();
  markButton($("refresh-button"), "Dane pobrane");
});
$("reload-page-button").addEventListener("click", () => {
  markButton($("reload-page-button"), "Odświeżanie…");
  setTimeout(() => window.location.reload(), 100);
});
$("alert-button").addEventListener("click", async () => {
  try {
    await enableAlerts();
    markButton($("alert-button"), "Alerty włączone");
  } catch {
    setAlertStatus("niedostępne");
  }
});
$("test-alarm-button").addEventListener("click", async () => {
  try {
    await enableAlerts();
    if (playPriceAlarm()) setAlertStatus("test alarmu — odtwarzanie");
  } catch {
    setAlertStatus("niedostępne");
  }
});
$("test-ping-button").addEventListener("click", async () => {
  try {
    await enableAlerts();
    setAlertStatus("test pingu — odtwarzanie");
    playPricePing();
    markButton($("test-ping-button"), "Ping odtworzony");
  } catch {
    setAlertStatus("niedostępne");
  }
});
$("save-thresholds").addEventListener("click", () => {
  const fall = Number($("fall-threshold").value);
  const rise = Number($("rise-threshold").value);
  if (!Number.isFinite(fall) || !Number.isFinite(rise) || fall < 0 || rise < 0) return;
  state.fallThreshold = fall;
  state.riseThreshold = rise;
  localStorage.setItem("fallThreshold", String(fall));
  localStorage.setItem("riseThreshold", String(rise));
  setAlertStatus(`progi: spadek ≤${fall}, wzrost >${rise}`);
  markButton($("save-thresholds"), "Progi zapisane");
});
requestWakeLock();
load();
state.timer = setInterval(load, REFRESH_MS);
