# Cena energii PSE

Aplikacja pokazująca ceny energii elektrycznej na rynku bilansującym z publicznego API PSE (`api.raporty.pse.pl`). Główna strona oferuje wykres, progi i alerty w przeglądarce.

## Wersja bez JavaScriptu: cenypsev2

GitHub Actions generuje statyczną stronę w `cenypsev2/index.html` i publikuje ją razem z resztą GitHub Pages. Workflow pobiera dane z API PSE przy wdrożeniu oraz w harmonogramie co 5 minut. Harmonogram GitHub Actions może się opóźniać, więc częstotliwość aktualizacji nie jest gwarantowana.

Adres wersji to `https://sp3gtp.github.io/pse-cena-energii/cenypsev2/`, jeśli repozytorium publikuje stronę pod obecnym adresem projektu. Do działania wymaga włączonego GitHub Pages korzystającego z workflow GitHub Actions. Wersja statyczna pokazuje bieżącą cenę, wykres i ostatnie odczyty, ale nie obsługuje alertów dźwiękowych ani interakcji wymagających JavaScriptu.

Link do istniejącej strony: https://sp3gtp.github.io/pse-cena-energii/
