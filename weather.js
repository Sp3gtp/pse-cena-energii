(() => {
  const URL = 'https://api.open-meteo.com/v1/forecast?latitude=51.9356&longitude=15.5062'
    + '&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code,is_day'
    + '&forecast_hours=9&timezone=Europe%2FWarsaw';

  const describe = (code) => {
    if (code === 0) return 'bezchmurnie';
    if (code <= 3) return 'zachmurzenie';
    if (code <= 48) return 'mgła';
    if (code <= 57) return 'mżawka';
    if (code <= 67) return 'deszcz';
    if (code <= 77) return 'śnieg';
    if (code <= 82) return 'przelotny deszcz';
    if (code <= 86) return 'przelotny śnieg';
    return 'burza';
  };

  const icon = (code, isDay) => {
    if (code === 0) return isDay ? '☀️' : '🌙';
    if (code <= 2) return isDay ? '🌤️' : '☁️';
    if (code === 3) return '☁️';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    if (code <= 86) return '🌨️';
    return '⛈️';
  };

  const temp = (value) => `${Math.round(value)}°`;

  async function loadWeather() {
    try {
      const response = await fetch(URL, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(response.status);
      const data = await response.json();

      document.getElementById('weather-temp').textContent =
        `${icon(data.current.weather_code, data.current.is_day)} ${temp(data.current.temperature_2m)}`;
      document.getElementById('weather-desc').textContent = `Zielona Góra · ${describe(data.current.weather_code)}`;

      const forecast = document.getElementById('weather-forecast');
      forecast.replaceChildren();
      const { time, temperature_2m: temps, weather_code: codes, is_day: days } = data.hourly;
      for (let i = 1; i <= 8 && i < time.length; i += 1) {
        const item = document.createElement('div');
        item.className = 'weather-tile';
        item.title = describe(codes[i]);
        const hour = document.createElement('span');
        const symbol = document.createElement('span');
        const value = document.createElement('b');
        symbol.className = 'weather-icon';
        hour.textContent = time[i].slice(11, 13) + ':00';
        symbol.textContent = icon(codes[i], days[i]);
        value.textContent = temp(temps[i]);
        item.append(hour, symbol, value);
        forecast.append(item);
      }
    } catch {
      document.getElementById('weather-desc').textContent = 'Zielona Góra · brak danych';
    }
  }

  loadWeather();
  setInterval(loadWeather, 15 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadWeather();
  });
})();
