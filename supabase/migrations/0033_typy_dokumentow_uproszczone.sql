-- Uproszczone typy dokumentów zapytania: Zapytanie ofertowe, Projekt / rysunek złożeniowy, Lista materiałowa,
-- Wymagania techniczne, Oferta dostawcy, Inne. Grupa = typ (lista rozwijana i grupy w widoku dokumentów się pokrywają).
-- Stare typy zostają nieaktywne (kosz i historia mogą się do nich odwoływać), dokumenty dostają nowy typ.
insert into public.typy_dokumentow (kod, nazwa, nazwa_en, grupa, istotny_domyslnie, kolejnosc, aktywny) values
  ('lista_materialowa', 'Lista materiałowa', 'Material list', 'lista_materialowa', true, 3, true),
  ('wymagania', 'Wymagania techniczne', 'Technical requirements', 'wymagania', true, 4, true)
on conflict (kod) do update set nazwa = excluded.nazwa, nazwa_en = excluded.nazwa_en, grupa = excluded.grupa, kolejnosc = excluded.kolejnosc, aktywny = true;

update public.typy_dokumentow set nazwa = 'Zapytanie ofertowe', nazwa_en = 'Request for quotation', grupa = 'zapytanie_ofertowe', kolejnosc = 1, aktywny = true where kod = 'zapytanie_ofertowe';
update public.typy_dokumentow set nazwa = 'Projekt / rysunek złożeniowy', nazwa_en = 'Design / assembly drawing', grupa = 'projekt', kolejnosc = 2, aktywny = true where kod = 'projekt';
update public.typy_dokumentow set nazwa = 'Oferta dostawcy', nazwa_en = 'Supplier offer', grupa = 'oferta_dostawcy', kolejnosc = 5, aktywny = true where kod = 'oferta_dostawcy';
update public.typy_dokumentow set nazwa = 'Inne', nazwa_en = 'Other', grupa = 'inne', istotny_domyslnie = false, kolejnosc = 99, aktywny = true where kod = 'inne';

-- Dokumenty: stare typy na nowe.
update public.dokumenty set typ = 'projekt' where typ in ('rysunek', 'rysunek_zestawieniowy', 'rysunek_wykonawczy', 'szkic');
update public.dokumenty set typ = 'wymagania' where typ in ('standard_klienta', 'formularz_wymagan', 'karta_danych', 'specyfikacja');
update public.dokumenty set typ = 'zapytanie_ofertowe' where typ = 'korespondencja';
update public.dokumenty set typ = 'inne' where typ in ('obliczenia', 'karta_dostawy', 'raport_registo');

update public.typy_dokumentow set aktywny = false
  where kod in ('rysunek', 'rysunek_zestawieniowy', 'rysunek_wykonawczy', 'szkic', 'standard_klienta', 'formularz_wymagan', 'karta_danych',
                'specyfikacja', 'korespondencja', 'obliczenia', 'karta_dostawy', 'raport_registo');
