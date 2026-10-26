-- Kooperacja, badania, transport (runda 2, faza 8): prośba technologa do działu handlowego o ofertę na usługę
-- pod konkretne zapytanie / wycenę. Dział handlowy ma kolejkę (licznik w menu), przyjmuje, przypisuje, dodaje oferty
-- i zamyka. Oferty dostawców są powiązane z prośbą; pozycja wyceny pamięta prośbę w `dodatkowe.prosba_id`.
-- Bez wysyłania maili z serwera (zapytania do kooperantów - jak dotąd przez mailto z generatora).

create table public.prosby_o_oferte (
  id                 uuid primary key default gen_random_uuid(),
  zapytanie_id       uuid not null references public.zapytania(id) on delete cascade,
  wycena_id          uuid references public.wyceny(id) on delete set null,
  zakladka           text not null default 'kooperacja' check (zakladka in ('kooperacja', 'badania', 'transport', 'projekt', 'inne')),
  kategoria_uslugi   text references public.kategorie_uslug(kod),
  opis               text not null,
  parametry          jsonb not null default '{}',     -- powierzchnia, masa, wymiary, norma, sztuk, miejsce... (wg kategorii)
  status             text not null default 'nowa'
                     check (status in ('nowa', 'przyjeta', 'wyslana', 'oferta_otrzymana', 'zamknieta', 'anulowana')),
  termin             date,                             -- do kiedy potrzebna oferta
  zlecajacy          uuid default auth.uid() references public.profiles(id) on delete set null,
  odpowiedzialny     uuid references public.profiles(id) on delete set null,
  oferta_id          uuid references public.oferty_dostawcow(id) on delete set null,  -- oferta wybrana do wyceny
  uwagi              text,
  utworzono          timestamptz not null default now(),
  zmodyfikowano      timestamptz not null default now()
);
create index on public.prosby_o_oferte (zapytanie_id);
create index on public.prosby_o_oferte (status);
create trigger trg_zmodyfikowano before update on public.prosby_o_oferte
  for each row execute function public.dotknij_rekord();
create trigger trg_audyt after insert or update or delete on public.prosby_o_oferte
  for each row execute function public.audytuj('zapytanie_id');

alter table public.prosby_o_oferte enable row level security;
create policy prosby_select on public.prosby_o_oferte for select to authenticated using (public.jest_pracownikiem());
create policy prosby_insert on public.prosby_o_oferte for insert to authenticated with check (public.jest_pracownikiem());
-- Zmienia dział handlowy (prezes, administrator) albo zlecający swoją prośbę.
create policy prosby_update on public.prosby_o_oferte for update to authenticated
  using (public.moze_baze_cen() or zlecajacy = auth.uid()) with check (public.moze_baze_cen() or zlecajacy = auth.uid());
create policy prosby_delete on public.prosby_o_oferte for delete to authenticated
  using (public.jest_administratorem() or (zlecajacy = auth.uid() and status = 'nowa'));

alter table public.oferty_dostawcow add column prosba_id uuid references public.prosby_o_oferte(id) on delete set null;
create index on public.oferty_dostawcow (prosba_id);

/** Licznik kolejki działu handlowego (znaczek w menu): prośby nowe i przyjęte, jeszcze bez oferty. */
create function public.prosby_do_obslugi() returns integer
language sql stable security invoker set search_path = public as $$
  select count(*)::int from public.prosby_o_oferte where status in ('nowa', 'przyjeta', 'wyslana');
$$;
revoke execute on function public.prosby_do_obslugi() from public, anon;
grant execute on function public.prosby_do_obslugi() to authenticated;
