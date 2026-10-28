(() => {
  const URL = 'https://api.open-meteo.com/v1/forecast?latitude=51.9356&longitude=15.5062'
    + '&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code'
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

  const temp = (value) => `${Math.round(value)}°`;

  async function loadWeather() {
    try {
      const response = await fetch(URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status);
      const data = await response.json();

      document.getElementById('weather-temp').textContent = temp(data.current.temperature_2m);
      document.getElementById('weather-desc').textContent = `Zielona Góra · ${describe(data.current.weather_code)}`;

      const forecast = document.getElementById('weather-forecast');
      forecast.replaceChildren();
      const { time, temperature_2m: temps } = data.hourly;
      for (let i = 1; i <= 8 && i < time.length; i += 1) {
        const item = document.createElement('div');
        const hour = document.createElement('span');
        const value = document.createElement('b');
        hour.textContent = time[i].slice(11, 13) + ':00';
        value.textContent = temp(temps[i]);
        item.append(hour, value);
        forecast.append(item);
      }
    } catch {
      document.getElementById('weather-desc').textContent = 'Zielona Góra · brak danych';
    }
  }

  loadWeather();
  setInterval(loadWeather, 15 * 60 * 1000);
})();
