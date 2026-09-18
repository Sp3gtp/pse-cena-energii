const API_URL = "https://api.raporty.pse.pl/api/price-fcst";
const REFRESH_MS = 60_000;
const DEFAULT_FALL_THRESHOLD = 550;
const DEFAULT_RISE_THRESHOLD = 650;
const $ = (id) => document.getElementById(id);

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function storedThreshold(key, fallback) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function formatTime(date) {
  return date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

function setStatus(text, kind) {
  const status = $("connection-status");
  status.textContent = text;
  status.className = `status status-${kind}`;
}

function normalizeRecord(raw) {
  const price = Number(String(raw.cen_fcst ?? raw.cen_cost ?? raw.price ?? raw.value ?? "").replace(",", "."));
  const time = new Date(raw.dtime ?? raw.date ?? raw.timestamp ?? raw.periodStart);
  if (!Number.isFinite(price) || Number.isNaN(time.getTime())) return null;
  return { price, time, period: typeof raw.period === "string" ? raw.period : "" };
}

async function load() {
  setStatus("Pobieranie…", "loading");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const filter = encodeURIComponent(`business_date eq '${today()}'`);
    const response = await fetch(`${API_URL}?%24filter=${filter}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`API PSE zwróciło HTTP ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : (payload.value ?? payload.data ?? []);
    const records = rows.map(normalizeRecord).filter(Boolean).sort((a, b) => a.time - b.time);
    if (!records.length) throw new Error("PSE nie zwróciło prawidłowych danych");
    const current = records.find((item) => item.time > new Date()) ?? records.at(-1);
    const price = $("current-price");
    price.textContent = current.price.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
    price.classList.toggle("price-low", current.price < storedThreshold("fallThreshold", DEFAULT_FALL_THRESHOLD));
    price.classList.toggle("price-high", current.price > storedThreshold("riseThreshold", DEFAULT_RISE_THRESHOLD));
    $("current-period").textContent = current.period || formatTime(current.time);
    $("updated-at").textContent = `Ostatnia synchronizacja: ${new Date().toLocaleTimeString("pl-PL")}`;
    setStatus("Połączono z PSE", "ok");
  } catch (error) {
    setStatus("Błąd połączenia", "error");
    $("updated-at").textContent = error.message;
  } finally {
    clearTimeout(timeout);
  }
}

load();
setInterval(load, REFRESH_MS);
