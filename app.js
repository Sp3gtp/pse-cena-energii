const API_URL = "https://api.raporty.pse.pl/api/price-fcst";
const REFRESH_MS = 60_000;
const state = { date: today(), range: "minute", records: [], timer: null };
let wakeLock = null;

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
  $("chart-title").textContent = { minute: "Ceny w bieżącym dniu", hour: "Średnia cena godzinowa", day: "Średnia cena dzienna", month: "Średnia cena miesięczna" }[state.range];
  $("data-table").innerHTML = records.slice(-12).reverse().map((r) => `<tr><td>${r.period || formatTime(r.time)}</td><td>${r.price.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}</td></tr>`).join("") || '<tr><td colspan="2" class="muted">Brak danych dla wybranego dnia</td></tr>';
  drawChart(records);
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
  svg.innerHTML = `<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#66d9b4" stop-opacity=".28"/><stop offset="1" stop-color="#66d9b4" stop-opacity="0"/></linearGradient></defs>
    <line class="grid-line" x1="${pad}" y1="${pad}" x2="${width - pad}" y2="${pad}"/><line class="grid-line" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/>
    <polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${line}"/>
    <text class="axis-label" x="${pad}" y="${pad - 10}">${max.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}</text><text class="axis-label" x="${pad}" y="${height - 8}">${min.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}</text>
    <text class="axis-label" x="${pad}" y="${height - 8}">${formatTime(records[0].time)}</text><text class="axis-label" x="${width - pad - 36}" y="${height - 8}">${formatTime(records.at(-1).time)}</text>`;
}
async function load() {
  setStatus("Pobieranie…", "loading");
  try {
    state.records = await fetchRecords();
    render();
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
$("date-input").addEventListener("change", (event) => { state.date = event.target.value; load(); });
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  document.querySelector(".tab.active").classList.remove("active");
  button.classList.add("active"); state.range = button.dataset.range; render();
}));
$("refresh-button").addEventListener("click", load);
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
$("reload-page-button").addEventListener("click", () => window.location.reload());
requestWakeLock();
load();
state.timer = setInterval(load, REFRESH_MS);
