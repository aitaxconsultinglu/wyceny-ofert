-- Poprawki kosza: przywracana wycena dostaje marże z migawki (trigger tworzy domyślne przy wstawieniu wyceny),
-- a stare zapytanie bez rodzaju aparatu da się przywrócić (wymóg rodzaju dotyczy nowych zapytań, nie trybu systemowego).

create or replace function public.wymagaj_rodzaju_aparatu() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.rodzaj_aparatu is null and not public.tryb_systemowy() then
    raise exception 'Wybierz rodzaj aparatu: zbiornik albo wymiennik ciepła.';
  end if;
  if new.rodzaj_aparatu = 'wymiennik' and new.zakres_wymiennika is null then
    new.zakres_wymiennika := 'kompletny';
  end if;
  return new;
end $$;

/** Przywrócenie z kosza z tymi samymi id (w trybie systemowym). Kolizja numeru ZO - czytelny komunikat. */
create or replace function public.przywroc_z_kosza(p_kosz uuid) returns void
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
    -- Wiersze tworzone automatycznie przez triggery przy wstawianiu rodzica (marże wyceny) - zastępujemy migawką.
    if v_tab = 'wyceny_marze' then
      delete from public.wyceny_marze where wycena_id in (select (e ->> 'wycena_id')::uuid from jsonb_array_elements(v_wiersze) e);
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

