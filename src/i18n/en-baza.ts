// Komunikaty bazy danych i funkcji brzegowych (po polsku, z triggerów i funkcji SQL) - tłumaczone, gdy przyjdą do interfejsu
// w trybie angielskim (komunikatPL -> tDowolny). Komunikaty z parametrami (np. numer ZO) zostają po polsku.
export const EN_BAZA: Record<string, string> = {
  'Wybierz rodzaj aparatu: zbiornik albo wymiennik ciepła.': 'Choose the apparatus kind: tank or heat exchanger.',
  'Rodzaju aparatu nie można usunąć - wybierz zbiornik albo wymiennik ciepła.': 'The apparatus kind cannot be removed - choose tank or heat exchanger.',
  'Brak uprawnień do usunięcia (zatwierdzone wyceny usuwa prezes albo administrator; zapytanie - jego autor w statusie nowe / w analizie).':
    'No permission to delete (approved quotes are deleted by the president or administrator; an inquiry - by its author in status new / under analysis).',
  'Rekord nie istnieje (mógł zostać już usunięty).': 'The record does not exist (it may have been deleted already).',
  'Tego wpisu nie ma już w koszu.': 'This entry is no longer in the trash.',
  'Trwale usuwa tylko prezes albo administrator.': 'Only the president or administrator can delete permanently.',
  'Brak uprawnień.': 'No permission.',
  'Brak autoryzacji - zaloguj się ponownie.': 'Not authorised - log in again.',
  'Nieprawidłowe dane wywołania.': 'Invalid call data.',
  'Brak treści do analizy.': 'No content to analyse.',
  'Model odmówił przetworzenia dokumentu. Spróbuj ponownie albo wprowadź dane ręcznie.': 'The model refused to process the document. Try again or enter the data manually.',
  'Odpowiedź przekroczyła limit długości - podziel dokument na mniejsze części.': 'The answer exceeded the length limit - split the document into smaller parts.',
  'Model zwrócił nieprawidłową odpowiedź. Spróbuj ponownie.': 'The model returned an invalid answer. Try again.',
}
