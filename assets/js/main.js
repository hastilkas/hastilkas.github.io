/* Сборка карточек проектов, фильтр, видео, тема, лайтбокс.
   Все данные вставляются через textContent — никакого innerHTML с данными, поэтому
   текст из projects.js не может сломать страницу или выполнить чужой код. */
(function () {
  'use strict';

  var projects = Array.isArray(window.PROJECTS) ? window.PROJECTS : [];
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var CATEGORY_NAMES = { bots: 'Telegram-боты', sites: 'Сайты', parsers: 'Парсеры' };

  /* ---------- маленький помощник для создания элементов ---------- */
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function safeHref(href) {
    // Только http(s), mailto и относительные ссылки — javascript: и прочее отбрасываем
    return /^(https?:\/\/|mailto:|\/|\.\/|#|assets\/)/i.test(String(href || '')) ? href : '#';
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* ---------- медиа: видео или картинка ---------- */
  function buildMedia(m, opts) {
    var frame = el('div', 'media' + (opts && opts.small ? ' media--small' : ''));
    if (m.width && m.height) frame.style.aspectRatio = m.width + ' / ' + m.height;

    if (m.video) {
      var video = el('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.preload = 'none';
      if (m.poster) video.poster = m.poster;
      if (m.width) { video.width = m.width; video.height = m.height; }
      video.setAttribute('aria-label', m.alt || m.caption || 'Видео-демонстрация');
      var source = el('source');
      source.src = m.video;
      source.type = 'video/mp4';
      video.appendChild(source);
      frame.appendChild(video);

      var toggle = el('button', 'media__toggle');
      toggle.type = 'button';
      frame.appendChild(toggle);
      setupVideo(video, toggle, frame);
    } else if (m.image) {
      var img = el('img');
      img.src = m.image;
      img.alt = m.alt || m.caption || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      if (m.width) { img.width = m.width; img.height = m.height; }
      frame.appendChild(img);
      frame.classList.add('media--zoom');
      frame.tabIndex = 0;
      frame.setAttribute('role', 'button');
      frame.setAttribute('aria-label', 'Открыть крупнее: ' + (m.caption || m.alt || 'изображение'));
      frame.addEventListener('click', function () { openLightbox(m.image, m.caption || m.alt || ''); });
      frame.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(m.image, m.caption || m.alt || ''); }
      });
    }
    return frame;
  }

  /* ---------- видео: играет, только когда на экране ---------- */
  var videoObserver = null;
  var videoState = new WeakMap();

  function setToggle(toggle, playing) {
    toggle.setAttribute('aria-label', playing ? 'Пауза' : 'Воспроизвести');
    toggle.dataset.state = playing ? 'playing' : 'paused';
  }

  function tryPlay(video, toggle) {
    var p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(function () { setToggle(toggle, true); }, function () { setToggle(toggle, false); });
    } else {
      setToggle(toggle, true);
    }
  }

  function setupVideo(video, toggle, frame) {
    // userPaused: человек сам нажал паузу — не включаем снова при прокрутке
    var state = { userPaused: reduceMotion.matches, visible: false, toggle: toggle };
    videoState.set(video, state);
    setToggle(toggle, false);

    toggle.addEventListener('click', function () {
      if (video.paused) {
        state.userPaused = false;
        tryPlay(video, toggle);
      } else {
        state.userPaused = true;
        video.pause();
        setToggle(toggle, false);
      }
    });
    // Клик по самому видео — на весь экран (на телефоне мелкий текст в демо иначе не прочитать)
    video.addEventListener('click', function () {
      if (video.requestFullscreen) video.requestFullscreen().catch(function () {});
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    });
    video.addEventListener('pause', function () { setToggle(toggle, false); });
    video.addEventListener('play', function () { setToggle(toggle, true); });
    // Если файл не загрузился — остаётся постер, кнопку прячем
    video.addEventListener('error', function () { toggle.hidden = true; }, true);
    video.querySelector('source').addEventListener('error', function () { toggle.hidden = true; });

    if (!('IntersectionObserver' in window)) {
      if (!state.userPaused) tryPlay(video, toggle);
      return;
    }
    if (!videoObserver) {
      videoObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var v = entry.target;
          var s = videoState.get(v);
          if (!s) return;
          s.visible = entry.isIntersecting;
          if (entry.isIntersecting) {
            if (!s.userPaused && v.paused) tryPlay(v, s.toggle);
          } else if (!v.paused) {
            v.pause();
          }
        });
      }, { threshold: 0.35 });
    }
    videoObserver.observe(video);
  }

  // Вкладка скрыта — ставим всё на паузу, вернулись — продолжаем видимые
  document.addEventListener('visibilitychange', function () {
    document.querySelectorAll('.media video').forEach(function (v) {
      var s = videoState.get(v);
      if (!s) return;
      if (document.hidden) v.pause();
      else if (s.visible && !s.userPaused) tryPlay(v, s.toggle);
    });
  });

  /* ---------- карточка проекта ---------- */
  function buildProject(p, index) {
    var m = p.media || {};
    var wide = m.width && m.height && m.width / m.height > 1.6;
    var card = el('article', 'project' + (wide ? ' project--wide' : '') + (index % 2 ? ' project--flip' : ''));
    if (p.id) card.id = p.id;
    card.dataset.categories = (p.categories || []).join(' ');

    var visual = el('div', 'project__visual');
    if (p.media) visual.appendChild(buildMedia(p.media));
    if (Array.isArray(p.gallery) && p.gallery.length) {
      var gallery = el('div', 'gallery');
      p.gallery.forEach(function (g) {
        // Очень широкие картинки (скриншот таблицы) — на всю ширину, иначе их не разглядеть
        var full = g.width && g.height && g.width / g.height > 3;
        var fig = el('figure', 'gallery__item' + (full ? ' gallery__item--full' : ''));
        fig.appendChild(buildMedia(g, { small: true }));
        if (g.caption) fig.appendChild(el('figcaption', null, g.caption));
        gallery.appendChild(fig);
      });
      visual.appendChild(gallery);
    }

    var body = el('div', 'project__body');
    body.appendChild(el('p', 'project__kind', p.kind || ''));
    body.appendChild(el('h3', 'project__title', p.title || ''));
    if (p.simple) body.appendChild(el('p', 'project__simple', p.simple));

    if (Array.isArray(p.audience) && p.audience.length) {
      var aud = el('div', 'project__audience');
      aud.appendChild(el('span', 'project__label', 'Кому подходит'));
      var list = el('ul', 'tags');
      p.audience.forEach(function (a) { list.appendChild(el('li', 'tag', a)); });
      aud.appendChild(list);
      body.appendChild(aud);
    }

    if (Array.isArray(p.results) && p.results.length) {
      var res = el('div', 'results');
      res.appendChild(el('span', 'project__label', 'Какую проблему решает'));
      var rl = el('ul');
      p.results.forEach(function (r) {
        var li = el('li');
        li.appendChild(el('span', 'results__before', r[0]));
        li.appendChild(el('span', 'results__after', r[1]));
        rl.appendChild(li);
      });
      res.appendChild(rl);
      body.appendChild(res);
    }

    var meta = el('div', 'project__meta');
    var techList = el('ul', 'tech');
    techList.setAttribute('aria-label', 'Технологии');
    (p.tech || []).forEach(function (t) { techList.appendChild(el('li', null, t)); });
    var facts = (p.stats || []).slice();
    if (p.tests) facts.push(p.tests + ' ' + plural(p.tests, 'автотест', 'автотеста', 'автотестов'));
    facts.forEach(function (f) { techList.appendChild(el('li', 'tech__fact', f)); });
    meta.appendChild(techList);
    body.appendChild(meta);

    if (Array.isArray(p.links) && p.links.length) {
      var actions = el('div', 'project__links');
      p.links.forEach(function (l) {
        var a = el('a', 'btn ' + (l.primary ? 'btn--dark' : 'btn--ghost'), l.label);
        a.href = safeHref(l.href);
        if (/^https?:/i.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener'; }
        actions.appendChild(a);
      });
      body.appendChild(actions);
    }

    card.appendChild(visual);
    card.appendChild(body);
    return card;
  }

  /* ---------- фильтр (появляется, когда проектов больше трёх) ---------- */
  function buildFilters(container, cards) {
    var used = [];
    projects.forEach(function (p) {
      (p.categories || []).forEach(function (c) { if (used.indexOf(c) < 0) used.push(c); });
    });
    if (projects.length <= 3 || used.length < 2) return;

    var options = [['all', 'Все']].concat(used.map(function (c) { return [c, CATEGORY_NAMES[c] || c]; }));
    options.forEach(function (o, i) {
      var b = el('button', 'filter', o[1]);
      b.type = 'button';
      b.dataset.value = o[0];
      b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () {
        container.querySelectorAll('.filter').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        cards.forEach(function (card) {
          var cats = card.dataset.categories.split(' ');
          card.hidden = !(o[0] === 'all' || cats.indexOf(o[0]) >= 0);
        });
      });
      container.appendChild(b);
    });
    container.hidden = false;
  }

  /* ---------- лайтбокс для картинок ---------- */
  var lightbox = document.querySelector('.lightbox');
  function openLightbox(src, caption) {
    if (!lightbox || typeof lightbox.showModal !== 'function') {
      window.open(src, '_blank', 'noopener');
      return;
    }
    lightbox.querySelector('img').src = src;
    lightbox.querySelector('img').alt = caption;
    lightbox.querySelector('.lightbox__caption').textContent = caption;
    lightbox.showModal();
  }
  if (lightbox) {
    lightbox.querySelector('.lightbox__close').addEventListener('click', function () { lightbox.close(); });
    // Клик по затемнению вокруг картинки закрывает окно
    lightbox.addEventListener('click', function (e) { if (e.target === lightbox) lightbox.close(); });
  }

  /* ---------- рендер ---------- */
  var root = document.querySelector('[data-projects]');
  if (root) {
    var cards = [];
    projects.forEach(function (p, i) {
      try {
        var card = buildProject(p, i);
        cards.push(card);
        root.appendChild(card);
      } catch (err) {
        // Ошибка в одном проекте не должна ломать остальные
        console.error('Проект не отрисован:', p && p.id, err);
      }
    });
    var filters = document.querySelector('.filters');
    if (filters) buildFilters(filters, cards);
  }

  // Цифры в шапке считаются из данных — добавили проект, они обновились сами
  var countProjects = document.querySelector('[data-count="projects"]');
  var labelProjects = document.querySelector('[data-label="projects"]');
  if (countProjects && projects.length) {
    countProjects.textContent = projects.length;
    if (labelProjects) labelProjects.textContent = plural(projects.length, 'готовый проект', 'готовых проекта', 'готовых проектов');
  }
  var countTests = document.querySelectorAll('[data-count="tests"]');
  var labelTests = document.querySelector('[data-label="tests"]');
  var totalTests = projects.reduce(function (sum, p) { return sum + (Number(p.tests) || 0); }, 0);
  if (totalTests) {
    countTests.forEach(function (n) { n.textContent = totalTests; });
    if (labelTests) labelTests.textContent = plural(totalTests, 'автотест', 'автотеста', 'автотестов');
  }

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- тема ---------- */
  var themeBtn = document.querySelector('.theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var root = document.documentElement;
      var current = root.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* не сохранится — не страшно */ }
    });
  }

  // Если открыли ссылку вида #booking-bot — прокручиваем к карточке после отрисовки
  if (location.hash && location.hash.length > 1) {
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target && target.classList.contains('project')) target.scrollIntoView();
  }
})();
