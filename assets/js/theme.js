/* Ставит сохранённую тему до отрисовки страницы, чтобы не было вспышки.
   Подключается в <head> без defer. Без сохранённого выбора тема берётся из системы. */
(function () {
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) { /* приватный режим или запрет хранилища — просто системная тема */ }
})();
