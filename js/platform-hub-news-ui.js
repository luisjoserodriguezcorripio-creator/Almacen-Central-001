/**
 * Tablón informativo — UI pública y panel admin
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var CTA_BY_THEME = {
    despacho: 'Entrar a despacho',
    ops: 'Entrar a operaciones',
    mando: 'Entrar al mando',
    inventario: 'Entrar a inventario',
    turnos: 'Entrar a turnos',
    agenda: 'Vista previa',
    recepcion: 'Vista previa'
  };

  var TAG_BY_THEME = {
    despacho: 'Portal de Despacho',
    ops: 'Operaciones de Piso',
    mando: 'Control de Mando',
    inventario: 'Inventario RF',
    turnos: 'Control de Turnos',
    agenda: 'Agenda Operativa',
    recepcion: 'Gestión de Recepción y Ubicación'
  };

  var ROTATE_MS = 20000;
  var carouselTimer = null;
  var carouselIndex = 0;
  var carouselPaused = false;
  var carouselFeed = null;
  var carouselTotal = 0;

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return global.PanelCore.formatDateTime(new Date(iso));
    } catch (e) {
      return String(iso);
    }
  }

  function renderBodyHtml(body) {
    var lines = String(body || '').split('\n');
    var html = '';
    var inList = false;
    var hasIntro = false;

    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) {
        if (inList) { html += '</ul>'; inList = false; }
        return;
      }
      if (trimmed.indexOf('•') === 0) {
        if (!inList) { html += '<ul class="hub-board-card__list">'; inList = true; }
        html += '<li>' + esc(trimmed.replace(/^•\s*/, '')) + '</li>';
        return;
      }
      if (inList) { html += '</ul>'; inList = false; }
      if (/^qué puedes hacer:/i.test(trimmed) || /^en qué nos puede ayudar:/i.test(trimmed)) {
        html += '<p class="hub-board-card__lead">' + esc(trimmed) + '</p>';
      } else if (!hasIntro) {
        html += '<p class="hub-board-card__intro">' + esc(trimmed) + '</p>';
        hasIntro = true;
      }
    });
    if (inList) html += '</ul>';
    return html;
  }

  var AGENDA_BOARD_IMAGE = 'assets/img/agenda-hub-poster.jpg?v=4';
  var RECEPCION_BOARD_IMAGE = 'assets/img/recepcion-hub-poster.jpg?v=1';

  function mediaSrc(url) {
    var src = String(url || '').trim();
    if (!src) return '';
    if (/^https?:\/\//i.test(src) || src.charAt(0) === '/') return src;
    return src;
  }

  function resolveItemImage(item) {
    var url = mediaSrc(item && item.imageUrl);
    if (url) return url;
    if (item && item.theme === 'agenda') return AGENDA_BOARD_IMAGE;
    if (item && item.theme === 'recepcion') return RECEPCION_BOARD_IMAGE;
    return '';
  }

  function isImageOnlyCard(item) {
    return !!(item && (item.imageOnly || item.theme === 'agenda'));
  }

  function renderItemHtml(item, isActive) {
    var theme = item.theme || '';
    var imageSrc = resolveItemImage(item);
    var imageOnly = isImageOnlyCard(item);
    var classes = 'hub-board-slide hub-board-card';
    if (isActive) classes += ' is-active';
    if (theme) classes += ' hub-board-card--' + theme;
    if (imageSrc) classes += ' hub-board-card--has-media';
    if (imageOnly) classes += ' hub-board-card--image-only';

    var html = '<article class="' + classes + '" aria-hidden="' + (isActive ? 'false' : 'true') + '" aria-label="' + esc(item.title) + '">';

    if (imageSrc) {
      html += '<div class="hub-board-card__media">';
      html += '<img src="' + esc(imageSrc) + '" alt="' + esc(item.title) + '" loading="eager" decoding="async">';
      html += '</div>';
    }

    if (imageOnly) {
      html += '</article>';
      return html;
    }

    html += '<div class="hub-board-card__body">';
    if (theme && TAG_BY_THEME[theme]) {
      html += '<span class="hub-board-card__badge">' + esc(TAG_BY_THEME[theme]) + '</span>';
    }
    if (item.comingSoon) {
      html += '<span class="hub-board-card__soon">Próximamente</span>';
    }
    html += '<h3 class="hub-board-card__title">' + esc(item.title) + '</h3>';
    if (item.body) html += '<div class="hub-board-card__text">' + renderBodyHtml(item.body) + '</div>';

    html += '<div class="hub-board-card__footer">';
    if (item.comingSoon) {
      html += '<div class="hub-board-card__actions">';
      html += '<span class="hub-board-card__btn hub-board-card__btn--soon">Próximamente</span>';
      if (item.linkUrl) {
        html += '<a class="hub-board-card__btn hub-board-card__btn--ghost" href="' + esc(item.linkUrl) + '">' + esc(CTA_BY_THEME[theme] || 'Vista previa') + ' →</a>';
      }
      html += '</div>';
    } else if (item.linkUrl) {
      var cta = CTA_BY_THEME[theme] || 'Ver más';
      html += '<div class="hub-board-card__actions">';
      html += '<a class="hub-board-card__btn" href="' + esc(item.linkUrl) + '">' + esc(cta) + ' →</a>';
      html += '</div>';
    }
    html += '<div class="hub-board-card__meta">';
    if (item.publishedAt) {
      html += '<time datetime="' + esc(item.publishedAt) + '">' + esc(formatDate(item.publishedAt)) + '</time>';
    }
    if (item.publishedBy) {
      html += '<span> · ' + esc(item.publishedBy) + '</span>';
    }
    html += '</div></div></div></article>';
    return html;
  }

  function stopCarousel() {
    if (carouselTimer) {
      clearInterval(carouselTimer);
      carouselTimer = null;
    }
  }

  function setActiveSlide(feed, index, total) {
    var slides = feed.querySelectorAll('.hub-board-slide');
    var counter = feed.querySelector('.hub-board-carousel__counter');
    carouselIndex = ((index % total) + total) % total;

    slides.forEach(function (slide, i) {
      var active = i === carouselIndex;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', active ? 'false' : 'true');
    });

    if (counter) counter.textContent = (carouselIndex + 1) + ' / ' + total;
  }

  function advanceSlide() {
    if (!carouselFeed || carouselTotal <= 1 || carouselPaused) return;
    setActiveSlide(carouselFeed, carouselIndex + 1, carouselTotal);
  }

  function startCarousel(feed, total) {
    stopCarousel();
    carouselFeed = feed;
    carouselTotal = total;
    if (total <= 1) return;
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    carouselTimer = setInterval(advanceSlide, ROTATE_MS);
  }

  function resetCarouselTimer() {
    if (!carouselFeed || carouselTotal <= 1) return;
    startCarousel(carouselFeed, carouselTotal);
  }

  function bindCarousel(feed, total) {
    if (total <= 1) return;
    feed.addEventListener('mouseenter', function () { carouselPaused = true; });
    feed.addEventListener('mouseleave', function () { carouselPaused = false; });
  }

  function renderBoard(items) {
    var feed = document.getElementById('hubNewsFeed');
    var empty = document.getElementById('hubNewsEmpty');
    var zone = document.getElementById('hubNewsRotator');
    if (!feed) return;

    stopCarousel();
    carouselFeed = null;
    carouselTotal = 0;
    var list = items || [];

    function showEmpty(show) {
      if (empty) {
        empty.hidden = !show;
        empty.setAttribute('aria-hidden', show ? 'false' : 'true');
      }
      if (feed) {
        feed.hidden = show;
        feed.setAttribute('aria-hidden', show ? 'true' : 'false');
      }
      if (zone) zone.classList.toggle('hub-board__carousel-zone--empty', show);
    }

    if (!list.length) {
      feed.innerHTML = '';
      showEmpty(true);
      return;
    }

    showEmpty(false);

    var multi = list.length > 1;
    var html = '<div class="hub-board-carousel" role="region" aria-label="Noticias del almacén" aria-roledescription="carrusel" aria-live="polite">';
    html += '<div class="hub-board-carousel__main">';
    html += '<div class="hub-board-carousel__viewport"><div class="hub-board-carousel__track">';

    list.forEach(function (item, i) {
      html += renderItemHtml(item, i === 0);
    });

    html += '</div></div></div>';

    if (multi) {
      html += '<p class="hub-board-carousel__counter" aria-live="polite">1 / ' + list.length + '</p>';
    }

    html += '</div>';
    feed.innerHTML = html;

    carouselIndex = 0;
    carouselPaused = false;
    bindCarousel(feed, list.length);
    startCarousel(feed, list.length);
  }

  function renderAdminPanel(host, options) {
    if (!host) return;
    var items = (options && options.items) || [];
    var actor = (options && options.actor) || 'Administrador';
    var onSave = options && options.onSave;
    var onDelete = options && options.onDelete;
    var setupRequired = options && options.setupRequired;

    var html = '<div class="hub-news-admin">';
    html += '<p class="admin-hint">Publica avisos visibles en la <strong>web principal</strong> (tablón antes de elegir portal). Solo usuarios con rol <strong>Administrador</strong>.</p>';
    if (setupRequired) {
      html += '<div class="admin-alert admin-alert-warn"><strong>Supabase Free</strong><p>Las noticias se sincronizan por <code>web_snapshots</code> (plan gratuito). Si prefiere tabla dedicada, ejecute <code>SETUP-HUB-NEWS-SUPABASE.bat</code>.</p></div>';
    }
    html += '<form id="hubNewsForm" class="admin-form hub-news-form">';
    html += '<input type="hidden" id="hubNewsEditId" value="">';
    html += '<label for="hubNewsTitle">Título del aviso</label>';
    html += '<input id="hubNewsTitle" maxlength="120" placeholder="Ej.: Portal de Despacho" required>';
    html += '<label for="hubNewsBody">Detalle</label>';
    html += '<textarea id="hubNewsBody" rows="6" maxlength="2000" placeholder="Descripción corta y lista con • para cada punto…"></textarea>';
    html += '<div class="admin-form-row">';
    html += '<div><label for="hubNewsImage">Imagen (ruta)</label>';
    html += '<input id="hubNewsImage" maxlength="240" placeholder="assets/img/login-dispatch-poster.jpg"></div>';
    html += '<div><label for="hubNewsLink">Enlace portal</label>';
    html += '<input id="hubNewsLink" maxlength="240" placeholder="despacho.html"></div></div>';
    html += '<label for="hubNewsTheme">Estilo / portal</label>';
    html += '<select id="hubNewsTheme"><option value="">General</option>';
    html += '<option value="despacho">Despacho (naranja)</option>';
    html += '<option value="ops">Operaciones (verde)</option>';
    html += '<option value="mando">Mando (azul)</option>';
    html += '<option value="inventario">Inventario (dorado)</option>';
    html += '<option value="turnos">Turnos (azul)</option>';
    html += '<option value="agenda">Agenda (turquesa)</option>';
    html += '<option value="recepcion">Recepción patio (rojo)</option></select>';
    html += '<label class="hub-news-check"><input type="checkbox" id="hubNewsPinned"> Fijar arriba del tablón</label>';
    html += '<div class="admin-btn-row">';
    html += '<button type="submit" class="btn btn-primary" id="hubNewsSubmit">Publicar aviso</button>';
    html += '<button type="button" class="btn" id="hubNewsCancelEdit" hidden>Cancelar edición</button>';
    html += '</div></form>';
    html += '<div class="status-msg" id="hubNewsAdminStatus"></div>';
    html += '<h4 class="admin-subtitle">Avisos publicados</h4>';

    if (!items.length) {
      html += '<p class="admin-empty">No hay noticias activas.</p>';
    } else {
      html += '<div class="admin-table-wrap"><table class="data-table hub-news-admin-table"><thead><tr>';
      html += '<th>Título</th><th>Portal</th><th>Fecha</th><th></th></tr></thead><tbody>';
      items.forEach(function (item) {
        html += '<tr><td>' + (item.pinned ? '📌 ' : '') + esc(item.title) + '</td>';
        html += '<td>' + esc(TAG_BY_THEME[item.theme] || 'General') + '</td>';
        html += '<td>' + esc(formatDate(item.publishedAt)) + '</td>';
        html += '<td class="admin-actions">';
        html += '<button type="button" class="btn btn-sm" data-edit-news="' + esc(item.id) + '">Editar</button> ';
        html += '<button type="button" class="btn btn-sm" data-del-news="' + esc(item.id) + '">Quitar</button>';
        html += '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
    host.innerHTML = html;

    var form = host.querySelector('#hubNewsForm');
    var statusEl = host.querySelector('#hubNewsAdminStatus');
    var editId = host.querySelector('#hubNewsEditId');
    var titleEl = host.querySelector('#hubNewsTitle');
    var bodyEl = host.querySelector('#hubNewsBody');
    var imageEl = host.querySelector('#hubNewsImage');
    var linkEl = host.querySelector('#hubNewsLink');
    var themeEl = host.querySelector('#hubNewsTheme');
    var pinnedEl = host.querySelector('#hubNewsPinned');
    var submitBtn = host.querySelector('#hubNewsSubmit');
    var cancelBtn = host.querySelector('#hubNewsCancelEdit');

    function setStatus(msg, isErr) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.className = 'status-msg show ' + (isErr ? 'err' : 'ok');
    }

    function resetForm() {
      if (editId) editId.value = '';
      if (titleEl) titleEl.value = '';
      if (bodyEl) bodyEl.value = '';
      if (imageEl) imageEl.value = '';
      if (linkEl) linkEl.value = '';
      if (themeEl) themeEl.value = '';
      if (pinnedEl) pinnedEl.checked = false;
      if (submitBtn) submitBtn.textContent = 'Publicar aviso';
      if (cancelBtn) cancelBtn.hidden = true;
    }

    if (form && onSave) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        onSave({
          id: editId ? editId.value : '',
          title: titleEl ? titleEl.value : '',
          body: bodyEl ? bodyEl.value : '',
          imageUrl: imageEl ? imageEl.value : '',
          linkUrl: linkEl ? linkEl.value : '',
          theme: themeEl ? themeEl.value : '',
          pinned: pinnedEl ? pinnedEl.checked : false
        }).then(function (res) {
          if (!res.ok) {
            setStatus(res.message || 'No se pudo guardar.', true);
            return;
          }
          setStatus(res.message || 'Aviso publicado.', false);
          resetForm();
        });
      });
    }

    if (cancelBtn) cancelBtn.addEventListener('click', resetForm);

    host.querySelectorAll('[data-edit-news]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-edit-news');
        var item = items.find(function (n) { return n.id === id; });
        if (!item) return;
        if (editId) editId.value = item.id;
        if (titleEl) titleEl.value = item.title;
        if (bodyEl) bodyEl.value = item.body || '';
        if (imageEl) imageEl.value = item.imageUrl || '';
        if (linkEl) linkEl.value = item.linkUrl || '';
        if (themeEl) themeEl.value = item.theme || '';
        if (pinnedEl) pinnedEl.checked = !!item.pinned;
        if (submitBtn) submitBtn.textContent = 'Guardar cambios';
        if (cancelBtn) cancelBtn.hidden = false;
        if (titleEl) titleEl.focus();
      });
    });

    host.querySelectorAll('[data-del-news]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-del-news');
        if (!id || !confirm('¿Quitar este aviso del tablón?')) return;
        if (onDelete) {
          onDelete(id).then(function (res) {
            if (!res.ok) setStatus(res.message || 'No se pudo quitar.', true);
            else setStatus('Aviso retirado del tablón.', false);
          });
        }
      });
    });
  }

  global.PlatformHubNewsUI = {
    renderBoard: renderBoard,
    renderAdminPanel: renderAdminPanel,
    stopCarousel: stopCarousel
  };
})(typeof window !== 'undefined' ? window : this);
