-- Moduł "Wersje edytowalne": pliki dodawane przez pracowników niezależnie od zapytań i wycen (PDF, skany, zdjęcia,
-- DOCX, arkusze, DXF...). Odczyt bez AI (warstwa tekstowa, struktura pliku) albo przez AI, wykrycie języka,
-- tłumaczenie na polski i eksport do Worda z formatowaniem. Dziennik odczytów: kto, co, które strony, ile kosztowało.

create table public.pliki_edytowalne (
  id            uuid primary key default gen_random_uuid(),
  nazwa_pliku   text not null,
  mime          text,
  rozmiar       bigint,
  rodzaj        text not null check (rodzaj in ('pdf', 'obraz', 'docx', 'arkusz', 'tekst', 'cad', 'inny')),
  sciezka       text unique,                    -- edytowalne/<id>/<nazwa> w bucket "dokumenty"
  stron         integer,
  jezyk         text,                           -- kod ISO 639-1 wykrytego języka (pl, en, de...)
  -- Wersja edytowalna: {"strony": {"<nr>": {"bloki": [...], "zrodlo": "tekst"|"ai", "jezyk": "en"}},
  --                     "tlumaczenie": {"<nr>": {"bloki": [...]}}}
  tresc         jsonb not null default '{"strony": {}, "tlumaczenie": {}}',
  utworzyl      uuid default auth.uid() references public.profiles(id) on delete set null,
  utworzono     timestamptz not null default now(),
  zmodyfikowano timestamptz not null default now()
);
create index on public.pliki_edytowalne (utworzono desc);

create table public.odczyty_plikow (
  id          uuid primary key default gen_random_uuid(),
  plik_id     uuid references public.pliki_edytowalne(id) on delete set null,
  nazwa_pliku text not null,                    -- zostaje w historii po usunięciu pliku
  rodzaj      text not null check (rodzaj in ('tekst', 'ai', 'tlumaczenie')),
  strony      integer[] not null default '{}',
  obszarow    integer not null default 0,       -- 0 = cała strona
  jezyk       text,
  model       text,
  koszt_pln   numeric not null default 0,
  utworzyl    uuid default auth.uid() references public.profiles(id) on delete set null,
  utworzono   timestamptz not null default now()
);
create index on public.odczyty_plikow (utworzono desc);
create index on public.odczyty_plikow (plik_id);

-- Koszt AI przypisany do pliku (także wywołania nieudane - liczą się do budżetu).
alter table public.ai_uzycie add column plik_id uuid references public.pliki_edytowalne(id) on delete set null;
create index on public.ai_uzycie (plik_id);

create trigger trg_zmodyfikowano before update on public.pliki_edytowalne
  for each row execute function public.dotknij_rekord();
-- Audyt dodania i usunięcia pliku; zmiany treści śledzi dziennik odczytów (bez kopii całej treści w audit_log).
create trigger trg_audyt after insert or delete on public.pliki_edytowalne
  for each row execute function public.audytuj();

alter table public.pliki_edytowalne enable row level security;
alter table public.odczyty_plikow enable row level security;

-- Wspólna praca: pliki widzą i odczytują wszyscy pracownicy; usuwa autor albo administrator.
create policy pe_select on public.pliki_edytowalne for select to authenticated using (public.jest_pracownikiem());
create policy pe_insert on public.pliki_edytowalne for insert to authenticated with check (public.jest_pracownikiem());
create policy pe_update on public.pliki_edytowalne for update to authenticated
  using (public.jest_pracownikiem()) with check (public.jest_pracownikiem());
create policy pe_delete on public.pliki_edytowalne for delete to authenticated
  using (public.jest_administratorem() or utworzyl = auth.uid());

-- Dziennik: czytają wszyscy pracownicy, dopisuje się tylko jako autor; bez zmian i usuwania (ślad zostaje).
create policy op_select on public.odczyty_plikow for select to authenticated using (public.jest_pracownikiem());
create policy op_insert on public.odczyty_plikow for insert to authenticated
  with check (public.jest_pracownikiem() and utworzyl = auth.uid());

-- Storage: ścieżka edytowalne/<id pliku>/<nazwa> - uprawnienie wynika z wiersza w pliki_edytowalne.
create function public.plik_edytowalny_z_sciezki(p_nazwa text) returns uuid
language plpgsql immutable set search_path = public as $$
begin
  if split_part(p_nazwa, '/', 1) <> 'edytowalne' then return null; end if;
  return split_part(p_nazwa, '/', 2)::uuid;
exception when others then
  return null;
end $$;
revoke execute on function public.plik_edytowalny_z_sciezki(text) from public, anon;
grant execute on function public.plik_edytowalny_z_sciezki(text) to authenticated;

create policy pe_plik_dodanie on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumenty' and public.jest_pracownikiem()
              and exists (select 1 from public.pliki_edytowalne p where p.id = public.plik_edytowalny_z_sciezki(name)));
create policy pe_plik_usuniecie on storage.objects for delete to authenticated
  using (bucket_id = 'dokumenty' and public.plik_edytowalny_z_sciezki(name) is not null and (public.jest_administratorem()
         or exists (select 1 from public.pliki_edytowalne p where p.id = public.plik_edytowalny_z_sciezki(name) and p.utworzyl = auth.uid())));

-- Tryby AI modułu: odczyt dokumentu z układem i tłumaczenie na polski.
update public.ustawienia
set wartosc = jsonb_set(wartosc, '{tryby}', (wartosc -> 'tryby') || '{"odczytaj_dokument": "standard", "przetlumacz_dokument": "standard"}')
where klucz = 'ai';
