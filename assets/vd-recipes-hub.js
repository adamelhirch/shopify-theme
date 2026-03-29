(function () {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function getPreviewThemeId() {
    var fromQuery = new URLSearchParams(window.location.search).get('preview_theme_id');
    if (fromQuery) return fromQuery;

    var shopifyTheme = window.Shopify && window.Shopify.theme;
    if (shopifyTheme && shopifyTheme.role === 'unpublished' && shopifyTheme.id) {
      return String(shopifyTheme.id);
    }

    return '';
  }

  function appendPreviewThemeId(url) {
    if (!url) return url;

    var previewThemeId = getPreviewThemeId();
    if (!previewThemeId) return url;

    try {
      var resolvedUrl = new URL(url, window.location.origin);
      if (!resolvedUrl.searchParams.get('preview_theme_id')) {
        resolvedUrl.searchParams.set('preview_theme_id', previewThemeId);
      }

      return resolvedUrl.origin === window.location.origin
        ? resolvedUrl.pathname + resolvedUrl.search + resolvedUrl.hash
        : resolvedUrl.toString();
    } catch (error) {
      return url;
    }
  }

  function recipeSearchText(recipe) {
    return normalize(
      [
        recipe.title,
        recipe.subtitle,
        recipe.summary,
        recipe.category,
        recipe.access,
        recipe.difficulty && recipe.difficulty.label,
        recipe.difficulty && recipe.difficulty.value,
        recipe.search_terms && recipe.search_terms.join(' '),
        recipe.tags && recipe.tags.join(' '),
        recipe.collections && recipe.collections.join(' '),
        recipe.ingredient_groups && recipe.ingredient_groups.map(function (group) {
          return (group.items || []).map(function (item) { return item.name || ''; }).join(' ');
        }).join(' '),
        recipe.product && recipe.product.handle,
        recipe.product && recipe.product.required_handles && recipe.product.required_handles.join(' ')
      ].join(' ')
    );
  }

  function parseDurationMinutes(value) {
    if (!value) return 0;
    var text = String(value).trim().toLowerCase();
    if (!text) return 0;
    var match = text.match(/(\d+(?:[.,]\d+)?)/);
    if (!match) return 0;
    var amount = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(amount)) return 0;
    if (text.indexOf('h') !== -1 || text.indexOf('heure') !== -1) {
      return Math.max(1, Math.round(amount * 60));
    }
    return Math.max(1, Math.round(amount));
  }

  function loadJSON(key, fallback) {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {}
  }

  function normalizeFavoritePayload(data) {
    var source = data && typeof data === 'object' ? data : {};
    return {
      slugs: Array.isArray(source.slugs)
        ? source.slugs.map(function (value) { return String(value || '').trim(); }).filter(Boolean).slice(0, 24)
        : [],
      updated_at: source.updated_at || '',
      updated_by: source.updated_by || ''
    };
  }

  function normalizeHistoryPayload(data) {
    var source = data && typeof data === 'object' ? data : {};
    return {
      items: Array.isArray(source.items)
        ? source.items.map(function (entry) {
            var item = entry && typeof entry === 'object' ? entry : { slug: entry };
            var slug = String(item.slug || '').trim();
            if (!slug) return null;
            return {
              slug: slug,
              saved_at: item.saved_at || item.at || '',
              title: item.title || ''
            };
          }).filter(Boolean).slice(0, 24)
        : [],
      updated_at: source.updated_at || '',
      updated_by: source.updated_by || ''
    };
  }

  function payloadSignature(value) {
    return JSON.stringify(value || {});
  }

  function mergeFavoritePayloads(localPayload, remotePayload) {
    var local = normalizeFavoritePayload(localPayload);
    var remote = normalizeFavoritePayload(remotePayload);
    var merged = [];

    remote.slugs.concat(local.slugs).forEach(function (slug) {
      if (merged.indexOf(slug) === -1) merged.push(slug);
    });

    return {
      slugs: merged.slice(0, 24),
      updated_at: local.updated_at || remote.updated_at || '',
      updated_by: local.updated_by || remote.updated_by || ''
    };
  }

  function mergeHistoryPayloads(localPayload, remotePayload) {
    var local = normalizeHistoryPayload(localPayload);
    var remote = normalizeHistoryPayload(remotePayload);
    var bySlug = {};

    remote.items.concat(local.items).forEach(function (entry) {
      if (!entry || !entry.slug) return;
      var current = bySlug[entry.slug];
      var currentTime = current && Date.parse(current.saved_at || '') || 0;
      var nextTime = Date.parse(entry.saved_at || '') || 0;
      if (!current || nextTime >= currentTime) {
        bySlug[entry.slug] = {
          slug: entry.slug,
          saved_at: entry.saved_at || new Date().toISOString(),
          title: entry.title || (current && current.title) || ''
        };
      }
    });

    return {
      items: Object.keys(bySlug).map(function (slug) {
        return bySlug[slug];
      }).sort(function (left, right) {
        return (Date.parse(right.saved_at || '') || 0) - (Date.parse(left.saved_at || '') || 0);
      }).slice(0, 24),
      updated_at: local.updated_at || remote.updated_at || '',
      updated_by: local.updated_by || remote.updated_by || ''
    };
  }

  function createShelfClient(section) {
    var endpoint = (section.getAttribute('data-customer-shelf-endpoint') || '').trim();
    var authenticated = section.getAttribute('data-customer-authenticated') === 'true';

    function request(method, payload) {
      if (!endpoint || !authenticated) return Promise.resolve(null);

      return fetch(endpoint, {
        method: method,
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: payload ? JSON.stringify(payload) : undefined
      }).then(function (response) {
        if (!response.ok) throw new Error('shelf_request_failed');
        return response.json();
      });
    }

    return {
      enabled: !!(endpoint && authenticated),
      fetch: function () {
        return request('GET');
      },
      syncLocalStores: function () {
        return request('POST', {
          favorites: favoriteStore(),
          history: historyStore()
        });
      },
      applyRemote: function (payload) {
        if (!payload) return { changed: false };
        var mergedFavorites = mergeFavoritePayloads(favoriteStore(), payload.favorites);
        var mergedHistory = mergeHistoryPayloads(historyStore(), payload.history);
        var remoteFavorites = normalizeFavoritePayload(payload.favorites);
        var remoteHistory = normalizeHistoryPayload(payload.history);
        saveJSON('vd-recipes-favorites', mergedFavorites);
        saveJSON('vd-recipes-history', mergedHistory);
        return {
          changed: payloadSignature(mergedFavorites) !== payloadSignature(remoteFavorites) || payloadSignature(mergedHistory) !== payloadSignature(remoteHistory)
        };
      }
    };
  }

  function favoriteStore() {
    return normalizeFavoritePayload(loadJSON('vd-recipes-favorites', { slugs: [] }));
  }

  function historyStore() {
    return normalizeHistoryPayload(loadJSON('vd-recipes-history', { items: [] }));
  }

  function syncShelfState(shelfClient) {
    if (!shelfClient || !shelfClient.enabled) return Promise.resolve(null);
    return shelfClient.syncLocalStores()
      .then(function (payload) {
        if (payload) shelfClient.applyRemote(payload);
        return payload;
      })
      .catch(function () {
        return null;
      });
  }

  function recipeHref(recipe) {
    var baseUrl = recipe.page_url || ('/pages/recettes?recipe=' + encodeURIComponent(recipe.slug || ''));
    return appendPreviewThemeId(baseUrl);
  }

  function parseEditorMedia(section) {
    var node = section.querySelector('[data-vd-recipe-editor-media]');
    if (!node) return [];

    try {
      var payload = JSON.parse(node.textContent || '[]');
      return Array.isArray(payload) ? payload : [];
    } catch (error) {
      return [];
    }
  }

  function buildHeroOverrideMap(section) {
    return parseEditorMedia(section).reduce(function (map, item) {
      if (!item || item.placement !== 'hero' || !item.recipe_slug || !item.image_url) return map;
      map[item.recipe_slug] = item;
      return map;
    }, {});
  }

  function metricValue(recipe) {
    var parts = [];
    if (recipe.timing && recipe.timing.total) parts.push(recipe.timing.total);
    if (recipe.difficulty && recipe.difficulty.label) parts.push(recipe.difficulty.label);
    if (recipe.serves) parts.push(recipe.serves + ' pers.');
    return parts.join(' • ');
  }

  function collectionLabel(value) {
    var map = {
      'recettes-gratuites': 'Recettes gratuites',
      'recettes-premium': 'Compte client',
      'desserts-a-la-vanille': 'Desserts vanille',
      'petits-dejeuners-a-la-vanille': 'Petit-déjeuner',
      'vanille-salee': 'Vanille salée',
      'accords-fruites': 'Accords fruités',
      guides: 'Guides',
      accords: 'Accords'
    };
    return map[value] || String(value || '').replace(/-/g, ' ');
  }

  function compactSummary(recipe) {
    return escapeHtml(recipe.summary || recipe.subtitle || '');
  }

  function placeholderEyebrow(recipe) {
    return escapeHtml(recipe.eyebrow || recipe.category || 'Recette');
  }

  function placeholderLine(recipe) {
    return escapeHtml((recipe.hero && recipe.hero.ambient_label) || recipe.subtitle || recipe.summary || '');
  }

  function buildMiniCard(recipe, heroOverrides, modifier) {
    var heroOverride = heroOverrides && heroOverrides[recipe.slug];
    var cover = (heroOverride && heroOverride.image_url) || (recipe.hero && recipe.hero.image_url);

    return (
      '<article class="vd-recipes-hub__mini-card' + (modifier ? ' ' + modifier : '') + '">' +
        '<a class="vd-recipes-hub__mini-link" href="' + escapeHtml(recipeHref(recipe)) + '">' +
          '<div class="vd-recipes-hub__mini-media"' + (cover ? ' style="background-image:url(\'' + escapeHtml(cover) + '\')"' : '') + '>' +
            (!cover ? '<span>Recette</span>' : '') +
          '</div>' +
          '<div class="vd-recipes-hub__mini-body">' +
            '<strong>' + escapeHtml(recipe.title) + '</strong>' +
            '<p>' + compactSummary(recipe) + '</p>' +
          '</div>' +
        '</a>' +
      '</article>'
    );
  }

  function buildCard(recipe, heroOverrides) {
    var heroOverride = heroOverrides && heroOverrides[recipe.slug];
    var cover = (heroOverride && heroOverride.image_url) || (recipe.hero && recipe.hero.image_url);
    var accessLabel = recipe.access === 'member' ? 'Compte client' : 'Accès libre';
    var badge = recipe.category || 'Recette';
    var search = recipeSearchText(recipe);
    var collections = Array.isArray(recipe.collections) ? recipe.collections.join(',') : '';
    var ingredients = Array.isArray(recipe.ingredient_groups)
      ? recipe.ingredient_groups.reduce(function (names, group) {
          return names.concat((group.items || []).map(function (item) { return normalize(item.name || ''); }).filter(Boolean));
        }, []).filter(function (value, index, array) { return array.indexOf(value) === index; }).join(',')
      : '';
    var productHandles = recipe.product && Array.isArray(recipe.product.required_handles)
      ? recipe.product.required_handles.join(',')
      : ((recipe.product && recipe.product.handle) || '');
    var totalMinutes = parseDurationMinutes(recipe.timing && recipe.timing.total);
    var favoriteSlugs = favoriteStore().slugs;
    var isFavorite = favoriteSlugs.indexOf(recipe.slug) !== -1;
    var mediaClass = 'vd-recipes-hub__card-media' + (cover ? '' : ' is-placeholder');
    var placeholder = cover
      ? ''
      : (
        '<div class="vd-recipes-hub__card-placeholder">' +
          '<span>' + placeholderEyebrow(recipe) + '</span>' +
          '<strong>' + escapeHtml(recipe.title) + '</strong>' +
          '<p>' + placeholderLine(recipe) + '</p>' +
        '</div>'
      );

    return (
      '<article class="vd-recipes-hub__card" data-vd-recipe-card data-slug="' + escapeHtml(recipe.slug || '') + '" data-search="' + escapeHtml(search) + '" data-access="' + escapeHtml(recipe.access || 'free') + '" data-difficulty="' + escapeHtml((recipe.difficulty && recipe.difficulty.value) || 'all') + '" data-collections="' + escapeHtml(collections) + '" data-total-minutes="' + escapeHtml(String(totalMinutes)) + '" data-ingredients="' + escapeHtml(ingredients) + '" data-products="' + escapeHtml(productHandles) + '">' +
        '<a class="vd-recipes-hub__card-link" href="' + escapeHtml(recipeHref(recipe)) + '">' +
          '<div class="' + mediaClass + '"' + (cover ? ' style="background-image:url(\'' + escapeHtml(cover) + '\')"' : '') + '>' +
            '<div class="vd-recipes-hub__card-overlay"></div>' +
            placeholder +
            '<div class="vd-recipes-hub__card-badges">' +
              '<span class="vd-recipes-hub__badge">' + escapeHtml(badge) + '</span>' +
              '<span class="vd-recipes-hub__badge vd-recipes-hub__badge--accent">' + escapeHtml(accessLabel) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="vd-recipes-hub__card-body">' +
            '<div class="vd-recipes-hub__card-meta">' + escapeHtml(metricValue(recipe)) + '</div>' +
            '<h2>' + escapeHtml(recipe.title) + '</h2>' +
            '<p>' + escapeHtml(recipe.summary || recipe.subtitle || '') + '</p>' +
          '</div>' +
        '</a>' +
        '<div class="vd-recipes-hub__card-footer">' +
          '<span class="vd-recipes-hub__card-state">' + escapeHtml(recipe.subtitle || '') + '</span>' +
          '<span class="vd-recipes-hub__card-actions">' +
            '<button type="button" class="vd-recipes-hub__favorite' + (isFavorite ? ' is-active' : '') + '" data-vd-recipe-favorite-toggle data-slug="' + escapeHtml(recipe.slug || '') + '" aria-label="Ajouter au carnet">' + (isFavorite ? 'Gardée' : 'Garder') + '</button>' +
            '<a class="vd-recipes-hub__card-cta" href="' + escapeHtml(recipeHref(recipe)) + '">Ouvrir</a>' +
          '</span>' +
        '</div>' +
      '</article>'
    );
  }

  function applyFilters(section, state) {
    var cards = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-card]'));
    var count = section.querySelector('[data-vd-recipes-count]');
    var empty = section.querySelector('[data-vd-recipes-empty]');
    var activeFilters = section.querySelector('[data-vd-recipes-active-filters]');
    var visibleCount = 0;
    var visibleCards = [];

    cards.forEach(function (card) {
      var haystack = normalize(card.getAttribute('data-search'));
      var access = normalize(card.getAttribute('data-access'));
      var difficulty = normalize(card.getAttribute('data-difficulty'));
      var collections = normalize(card.getAttribute('data-collections'));
      var totalMinutes = Number(card.getAttribute('data-total-minutes') || 0);
      var ingredients = normalize(card.getAttribute('data-ingredients'));
      var products = normalize(card.getAttribute('data-products'));
      var matchesQuery = !state.query || haystack.indexOf(state.query) !== -1;
      var matchesAccess = state.access === 'all' || access === state.access;
      var matchesDifficulty = state.difficulty === 'all' || difficulty === state.difficulty;
      var matchesCollection = state.collection === 'all' || collections.indexOf(state.collection) !== -1;
      var matchesTime =
        state.time === 'all' ||
        (state.time === 'quick' && totalMinutes > 0 && totalMinutes < 30) ||
        (state.time === 'medium' && totalMinutes >= 30 && totalMinutes <= 60) ||
        (state.time === 'long' && totalMinutes > 60);
      var matchesIngredient = state.ingredient === 'all' || ingredients.indexOf(state.ingredient) !== -1;
      var matchesProduct = state.product === 'all' || products.indexOf(state.product) !== -1;
      var show = matchesQuery && matchesAccess && matchesDifficulty && matchesCollection && matchesTime && matchesIngredient && matchesProduct;

      card.hidden = !show;
      if (show) {
        visibleCount += 1;
        visibleCards.push(card);
      }
    });

    visibleCards.sort(function (left, right) {
      var leftMinutes = Number(left.getAttribute('data-total-minutes') || 0);
      var rightMinutes = Number(right.getAttribute('data-total-minutes') || 0);
      var leftDifficulty = difficultyRank(left.getAttribute('data-difficulty'));
      var rightDifficulty = difficultyRank(right.getAttribute('data-difficulty'));
      var leftTitle = (left.querySelector('h2') && left.querySelector('h2').textContent) || '';
      var rightTitle = (right.querySelector('h2') && right.querySelector('h2').textContent) || '';

      if (state.sort === 'quick') {
        return leftMinutes - rightMinutes || leftDifficulty - rightDifficulty || leftTitle.localeCompare(rightTitle, 'fr');
      }

      if (state.sort === 'easy') {
        return leftDifficulty - rightDifficulty || leftMinutes - rightMinutes || leftTitle.localeCompare(rightTitle, 'fr');
      }

      if (state.sort === 'name') {
        return leftTitle.localeCompare(rightTitle, 'fr');
      }

      return leftDifficulty - rightDifficulty || leftMinutes - rightMinutes || leftTitle.localeCompare(rightTitle, 'fr');
    });

    if (visibleCards.length && visibleCards[0].parentNode) {
      visibleCards.forEach(function (card) {
        card.parentNode.appendChild(card);
      });
    }

    if (count) {
      count.textContent = visibleCount + ' résultat' + (visibleCount > 1 ? 's' : '');
    }

    if (empty) {
      empty.hidden = visibleCount !== 0;
    }

    if (activeFilters) {
      var chips = activeFilterChips(state, visibleCount);
      activeFilters.innerHTML = chips.map(function (label) {
        return '<span class="vd-recipes-hub__active-chip">' + escapeHtml(label) + '</span>';
      }).join('');
      activeFilters.hidden = chips.length === 0;
    }
  }

  function collectIngredientOptions(recipes) {
    var values = {};
    recipes.forEach(function (recipe) {
      (recipe.ingredient_groups || []).forEach(function (group) {
        (group.items || []).forEach(function (item) {
          var raw = String(item.name || '').trim();
          if (!raw) return;
          var key = normalize(raw);
          if (!key || values[key]) return;
          values[key] = raw.charAt(0).toUpperCase() + raw.slice(1);
        });
      });
    });
    return Object.keys(values).sort().slice(0, 24).map(function (key) {
      return { value: key, label: values[key] };
    });
  }

  function productLabel(handle) {
    return String(handle || '')
      .split('-')
      .filter(Boolean)
      .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
      .join(' ');
  }

  function difficultyRank(value) {
    var key = normalize(value);
    if (key === 'facile') return 0;
    if (key === 'intermediaire') return 1;
    if (key === 'signature') return 2;
    return 9;
  }

  function activeFilterChips(state, visibleCount) {
    var chips = [];
    if (state.query) chips.push('Recherche : ' + state.query);
    if (state.access !== 'all') chips.push(state.access === 'member' ? 'Compte client' : 'Accès libre');
    if (state.difficulty !== 'all') chips.push('Niveau : ' + state.difficulty);
    if (state.time === 'quick') chips.push('Moins de 30 min');
    if (state.time === 'medium') chips.push('30 à 60 min');
    if (state.time === 'long') chips.push('Plus de 60 min');
    if (state.collection !== 'all') chips.push(collectionLabel(state.collection));
    if (state.ingredient !== 'all') chips.push('Ingrédient : ' + state.ingredient);
    if (state.product !== 'all') chips.push('Produit : ' + productLabel(state.product));
    if (state.sort === 'quick') chips.push('Tri : plus rapides');
    if (state.sort === 'easy') chips.push('Tri : plus faciles');
    if (state.sort === 'name') chips.push('Tri : alphabétique');
    if (!chips.length && visibleCount) chips.push('Sélection complète');
    return chips;
  }

  function collectProductOptions(recipes) {
    var values = {};
    recipes.forEach(function (recipe) {
      var handles = [];
      if (recipe.product && Array.isArray(recipe.product.required_handles)) handles = handles.concat(recipe.product.required_handles);
      if (recipe.product && recipe.product.handle) handles.push(recipe.product.handle);
      handles.filter(Boolean).forEach(function (handle) {
        var key = normalize(handle);
        if (!key || values[key]) return;
        values[key] = productLabel(handle);
      });
    });
    return Object.keys(values).sort().map(function (key) {
      return { value: key, label: values[key] };
    });
  }

  function populateSelect(select, options, placeholder) {
    if (!select) return;
    select.innerHTML =
      '<option value="all">' + escapeHtml(placeholder) + '</option>' +
      options.map(function (option) {
        return '<option value="' + escapeHtml(option.value) + '">' + escapeHtml(option.label) + '</option>';
      }).join('');
  }

  function setButtonState(buttons, value) {
    buttons.forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-value') === value);
    });
  }

  function buildCollectionButtons(section, recipes, state) {
    var target = section.querySelector('[data-vd-recipes-collection-filters]');
    if (!target) return [];

    var ordered = [];
    recipes.forEach(function (recipe) {
      (recipe.collections || []).forEach(function (collection) {
        if (ordered.indexOf(collection) === -1) ordered.push(collection);
      });
    });

    var interesting = ordered.filter(function (value) {
      return /recettes|desserts|petits-dejeuners|salee|accords|guides/.test(value);
    }).slice(0, 6);

    target.innerHTML =
      '<button type="button" class="vd-recipes-hub__filter' + (state.collection === 'all' ? ' is-active' : '') + '" data-vd-recipes-collection data-value="all">Tous les univers</button>' +
      interesting.map(function (collection) {
        return '<button type="button" class="vd-recipes-hub__filter' + (state.collection === collection ? ' is-active' : '') + '" data-vd-recipes-collection data-value="' + escapeHtml(collection) + '">' + escapeHtml(collectionLabel(collection)) + '</button>';
      }).join('');

    return Array.prototype.slice.call(target.querySelectorAll('[data-vd-recipes-collection]'));
  }

  function buildCollectionShowcase(section, recipes, heroOverrides) {
    var target = section.querySelector('[data-vd-recipes-collections]');
    if (!target) return;

    var config = [
      { key: 'desserts-a-la-vanille', title: 'Desserts à la vanille', text: 'Des classiques gourmands et des idées à partager pour mettre la vanille au centre du dessert.' },
      { key: 'vanille-salee', title: 'Vanille salée', text: 'Des recettes nettes et surprenantes pour cuisiner la vanille autrement, sans perdre en équilibre.' },
      { key: 'petits-dejeuners-a-la-vanille', title: 'Petit-déjeuner & goûter', text: 'Des formats simples, moelleux et faciles à refaire pour le matin ou le goûter.' }
    ];

    var panels = config.map(function (entry) {
      var items = recipes.filter(function (recipe) {
        return Array.isArray(recipe.collections) && recipe.collections.indexOf(entry.key) !== -1;
      }).slice(0, 3);

      if (!items.length) return '';

      return (
        '<article class="vd-recipes-hub__collection-panel">' +
          '<div class="vd-recipes-hub__collection-copy">' +
            '<span class="vd-recipes-hub__panel-label">Collection</span>' +
            '<h2>' + escapeHtml(entry.title) + '</h2>' +
            '<p>' + escapeHtml(entry.text) + '</p>' +
          '</div>' +
          '<div class="vd-recipes-hub__collection-grid">' +
            items.map(function (recipe) { return buildMiniCard(recipe, heroOverrides); }).join('') +
          '</div>' +
        '</article>'
      );
    }).join('');

    target.innerHTML = panels;
    target.hidden = !panels;
  }

  function buildPersonalRails(section, recipes, heroOverrides) {
    var rails = section.querySelector('[data-vd-recipes-rails]');
    var historyPanel = section.querySelector('[data-vd-recipes-history]');
    var historyTrack = section.querySelector('[data-vd-recipes-history-track]');
    var favoritesPanel = section.querySelector('[data-vd-recipes-favorites]');
    var favoritesTrack = section.querySelector('[data-vd-recipes-favorites-track]');
    if (!rails || !historyPanel || !favoritesPanel || !historyTrack || !favoritesTrack) return;

    var history = historyStore().items
      .map(function (entry) {
        return recipes.find(function (recipe) { return recipe.slug === entry.slug; });
      })
      .filter(Boolean)
      .slice(0, 6);
    var favorites = favoriteStore().slugs
      .map(function (slug) {
        return recipes.find(function (recipe) { return recipe.slug === slug; });
      })
      .filter(Boolean)
      .slice(0, 6);

    historyTrack.innerHTML = history.map(function (recipe) {
      return buildMiniCard(recipe, heroOverrides, 'is-history');
    }).join('');
    favoritesTrack.innerHTML = favorites.map(function (recipe) {
      return buildMiniCard(recipe, heroOverrides, 'is-favorite');
    }).join('');

    historyPanel.hidden = history.length === 0;
    favoritesPanel.hidden = favorites.length === 0;
    rails.hidden = history.length === 0 && favorites.length === 0;
  }

  function bindFavoriteButtons(section, recipes, heroOverrides, state, shelfClient) {
    Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-favorite-toggle]')).forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();

        var slug = button.getAttribute('data-slug');
        var store = favoriteStore();
        var index = store.slugs.indexOf(slug);
        if (index === -1) {
          store.slugs.unshift(slug);
        } else {
          store.slugs.splice(index, 1);
        }
        store.slugs = store.slugs.slice(0, 20);
        store.updated_at = new Date().toISOString();
        store.updated_by = 'storefront';
        saveJSON('vd-recipes-favorites', store);

        button.classList.toggle('is-active', index === -1);
        button.textContent = index === -1 ? 'Gardée' : 'Garder';
        syncShelfState(shelfClient);
        buildPersonalRails(section, recipes, heroOverrides);
        applyFilters(section, state);
      });
    });
  }

  function initRecipesHub(section) {
    if (!section || section.__vdRecipesHubReady) return;
    section.__vdRecipesHubReady = true;

    var registryUrl = section.getAttribute('data-registry-url');
    var input = section.querySelector('[data-vd-recipes-search-input]');
    var clearButton = section.querySelector('[data-vd-recipes-search-clear]');
    var grid = section.querySelector('[data-vd-recipes-grid]');
    var totalNode = section.querySelector('[data-vd-recipes-total]');
    var freeNode = section.querySelector('[data-vd-recipes-free]');
    var memberNode = section.querySelector('[data-vd-recipes-member]');
    var hubScreen = section.querySelector('[data-vd-recipes-screen="hub"]');
    var detailScreen = section.querySelector('[data-vd-recipes-screen="detail"]');
    var heroOverrides = buildHeroOverrideMap(section);
    var shelfClient = createShelfClient(section);
    var accessButtons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipes-access]'));
    var difficultyButtons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipes-difficulty]'));
    var timeButtons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipes-time]'));
    var ingredientSelect = section.querySelector('[data-vd-recipes-ingredient]');
    var productSelect = section.querySelector('[data-vd-recipes-product]');
    var sortSelect = section.querySelector('[data-vd-recipes-sort]');
    var resetButton = section.querySelector('[data-vd-recipes-reset]');
    var collectionButtons = [];
    var state = { query: '', access: 'all', difficulty: 'all', time: 'all', ingredient: 'all', product: 'all', collection: 'all', sort: 'recommended' };
    var requestedRecipe = new URLSearchParams(window.location.search).get('recipe');

    if (!registryUrl || !grid || !input) return;

    if (requestedRecipe) {
      if (hubScreen) hubScreen.hidden = true;
      if (detailScreen) detailScreen.hidden = false;
      return;
    }

    if (hubScreen) hubScreen.hidden = false;
    if (detailScreen) detailScreen.hidden = true;

    Promise.all([
      fetch(registryUrl, { credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) throw new Error('registry');
          return response.json();
        }),
      shelfClient.enabled
        ? shelfClient.fetch().then(function (payload) {
            var remoteState = shelfClient.applyRemote(payload);
            if (remoteState && remoteState.changed) {
              return shelfClient.syncLocalStores().catch(function () {});
            }
          }).catch(function () {})
        : Promise.resolve()
    ])
      .then(function (result) {
        var payload = result[0];
        var recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
        var approved = recipes.filter(function (recipe) {
          return recipe.status === 'approved';
        });

        grid.innerHTML = approved.map(function (recipe) {
          return buildCard(recipe, heroOverrides);
        }).join('');
        populateSelect(ingredientSelect, collectIngredientOptions(approved), 'Tous les ingrédients');
        populateSelect(productSelect, collectProductOptions(approved), 'Tous les produits');
        collectionButtons = buildCollectionButtons(section, approved, state);
        buildPersonalRails(section, approved, heroOverrides);
        buildCollectionShowcase(section, approved, heroOverrides);
        bindFavoriteButtons(section, approved, heroOverrides, state, shelfClient);
        collectionButtons.forEach(function (button) {
          button.addEventListener('click', function () {
            state.collection = button.getAttribute('data-value') || 'all';
            setButtonState(collectionButtons, state.collection);
            applyFilters(section, state);
          });
        });

        if (totalNode) totalNode.textContent = String(approved.length);
        if (freeNode) {
          freeNode.textContent = String(
            approved.filter(function (recipe) {
              return recipe.access === 'free';
            }).length
          );
        }
        if (memberNode) {
          memberNode.textContent = String(
            approved.filter(function (recipe) {
              return recipe.access === 'member';
            }).length
          );
        }

        applyFilters(section, state);

        if (window.gsap && window.ScrollTrigger) {
          var cards = section.querySelectorAll('[data-vd-recipe-card]');
          window.gsap.fromTo(
            cards,
            { y: 26, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.7,
              ease: 'power2.out',
              stagger: 0.08,
              scrollTrigger: {
                trigger: grid,
                start: 'top 78%'
              }
            }
          );
        }
      })
      .catch(function () {
        grid.innerHTML =
          '<article class="vd-recipes-hub__empty-card"><h2>Les recettes sont en cours de chargement.</h2><p>Rechargez la page dans un instant.</p></article>';
      });

    input.addEventListener('input', function () {
      state.query = normalize(input.value);
      if (clearButton) clearButton.hidden = !input.value.length;
      applyFilters(section, state);
    });

    if (clearButton) {
      clearButton.addEventListener('click', function () {
        input.value = '';
        state.query = '';
        clearButton.hidden = true;
        input.focus();
        applyFilters(section, state);
      });
    }

    accessButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.access = button.getAttribute('data-value') || 'all';
        setButtonState(accessButtons, state.access);
        applyFilters(section, state);
      });
    });

    difficultyButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.difficulty = button.getAttribute('data-value') || 'all';
        setButtonState(difficultyButtons, state.difficulty);
        applyFilters(section, state);
      });
    });

    timeButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.time = button.getAttribute('data-value') || 'all';
        setButtonState(timeButtons, state.time);
        applyFilters(section, state);
      });
    });

    if (ingredientSelect) {
      ingredientSelect.addEventListener('change', function () {
        state.ingredient = normalize(ingredientSelect.value);
        applyFilters(section, state);
      });
    }

    if (productSelect) {
      productSelect.addEventListener('change', function () {
        state.product = normalize(productSelect.value);
        applyFilters(section, state);
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        state.sort = normalize(sortSelect.value) || 'recommended';
        applyFilters(section, state);
      });
    }

    if (resetButton) {
      resetButton.addEventListener('click', function () {
        state.query = '';
        state.access = 'all';
        state.difficulty = 'all';
        state.time = 'all';
        state.ingredient = 'all';
        state.product = 'all';
        state.collection = 'all';
        state.sort = 'recommended';
        input.value = '';
        if (clearButton) clearButton.hidden = true;
        if (ingredientSelect) ingredientSelect.value = 'all';
        if (productSelect) productSelect.value = 'all';
        if (sortSelect) sortSelect.value = 'recommended';
        setButtonState(accessButtons, state.access);
        setButtonState(difficultyButtons, state.difficulty);
        setButtonState(timeButtons, state.time);
        setButtonState(collectionButtons, state.collection);
        applyFilters(section, state);
      });
    }

  }

  function initAll() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-vd-recipes-hub]'), initRecipesHub);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  document.addEventListener('shopify:section:load', function (event) {
    initRecipesHub(event.target);
  });
})();
