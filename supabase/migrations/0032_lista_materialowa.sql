-- Lista materiałowa zapytania: jeden odczyt rysunku o rodzaju "lista_materialowa" na zapytanie - kompletna lista złożona
-- z dokumentów (lista materiałowa, rysunek złożeniowy, zaznaczone tabele). Pozostałe odczyty to jej źródła.
create unique index if not exists odczyty_rysunkow_lista_materialowa on public.odczyty_rysunkow (zapytanie_id)
  where rodzaj_tabeli = 'lista_materialowa';
