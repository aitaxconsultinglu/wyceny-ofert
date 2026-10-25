-- Kosz (runda 2): usunięcie przenosi całe drzewo rekordów do kosza (migawka jsonb) i usuwa wiersze - aplikacja i RLS
-- nie muszą pomijać "usuniętych" w każdym zapytaniu, a numer ZO z kosza nie blokuje nowego. Pliki w Storage zostają
-- do trwałego usunięcia (prezes / administrator albo automatyczne czyszczenie po N dniach). Przywrócenie odtwarza wiersze
-- z tymi samymi id w trybie systemowym (strażniki zamrożonych wycen nie blokują), audyt zapisuje usunięcie i przywrócenie.

create table public.kosz (
  id           uuid primary key default gen_random_uuid(),
  rodzaj       text not null check (rodzaj in ('zapytanie', 'dokument', 'odczyt_rysunku', 'wycena', 'oferta_dostawcy',
                                                'import_optima', 'import_registo', 'zapytanie_do_dostawcy', 'plik_edytowalny')),
  rekord_id    text not null,
  opis         text not null,
  zapytanie_id uuid,                       -- bez klucza obcego: zapytanie bywa w koszu razem z tym rekordem
  numer_zo     text,
  dane         jsonb not null,             -- [{"tabela": "...", "wiersze": [...]}] w kolejności odtwarzania
  pliki        text[] not null default '{}',
  rozmiar      bigint not null default 0,  -- bajty migawki (zajętość bazy)
  usunal       uuid default auth.uid() references public.profiles(id) on delete set null,
  usunieto     timestamptz not null default now()
);
create index on public.kosz (usunieto desc);
alter table public.kosz enable row level security;
create policy ko_select on public.kosz for select to authenticated using (public.jest_pracownikiem());
-- Zapis i usuwanie tylko przez funkcje poniżej (security definer) - brak polityk insert / update / delete.

insert into public.ustawienia (klucz, wartosc, opis, poufne) values
  ('kosz', '{"dni": 30}', 'Kosz: po ilu dniach rekordy i pliki są usuwane trwale (ostrzeżenie 7 dni wcześniej).', false)
on conflict (klucz) do nothing;

-- Wiersze z zapytania jako tablica jsonb (zapytanie składane wyłącznie wewnątrz tych funkcji).
create function public._kosz_wiersze(p_sql text) returns jsonb
language plpgsql set search_path = public as $$
declare v jsonb;
begin
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (%s) t', p_sql) into v;
  return v;
end $$;

-- Dokumenty od podanych korzeni z załącznikami (mail -> załączniki, ZIP -> pliki), rodzice przed dziećmi.
create function public._kosz_dokumenty(p_warunek text) returns jsonb
language plpgsql set search_path = public as $$
begin
  return public._kosz_wiersze(format(
    'with recursive d(id, gl) as (select id, 0 from public.dokumenty where %s
       union all select x.id, d.gl + 1 from public.dokumenty x join d on x.nadrzedny_id = d.id)
     select t.* from public.dokumenty t join d using (id) order by d.gl', p_warunek));
end $$;

/** Migawka rekordu z zależnymi wierszami, w kolejności odtwarzania. */
create function public._kosz_migawka(p_rodzaj text, p_id text) returns jsonb
language plpgsql set search_path = public as $$
declare
  v jsonb := '[]'::jsonb;
  q text := quote_literal(p_id);
  dodaj jsonb;
begin
  if p_rodzaj = 'zapytanie' then
    v := jsonb_build_array(
      jsonb_build_object('tabela', 'zapytania', 'wiersze', public._kosz_wiersze('select * from public.zapytania where id = ' || q)),
      jsonb_build_object('tabela', 'dokumenty', 'wiersze', public._kosz_dokumenty('zapytanie_id = ' || q)),
      jsonb_build_object('tabela', 'analizy_zapytan', 'wiersze', public._kosz_wiersze('select * from public.analizy_zapytan where zapytanie_id = ' || q)),
      jsonb_build_object('tabela', 'odczyty_rysunkow', 'wiersze', public._kosz_wiersze('select * from public.odczyty_rysunkow where zapytanie_id = ' || q)),
      jsonb_build_object('tabela', 'wyceny', 'wiersze', public._kosz_wiersze('select * from public.wyceny where zapytanie_id = ' || q || ' order by wersja')),
      jsonb_build_object('tabela', 'wyceny_marze', 'wiersze', public._kosz_wiersze('select m.* from public.wyceny_marze m join public.wyceny w on w.id = m.wycena_id where w.zapytanie_id = ' || q)),
      jsonb_build_object('tabela', 'aparaty', 'wiersze', public._kosz_wiersze('select a.* from public.aparaty a join public.wyceny w on w.id = a.wycena_id where w.zapytanie_id = ' || q)),
      jsonb_build_object('tabela', 'pozycje_wyceny', 'wiersze', public._kosz_wiersze('select p.* from public.pozycje_wyceny p join public.aparaty a on a.id = p.aparat_id join public.wyceny w on w.id = a.wycena_id where w.zapytanie_id = ' || q)),
      jsonb_build_object('tabela', 'oferty_dostawcow', 'wiersze', public._kosz_wiersze('select * from public.oferty_dostawcow where zapytanie_id = ' || q)),
      jsonb_build_object('tabela', 'pozycje_ofert', 'wiersze', public._kosz_wiersze('select p.* from public.pozycje_ofert p join public.oferty_dostawcow o on o.id = p.oferta_id where o.zapytanie_id = ' || q)),
      jsonb_build_object('tabela', 'dokumenty', 'wiersze', public._kosz_dokumenty('oferta_id in (select id from public.oferty_dostawcow where zapytanie_id = ' || q || ')')),
      jsonb_build_object('tabela', 'zapytania_dostawcow', 'wiersze', public._kosz_wiersze('select * from public.zapytania_dostawcow where zapytanie_id = ' || q)),
      jsonb_build_object('tabela', 'zapytania_dostawcow_odbiorcy', 'wiersze', public._kosz_wiersze('select o.* from public.zapytania_dostawcow_odbiorcy o join public.zapytania_dostawcow z on z.id = o.zapytanie_dostawcy_id where z.zapytanie_id = ' || q))
    );
  elsif p_rodzaj = 'dokument' then
    v := jsonb_build_array(jsonb_build_object('tabela', 'dokumenty', 'wiersze', public._kosz_dokumenty('id = ' || q)));
  elsif p_rodzaj = 'odczyt_rysunku' then
    v := jsonb_build_array(jsonb_build_object('tabela', 'odczyty_rysunkow', 'wiersze', public._kosz_wiersze('select * from public.odczyty_rysunkow where id = ' || q)));
  elsif p_rodzaj = 'wycena' then
    v := jsonb_build_array(
      jsonb_build_object('tabela', 'wyceny', 'wiersze', public._kosz_wiersze('select * from public.wyceny where id = ' || q)),
      jsonb_build_object('tabela', 'wyceny_marze', 'wiersze', public._kosz_wiersze('select * from public.wyceny_marze where wycena_id = ' || q)),
      jsonb_build_object('tabela', 'aparaty', 'wiersze', public._kosz_wiersze('select * from public.aparaty where wycena_id = ' || q)),
      jsonb_build_object('tabela', 'pozycje_wyceny', 'wiersze', public._kosz_wiersze('select p.* from public.pozycje_wyceny p join public.aparaty a on a.id = p.aparat_id where a.wycena_id = ' || q))
    );
  elsif p_rodzaj = 'oferta_dostawcy' then
    v := jsonb_build_array(
      jsonb_build_object('tabela', 'oferty_dostawcow', 'wiersze', public._kosz_wiersze('select * from public.oferty_dostawcow where id = ' || q)),
      jsonb_build_object('tabela', 'pozycje_ofert', 'wiersze', public._kosz_wiersze('select * from public.pozycje_ofert where oferta_id = ' || q)),
      jsonb_build_object('tabela', 'dokumenty', 'wiersze', public._kosz_dokumenty('oferta_id = ' || q))
    );
  elsif p_rodzaj = 'import_optima' then
    v := jsonb_build_array(
      jsonb_build_object('tabela', 'importy_optima', 'wiersze', public._kosz_wiersze('select * from public.importy_optima where id = ' || q)),
      jsonb_build_object('tabela', 'zakupy', 'wiersze', public._kosz_wiersze('select * from public.zakupy where import_id = ' || q))
    );
  elsif p_rodzaj = 'import_registo' then
    v := jsonb_build_array(
      jsonb_build_object('tabela', 'importy_registo', 'wiersze', public._kosz_wiersze('select * from public.importy_registo where id = ' || q)),
      jsonb_build_object('tabela', 'registo_godziny', 'wiersze', public._kosz_wiersze('select * from public.registo_godziny where import_id = ' || q))
    );
  elsif p_rodzaj = 'zapytanie_do_dostawcy' then
    v := jsonb_build_array(
      jsonb_build_object('tabela', 'zapytania_dostawcow', 'wiersze', public._kosz_wiersze('select * from public.zapytania_dostawcow where id = ' || q)),
      jsonb_build_object('tabela', 'zapytania_dostawcow_odbiorcy', 'wiersze', public._kosz_wiersze('select * from public.zapytania_dostawcow_odbiorcy where zapytanie_dostawcy_id = ' || q))
    );
  elsif p_rodzaj = 'plik_edytowalny' then
    v := jsonb_build_array(jsonb_build_object('tabela', 'pliki_edytowalne', 'wiersze', public._kosz_wiersze('select * from public.pliki_edytowalne where id = ' || q)));
  else
    raise exception 'Nieznany rodzaj rekordu do kosza: %', p_rodzaj;
  end if;
  -- Puste grupy wyrzucamy (mniejsza migawka).
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dodaj from jsonb_array_elements(v) e where jsonb_array_length(e -> 'wiersze') > 0;
  return dodaj;
end $$;

/** Czy zalogowany może przenieść rekord do kosza (te same zasady co usuwanie, sprawdzane w bazie). */
create function public._kosz_moze(p_rodzaj text, p_id text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  szef boolean := public.jest_administratorem() or public.ma_role('prezes');
begin
  if not public.jest_pracownikiem() then return false; end if;
  if p_rodzaj = 'zapytanie' then
    -- Zatwierdzone wyceny usuwa tylko prezes / administrator; pozostali - swoje zapytania w statusie nowe / w analizie.
    if szef then return true; end if;
    if exists (select 1 from public.wyceny where zapytanie_id = p_id::uuid and status = 'zatwierdzona') then return false; end if;
    return exists (select 1 from public.zapytania where id = p_id::uuid and utworzyl = auth.uid() and status in ('nowe', 'w_analizie'));
  elsif p_rodzaj = 'wycena' then
    return szef or exists (select 1 from public.wyceny where id = p_id::uuid and status in ('robocza', 'zwrocona'));
  elsif p_rodzaj = 'dokument' then
    return szef or exists (select 1 from public.dokumenty where id = p_id::uuid and utworzyl = auth.uid());
  elsif p_rodzaj = 'odczyt_rysunku' then
    return true;
  elsif p_rodzaj in ('oferta_dostawcy', 'import_optima', 'import_registo') then
    return public.moze_baze_cen();
  elsif p_rodzaj = 'zapytanie_do_dostawcy' then
    return true;
  elsif p_rodzaj = 'plik_edytowalny' then
    return szef or exists (select 1 from public.pliki_edytowalne where id = p_id::uuid and utworzyl = auth.uid());
  end if;
  return false;
end $$;

/** Przeniesienie do kosza: migawka, usunięcie wierszy (kaskady), wpis w audycie. Zwraca id wpisu kosza. */
create function public.przenies_do_kosza(p_rodzaj text, p_id text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_dane jsonb;
  v_pliki text[];
  v_opis text;
  v_zap uuid;
  v_numer text;
  v_kosz uuid;
begin
  if not public._kosz_moze(p_rodzaj, p_id) then
    raise exception 'Brak uprawnień do usunięcia (zatwierdzone wyceny usuwa prezes albo administrator; zapytanie - jego autor w statusie nowe / w analizie).';
  end if;
  v_dane := public._kosz_migawka(p_rodzaj, p_id);
  if jsonb_array_length(v_dane) = 0 then raise exception 'Rekord nie istnieje (mógł zostać już usunięty).'; end if;
  select coalesce(array_agg(distinct w ->> 'sciezka') filter (where w ->> 'sciezka' is not null), '{}') into v_pliki
    from jsonb_array_elements(v_dane) g, jsonb_array_elements(g -> 'wiersze') w
   where g ->> 'tabela' in ('dokumenty', 'pliki_edytowalne');

  -- Opis i zapytanie dla listy kosza.
  if p_rodzaj = 'zapytanie' then
    select id, numer, numer || ' - ' || przedmiot into v_zap, v_numer, v_opis from public.zapytania where id = p_id::uuid;
  elsif p_rodzaj = 'wycena' then
    select w.zapytanie_id, z.numer, z.numer || ' - wycena v' || w.wersja || coalesce(' ' || w.nazwa, '') into v_zap, v_numer, v_opis
      from public.wyceny w join public.zapytania z on z.id = w.zapytanie_id where w.id = p_id::uuid;
  elsif p_rodzaj = 'dokument' then
    select d.zapytanie_id, z.numer, d.nazwa_pliku into v_zap, v_numer, v_opis from public.dokumenty d left join public.zapytania z on z.id = d.zapytanie_id where d.id = p_id::uuid;
  elsif p_rodzaj = 'odczyt_rysunku' then
    select o.zapytanie_id, z.numer, o.nazwa_pliku || ', str. ' || o.strona into v_zap, v_numer, v_opis from public.odczyty_rysunkow o join public.zapytania z on z.id = o.zapytanie_id where o.id = p_id::uuid;
  elsif p_rodzaj = 'oferta_dostawcy' then
    select o.zapytanie_id, z.numer, coalesce(d.nazwa, 'oferta') || coalesce(' ' || o.numer_oferty, '') into v_zap, v_numer, v_opis
      from public.oferty_dostawcow o left join public.zapytania z on z.id = o.zapytanie_id left join public.dostawcy d on d.id = o.dostawca_id where o.id = p_id::uuid;
  elsif p_rodzaj = 'import_optima' then
    select 'karta dostawy ' || numer_karty || coalesce(' (' || nazwa_pliku || ')', '') into v_opis from public.importy_optima where id = p_id::uuid;
  elsif p_rodzaj = 'import_registo' then
    select 'Registo ' || to_char(miesiac, 'YYYY-MM') || coalesce(' (' || nazwa_pliku || ')', '') into v_opis from public.importy_registo where id = p_id::uuid;
  elsif p_rodzaj = 'zapytanie_do_dostawcy' then
    select q.zapytanie_id, z.numer, 'zapytanie do dostawców: ' || coalesce(q.temat, '') into v_zap, v_numer, v_opis
      from public.zapytania_dostawcow q join public.zapytania z on z.id = q.zapytanie_id where q.id = p_id::uuid;
  elsif p_rodzaj = 'plik_edytowalny' then
    select nazwa_pliku into v_opis from public.pliki_edytowalne where id = p_id::uuid;
  end if;

  perform set_config('wyceny.system', 'tak', true);
  if p_rodzaj = 'zapytanie' then
    delete from public.oferty_dostawcow where zapytanie_id = p_id::uuid;
    delete from public.zapytania where id = p_id::uuid;
  elsif p_rodzaj = 'dokument' then delete from public.dokumenty where id = p_id::uuid;
  elsif p_rodzaj = 'odczyt_rysunku' then delete from public.odczyty_rysunkow where id = p_id::uuid;
  elsif p_rodzaj = 'wycena' then delete from public.wyceny where id = p_id::uuid;
  elsif p_rodzaj = 'oferta_dostawcy' then delete from public.oferty_dostawcow where id = p_id::uuid;
  elsif p_rodzaj = 'import_optima' then
    delete from public.zakupy where import_id = p_id::uuid;
    delete from public.importy_optima where id = p_id::uuid;
  elsif p_rodzaj = 'import_registo' then delete from public.importy_registo where id = p_id::uuid;
  elsif p_rodzaj = 'zapytanie_do_dostawcy' then delete from public.zapytania_dostawcow where id = p_id::uuid;
  elsif p_rodzaj = 'plik_edytowalny' then delete from public.pliki_edytowalne where id = p_id::uuid;
  end if;
  perform set_config('wyceny.system', '', true);

  insert into public.kosz (rodzaj, rekord_id, opis, zapytanie_id, numer_zo, dane, pliki, rozmiar)
  values (p_rodzaj, p_id, coalesce(v_opis, p_rodzaj), v_zap, v_numer, v_dane, v_pliki, octet_length(v_dane::text))
  returning id into v_kosz;
  insert into public.audit_log (tabela, rekord_id, akcja, zapytanie_id, user_id, user_email, zmiany)
  values ('kosz', p_id, 'do_kosza', v_zap, auth.uid(), auth.jwt() ->> 'email', jsonb_build_object('rodzaj', p_rodzaj, 'opis', v_opis, 'kosz_id', v_kosz));
  return v_kosz;
end $$;

/** Przywrócenie z kosza z tymi samymi id (w trybie systemowym). Kolizja numeru ZO - czytelny komunikat. */
create function public.przywroc_z_kosza(p_kosz uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  k public.kosz;
  g jsonb;
  v_tab text;
  v_wiersze jsonb;
  v_kol text;
  v_oferty jsonb := '[]'::jsonb;
begin
  if not public.jest_pracownikiem() then raise exception 'Brak uprawnień.'; end if;
  select * into k from public.kosz where id = p_kosz;
  if not found then raise exception 'Tego wpisu nie ma już w koszu.'; end if;
  if k.rodzaj = 'zapytanie' and exists (
    select 1 from public.zapytania z, jsonb_array_elements(k.dane) e, jsonb_array_elements(e -> 'wiersze') w
    where e ->> 'tabela' = 'zapytania' and z.numer = w ->> 'numer' and z.id <> (w ->> 'id')::uuid) then
    raise exception 'Numer % jest już zajęty przez inne zapytanie - zmień numer tamtego zapytania i przywróć ponownie.', k.numer_zo;
  end if;
  if k.rodzaj in ('wycena', 'odczyt_rysunku', 'dokument', 'zapytanie_do_dostawcy') and k.zapytanie_id is not null
     and not exists (select 1 from public.zapytania where id = k.zapytanie_id) then
    raise exception 'Zapytanie % jest w koszu - przywróć najpierw zapytanie.', coalesce(k.numer_zo, '');
  end if;

  perform set_config('wyceny.system', 'tak', true);
  for g in select * from jsonb_array_elements(k.dane) loop
    v_tab := g ->> 'tabela';
    v_wiersze := g -> 'wiersze';
    -- Oferta wskazuje dokument oferty, a dokument - ofertę: dokument_id uzupełniamy po wstawieniu dokumentów.
    if v_tab = 'oferty_dostawcow' then
      v_oferty := v_oferty || v_wiersze;
      select coalesce(jsonb_agg(e - 'dokument_id'), '[]'::jsonb) into v_wiersze from jsonb_array_elements(v_wiersze) e;
    end if;
    -- Kolumny bez generowanych (np. zakupy.cena_kg); identyfikatory wstawiamy te same.
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_kol
      from information_schema.columns where table_schema = 'public' and table_name = v_tab and is_generated = 'NEVER';
    execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1)', v_tab, v_kol, v_kol, v_tab)
      using v_wiersze;
  end loop;
  update public.oferty_dostawcow o set dokument_id = (w ->> 'dokument_id')::uuid
    from jsonb_array_elements(v_oferty) w where o.id = (w ->> 'id')::uuid and w ->> 'dokument_id' is not null
     and exists (select 1 from public.dokumenty d where d.id = (w ->> 'dokument_id')::uuid);
  perform set_config('wyceny.system', '', true);

  delete from public.kosz where id = p_kosz;
  insert into public.audit_log (tabela, rekord_id, akcja, zapytanie_id, user_id, user_email, zmiany)
  values ('kosz', k.rekord_id, 'przywrocenie', k.zapytanie_id, auth.uid(), auth.jwt() ->> 'email', jsonb_build_object('rodzaj', k.rodzaj, 'opis', k.opis));
end $$;

/**
 * Trwałe usunięcie (prezes / administrator): dla zapytania trzeba wpisać jego numer ZO. Zwraca ścieżki plików do usunięcia
 * ze Storage (usuwa je aplikacja przez API Storage - polityka niżej pozwala prezesowi i administratorowi).
 */
create function public.usun_z_kosza_trwale(p_kosz uuid, p_potwierdzenie text default null) returns text[]
language plpgsql security definer set search_path = public as $$
declare k public.kosz;
begin
  if not (public.jest_administratorem() or public.ma_role('prezes')) then
    raise exception 'Trwale usuwa tylko prezes albo administrator.';
  end if;
  select * into k from public.kosz where id = p_kosz;
  if not found then return '{}'; end if;
  if k.rodzaj = 'zapytanie' and coalesce(trim(p_potwierdzenie), '') <> coalesce(k.numer_zo, '') then
    raise exception 'Aby trwale usunąć zapytanie, wpisz jego numer: %', k.numer_zo;
  end if;
  delete from public.kosz where id = p_kosz;
  insert into public.audit_log (tabela, rekord_id, akcja, zapytanie_id, user_id, user_email, zmiany)
  values ('kosz', k.rekord_id, 'usuniecie_trwale', k.zapytanie_id, auth.uid(), auth.jwt() ->> 'email', jsonb_build_object('rodzaj', k.rodzaj, 'opis', k.opis, 'plikow', cardinality(k.pliki)));
  return k.pliki;
end $$;

/** Wpisy kosza starsze niż ustawienie "kosz.dni" - dla funkcji czyszczącej (konto serwisowe). */
create function public.kosz_do_wyczyszczenia() returns setof public.kosz
language sql stable set search_path = public as $$
  select * from public.kosz
  where usunieto < now() - make_interval(days => coalesce((select (wartosc ->> 'dni')::int from public.ustawienia where klucz = 'kosz'), 30));
$$;

-- Pliki usuniętych rekordów (wierszy już nie ma) - kasuje prezes / administrator przy trwałym usunięciu.
create policy kosz_pliki_usuniecie on storage.objects for delete to authenticated
  using (bucket_id = 'dokumenty' and (public.jest_administratorem() or public.ma_role('prezes')));

revoke execute on function public._kosz_wiersze(text), public._kosz_dokumenty(text), public._kosz_migawka(text, text),
  public._kosz_moze(text, text), public.kosz_do_wyczyszczenia() from public, anon, authenticated;
grant execute on function public.kosz_do_wyczyszczenia() to service_role;
revoke execute on function public.przenies_do_kosza(text, text), public.przywroc_z_kosza(uuid), public.usun_z_kosza_trwale(uuid, text) from public, anon;
grant execute on function public.przenies_do_kosza(text, text), public.przywroc_z_kosza(uuid), public.usun_z_kosza_trwale(uuid, text) to authenticated;

-- Automatyczne czyszczenie kosza raz dziennie (funkcja "czysc-kosz" usuwa pliki ze Storage i wpisy po terminie).
select cron.schedule(
  'czysc-kosz',
  '15 2 * * *',
  $$
  select net.http_post(
    url := s.decrypted_secret || '/functions/v1/czysc-kosz',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  from vault.decrypted_secrets s
  where s.name = 'url_projektu';
  $$
);
