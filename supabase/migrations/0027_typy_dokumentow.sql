-- Dokumenty (runda 2, faza 5): typy dokumentów jako słownik z nazwami PL/EN i grupami (widok zwijanych grup w karcie
-- zapytania), kompresja plików przed zapisem (rozmiar oryginalny / zapisany, metoda), SHA-256 oryginału (duplikaty)
-- i źródła pól karty zapytania uzupełnionych automatycznie z dokumentów (plik, strona).

create table public.typy_dokumentow (
  kod                text primary key,
  nazwa              text not null,
  nazwa_en           text,
  grupa              text not null,                 -- grupa w widoku dokumentów (np. rysunki: zestawieniowy / wykonawczy / szkic)
  istotny_domyslnie  boolean not null default true,  -- czy dokument tego typu idzie domyślnie do analizy AI
  kolejnosc          integer not null default 0,
  aktywny            boolean not null default true,
  zmodyfikowano      timestamptz not null default now()
);
create trigger trg_zmodyfikowano before update on public.typy_dokumentow
  for each row execute function public.dotknij_rekord();
create trigger trg_audyt after insert or update or delete on public.typy_dokumentow
  for each row execute function public.audytuj('-');
alter table public.typy_dokumentow enable row level security;
create policy tdok_select on public.typy_dokumentow for select to authenticated using (public.jest_pracownikiem());
create policy tdok_write on public.typy_dokumentow for all to authenticated
  using (public.jest_administratorem()) with check (public.jest_administratorem());

insert into public.typy_dokumentow (kod, nazwa, nazwa_en, grupa, istotny_domyslnie, kolejnosc) values
  ('zapytanie_ofertowe', 'Zapytanie ofertowe', 'Request for quotation', 'zapytanie', true, 1),
  ('projekt', 'Projekt / opis techniczny', 'Design / technical description', 'projekt', true, 2),
  ('rysunek', 'Rysunek', 'Drawing', 'rysunki', true, 3),
  ('rysunek_zestawieniowy', 'Rysunek zestawieniowy', 'General arrangement drawing', 'rysunki', true, 4),
  ('rysunek_wykonawczy', 'Rysunek wykonawczy', 'Detail drawing', 'rysunki', true, 5),
  ('szkic', 'Szkic', 'Sketch', 'rysunki', true, 6),
  ('standard_klienta', 'Wymagania techniczne / standard klienta', 'Technical requirements / customer standard', 'wymagania', false, 7),
  ('formularz_wymagan', 'Formularz wymagań', 'Requirements form', 'wymagania', true, 8),
  ('karta_danych', 'Arkusz danych (datasheet)', 'Datasheet', 'karta_danych', true, 9),
  ('specyfikacja', 'Specyfikacja techniczna', 'Technical specification', 'specyfikacja', true, 10),
  ('obliczenia', 'Obliczenia', 'Calculations', 'obliczenia', true, 11),
  ('korespondencja', 'Korespondencja / pytania i odpowiedzi', 'Correspondence / Q&A', 'korespondencja', false, 12),
  ('oferta_dostawcy', 'Oferta / dokument od dostawcy', 'Supplier offer / document', 'oferty', true, 13),
  ('karta_dostawy', 'Karta dostawy (Optima)', 'Delivery card (Optima)', 'inne', false, 14),
  ('raport_registo', 'Raport Registo', 'Registo report', 'inne', false, 15),
  ('inne', 'Inne', 'Other', 'inne', true, 99);

-- Typ dokumentu: tekst ze słownika zamiast typu wyliczeniowego (nowe typy dodaje administrator).
alter table public.dokumenty alter column typ drop default;
alter table public.dokumenty alter column typ type text using typ::text;
alter table public.dokumenty alter column typ set default 'inne';
alter table public.dokumenty add constraint dokumenty_typ_fk foreign key (typ) references public.typy_dokumentow(kod) on update cascade;

alter table public.dokumenty add column rozmiar_oryginalny bigint;
alter table public.dokumenty add column rozmiar_zapisany bigint;
alter table public.dokumenty add column metoda_kompresji text not null default 'brak';
alter table public.dokumenty add column hash text;                 -- SHA-256 oryginału (hex)
create index on public.dokumenty (zapytanie_id, hash);
update public.dokumenty set rozmiar_oryginalny = rozmiar, rozmiar_zapisany = rozmiar where rozmiar_oryginalny is null;

-- Karta zapytania: skąd pochodzi wartość pola uzupełnionego automatycznie ({pole: "plik.pdf, str. 1"}).
alter table public.zapytania add column zrodla_pol jsonb not null default '{}';

-- Limit jednego pliku: w ustawieniach (limity_planu.plik_mb, domyślnie 50 MB) i twardo w bucketcie.
update storage.buckets set file_size_limit = 52428800 where id = 'dokumenty';
