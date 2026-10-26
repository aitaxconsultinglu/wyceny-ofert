-- Kosz (runda 2, faza 8): usunięte zapytanie zabiera do kosza także prośby o oferty; po przywróceniu wracają razem
-- z ofertami. Prośba i oferta wskazują na siebie (wybrana oferta / oferta do prośby) - klucz oferty do prośby sprawdzany
-- na końcu transakcji, więc kolejność odtwarzania wierszy nie ma znaczenia.
alter table public.oferty_dostawcow drop constraint oferty_dostawcow_prosba_id_fkey;
alter table public.oferty_dostawcow add constraint oferty_dostawcow_prosba_id_fkey foreign key (prosba_id)
  references public.prosby_o_oferte(id) on delete set null deferrable initially deferred;
alter table public.prosby_o_oferte drop constraint prosby_o_oferte_oferta_id_fkey;
alter table public.prosby_o_oferte add constraint prosby_o_oferte_oferta_id_fkey foreign key (oferta_id)
  references public.oferty_dostawcow(id) on delete set null deferrable initially deferred;

/** Migawka rekordu z zależnymi wierszami, w kolejności odtwarzania. */
create or replace function public._kosz_migawka(p_rodzaj text, p_id text) returns jsonb
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
      jsonb_build_object('tabela', 'prosby_o_oferte', 'wiersze', public._kosz_wiersze('select * from public.prosby_o_oferte where zapytanie_id = ' || q)),
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

