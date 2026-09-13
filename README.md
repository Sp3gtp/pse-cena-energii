# Cena energii PSE

Lekka aplikacja webowa bez frameworka i bez kluczy API. Pobiera aktualną prognozowaną cenę CEN (`cen_fcst`) z endpointu `price-fcst` publicznego API PSE (`api.raporty.pse.pl`), odświeża ją co 60 sekund i pokazuje zakresy: minuta (surowe interwały PSE), godzina, dzień oraz miesiąc.

## Uruchomienie

W katalogu projektu uruchom dowolny prosty serwer plików statycznych, np.:

```powershell
py -m http.server 8080
```

Następnie otwórz `http://localhost:8080`.

## Ważne

Publiczna prognoza CEN PSE jest publikowana w interwałach 15-minutowych. Aplikacja odświeża zapytanie co minutę, ale nie tworzy sztucznej rozdzielczości minutowej; widok godziny, dnia i miesiąca wylicza średnią z dostępnych rekordów.

Po kliknięciu **Włącz alerty** aplikacja sygnalizuje dźwiękiem i wibracją zmianę bieżącej ceny o co najmniej 100 PLN/MWh. Wibracja zależy od obsługi urządzenia, a dźwięk od zgody przeglądarki.

Jeśli cena spadnie z poziomu powyżej 550 PLN/MWh do 550 PLN/MWh lub niżej, odtworzy się alarm audio przez 3 sekundy. Alarm wymaga wcześniejszego kliknięcia **Włącz alerty**.

Progi spadku i wzrostu można zmienić bezpośrednio na stronie; przycisk **Zapisz progi** zapisuje je lokalnie w przeglądarce. Wykres ma osie czasu i ceny oraz tooltip po najechaniu na punkt.
