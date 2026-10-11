import html
import json
import math
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


API_URL = "https://api.raporty.pse.pl/api/price-fcst"
UTC = timezone.utc
OUTPUT = Path("cenypsev2/index.html")
FALL_THRESHOLD = 550
RISE_THRESHOLD = 650


def last_sunday(year, month):
    if month == 12:
        last_day = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        last_day = datetime(year, month + 1, 1) - timedelta(days=1)
    return last_day - timedelta(days=(last_day.weekday() + 1) % 7)


def warsaw_timezone_for_utc(timestamp):
    start = last_sunday(timestamp.year, 3).replace(hour=1, tzinfo=UTC)
    end = last_sunday(timestamp.year, 10).replace(hour=1, tzinfo=UTC)
    offset = 2 if start <= timestamp.astimezone(UTC) < end else 1
    return timezone(timedelta(hours=offset))


def warsaw_timezone_for_local(timestamp):
    start = last_sunday(timestamp.year, 3).date()
    end = last_sunday(timestamp.year, 10).date()
    summer_time = (timestamp.date() > start or (timestamp.date() == start and timestamp.hour >= 2)) and (
        timestamp.date() < end or (timestamp.date() == end and timestamp.hour < 3)
    )
    return timezone(timedelta(hours=2 if summer_time else 1))


def warsaw_now():
    now = datetime.now(UTC)
    return now.astimezone(warsaw_timezone_for_utc(now))


def parse_record(row):
    raw_price = next(
        (row.get(key) for key in ("cen_fcst", "cen_cost", "price", "value") if row.get(key) is not None),
        None,
    )
    raw_time = next(
        (row.get(key) for key in ("dtime", "date", "timestamp", "periodStart") if row.get(key)),
        None,
    )
    if raw_price is None or raw_time is None:
        return None

    try:
        price = float(str(raw_price).replace(",", "."))
        timestamp = datetime.fromisoformat(str(raw_time).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(price):
        return None
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=warsaw_timezone_for_local(timestamp))
    else:
        timestamp = timestamp.astimezone(warsaw_timezone_for_utc(timestamp))
    return {
        "price": price,
        "time": timestamp,
        "period": str(row.get("period") or ""),
    }


def fetch_records():
    business_date = warsaw_now().date().isoformat()
    query = urllib.parse.urlencode({"$filter": f"business_date eq '{business_date}'"})
    request = urllib.request.Request(
        f"{API_URL}?{query}",
        headers={"Accept": "application/json", "User-Agent": "cenypsev2-pages/1.0"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)

    rows = payload if isinstance(payload, list) else (payload.get("value") or payload.get("data") or [])
    if not isinstance(rows, list):
        raise ValueError("Nieoczekiwany format odpowiedzi API PSE")
    records = [record for row in rows if isinstance(row, dict) if (record := parse_record(row))]
    records.sort(key=lambda record: record["time"])
    if not records:
        raise ValueError("API PSE nie zwróciło prawidłowych odczytów dla bieżącego dnia")
    return records


def format_price(value):
    return f"{value:,.2f}".replace(",", "\u00a0").replace(".", ",")


def format_time(value):
    return value.strftime("%H:%M")


def chart_svg(records):
    width, height = 900, 300
    left, right, top, bottom = 76, 28, 32, 42
    low = min(0, min(record["price"] for record in records))
    high = max(0, max(record["price"] for record in records))
    span = high - low or 1
    plot_width = width - left - right
    plot_height = height - top - bottom
    points = []
    for index, record in enumerate(records):
        x = left + index / max(1, len(records) - 1) * plot_width
        y = height - bottom - (record["price"] - low) / span * plot_height
        points.append((x, y))

    grid = []
    for step in range(5):
        y = top + step * plot_height / 4
        value = high - step * span / 4
        grid.append(
            f'<line class="grid" x1="{left}" y1="{y:.1f}" x2="{width-right}" y2="{y:.1f}"/>'
            f'<text class="label" text-anchor="end" x="{left-8}" y="{y+4:.1f}">'
            f"{html.escape(format_price(value))}</text>"
        )
    polyline = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    labels = []
    for index in sorted({0, len(records) // 4, len(records) // 2, 3 * len(records) // 4, len(records) - 1}):
        x, _ = points[index]
        labels.append(
            f'<text class="label" text-anchor="middle" x="{x:.1f}" y="{height-12}">'
            f"{format_time(records[index]['time'])}</text>"
        )
    return (
        f'<svg class="chart" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="Wykres cen energii dla {len(records)} odczytów">'
        f'{"".join(grid)}<polyline class="line" points="{polyline}"/>'
        f'{"".join(labels)}</svg>'
    )


def render(records):
    now = warsaw_now()
    current = next((record for record in records if record["time"] > now), records[-1])
    if current["price"] < FALL_THRESHOLD:
        price_class = "price low"
    elif current["price"] > RISE_THRESHOLD:
        price_class = "price high"
    else:
        price_class = "price"

    rows = "".join(
        "<tr>"
        f"<td>{html.escape(record['period'] or format_time(record['time']))}</td>"
        f"<td>{html.escape(format_price(record['price']))}</td>"
        "</tr>"
        for record in reversed(records[-12:])
    )
    updated = now.strftime("%d.%m.%Y, %H:%M:%S")
    return f"""<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b1324">
  <meta http-equiv="refresh" content="300">
  <title>Cena energii PSE — cenypsev2</title>
  <style>
    :root {{ color-scheme: dark; font-family: system-ui, sans-serif; color: #f5f7fb; background: #080d18; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; background: radial-gradient(circle at 80% 0%, #17284c, #080d18 55%); }}
    main {{ width: min(100% - 32px, 1000px); margin: 0 auto; padding: 36px 0; }}
    header, section, footer {{ margin-bottom: 16px; }}
    header {{ display: flex; justify-content: space-between; gap: 16px; align-items: start; }}
    h1 {{ margin: 4px 0 8px; font-size: clamp(28px, 5vw, 42px); }}
    h2 {{ font-size: 18px; }}
    p {{ margin: 0 0 8px; }}
    .eyebrow, .unit {{ color: #66d9b4; font-weight: 700; }}
    .muted, .label {{ color: #9caac2; }}
    .card {{ padding: 22px 24px; background: #131e35e0; border: 1px solid #293b61; border-radius: 16px; }}
    .hero {{ display: flex; align-items: center; justify-content: space-between; gap: 20px; }}
    .price {{ margin: 0; font-size: clamp(42px, 9vw, 76px); font-weight: 800; }}
    .price.low {{ color: #ff667d; }} .price.high {{ color: #66d9b4; }}
    .unit {{ text-align: right; }}
    .chart-wrap {{ overflow-x: auto; }}
    .chart {{ display: block; width: 100%; min-width: 680px; height: auto; }}
    .grid {{ stroke: #2b3d62; stroke-width: 1; }}
    .line {{ fill: none; stroke: #66d9b4; stroke-width: 3; }}
    .label {{ fill: #9caac2; font-size: 11px; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ padding: 11px 8px; border-bottom: 1px solid #293b61; text-align: left; }}
    th:last-child, td:last-child {{ text-align: right; }}
    footer {{ color: #9caac2; font-size: 13px; }}
    a {{ color: #66d9b4; }}
    @media (max-width: 600px) {{ main {{ width: calc(100% - 20px); padding-top: 24px; }} .hero {{ align-items: start; flex-direction: column; }} .unit {{ text-align: left; }} }}
  </style>
</head>
<body>
  <main>
    <header>
      <div><p class="eyebrow">PSE · CEN</p><h1>Cena energii elektrycznej</h1>
      <p class="muted">Rynek bilansujący · automatyczne odświeżenie strony co 5 minut</p></div>
      <p class="muted">Dane: {html.escape(updated)}</p>
    </header>
    <section class="card hero" aria-label="Aktualna cena">
      <div><p class="label">Aktualny przedział</p>
      <p><strong>{html.escape(current['period'] or format_time(current['time']))}</strong></p>
      <p class="muted">Ostatnia aktualizacja danych: {html.escape(updated)}</p></div>
      <div><p class="{price_class}">{html.escape(format_price(current['price']))}</p>
      <p class="unit">PLN/MWh</p></div>
    </section>
    <section class="card"><h2>Ceny energii w bieżącej dobie</h2>
      <p class="muted">{len(records)} odczytów · źródło: publiczne API PSE</p>
      <div class="chart-wrap">{chart_svg(records)}</div>
    </section>
    <section class="card"><h2>Ostatnie odczyty</h2>
      <table><thead><tr><th>Przedział</th><th>Cena [PLN/MWh]</th></tr></thead>
      <tbody>{rows}</tbody></table>
    </section>
    <footer>Źródło: <a href="https://raporty.pse.pl/">raporty.pse.pl</a>.
      Widok statyczny bez JavaScriptu; alerty dźwiękowe i interaktywne funkcje są niedostępne.</footer>
  </main>
</body>
</html>
"""


def main():
    records = fetch_records()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = OUTPUT.with_suffix(".tmp")
    temporary_output.write_text(render(records), encoding="utf-8")
    temporary_output.replace(OUTPUT)
    print(f"Wygenerowano {OUTPUT} ({len(records)} odczytów)")


if __name__ == "__main__":
    main()
