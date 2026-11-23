-- Katalog ofert materiałowych: zaopatrzenie wrzuca pliki ofert (PDF, skan, mail, Excel) - do podłączonego folderu
-- firmowego albo przeciągając je do aplikacji. Każdy plik raz (skrót SHA-256), zapisany jako dokument; z odczytu
-- (bez AI albo przez AI) powstaje oferta „do przejrzenia”, po zatwierdzeniu jej ceny zasilają wyceny.
create table public.katalog_ofert (
  id            uuid primary key default gen_random_uuid(),
  nazwa_pliku   text not null,
  folder        text,                                  -- ścieżka w podłączonym folderze (plik z folderu)
  hash          text not null unique,                  -- ten sam plik drugi raz się nie zapisze
  rozmiar       bigint,
  data_pliku    timestamptz,                           -- data modyfikacji pliku w folderze
  dokument_id   uuid references public.dokumenty(id) on delete set null,
  oferta_id     uuid references public.oferty_dostawcow(id) on delete set null,
  status        text not null default 'nowy' check (status in ('nowy', 'do_przejrzenia', 'zatwierdzony', 'pominiety', 'blad')),
  dostawca      text,
  nr_zo         text,
  pozycji       integer,
  uwagi         text,
  koszt_pln     numeric,
  utworzyl      uuid default auth.uid() references public.profiles(id) on delete set null,
  utworzono     timestamptz not null default now(),
  zmodyfikowano timestamptz not null default now()
);
create index on public.katalog_ofert (status);
create trigger trg_zmodyfikowano before update on public.katalog_ofert
  for each row execute function public.dotknij_rekord();
create trigger trg_audyt after insert or update or delete on public.katalog_ofert
  for each row execute function public.audytuj('-');
alter table public.katalog_ofert enable row level security;
create policy ko_select on public.katalog_ofert for select to authenticated using (public.jest_pracownikiem());
create policy ko_insert on public.katalog_ofert for insert to authenticated with check (public.jest_pracownikiem());
create policy ko_update on public.katalog_ofert for update to authenticated using (public.jest_pracownikiem()) with check (public.jest_pracownikiem());
create policy ko_delete on public.katalog_ofert for delete to authenticated using (public.jest_administratorem() or utworzyl = auth.uid());

-- Dokument pliku z katalogu (zanim powstanie z niego oferta).
alter table public.dokumenty add column katalog_id uuid references public.katalog_ofert(id) on delete set null;
create index on public.dokumenty (katalog_id);
alter table public.dokumenty drop constraint dokumenty_check;
alter table public.dokumenty add constraint dokumenty_check
  check (num_nonnulls(zapytanie_id, oferta_id, projekt_id, nadrzedny_id, katalog_id) >= 1);
