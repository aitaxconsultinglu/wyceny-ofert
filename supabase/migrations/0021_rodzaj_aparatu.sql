-- Runda 2: rodzaj aparatu wybierany przy zakładaniu zapytania - zbiornik albo wymiennik ciepła (z zakresem: kompletny,
-- wkład rurowy / wiązka, część wymiennika). Rodzaj decyduje o szablonie elementów, kategoriach tabel rysunków i wymaganiach;
-- aparaty wyceny dziedziczą typ z zapytania (w wycenie nie ma już wyboru). aparaty.typ zostaje dla starych wartości.

alter table public.zapytania
  add column rodzaj_aparatu    text check (rodzaj_aparatu in ('zbiornik', 'wymiennik')),
  add column zakres_wymiennika text check (zakres_wymiennika in ('kompletny', 'wiazka', 'czesc')),
  add column zakres_opis       text,
  add constraint zapytania_zakres_tylko_wymiennik check (zakres_wymiennika is null or rodzaj_aparatu = 'wymiennik');

-- Stare zapytania: rodzaj z aparatów wycen, potem z przedmiotu; nieustalone zostają puste (ekran wyboru w aplikacji).
update public.zapytania z set
  rodzaj_aparatu = s.rodzaj,
  zakres_wymiennika = case when s.rodzaj = 'wymiennik' then s.zakres end
from (
  select z2.id,
    case
      when exists (select 1 from public.wyceny w join public.aparaty a on a.wycena_id = w.id
                   where w.zapytanie_id = z2.id and a.typ ~* '(wymiennik|wkład|wklad)') then 'wymiennik'
      when exists (select 1 from public.wyceny w join public.aparaty a on a.wycena_id = w.id
                   where w.zapytanie_id = z2.id and a.typ ~* 'zbiornik') then 'zbiornik'
      when z2.przedmiot ~* '(wymienn|wkład|wklad|chłodnic|chlodnic|skraplacz|exchanger|wężownic|wezownic)' then 'wymiennik'
      when z2.przedmiot ~* '(zbiornik|tank)' then 'zbiornik'
    end as rodzaj,
    case
      when z2.przedmiot ~* '(wkład|wklad|wiązk|wiazk|bundle)'
        or exists (select 1 from public.wyceny w join public.aparaty a on a.wycena_id = w.id
                   where w.zapytanie_id = z2.id and a.typ ~* '(wkład|wklad)') then 'wiazka'
      when z2.przedmiot ~* '(wężownic|wezownic|głowic|glowic|część|czesc)' then 'czesc'
      else 'kompletny'
    end as zakres
  from public.zapytania z2
) s
where s.id = z.id and z.rodzaj_aparatu is null and s.rodzaj is not null;

-- Nowe zapytanie musi mieć rodzaj (pierwsze pole formularza); stare bez rodzaju dostają go przy pierwszym wejściu.
create function public.wymagaj_rodzaju_aparatu() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.rodzaj_aparatu is null then
    raise exception 'Wybierz rodzaj aparatu: zbiornik albo wymiennik ciepła.';
  end if;
  if new.rodzaj_aparatu = 'wymiennik' and new.zakres_wymiennika is null then
    new.zakres_wymiennika := 'kompletny';
  end if;
  return new;
end $$;
create trigger trg_rodzaj_aparatu before insert on public.zapytania
  for each row execute function public.wymagaj_rodzaju_aparatu();

-- Raz ustawionego rodzaju nie można wyczyścić (zmiana zbiornik <-> wymiennik dozwolona - ostrzega aplikacja).
create function public.chron_rodzaj_aparatu() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.rodzaj_aparatu is not null and new.rodzaj_aparatu is null then
    raise exception 'Rodzaju aparatu nie można usunąć - wybierz zbiornik albo wymiennik ciepła.';
  end if;
  if new.rodzaj_aparatu = 'zbiornik' then new.zakres_wymiennika := null; new.zakres_opis := null; end if;
  if new.rodzaj_aparatu = 'wymiennik' and new.zakres_wymiennika is null then new.zakres_wymiennika := 'kompletny'; end if;
  return new;
end $$;
create trigger trg_chron_rodzaj_aparatu before update on public.zapytania
  for each row execute function public.chron_rodzaj_aparatu();

-- Typ aparatu w wycenie z rodzaju zapytania (wartości zgodne ze szablonami: zbiornik / wymiennik / wkład rurowy).
create function public.typ_aparatu_zapytania(p_zapytanie uuid) returns text
language sql stable set search_path = public as $$
  select case
    when z.rodzaj_aparatu = 'zbiornik' then 'zbiornik'
    when z.rodzaj_aparatu = 'wymiennik' and z.zakres_wymiennika = 'wiazka' then 'wkład rurowy'
    when z.rodzaj_aparatu = 'wymiennik' and z.zakres_wymiennika = 'czesc' then 'część wymiennika'
    when z.rodzaj_aparatu = 'wymiennik' then 'wymiennik płaszczowo-rurowy'
  end
  from public.zapytania z where z.id = p_zapytanie;
$$;
revoke execute on function public.typ_aparatu_zapytania(uuid) from public, anon;
grant execute on function public.typ_aparatu_zapytania(uuid) to authenticated, service_role;

create function public.typ_aparatu_z_zapytania() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.typ is null then
    new.typ := public.typ_aparatu_zapytania((select w.zapytanie_id from public.wyceny w where w.id = new.wycena_id));
  end if;
  return new;
end $$;
create trigger trg_typ_aparatu before insert on public.aparaty
  for each row execute function public.typ_aparatu_z_zapytania();

-- Ustawienie trybu "etap1" przestaje mieć znaczenie (aplikacja ma jedną wersję); wiersz zostaje w historii migracji.
delete from public.ustawienia where klucz = 'moduly';
