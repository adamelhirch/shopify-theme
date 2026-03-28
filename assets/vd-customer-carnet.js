(function () {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseJSONScript(section, selector, fallback) {
    var node = section.querySelector(selector);
    if (!node) return fallback;

    try {
      var parsed = JSON.parse(node.textContent || 'null');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function fetchRegistry(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('registry_fetch_failed');
        return response.json();
      })
      .then(function (payload) {
        return Array.isArray(payload.recipes) ? payload.recipes : [];
      });
  }

  function recipeHref(recipe) {
    return recipe.page_url || ('/pages/recettes?recipe=' + encodeURIComponent(recipe.slug || ''));
  }

  function cardMarkup(recipe) {
    var cover = recipe.hero && recipe.hero.image_url;
    var metrics = [];
    if (recipe.timing && recipe.timing.total) metrics.push(recipe.timing.total);
    if (recipe.difficulty && recipe.difficulty.label) metrics.push(recipe.difficulty.label);
    if (recipe.access === 'member') metrics.push('Compte client');

    return (
      '<a class="vd-customer-carnet__card" href="' + escapeHtml(recipeHref(recipe)) + '">' +
        '<div class="vd-customer-carnet__media"' + (cover ? ' style="background-image:url(\'' + escapeHtml(cover) + '\')"' : '') + '>' +
          (cover ? '' : '<span>Recette</span>') +
        '</div>' +
        '<div class="vd-customer-carnet__body">' +
          '<span class="vd-customer-carnet__meta">' + escapeHtml(metrics.join(' • ')) + '</span>' +
          '<strong>' + escapeHtml(recipe.title) + '</strong>' +
          '<p>' + escapeHtml(recipe.summary || recipe.subtitle || '') + '</p>' +
        '</div>' +
      '</a>'
    );
  }

  function renderTrack(track, recipes) {
    track.innerHTML = recipes.map(cardMarkup).join('');
  }

  function init(section) {
    var registryUrl = section.getAttribute('data-registry-url');
    if (!registryUrl) return;

    var favoritesData = parseJSONScript(section, '[data-vd-customer-favorites]', { slugs: [] });
    var historyData = parseJSONScript(section, '[data-vd-customer-history]', { items: [] });
    var favoritesPanel = section.querySelector('[data-vd-customer-favorites-panel]');
    var historyPanel = section.querySelector('[data-vd-customer-history-panel]');
    var favoritesTrack = section.querySelector('[data-vd-customer-favorites-track]');
    var historyTrack = section.querySelector('[data-vd-customer-history-track]');
    var favoritesCount = section.querySelector('[data-vd-customer-favorites-count]');
    var historyCount = section.querySelector('[data-vd-customer-history-count]');
    var emptyState = section.querySelector('[data-vd-customer-carnet-empty]');

    fetchRegistry(registryUrl)
      .then(function (recipes) {
        var bySlug = recipes.reduce(function (map, recipe) {
          if (recipe && recipe.slug) map[recipe.slug] = recipe;
          return map;
        }, {});
        var favoriteRecipes = (favoritesData.slugs || []).map(function (slug) {
          return bySlug[slug];
        }).filter(Boolean);
        var historyRecipes = (historyData.items || []).map(function (item) {
          return bySlug[item.slug];
        }).filter(Boolean);

        if (favoriteRecipes.length) {
          renderTrack(favoritesTrack, favoriteRecipes);
          favoritesCount.textContent = String(favoriteRecipes.length);
          favoritesPanel.hidden = false;
        }

        if (historyRecipes.length) {
          renderTrack(historyTrack, historyRecipes);
          historyCount.textContent = String(historyRecipes.length);
          historyPanel.hidden = false;
        }

        emptyState.hidden = favoriteRecipes.length > 0 || historyRecipes.length > 0;
      })
      .catch(function () {
        emptyState.hidden = false;
        emptyState.textContent = 'Le carnet persistant n a pas pu charger le registre recette pour le moment.';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.slice.call(document.querySelectorAll('[data-vd-customer-carnet]')).forEach(init);
  });
})();
