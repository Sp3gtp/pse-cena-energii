# Cena energii PSE

Aplkacja pokazująca aktualną cenę energii elektrycznej na rynku bilansującym. Umożliwia ustawienie własnych progów alarmowych dla spadku ceny oraz dla wzrostu. Pobiera aktualną cenę CEN  z endpointu  publicznego API PSE (`api.raporty.pse.pl`), odświeża ją co 60 sekund i pokazuje wykres całej doby w surowych interwałach 15-minutowych. Ikona w prawym górnym rogu pola ceny otwiera osobne okno przeglądarki z tym samym panelem ceny co ekran główny. Okno samodzielnie pobiera dane PSE co minutę. Przy wykryciu błędu połączenia aplikacja automatycznie odświeża stronę po 5 sekundach; ograniczenie jednego odświeżenia na minutę zapobiega pętli przy awarii źródła danych.
Link do Strony : https://sp3gtp.github.io/pse-cena-energii/
