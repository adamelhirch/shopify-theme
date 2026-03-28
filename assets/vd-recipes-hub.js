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
        recipe.collections && recipe.collections.join(' ')
      ].join(' ')
    );
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
          favorites: favoriteStore().slugs,
          history: historyStore().items
        });
      },
      applyRemote: function (payload) {
        if (!payload) return;
        if (payload.favorites) saveJSON('vd-recipes-favorites', payload.favorites);
        if (payload.history) saveJSON('vd-recipes-history', payload.history);
      }
    };
  }

  function favoriteStore() {
    var data = loadJSON('vd-recipes-favorites', { slugs: [] });
    data.slugs = Array.isArray(data.slugs) ? data.slugs : [];
    return data;
  }

  function historyStore() {
    var data = loadJSON('vd-recipes-history', { items: [] });
    data.items = Array.isArray(data.items) ? data.items : [];
    return data;
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
      'recettes-premium': 'Recettes premium',
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
    var favoriteSlugs = favoriteStore().slugs;
    var isFavorite = favoriteSlugs.indexOf(recipe.slug) !== -1;
    var mediaClass = 'vd-recipes-hub__card-media' + (cover ? '' : ' is-placeholder');
    var placeholder = cover
      ? ''
      : '<div class="vd-recipes-hub__card-placeholder"><span>Visuel recette à poser</span><strong>' + escapeHtml(recipe.title) + '</strong></div>';

    return (
      '<article class="vd-recipes-hub__card" data-vd-recipe-card data-slug="' + escapeHtml(recipe.slug || '') + '" data-search="' + escapeHtml(search) + '" data-access="' + escapeHtml(recipe.access || 'free') + '" data-difficulty="' + escapeHtml((recipe.difficulty && recipe.difficulty.value) || 'all') + '" data-collections="' + escapeHtml(collections) + '">' +
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
            '<button type="button" class="vd-recipes-hub__favorite' + (isFavorite ? ' is-active' : '') + '" data-vd-recipe-favorite-toggle data-slug="' + escapeHtml(recipe.slug || '') + '" aria-label="Ajouter aux favoris">' + (isFavorite ? 'Favori' : 'Sauvegarder') + '</button>' +
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
    var visibleCount = 0;

    cards.forEach(function (card) {
      var haystack = normalize(card.getAttribute('data-search'));
      var access = normalize(card.getAttribute('data-access'));
      var difficulty = normalize(card.getAttribute('data-difficulty'));
      var collections = normalize(card.getAttribute('data-collections'));
      var matchesQuery = !state.query || haystack.indexOf(state.query) !== -1;
      var matchesAccess = state.access === 'all' || access === state.access;
      var matchesDifficulty = state.difficulty === 'all' || difficulty === state.difficulty;
      var matchesCollection = state.collection === 'all' || collections.indexOf(state.collection) !== -1;
      var show = matchesQuery && matchesAccess && matchesDifficulty && matchesCollection;

      card.hidden = !show;
      if (show) visibleCount += 1;
    });

    if (count) {
      count.textContent = visibleCount + ' résultat' + (visibleCount > 1 ? 's' : '');
    }

    if (empty) {
      empty.hidden = visibleCount !== 0;
    }
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
      { key: 'desserts-a-la-vanille', title: 'Desserts à la vanille', text: 'Les recettes pilier pour installer Vanille Désiré sur les requêtes cœur de gamme.' },
      { key: 'vanille-salee', title: 'Vanille salée', text: 'Le territoire le plus différenciant pour la marque, avec des recettes qui surprennent sans perdre en lisibilité.' },
      { key: 'petits-dejeuners-a-la-vanille', title: 'Petit-déjeuner & goûter', text: 'Des formats simples à refaire souvent, parfaits pour la récurrence et le carnet personnel.' }
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
        saveJSON('vd-recipes-favorites', store);

        button.classList.toggle('is-active', index === -1);
        button.textContent = index === -1 ? 'Favori' : 'Sauvegarder';
        if (shelfClient && shelfClient.enabled) {
          shelfClient.syncLocalStores().catch(function () {});
        }
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
    var collectionButtons = [];
    var state = { query: '', access: 'all', difficulty: 'all', collection: 'all' };
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
            shelfClient.applyRemote(payload);
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
          '<article class="vd-recipes-hub__empty-card"><h2>Le registre des recettes est indisponible.</h2><p>Rechargez la page dans un instant.</p></article>';
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
