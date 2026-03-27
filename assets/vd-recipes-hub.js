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
    if (recipe.page_url) return recipe.page_url;
    return '/pages/' + recipe.slug;
  }

  function metricValue(recipe) {
    var parts = [];
    if (recipe.timing && recipe.timing.total) parts.push(recipe.timing.total);
    if (recipe.difficulty && recipe.difficulty.label) parts.push(recipe.difficulty.label);
    if (recipe.serves) parts.push(recipe.serves + ' pers.');
    return parts.join(' • ');
  }

  function renderViewerContent(recipe, isLocked, urls) {
    var ingredients = (recipe.ingredient_groups || [])
      .map(function (group) {
        return (
          '<div class="vd-recipes-hub__viewer-group">' +
            '<h3>' + escapeHtml(group.title || '') + '</h3>' +
            (group.items || [])
              .map(function (item) {
                return (
                  '<div class="vd-recipes-hub__viewer-row">' +
                    '<strong>' + escapeHtml([item.quantity, item.unit, item.name].join(' ').trim()) + '</strong>' +
                    (item.note ? '<p>' + escapeHtml(item.note) + '</p>' : '') +
                  '</div>'
                );
              })
              .join('') +
          '</div>'
        );
      })
      .join('');

    var steps = (recipe.steps || [])
      .map(function (step, index) {
        return (
          '<article class="vd-recipes-hub__viewer-step">' +
            '<div class="vd-recipes-hub__viewer-step-meta">' +
              '<span>Etape ' + (index + 1) + '</span>' +
              (step.duration ? '<span>' + escapeHtml(step.duration) + '</span>' : '') +
              (step.highlight ? '<span>' + escapeHtml(step.highlight) + '</span>' : '') +
            '</div>' +
            '<h3>' + escapeHtml(step.title) + '</h3>' +
            '<p>' + escapeHtml(step.body) + '</p>' +
          '</article>'
        );
      })
      .join('');

    var tips = (recipe.tips || [])
      .map(function (tip) {
        return '<article class="vd-recipes-hub__viewer-tip"><h3>' + escapeHtml(tip.title) + '</h3><p>' + escapeHtml(tip.body) + '</p></article>';
      })
      .join('');

    return (
      '<div class="vd-recipes-hub__viewer-hero">' +
        '<div>' +
          '<span class="vd-recipes-hub__panel-label">' + escapeHtml(recipe.eyebrow || recipe.category || 'Recette') + '</span>' +
          '<h2>' + escapeHtml(recipe.title) + '</h2>' +
          '<p>' + escapeHtml(recipe.description || recipe.summary || '') + '</p>' +
          '<div class="vd-recipes-hub__viewer-metrics">' +
            '<span>' + escapeHtml(metricValue(recipe)) + '</span>' +
            '<span>' + escapeHtml(recipe.access === 'member' ? 'Compte client' : 'Acces libre') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="vd-recipes-hub__viewer-media"' + (recipe.hero && recipe.hero.image_url ? ' style="background-image:url(\'' + escapeHtml(recipe.hero.image_url) + '\')"' : '') + '></div>' +
      '</div>' +
      (isLocked
        ? '<div class="vd-recipes-hub__viewer-gate"><h3>Connexion requise</h3><p>Cette recette ouvre le pas-a-pas complet, la progression memorisee et le mode immersion apres connexion.</p><div class="vd-recipes-hub__viewer-actions"><a class="button button--primary" href="' + escapeHtml(urls.login) + '">Se connecter</a><a class="button button--secondary" href="' + escapeHtml(urls.register) + '">Creer un compte</a></div></div>'
        : '<div class="vd-recipes-hub__viewer-layout"><div class="vd-recipes-hub__viewer-section"><span class="vd-recipes-hub__panel-label">Ingredients</span>' + ingredients + '</div><div class="vd-recipes-hub__viewer-section"><span class="vd-recipes-hub__panel-label">Preparation</span>' + steps + '</div></div>' +
          (tips ? '<div class="vd-recipes-hub__viewer-section"><span class="vd-recipes-hub__panel-label">Astuces</span><div class="vd-recipes-hub__viewer-tips">' + tips + '</div></div>' : '')
      )
    );
  }

  function buildCard(recipe) {
    var cover = recipe.hero && recipe.hero.image_url;
    var accessLabel = recipe.access === 'member' ? 'Compte client' : 'Acces libre';
    var badge = recipe.category || 'Recette';
    var search = recipeSearchText(recipe);

    return (
      '<article class="vd-recipes-hub__card" data-vd-recipe-card data-search="' + escapeHtml(search) + '" data-access="' + escapeHtml(recipe.access || 'free') + '" data-difficulty="' + escapeHtml((recipe.difficulty && recipe.difficulty.value) || 'all') + '">' +
        '<a class="vd-recipes-hub__card-link" href="' + escapeHtml(recipeHref(recipe)) + '">' +
          '<div class="vd-recipes-hub__card-media"' + (cover ? ' style="background-image:url(\'' + escapeHtml(cover) + '\')"' : '') + '>' +
            '<div class="vd-recipes-hub__card-overlay"></div>' +
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
    var viewer = section.querySelector('[data-vd-recipes-viewer]');
    var viewerContent = section.querySelector('[data-vd-recipes-viewer-content]');
    var totalNode = section.querySelector('[data-vd-recipes-total]');
    var freeNode = section.querySelector('[data-vd-recipes-free]');
    var memberNode = section.querySelector('[data-vd-recipes-member]');
    var closeButtons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipes-viewer-close]'));
    var customerAuthenticated = section.getAttribute('data-customer-authenticated') === 'true';
    var loginUrl = section.getAttribute('data-login-url') || '/account/login';
    var registerUrl = section.getAttribute('data-register-url') || '/account/register';
    var accessButtons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipes-access]'));
    var difficultyButtons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipes-difficulty]'));
    var state = { query: '', access: 'all', difficulty: 'all' };

    if (!registryUrl || !grid || !input) return;

    function closeViewer(shouldReplaceState) {
      if (!viewer) return;
      viewer.hidden = true;
      document.documentElement.classList.remove('vd-recipes-viewer-open');
      if (shouldReplaceState) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    function openViewer(recipe, shouldPushState) {
      if (!viewer || !viewerContent) return;
      var isLocked = recipe.access === 'member' && !customerAuthenticated;
      viewerContent.innerHTML = renderViewerContent(recipe, isLocked, {
        login: loginUrl,
        register: registerUrl
      });
      viewer.hidden = false;
      document.documentElement.classList.add('vd-recipes-viewer-open');
      if (shouldPushState) {
        window.history.pushState({}, '', recipeHref(recipe));
      }
    }

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
        var params = new URLSearchParams(window.location.search);
        var requestedRecipe = params.get('recipe');

        grid.innerHTML = approved.map(buildCard).join('');

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

        grid.addEventListener('click', function (event) {
          var link = event.target.closest('.vd-recipes-hub__card-link');
          if (!link) return;
          var href = link.getAttribute('href') || '';
          var slugMatch = href.match(/recipe=([^&]+)/);
          if (!slugMatch) return;
          var slug = decodeURIComponent(slugMatch[1]);
          var recipe = approved.find(function (entry) {
            return entry.slug === slug;
          });
          if (!recipe) return;
          event.preventDefault();
          openViewer(recipe, true);
        });

        if (requestedRecipe) {
          var entry = approved.find(function (recipe) {
            return recipe.slug === requestedRecipe;
          });
          if (entry) openViewer(entry, false);
        }

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

    closeButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        closeViewer(true);
      });
    });

    window.addEventListener('popstate', function () {
      var params = new URLSearchParams(window.location.search);
      if (!params.get('recipe')) {
        closeViewer(false);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && viewer && !viewer.hidden) {
        closeViewer(true);
      }
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
