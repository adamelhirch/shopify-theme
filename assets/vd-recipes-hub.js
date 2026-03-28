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
        recipe.search_terms && recipe.search_terms.join(' ')
      ].join(' ')
    );
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

  function buildCard(recipe, heroOverrides) {
    var heroOverride = heroOverrides && heroOverrides[recipe.slug];
    var cover = (heroOverride && heroOverride.image_url) || (recipe.hero && recipe.hero.image_url);
    var accessLabel = recipe.access === 'member' ? 'Compte client' : 'Acces libre';
    var badge = recipe.category || 'Recette';
    var search = recipeSearchText(recipe);
    var mediaClass = 'vd-recipes-hub__card-media' + (cover ? '' : ' is-placeholder');
    var placeholder = cover
      ? ''
      : '<div class="vd-recipes-hub__card-placeholder"><span>Visuel recette a poser</span><strong>' + escapeHtml(recipe.title) + '</strong></div>';

    return (
      '<article class="vd-recipes-hub__card" data-vd-recipe-card data-search="' + escapeHtml(search) + '" data-access="' + escapeHtml(recipe.access || 'free') + '" data-difficulty="' + escapeHtml((recipe.difficulty && recipe.difficulty.value) || 'all') + '">' +
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
          '<div class="vd-recipes-hub__card-footer">' +
            '<span class="vd-recipes-hub__card-state">' + escapeHtml(recipe.subtitle || '') + '</span>' +
            '<span class="vd-recipes-hub__card-cta">Ouvrir</span>' +
          '</div>' +
        '</a>' +
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
      var matchesQuery = !state.query || haystack.indexOf(state.query) !== -1;
      var matchesAccess = state.access === 'all' || access === state.access;
      var matchesDifficulty = state.difficulty === 'all' || difficulty === state.difficulty;
      var show = matchesQuery && matchesAccess && matchesDifficulty;

      card.hidden = !show;
      if (show) visibleCount += 1;
    });

    if (count) {
      count.textContent = visibleCount + ' resultat' + (visibleCount > 1 ? 's' : '');
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
    var accessButtons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipes-access]'));
    var difficultyButtons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipes-difficulty]'));
    var state = { query: '', access: 'all', difficulty: 'all' };
    var requestedRecipe = new URLSearchParams(window.location.search).get('recipe');

    if (!registryUrl || !grid || !input) return;

    if (requestedRecipe) {
      if (hubScreen) hubScreen.hidden = true;
      if (detailScreen) detailScreen.hidden = false;
      return;
    }

    if (hubScreen) hubScreen.hidden = false;
    if (detailScreen) detailScreen.hidden = true;

    fetch(registryUrl, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('registry');
        return response.json();
      })
      .then(function (payload) {
        var recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
        var approved = recipes.filter(function (recipe) {
          return recipe.status === 'approved';
        });

        grid.innerHTML = approved.map(function (recipe) {
          return buildCard(recipe, heroOverrides);
        }).join('');

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
