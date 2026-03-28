(function () {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseQuantity(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    var parsed = Number(value.replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatQuantity(value) {
    var rounded = Math.round(value * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 0.001) return String(Math.round(rounded));
    return String(rounded).replace('.', ',');
  }

  function formatMoney(cents) {
    var currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'EUR';
    var amount = Number(cents || 0) / 100;
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency }).format(amount);
    } catch (error) {
      return amount.toFixed(2) + ' ' + currency;
    }
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

  function durationToISO(value) {
    var minutes = parseDurationMinutes(value);
    if (!minutes) return '';
    if (minutes % 60 === 0) return 'PT' + String(minutes / 60) + 'H';
    if (minutes > 60) {
      var hours = Math.floor(minutes / 60);
      var leftoverMinutes = minutes % 60;
      return 'PT' + String(hours) + 'H' + String(leftoverMinutes) + 'M';
    }
    return 'PT' + String(minutes) + 'M';
  }

  function compactText(value, maxLength) {
    var text = String(value || '').trim();
    if (!text) return '';
    var sentenceMatch = text.match(/^[\s\S]*?[.!?](?:\s|$)/);
    var sentence = (sentenceMatch && sentenceMatch[0]) || text;
    if (sentence.length <= maxLength) return sentence;
    return sentence.slice(0, Math.max(0, maxLength - 1)).trim() + '…';
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
          favorites: getFavoriteStore(),
          history: getHistoryStore()
        });
      },
      applyRemote: function (payload) {
        if (!payload) return { changed: false };
        var mergedFavorites = mergeFavoritePayloads(getFavoriteStore(), payload.favorites);
        var mergedHistory = mergeHistoryPayloads(getHistoryStore(), payload.history);
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

  function getFavoriteStore() {
    return normalizeFavoritePayload(loadJSON('vd-recipes-favorites', { slugs: [] }));
  }

  function getHistoryStore() {
    return normalizeHistoryPayload(loadJSON('vd-recipes-history', { items: [] }));
  }

  function isFavoriteRecipe(slug) {
    return getFavoriteStore().slugs.indexOf(slug) !== -1;
  }

  function toggleFavoriteRecipe(slug) {
    var store = getFavoriteStore();
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
    return index === -1;
  }

  function pushRecipeHistory(recipe) {
    if (!recipe || !recipe.slug) return;
    var store = getHistoryStore();
    store.items = store.items.filter(function (entry) {
      return entry && entry.slug !== recipe.slug;
    });
    store.items.unshift({
      slug: recipe.slug,
      title: recipe.title || '',
      saved_at: new Date().toISOString()
    });
    store.items = store.items.slice(0, 12);
    store.updated_at = new Date().toISOString();
    store.updated_by = 'storefront';
    saveJSON('vd-recipes-history', store);
  }

  function showToast(section, message) {
    var toast = section.querySelector('[data-vd-recipe-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(section.__vdRecipeToastTimer);
    section.__vdRecipeToastTimer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 1500);
  }

  function loadState(storageKey, baseServes, stepTotal) {
    var state = {
      serves: baseServes,
      checked: {},
      activeStepIndex: 0,
      focusMode: false
    };

    try {
      var saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
      if (saved && typeof saved === 'object') {
        state.serves = Number(saved.serves) || baseServes;
        state.checked = saved.checked && typeof saved.checked === 'object' ? saved.checked : {};
        state.activeStepIndex = Math.max(0, Math.min(stepTotal - 1, Number(saved.activeStepIndex) || 0));
        state.focusMode = !!saved.focusMode;
      }
    } catch (error) {}

    return state;
  }

  function saveState(storageKey, state) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {}
  }

  function buildStructuredData(recipe) {
    var recipeImage = [];
    var hero = recipe.hero || {};
    if (hero.image_url) recipeImage.push(hero.image_url);
    (recipe.story_media || []).forEach(function (item) {
      if (item.image_url) recipeImage.push(item.image_url);
    });

    var recipeSchema = {
      '@type': 'Recipe',
      name: recipe.title,
      description: recipe.description || recipe.summary || '',
      image: recipeImage,
      recipeYield: recipe.serves ? recipe.serves + ' portions' : '',
      keywords: ((recipe.seo && recipe.seo.keywords) || recipe.search_terms || []).join(', '),
      recipeCategory: recipe.category || '',
      recipeCuisine: 'Madagascar',
      prepTime: durationToISO(recipe.timing && recipe.timing.prep),
      cookTime: durationToISO(recipe.timing && recipe.timing.cook),
      totalTime: durationToISO(recipe.timing && recipe.timing.total),
      recipeIngredient: (recipe.ingredient_groups || []).reduce(function (accumulator, group) {
        (group.items || []).forEach(function (item) {
          accumulator.push([item.quantity, item.unit, item.name].join(' ').trim());
        });
        return accumulator;
      }, []),
      recipeInstructions: (recipe.steps || []).map(function (step, index) {
        var stepSchema = {
          '@type': 'HowToStep',
          position: index + 1,
          name: step.title,
          text: step.body
        };
        if (step.duration) stepSchema.performTime = durationToISO(step.duration);
        var stepMedia = (step.media && step.media[0]) || (step.editor_media && step.editor_media[0]);
        if (stepMedia && stepMedia.image_url) {
          stepSchema.image = stepMedia.image_url;
        }
        if (stepMedia && stepMedia.video_url) {
          stepSchema.video = {
            '@type': 'VideoObject',
            contentUrl: stepMedia.video_url,
            name: step.title
          };
        }
        return stepSchema;
      }),
      author: {
        '@type': 'Organization',
        name: 'Vanille Desire'
      },
      publisher: {
        '@type': 'Organization',
        name: 'Vanille Desire'
      }
    };

    if (hero.video_url) {
      recipeSchema.video = {
        '@type': 'VideoObject',
        name: recipe.title,
        description: recipe.summary || recipe.description || '',
        contentUrl: hero.video_url
      };
    }

    if (Array.isArray(recipe.sources) && recipe.sources.length) {
      recipeSchema.citation = recipe.sources.map(function (source) {
        return source.url || source.title;
      }).filter(Boolean);
    }

    var graph = [recipeSchema];
    if (recipe.seo && Array.isArray(recipe.seo.faq) && recipe.seo.faq.length) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: recipe.seo.faq.map(function (item) {
          return {
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: item.answer
            }
          };
        })
      });
    }

    return {
      '@context': 'https://schema.org',
      '@graph': graph
    };
  }

  function metricList(recipe) {
    var metrics = [];
    if (recipe.timing && recipe.timing.total) metrics.push(recipe.timing.total);
    if (recipe.timing && recipe.timing.prep) metrics.push('Prep ' + recipe.timing.prep);
    if (recipe.timing && recipe.timing.cook) metrics.push('Cuisson ' + recipe.timing.cook);
    if (recipe.difficulty && recipe.difficulty.label) metrics.push(recipe.difficulty.label);
    if (recipe.serves) metrics.push(recipe.serves + ' pers.');
    return metrics;
  }

  function renderSources(recipe) {
    if (!Array.isArray(recipe.sources) || !recipe.sources.length) return '';

    return '<article class="vd-recipe-signature__sources"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Sources & références</span><h2>Recette inspirée de sources ouvertes et adaptée pour Vanille Désiré.</h2></div></div><div class="vd-recipe-signature__sources-list">' +
      recipe.sources.map(function (source) {
        var title = escapeHtml(source.title || source.url || 'Source');
        var meta = [source.license, source.note].filter(Boolean).map(escapeHtml).join(' · ');
        var link = source.url
          ? '<a href="' + escapeHtml(source.url) + '" target="_blank" rel="noreferrer">' + title + '</a>'
          : '<span>' + title + '</span>';
        return '<article class="vd-recipe-signature__source-item"><strong>' + link + '</strong>' +
          (meta ? '<p>' + meta + '</p>' : '') +
        '</article>';
      }).join('') +
    '</div></article>';
  }

  function relatedRecipesFor(recipe, recipes) {
    if (!Array.isArray(recipes)) return [];

    var baseTags = Array.isArray(recipe.tags) ? recipe.tags : [];
    return recipes
      .filter(function (entry) {
        return entry && entry.slug !== recipe.slug && entry.status === 'approved';
      })
      .map(function (entry) {
        var score = 0;
        if (entry.category && recipe.category && entry.category === recipe.category) score += 2;
        if (entry.access === recipe.access) score += 1;
        if (Array.isArray(entry.collections) && Array.isArray(recipe.collections)) {
          entry.collections.forEach(function (collection) {
            if (recipe.collections.indexOf(collection) !== -1) score += 3;
          });
        }
        if (Array.isArray(entry.tags)) {
          entry.tags.forEach(function (tag) {
            if (baseTags.indexOf(tag) !== -1) score += 1;
          });
        }
        return { recipe: entry, score: score };
      })
      .sort(function (left, right) {
        return right.score - left.score;
      })
      .slice(0, 3)
      .map(function (entry) {
        return entry.recipe;
      });
  }

  function renderRelated(recipe, items) {
    if (!Array.isArray(items) || !items.length) return '';

    return '<article class="vd-recipe-signature__related"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">À poursuivre</span><h2>Continuer la lecture dans le même univers.</h2></div></div><div class="vd-recipe-signature__related-grid">' +
      items.map(function (entry) {
        return '<a class="vd-recipe-signature__related-card" href="' + escapeHtml(appendPreviewThemeId((entry.page_url || ('/pages/recettes?recipe=' + encodeURIComponent(entry.slug || ''))))) + '" data-vd-preview-link><span>' + escapeHtml(entry.category || 'Recette') + '</span><strong>' + escapeHtml(entry.title) + '</strong><p>' + escapeHtml(entry.summary || entry.subtitle || '') + '</p></a>';
      }).join('') +
    '</div></article>';
  }

  function renderMedia(media, recipe) {
    var hero = recipe.hero || {};

    if (hero.video_url) {
      media.innerHTML =
        '<video class="vd-recipe-signature__video" autoplay loop muted playsinline preload="metadata">' +
          '<source src="' + escapeHtml(hero.video_url) + '" type="video/mp4">' +
        '</video>';
      return;
    }

    if (hero.image_url) {
      media.innerHTML = '<img class="vd-recipe-signature__poster" src="' + escapeHtml(hero.image_url) + '" alt="">';
      return;
    }

    media.innerHTML = '';
  }

  function parseEditorMedia(section, recipeSlug) {
    var node = section.querySelector('[data-vd-recipe-editor-media]');
    if (!node) return [];

    try {
      var payload = JSON.parse(node.textContent || '[]');
      if (!Array.isArray(payload)) return [];
      return payload.filter(function (item) {
        return item && item.recipe_slug === recipeSlug;
      });
    } catch (error) {
      return [];
    }
  }

  function applyEditorMedia(recipe, editorMedia) {
    if (!editorMedia.length) return recipe;

    var recipeClone = Object.assign({}, recipe);
    var heroMedia = editorMedia.find(function (item) {
      return item.placement === 'hero' && (item.video_url || item.image_url);
    });

    recipeClone.hero = Object.assign({}, recipe.hero || {});
    if (heroMedia) {
      if (heroMedia.video_url) recipeClone.hero.video_url = heroMedia.video_url;
      if (heroMedia.image_url) recipeClone.hero.image_url = heroMedia.image_url;
    }

    var galleryMedia = editorMedia.filter(function (item) {
      return item.placement === 'gallery' && (item.video_url || item.image_url);
    });
    recipeClone.story_media = (recipe.story_media || []).slice();
    if (galleryMedia.length) {
      recipeClone.story_media = recipeClone.story_media.concat(galleryMedia);
    }

    recipeClone.steps = (recipe.steps || []).map(function (step, index) {
      var editorStepMedia = editorMedia.filter(function (item) {
        return item.placement === 'step' && Number(item.step_number) === index + 1 && (item.video_url || item.image_url);
      });
      return Object.assign({}, step, {
        media: (step.media || []).concat(editorStepMedia),
        editor_media: editorStepMedia
      });
    });

    return recipeClone;
  }

  function renderEditorialMedia(items, className) {
    return (items || [])
      .map(function (item) {
        var mediaNode = item.video_url
          ? '<video class="' + className + '__asset" playsinline muted loop controls preload="metadata"><source src="' + escapeHtml(item.video_url) + '" type="video/mp4"></video>'
          : '<img class="' + className + '__asset" src="' + escapeHtml(item.image_url) + '" alt="' + escapeHtml(item.image_alt || item.caption || '') + '">';

        return (
          '<figure class="' + className + '__item">' +
            '<div class="' + className + '__media">' + mediaNode + '</div>' +
            (item.caption ? '<figcaption class="' + className + '__caption">' + escapeHtml(item.caption) + '</figcaption>' : '') +
          '</figure>'
        );
      })
      .join('');
  }

  function renderRecipeShell(section, recipe, isLocked, relatedRecipes) {
    var shell = section.querySelector('[data-vd-recipe-shell]');
    var loginUrl = section.getAttribute('data-login-url') || '/account/login';
    var registerUrl = section.getAttribute('data-register-url') || '/account/register';
    var currentReturnTo = encodeURIComponent(window.location.pathname + window.location.search);

    function withCurrentReturnTo(url) {
      var separator = url.indexOf('?') === -1 ? '?' : '&';
      if (url.indexOf('return_to=') !== -1) {
        return url.replace(/return_to=[^&]*/g, 'return_to=' + currentReturnTo);
      }
      return url + separator + 'return_to=' + currentReturnTo;
    }

    loginUrl = withCurrentReturnTo(loginUrl);
    registerUrl = withCurrentReturnTo(registerUrl);
    var metrics = metricList(recipe)
      .map(function (metric) {
        return '<span class="vd-recipe-signature__meta-item">' + escapeHtml(metric) + '</span>';
      })
      .join('');
    var productUrl = recipe.product && recipe.product.handle ? '/products/' + recipe.product.handle : '';
    var collectionUrl = recipe.product && recipe.product.collection_handle ? '/collections/' + recipe.product.collection_handle : '';
    var previewIngredients = (recipe.ingredient_groups || [])
      .slice(0, 1)
      .map(function (group) {
        return (group.items || [])
          .slice(0, 4)
          .map(function (item) {
            return '<p>' + escapeHtml([item.quantity, item.unit, item.name].join(' ').trim()) + '</p>';
          })
          .join('');
      })
      .join('');
    var previewSteps = (recipe.steps || [])
      .slice(0, 2)
      .map(function (step, index) {
        return '<p>Étape ' + (index + 1) + ' · ' + escapeHtml(step.title) + '</p>';
      })
      .join('');
    var recipeSummary = escapeHtml(recipe.description || recipe.summary || '');
    var recipeSubtitle = escapeHtml(recipe.subtitle || recipe.summary || '');
    var favoriteActive = isFavoriteRecipe(recipe.slug);
    var editorialPanel =
      (recipe.seo && Array.isArray(recipe.seo.body_sections) && recipe.seo.body_sections.length
        ? '<article class="vd-recipe-signature__editorial"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Conseils utiles</span><h2>Les bons repères avant de commencer.</h2></div></div><div class="vd-recipe-signature__editorial-grid">' +
            (recipe.seo.body_sections || []).map(function (sectionItem) {
              return '<article class="vd-recipe-signature__editorial-card"><h3>' + escapeHtml(sectionItem.title) + '</h3><p>' + escapeHtml(sectionItem.body) + '</p></article>';
            }).join('') +
          '</div></article>'
        : '');
    var faqPanel =
      (recipe.seo && Array.isArray(recipe.seo.faq) && recipe.seo.faq.length
        ? '<article class="vd-recipe-signature__faq"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">FAQ recette</span><h2>Questions fréquentes avant de se lancer.</h2></div></div><div class="vd-recipe-signature__faq-list">' +
            recipe.seo.faq.map(function (item) {
              return '<details class="vd-recipe-signature__faq-item"><summary>' + escapeHtml(item.question) + '</summary><p>' + escapeHtml(item.answer) + '</p></details>';
            }).join('') +
          '</div></article>'
        : '');
    var storyPanel =
      (recipe.story_media && recipe.story_media.length
        ? '<article class="vd-recipe-signature__story"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Visuels recette</span><h2>Une lecture visuelle pour suivre chaque geste.</h2></div></div><div class="vd-recipe-signature__story-grid">' + renderEditorialMedia(recipe.story_media, 'vd-recipe-signature__story-card') + '</div></article>'
        : '');
    var sourcePanel = renderSources(recipe);
    var relatedPanel = renderRelated(recipe, relatedRecipes);
    var shopPanel =
      ((productUrl || collectionUrl)
        ? '<article class="vd-recipe-signature__shop" data-vd-recipe-shop data-product-handle="' + escapeHtml((recipe.product && recipe.product.handle) || '') + '" data-collection-handle="' + escapeHtml((recipe.product && recipe.product.collection_handle) || '') + '">' +
            '<div class="vd-recipe-signature__shop-copy"><span class="vd-recipe-signature__panel-kicker">Nos produits</span><h2>Les produits utiles pour refaire la recette.</h2><p>' + escapeHtml((recipe.product && recipe.product.note) || 'Retrouvez la vanille et les références conseillées pour refaire cette recette avec les bons produits.') + '</p></div>' +
            '<div class="vd-recipe-signature__shop-carousel">' +
              '<button type="button" class="vd-recipe-signature__shop-nav" data-vd-recipe-shop-prev aria-label="Produit précédent">Préc.</button>' +
              '<div class="vd-recipe-signature__shop-window">' +
                '<div class="vd-recipe-signature__shop-track" data-vd-recipe-shop-track>' +
                  '<article class="vd-recipe-signature__shop-loading">Chargement des produits...</article>' +
                '</div>' +
              '</div>' +
              '<button type="button" class="vd-recipe-signature__shop-nav" data-vd-recipe-shop-next aria-label="Produit suivant">Suiv.</button>' +
            '</div>' +
          '</article>'
        : '');

    shell.innerHTML =
      '<div class="vd-recipe-signature__hero">' +
        '<div class="vd-recipe-signature__hero-copy">' +
          '<span class="vd-recipe-signature__eyebrow" data-vd-recipe-title-eyebrow>' + escapeHtml(recipe.eyebrow || 'Recette') + '</span>' +
          '<h1 class="vd-recipe-signature__heading" data-vd-recipe-title>' + escapeHtml(recipe.title) + '</h1>' +
          '<p class="vd-recipe-signature__intro" data-vd-recipe-intro>' + recipeSummary + '</p>' +
          '<div class="vd-recipe-signature__meta">' + metrics + '</div>' +
        '</div>' +
        '<aside class="vd-recipe-signature__hero-aside">' +
          '<span class="vd-recipe-signature__panel-kicker">' + escapeHtml(isLocked ? 'Compte client' : 'Mode navigation') + '</span>' +
          '<h2>' + recipeSubtitle + '</h2>' +
          '<p>' + escapeHtml(isLocked ? 'Connectez-vous pour lancer le pas-à-pas, mémoriser la progression et passer en plein écran.' : 'Passez en focus, suivez étape par étape et gardez la progression en mémoire locale.') + '</p>' +
          '<div class="vd-recipe-signature__hero-actions">' +
            (isLocked
              ? '<a href="' + escapeHtml(loginUrl) + '" class="vd-recipe-signature__hero-link is-primary">Se connecter</a><a href="' + escapeHtml(registerUrl) + '" class="vd-recipe-signature__hero-link is-secondary">Créer un compte</a>'
              : '<a href="#VDRecipeIngredients" class="vd-recipe-signature__hero-link is-primary">Voir les ingrédients</a><a href="#VDRecipePreparation" class="vd-recipe-signature__hero-link is-secondary">Voir la préparation</a>'
            ) +
          '</div>' +
          (!isLocked ? '<button type="button" class="vd-recipe-signature__hero-favorite' + (favoriteActive ? ' is-active' : '') + '" data-vd-recipe-favorite>' + (favoriteActive ? 'Dans vos favoris' : 'Ajouter au carnet') + '</button>' : '') +
        '</aside>' +
      '</div>' +
      (isLocked
        ? '<div class="vd-recipe-signature__gate">' +
            '<article class="vd-recipe-signature__overview"><div class="vd-recipe-signature__overview-head"><span class="vd-recipe-signature__panel-kicker">Descriptif</span><h2>La recette en un coup d’œil.</h2></div><div class="vd-recipe-signature__overview-body"><p>' + recipeSummary + '</p></div></article>' +
            '<div class="vd-recipe-signature__gate-card">' +
              '<span class="vd-recipe-signature__panel-kicker">Apercu</span>' +
              '<h2>Le mode complet se débloque après connexion.</h2>' +
              '<p>Connectez-vous pour suivre les étapes pas à pas, mémoriser votre progression et cuisiner en mode plein écran.</p>' +
              '<div class="vd-recipe-signature__gate-actions">' +
                '<a href="' + escapeHtml(loginUrl) + '" class="vd-recipe-signature__hero-link is-primary">Se connecter</a>' +
                '<a href="' + escapeHtml(registerUrl) + '" class="vd-recipe-signature__hero-link is-secondary">Créer un compte</a>' +
              '</div>' +
            '</div>' +
            storyPanel +
            '<div class="vd-recipe-signature__preview">' +
              '<article class="vd-recipe-signature__panel"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Ingrédients</span><h2>Avant de cuisiner</h2></div></div><div class="vd-recipe-signature__panel-body vd-recipe-signature__preview-copy">' + previewIngredients + '</div></article>' +
              '<article class="vd-recipe-signature__panel"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Étapes</span><h2>Aperçu de la préparation</h2></div></div><div class="vd-recipe-signature__panel-body vd-recipe-signature__preview-copy">' + previewSteps + '</div></article>' +
            '</div>' + editorialPanel + faqPanel + sourcePanel + relatedPanel + shopPanel +
          '</div>'
        : '<div class="vd-recipe-signature__fullscreen-spotlight">' +
            '<button type="button" class="vd-recipe-signature__fullscreen-button" data-vd-recipe-fullscreen>Plein écran</button>' +
            '<p>Mode immersion pour cuisiner avec une lecture plus nette et plus ample.</p>' +
          '</div>' +
          '<div class="vd-recipe-signature__utility">' +
            '<div class="vd-recipe-signature__utility-main">' +
              '<div class="vd-recipe-signature__progress"><span class="vd-recipe-signature__panel-kicker">Progression</span><div class="vd-recipe-signature__progress-bar"><span class="vd-recipe-signature__progress-fill" data-vd-recipe-progress-fill></span></div><div class="vd-recipe-signature__progress-text" data-vd-recipe-progress-text>0/' + escapeHtml(String((recipe.steps || []).length)) + ' étapes</div></div>' +
              '<div class="vd-recipe-signature__serves"><span class="vd-recipe-signature__panel-kicker">Portions</span><div class="vd-recipe-signature__serves-control"><button type="button" data-vd-recipe-minus aria-label="Diminuer">−</button><input type="number" min="1" value="' + escapeHtml(String(recipe.serves || 1)) + '" data-vd-recipe-serves><button type="button" data-vd-recipe-plus aria-label="Augmenter">+</button></div></div>' +
              '<article class="vd-recipe-signature__session-card"><span class="vd-recipe-signature__panel-kicker">Session</span><strong data-vd-recipe-session-status>Nouvelle session</strong><p data-vd-recipe-session-title>' + escapeHtml((recipe.steps && recipe.steps[0] && recipe.steps[0].title) || 'Commencez la préparation.') + '</p><div class="vd-recipe-signature__session-meta" data-vd-recipe-session-meta>Étape 1 prête à lancer.</div><button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-session-jump>Reprendre</button></article>' +
            '</div>' +
            '<div class="vd-recipe-signature__utility-actions">' +
              '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-focus>Mode focus</button>' +
              '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-toggle>Tout cocher</button>' +
              '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-copy>Copier</button>' +
              '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-download>Télécharger</button>' +
              '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-reset>Réinitialiser</button>' +
            '</div>' +
          '</div>' +
          '<article class="vd-recipe-signature__overview"><div class="vd-recipe-signature__overview-head"><span class="vd-recipe-signature__panel-kicker">Descriptif</span><h2>Ce que vous allez préparer.</h2></div><div class="vd-recipe-signature__overview-body"><p>' + recipeSummary + '</p></div></article>' +
          storyPanel +
          editorialPanel +
          '<div class="vd-recipe-signature__layout">' +
            '<div class="vd-recipe-signature__main">' +
              '<article class="vd-recipe-signature__panel vd-recipe-signature__ingredients-panel" id="VDRecipeIngredients" data-vd-recipe-ingredients-panel><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Ingrédients</span><h2>Tout le nécessaire pour <span data-vd-recipe-serves-slot>' + escapeHtml(String(recipe.serves || 1)) + '</span> personnes.</h2></div></div><div class="vd-recipe-signature__ingredients-done" data-vd-recipe-ingredients-done hidden><strong>Ingrédients prêts.</strong><p>Tout est coché, on peut laisser plus de place à la préparation.</p><button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-ingredients-show>Revoir les ingrédients</button></div><div class="vd-recipe-signature__panel-body" data-vd-recipe-ingredients></div></article>' +
              '<article class="vd-recipe-signature__panel" id="VDRecipePreparation"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Préparation</span><h2>Le pas à pas complet de la recette.</h2></div><div class="vd-recipe-signature__step-nav"><button type="button" data-vd-recipe-prev-step>Étape précédente</button><button type="button" data-vd-recipe-next-step>Étape suivante</button></div></div><div class="vd-recipe-signature__step-rail" data-vd-recipe-step-rail></div><div class="vd-recipe-signature__panel-body" data-vd-recipe-steps></div></article>' +
            '</div>' +
            '<aside class="vd-recipe-signature__aside">' +
              (recipe.tips && recipe.tips.length
                ? '<article class="vd-recipe-signature__panel"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">À retenir</span><h2>Deux repères vraiment utiles.</h2></div></div><div class="vd-recipe-signature__panel-body vd-recipe-signature__tips-compact" data-vd-recipe-tips></div></article>'
                : '') +
            '</aside>' +
          '</div>' + faqPanel + sourcePanel + relatedPanel + shopPanel
      );
  }

  function loadRecipeProducts(recipe) {
    var requests = [];
    var seen = {};

    function normalizeProduct(product) {
      if (!product || !product.handle || seen[product.handle]) return null;
      seen[product.handle] = true;
      var variants = Array.isArray(product.variants) ? product.variants : [];
      var firstVariant = variants[0] || {};
      var image = '';
      if (product.featured_image && typeof product.featured_image === 'string') image = product.featured_image;
      if (!image && product.featured_image && product.featured_image.src) image = product.featured_image.src;
      if (!image && Array.isArray(product.images) && product.images[0]) {
        image = typeof product.images[0] === 'string' ? product.images[0] : product.images[0].src || '';
      }
      return {
        title: product.title || '',
        handle: product.handle,
        url: product.url || ('/products/' + product.handle),
        image: image,
        price: formatMoney(firstVariant.price || product.price || 0),
        vendor: product.vendor || '',
        available: product.available !== false
      };
    }

    var requiredHandles = [];
    if (recipe.product && Array.isArray(recipe.product.required_handles)) {
      requiredHandles = recipe.product.required_handles.filter(Boolean);
    }
    if (!requiredHandles.length && recipe.product && recipe.product.handle) {
      requiredHandles = [recipe.product.handle];
    }

    requiredHandles.forEach(function (handle) {
      requests.push(
        fetch('/products/' + encodeURIComponent(handle) + '.js', { credentials: 'same-origin' })
          .then(function (response) {
            if (!response.ok) throw new Error('product');
            return response.json();
          })
          .then(function (product) {
            return [normalizeProduct(product)].filter(Boolean);
          })
          .catch(function () {
            return [];
          })
      );
    });

    if (!requests.length) return Promise.resolve([]);

    return Promise.all(requests).then(function (groups) {
      return groups.reduce(function (accumulator, group) {
        return accumulator.concat(group);
      }, []);
    });
  }

  function hydrateShop(section, recipe) {
    var shop = section.querySelector('[data-vd-recipe-shop]');
    if (!shop) return;
    var viewport = shop.querySelector('.vd-recipe-signature__shop-window');
    var track = shop.querySelector('[data-vd-recipe-shop-track]');
    var prevButton = shop.querySelector('[data-vd-recipe-shop-prev]');
    var nextButton = shop.querySelector('[data-vd-recipe-shop-next]');
    if (!track || !viewport) return;

    function updateNav() {
      if (!prevButton || !nextButton) return;
      var maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth - 4);
      prevButton.disabled = viewport.scrollLeft <= 4;
      nextButton.disabled = viewport.scrollLeft >= maxScroll;
    }

    function renderProducts(products) {
      if (!products.length) {
        track.innerHTML = '<article class="vd-recipe-signature__shop-loading">Les produits recommandes arrivent bientot.</article>';
        if (prevButton) prevButton.hidden = true;
        if (nextButton) nextButton.hidden = true;
        return;
      }

      track.innerHTML = products
        .map(function (product) {
          return (
            '<article class="vd-recipe-signature__product-card">' +
              '<a class="vd-recipe-signature__product-link" href="' + escapeHtml(product.url) + '">' +
                (product.image ? '<div class="vd-recipe-signature__product-media"><img src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.title) + '"></div>' : '') +
                '<div class="vd-recipe-signature__product-copy">' +
                  (product.vendor ? '<span class="vd-recipe-signature__panel-kicker">' + escapeHtml(product.vendor) + '</span>' : '') +
                  '<h3>' + escapeHtml(product.title) + '</h3>' +
                  '<div class="vd-recipe-signature__product-meta"><strong>' + escapeHtml(product.price) + '</strong><span>' + escapeHtml(product.available ? 'Disponible' : 'Rupture') + '</span></div>' +
                '</div>' +
              '</a>' +
            '</article>'
          );
        })
        .join('');

      updateNav();
      viewport.addEventListener('scroll', updateNav);
      if (prevButton) {
        prevButton.hidden = products.length < 2;
        prevButton.addEventListener('click', function () {
          viewport.scrollBy({ left: -Math.max(280, viewport.clientWidth * 0.82), behavior: 'smooth' });
        });
      }
      if (nextButton) {
        nextButton.hidden = products.length < 2;
        nextButton.addEventListener('click', function () {
          viewport.scrollBy({ left: Math.max(280, viewport.clientWidth * 0.82), behavior: 'smooth' });
        });
      }

      if (window.gsap) {
        window.gsap.fromTo(
          track.querySelectorAll('.vd-recipe-signature__product-card'),
          { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.48, stagger: 0.06, ease: 'power2.out' }
        );
      }
    }

    loadRecipeProducts(recipe).then(renderProducts);
  }

  function bindRecipe(section, recipe, shelfClient) {
    var storageKey = 'vd-recipe-' + recipe.slug;
    var baseServes = Number(recipe.serves) || 1;
    var state = loadState(storageKey, baseServes, (recipe.steps || []).length);
    var quantityInput = section.querySelector('[data-vd-recipe-serves]');
    var minusButton = section.querySelector('[data-vd-recipe-minus]');
    var plusButton = section.querySelector('[data-vd-recipe-plus]');
    var progressFill = section.querySelector('[data-vd-recipe-progress-fill]');
    var progressText = section.querySelector('[data-vd-recipe-progress-text]');
    var ingredientsPanel = section.querySelector('[data-vd-recipe-ingredients-panel]');
    var ingredientsTarget = section.querySelector('[data-vd-recipe-ingredients]');
    var ingredientsDone = section.querySelector('[data-vd-recipe-ingredients-done]');
    var ingredientsShowButton = section.querySelector('[data-vd-recipe-ingredients-show]');
    var stepRailTarget = section.querySelector('[data-vd-recipe-step-rail]');
    var stepsTarget = section.querySelector('[data-vd-recipe-steps]');
    var tipsTarget = section.querySelector('[data-vd-recipe-tips]');
    var sessionStatus = section.querySelector('[data-vd-recipe-session-status]');
    var sessionTitle = section.querySelector('[data-vd-recipe-session-title]');
    var sessionMeta = section.querySelector('[data-vd-recipe-session-meta]');
    var sessionJumpButton = section.querySelector('[data-vd-recipe-session-jump]');
    var focusButton = section.querySelector('[data-vd-recipe-focus]');
    var fullscreenButton = section.querySelector('[data-vd-recipe-fullscreen]');
    var favoriteButton = section.querySelector('[data-vd-recipe-favorite]');
    var toggleButton = section.querySelector('[data-vd-recipe-toggle]');
    var copyButton = section.querySelector('[data-vd-recipe-copy]');
    var downloadButton = section.querySelector('[data-vd-recipe-download]');
    var resetButton = section.querySelector('[data-vd-recipe-reset]');
    var prevButton = section.querySelector('[data-vd-recipe-prev-step]');
    var nextButton = section.querySelector('[data-vd-recipe-next-step]');
    var cleanups = [];
    var timerState = {
      intervalId: null,
      stepId: '',
      remainingSeconds: 0
    };

    if (!quantityInput || !ingredientsTarget || !stepsTarget) return;

    function scaledQuantity(item) {
      var baseQuantity = parseQuantity(item.quantity);
      if (baseQuantity === null || item.scalable === false) return item.quantity;
      return formatQuantity((baseQuantity * state.serves) / baseServes);
    }

    function renderIngredients() {
      ingredientsTarget.innerHTML = (recipe.ingredient_groups || [])
        .map(function (group) {
          return (
            '<div class="vd-recipe-signature__ingredient-group">' +
              '<h3>' + escapeHtml(group.title || '') + '</h3>' +
              '<div class="vd-recipe-signature__ingredient-list">' +
                (group.items || [])
                  .map(function (item) {
                    var itemId = 'ingredient-' + item.id;
                    var checked = !!state.checked[itemId];
                    return (
                      '<label class="vd-recipe-signature__ingredient">' +
                        '<input type="checkbox" data-vd-recipe-check data-item-type="ingredient" data-item-id="' + escapeHtml(itemId) + '"' + (checked ? ' checked' : '') + '>' +
                        '<span><strong><span data-vd-recipe-base-qty="' + escapeHtml(item.quantity || '') + '" data-vd-recipe-scalable="' + escapeHtml(String(item.scalable !== false)) + '">' + escapeHtml([scaledQuantity(item), item.unit].join(' ').trim()) + '</span> ' + escapeHtml(item.name || '') + '</strong>' +
                        (item.note ? '<p>' + escapeHtml(item.note) + '</p>' : '') + '</span>' +
                        (item.badge ? '<span class="vd-recipe-signature__chip">' + escapeHtml(item.badge) + '</span>' : '') +
                      '</label>'
                    );
                  })
                  .join('') +
              '</div>' +
            '</div>'
          );
        })
        .join('');
    }

    function renderSteps() {
      stepsTarget.innerHTML = (recipe.steps || [])
        .map(function (step, index) {
          var itemId = 'step-' + step.id;
          var checked = !!state.checked[itemId];
          var active = index === state.activeStepIndex;
          return (
            '<article class="vd-recipe-signature__step' + (active ? ' is-active' : '') + '" data-vd-recipe-step-item data-step-index="' + index + '">' +
              '<div class="vd-recipe-signature__step-top">' +
                '<div class="vd-recipe-signature__step-meta">' +
                  '<span class="vd-recipe-signature__panel-kicker">Étape ' + (index + 1) + '</span>' +
                  (step.duration ? '<span class="vd-recipe-signature__chip" data-vd-recipe-step-duration>' + escapeHtml(step.duration) + '</span>' : '') +
                  (step.highlight ? '<span class="vd-recipe-signature__chip">' + escapeHtml(step.highlight) + '</span>' : '') +
                '</div>' +
                '<div class="vd-recipe-signature__step-actions">' +
                  '<label class="vd-recipe-signature__step-check"><input type="checkbox" data-vd-recipe-check data-item-type="step" data-item-id="' + escapeHtml(itemId) + '"' + (checked ? ' checked' : '') + '> Fait</label>' +
                  (parseDurationMinutes(step.duration)
                    ? '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-step-timer data-step-id="' + escapeHtml(step.id) + '" data-step-duration="' + escapeHtml(step.duration) + '">Lancer ' + escapeHtml(step.duration) + '</button>'
                    : '') +
                  '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-step-select data-step-index="' + index + '">Centrer</button>' +
                '</div>' +
              '</div>' +
              '<div class="vd-recipe-signature__step-content"><strong data-vd-recipe-step-title>' + escapeHtml(step.title) + '</strong><p>' + escapeHtml(step.body) + '</p></div>' +
              ((step.media && step.media.length)
                ? '<div class="vd-recipe-signature__step-gallery">' + renderEditorialMedia(step.media, 'vd-recipe-signature__step-media') + '</div>'
                : '') +
            '</article>'
          );
        })
        .join('');
    }

    function renderStepRail() {
      if (!stepRailTarget) return;
      stepRailTarget.innerHTML = (recipe.steps || [])
        .map(function (step, index) {
          return (
            '<button type="button" class="vd-recipe-signature__step-pill' + (index === state.activeStepIndex ? ' is-active' : '') + '" data-vd-recipe-step-pill data-step-index="' + index + '">' +
              '<span>Étape ' + (index + 1) + '</span>' +
              '<strong>' + escapeHtml(step.title) + '</strong>' +
              (step.duration ? '<small>' + escapeHtml(step.duration) + '</small>' : '') +
            '</button>'
          );
        })
        .join('');
    }

    function renderTips() {
      if (!tipsTarget) return;
      tipsTarget.innerHTML = (recipe.tips || [])
        .slice(0, 2)
        .map(function (tip, index) {
          return (
            '<article class="vd-recipe-signature__tip-card">' +
              '<strong>' + escapeHtml(tip.title) + '</strong>' +
              '<p class="vd-recipe-signature__tip-content">' + escapeHtml(compactText(tip.body, index === 0 ? 150 : 110)) + '</p>' +
            '</article>'
          );
        })
        .join('');
    }

    function ingredientCheckboxes() {
      return Array.prototype.slice.call(section.querySelectorAll('[data-item-type="ingredient"][data-vd-recipe-check]'));
    }

    function setIngredientsCollapsed(collapsed, animate) {
      if (!ingredientsPanel || !ingredientsDone || !ingredientsTarget) return;

      ingredientsPanel.classList.toggle('is-complete', collapsed);

      if (!animate || !window.gsap) {
        ingredientsDone.hidden = !collapsed;
        ingredientsTarget.hidden = collapsed;
        return;
      }

      window.gsap.killTweensOf([ingredientsDone, ingredientsTarget]);

      if (collapsed) {
        ingredientsDone.hidden = false;
        window.gsap.set(ingredientsTarget, { height: ingredientsTarget.offsetHeight, overflow: 'hidden' });
        window.gsap.to(ingredientsTarget, {
          height: 0,
          opacity: 0,
          duration: 0.42,
          ease: 'power2.inOut',
          onComplete: function () {
            ingredientsTarget.hidden = true;
            window.gsap.set(ingredientsTarget, { clearProps: 'height,opacity,overflow' });
          }
        });
        window.gsap.fromTo(
          ingredientsDone,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.34, ease: 'power2.out', clearProps: 'opacity,transform' }
        );
        return;
      }

      ingredientsTarget.hidden = false;
      window.gsap.to(ingredientsDone, {
        opacity: 0,
        y: -10,
        duration: 0.22,
        ease: 'power1.out',
        onComplete: function () {
          ingredientsDone.hidden = true;
          window.gsap.set(ingredientsDone, { clearProps: 'opacity,transform' });
        }
      });
      window.gsap.fromTo(
        ingredientsTarget,
        { height: 0, opacity: 0, overflow: 'hidden' },
        {
          height: 'auto',
          opacity: 1,
          duration: 0.42,
          ease: 'power2.out',
          onComplete: function () {
            window.gsap.set(ingredientsTarget, { clearProps: 'height,opacity,overflow' });
          }
        }
      );
    }

    function refreshIngredientsPanel(animate) {
      if (!ingredientsPanel || !ingredientsDone) return;
      var boxes = ingredientCheckboxes();
      var allChecked = boxes.length > 0 && boxes.every(function (checkbox) {
        return checkbox.checked;
      });
      var alreadyCollapsed = ingredientsPanel.classList.contains('is-complete');
      if (alreadyCollapsed === allChecked) return;
      setIngredientsCollapsed(allChecked, !!animate);
    }

    function syncServes() {
      var serveSlots = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-serves-slot]'));
      quantityInput.value = String(state.serves);
      serveSlots.forEach(function (slot) {
        slot.textContent = String(state.serves);
      });
      renderIngredients();
      bindDynamicEvents();
      refreshIngredientsPanel(false);
      saveState(storageKey, state);
    }

    function stepCards() {
      return Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-step-item]'));
    }

    function stepPills() {
      return Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-step-pill]'));
    }

    function syncStepRail() {
      var pills = stepPills();
      pills.forEach(function (pill, pillIndex) {
        pill.classList.toggle('is-active', pillIndex === state.activeStepIndex);
      });
      var activePill = pills[state.activeStepIndex];
      if (activePill && typeof activePill.scrollIntoView === 'function') {
        activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }

    function refreshProgress() {
      var stepChecks = Array.prototype.slice.call(section.querySelectorAll('[data-item-type="step"][data-vd-recipe-check]'));
      var completed = stepChecks.filter(function (checkbox) {
        return checkbox.checked;
      }).length;
      var percent = stepChecks.length ? Math.round((completed / stepChecks.length) * 100) : 0;

      if (progressFill) progressFill.style.width = percent + '%';
      if (progressText) progressText.textContent = completed + '/' + stepChecks.length + ' etapes';
      updateSessionCard(completed, stepChecks.length);
    }

    function clearTimer() {
      if (timerState.intervalId) {
        window.clearInterval(timerState.intervalId);
      }
      timerState.intervalId = null;
      timerState.stepId = '';
      timerState.remainingSeconds = 0;
    }

    function updateTimerButtons() {
      Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-step-timer]')).forEach(function (button) {
        var stepId = button.getAttribute('data-step-id') || '';
        var durationLabel = button.getAttribute('data-step-duration') || '';
        var isRunning = timerState.intervalId && timerState.stepId === stepId;
        button.classList.toggle('is-running', !!isRunning);
        if (isRunning) {
          var minutes = Math.floor(timerState.remainingSeconds / 60);
          var seconds = timerState.remainingSeconds % 60;
          button.textContent = 'En cours ' + minutes + ':' + String(seconds).padStart(2, '0');
        } else {
          button.textContent = 'Lancer ' + durationLabel;
        }
      });
      updateSessionCard();
    }

    function updateSessionCard(completedCount, totalCount) {
      if (!sessionStatus || !sessionTitle || !sessionMeta) return;

      var steps = Array.isArray(recipe.steps) ? recipe.steps : [];
      var activeStep = steps[state.activeStepIndex] || steps[0] || null;
      var stepChecks = Array.prototype.slice.call(section.querySelectorAll('[data-item-type="step"][data-vd-recipe-check]'));
      var completed = typeof completedCount === 'number'
        ? completedCount
        : stepChecks.filter(function (checkbox) { return checkbox.checked; }).length;
      var total = typeof totalCount === 'number' ? totalCount : stepChecks.length;
      var remaining = Math.max(0, total - completed);

      if (!activeStep) {
        sessionStatus.textContent = 'Recette';
        sessionTitle.textContent = 'Aucune étape disponible';
        sessionMeta.textContent = 'Le pas à pas n’est pas encore disponible pour cette recette.';
        return;
      }

      if (completed >= total && total > 0) {
        sessionStatus.textContent = 'Recette terminée';
        sessionTitle.textContent = 'Tout est coché, vous pouvez repasser au descriptif ou aux produits.';
        sessionMeta.textContent = 'La session est complète.';
      } else if (timerState.intervalId && timerState.stepId === activeStep.id) {
        sessionStatus.textContent = 'Minuteur en cours';
        sessionTitle.textContent = activeStep.title;
        sessionMeta.textContent = 'Étape ' + (state.activeStepIndex + 1) + ' en cours · ' + Math.floor(timerState.remainingSeconds / 60) + ':' + String(timerState.remainingSeconds % 60).padStart(2, '0');
      } else if (completed > 0 || state.activeStepIndex > 0) {
        sessionStatus.textContent = 'Session en cours';
        sessionTitle.textContent = activeStep.title;
        sessionMeta.textContent = remaining + ' étape' + (remaining > 1 ? 's' : '') + ' restante' + (remaining > 1 ? 's' : '') + ' · étape ' + (state.activeStepIndex + 1);
      } else {
        sessionStatus.textContent = 'Nouvelle session';
        sessionTitle.textContent = activeStep.title;
        sessionMeta.textContent = 'Étape ' + (state.activeStepIndex + 1) + ' prête à lancer.';
      }
    }

    function startTimer(stepId, durationLabel) {
      var durationMinutes = parseDurationMinutes(durationLabel);
      if (!durationMinutes) return;

      if (timerState.intervalId && timerState.stepId === stepId) {
        clearTimer();
        updateTimerButtons();
        showToast(section, 'Minuteur arrêté');
        return;
      }

      clearTimer();
      timerState.stepId = stepId;
      timerState.remainingSeconds = durationMinutes * 60;
      updateTimerButtons();
      showToast(section, 'Minuteur lancé pour ' + durationLabel);

      timerState.intervalId = window.setInterval(function () {
        timerState.remainingSeconds -= 1;
        if (timerState.remainingSeconds <= 0) {
          clearTimer();
          updateTimerButtons();
          showToast(section, 'Étape terminée');
          return;
        }
        updateTimerButtons();
      }, 1000);
    }

    function setActiveStep(index, shouldScroll) {
      var cards = stepCards();
      if (!cards.length) return;
      state.activeStepIndex = Math.max(0, Math.min(cards.length - 1, index));
      cards.forEach(function (card, cardIndex) {
        card.classList.toggle('is-active', cardIndex === state.activeStepIndex);
      });
      syncStepRail();
      updateSessionCard();
      if (state.focusMode && shouldScroll && cards[state.activeStepIndex]) {
        cards[state.activeStepIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      saveState(storageKey, state);
    }

    function bindDynamicEvents() {
      Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-check]')).forEach(function (checkbox) {
        checkbox.addEventListener('change', function () {
          state.checked[checkbox.getAttribute('data-item-id')] = checkbox.checked;
          refreshIngredientsPanel(true);
          refreshProgress();
          saveState(storageKey, state);
        });
      });

      Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-step-select]')).forEach(function (button) {
        button.addEventListener('click', function () {
          setActiveStep(Number(button.getAttribute('data-step-index')) || 0, true);
        });
      });

      Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-step-pill]')).forEach(function (button) {
        button.addEventListener('click', function () {
          setActiveStep(Number(button.getAttribute('data-step-index')) || 0, true);
        });
      });

      Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-step-timer]')).forEach(function (button) {
        button.addEventListener('click', function () {
          startTimer(button.getAttribute('data-step-id') || '', button.getAttribute('data-step-duration') || '');
        });
      });
    }

    function buildText() {
      var lines = [recipe.title, '', recipe.description || recipe.summary || '', '', 'Ingrédients'];
      (recipe.ingredient_groups || []).forEach(function (group) {
        lines.push(group.title || '');
        (group.items || []).forEach(function (item) {
          lines.push('- ' + [scaledQuantity(item), item.unit, item.name].join(' ').trim());
        });
      });
      lines.push('', 'Préparation');
      (recipe.steps || []).forEach(function (step, index) {
        lines.push(index + 1 + '. ' + step.title + ' - ' + step.body);
      });
      return lines.join('\n');
    }

    function downloadText() {
      var blob = new Blob([buildText()], { type: 'text/plain;charset=utf-8' });
      var url = window.URL.createObjectURL(blob);
      var anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = recipe.slug + '.txt';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      showToast(section, 'Recette téléchargée');
    }

    function registerMotion() {
      if (!window.gsap || !window.ScrollTrigger) return;
      var cards = stepCards();
      window.gsap.fromTo(
        section.querySelectorAll('.vd-recipe-signature__hero-copy > *, .vd-recipe-signature__hero-aside > *'),
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.72, stagger: 0.08, ease: 'power2.out' }
      );

      window.gsap.fromTo(
        section.querySelectorAll('.vd-recipe-signature__fullscreen-spotlight, .vd-recipe-signature__overview, .vd-recipe-signature__shop'),
        { opacity: 0, y: 26 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 72%'
          }
        }
      );

      window.gsap.fromTo(
        cards,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.06,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: stepsTarget,
            start: 'top 78%'
          }
        }
      );

      cards.forEach(function (card, index) {
        var trigger = window.ScrollTrigger.create({
          trigger: card,
          start: 'top center',
          end: 'bottom center',
          onEnter: function () {
            setActiveStep(index, false);
          },
          onEnterBack: function () {
            setActiveStep(index, false);
          }
        });

        cleanups.push(function () {
          trigger.kill();
        });
      });
    }

    renderStepRail();
    renderSteps();
    renderTips();
    syncServes();
    refreshProgress();
    refreshIngredientsPanel(false);
    setActiveStep(state.activeStepIndex, false);
    section.classList.toggle('is-focus-mode', state.focusMode);
    focusButton.textContent = state.focusMode ? 'Vue complete' : 'Mode focus';
    updateTimerButtons();

    if (ingredientsShowButton) {
      ingredientsShowButton.addEventListener('click', function () {
        setIngredientsCollapsed(false, true);
        if (ingredientsPanel) ingredientsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    minusButton.addEventListener('click', function () {
      state.serves = Math.max(1, state.serves - 1);
      syncServes();
    });

    plusButton.addEventListener('click', function () {
      state.serves += 1;
      syncServes();
    });

    quantityInput.addEventListener('input', function () {
      state.serves = Math.max(1, Number(quantityInput.value) || baseServes);
      syncServes();
    });

    if (sessionJumpButton) {
      sessionJumpButton.addEventListener('click', function () {
        setActiveStep(state.activeStepIndex, true);
      });
    }

    focusButton.addEventListener('click', function () {
      state.focusMode = !state.focusMode;
      section.classList.toggle('is-focus-mode', state.focusMode);
      focusButton.textContent = state.focusMode ? 'Vue complete' : 'Mode focus';
      saveState(storageKey, state);
    });

    if (favoriteButton) {
      favoriteButton.addEventListener('click', function () {
        var active = toggleFavoriteRecipe(recipe.slug);
        favoriteButton.classList.toggle('is-active', active);
        favoriteButton.textContent = active ? 'Dans vos favoris' : 'Ajouter au carnet';
        showToast(section, active ? 'Ajoutée au carnet' : 'Retirée du carnet');
        if (shelfClient && shelfClient.enabled) {
          shelfClient.syncLocalStores().catch(function () {});
        }
      });
    }

    fullscreenButton.addEventListener('click', function () {
      if (!document.fullscreenElement && section.requestFullscreen) {
        section.requestFullscreen();
        section.classList.add('is-fullscreen');
        showToast(section, 'Plein écran activé');
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
        section.classList.remove('is-fullscreen');
      }
    });

    var fullscreenWheelHandler = function (event) {
      if (document.fullscreenElement !== section || !section.classList.contains('is-fullscreen')) return;

      var horizontalScrollable = findScrollableParent(event.target, 'x', section);
      if (horizontalScrollable && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return;
      }

      var verticalScrollable = findScrollableParent(event.target, 'y', section);
      if (verticalScrollable && verticalScrollable !== section) {
        return;
      }

      if (Math.abs(event.deltaY) < 1) return;

      event.preventDefault();
      section.scrollTop += event.deltaY;
    };

    section.addEventListener('wheel', fullscreenWheelHandler, { passive: false });
    cleanups.push(function () {
      section.removeEventListener('wheel', fullscreenWheelHandler, { passive: false });
    });

    document.addEventListener('fullscreenchange', function () {
      var isFullscreen = document.fullscreenElement === section;
      section.classList.toggle('is-fullscreen', isFullscreen);
      fullscreenButton.textContent = isFullscreen ? 'Quitter plein écran' : 'Plein écran';
      if (isFullscreen) {
        section.setAttribute('tabindex', '-1');
        section.focus({ preventScroll: true });
      } else {
        section.removeAttribute('tabindex');
      }
    });

    toggleButton.addEventListener('click', function () {
      var checkboxes = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-check]'));
      var nextState = !checkboxes.every(function (checkbox) {
        return checkbox.checked;
      });
      checkboxes.forEach(function (checkbox) {
        checkbox.checked = nextState;
        state.checked[checkbox.getAttribute('data-item-id')] = nextState;
      });
      refreshIngredientsPanel(true);
      refreshProgress();
      saveState(storageKey, state);
    });

    copyButton.addEventListener('click', function () {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        showToast(section, 'Copie indisponible');
        return;
      }

      navigator.clipboard.writeText(buildText()).then(function () {
        showToast(section, 'Recette copiee');
      });
    });

    downloadButton.addEventListener('click', downloadText);

    resetButton.addEventListener('click', function () {
      clearTimer();
      state.serves = baseServes;
      state.checked = {};
      state.activeStepIndex = 0;
      state.focusMode = false;
      section.classList.remove('is-focus-mode');
      focusButton.textContent = 'Mode focus';
      syncServes();
      refreshIngredientsPanel(false);
      refreshProgress();
      updateTimerButtons();
      setActiveStep(0, false);
      showToast(section, 'Progression reinitialisee');
      if (shelfClient && shelfClient.enabled) {
        shelfClient.syncLocalStores().catch(function () {});
      }
    });

    prevButton.addEventListener('click', function () {
      setActiveStep(state.activeStepIndex - 1, true);
    });

    nextButton.addEventListener('click', function () {
      setActiveStep(state.activeStepIndex + 1, true);
    });

    registerMotion();

    document.addEventListener('shopify:section:unload', function (event) {
      if (!section.contains(event.target)) return;
      clearTimer();
      cleanups.forEach(function (cleanup) {
        cleanup();
      });
      cleanups.length = 0;
    });
  }

  function renderError(section, message) {
    var shell = section.querySelector('[data-vd-recipe-shell]');
    shell.innerHTML =
      '<div class="vd-recipe-signature__loading"><span class="vd-recipe-signature__loading-label">Indisponible</span><h1>' +
      escapeHtml(message) +
      '</h1></div>';
  }

  function normalizePath(value) {
    if (!value) return '';

    var normalized = String(value).trim();
    if (!normalized) return '';

    try {
      normalized = new URL(normalized, window.location.origin).pathname;
    } catch (error) {
      normalized = normalized.split('?')[0].split('#')[0];
    }

    if (!normalized) return '';
    return normalized.replace(/\/+$/, '') || '/';
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

  function preservePreviewLinks(scope) {
    Array.prototype.forEach.call((scope || document).querySelectorAll('[data-vd-preview-link]'), function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      link.setAttribute('href', appendPreviewThemeId(href));
    });
  }

  function canScrollOnAxis(element, axis) {
    if (!element || element === document.body || element === document.documentElement) return false;

    var style = window.getComputedStyle(element);
    var overflowProp = axis === 'x' ? style.overflowX : style.overflowY;
    if (!/(auto|scroll|overlay)/.test(overflowProp)) return false;

    if (axis === 'x') {
      return element.scrollWidth > element.clientWidth + 4;
    }

    return element.scrollHeight > element.clientHeight + 4;
  }

  function findScrollableParent(node, axis, stopAt) {
    var current = node;

    while (current && current !== stopAt && current !== document.body) {
      if (canScrollOnAxis(current, axis)) return current;
      current = current.parentElement;
    }

    return null;
  }

  function resolveRequestedRecipe(recipes, requestedSlug) {
    if (!Array.isArray(recipes) || !recipes.length) return null;

    if (requestedSlug) {
      var bySlug = recipes.find(function (entry) {
        return entry.slug === requestedSlug;
      });

      if (bySlug) return bySlug;
    }

    var currentPath = normalizePath(window.location.pathname);
    if (!currentPath) return null;

    return recipes.find(function (entry) {
      return normalizePath(entry && entry.page_url) === currentPath;
    }) || null;
  }

  function initRecipe(section) {
    if (!section || section.__vdRecipeReady) return;
    section.__vdRecipeReady = true;
    preservePreviewLinks(document);

    var registryUrl = section.getAttribute('data-registry-url');
    var requestedSlug = section.getAttribute('data-recipe-slug') || '';
    var pageHandle = section.getAttribute('data-page-handle');
    var querySlug = new URLSearchParams(window.location.search).get('recipe');
    var customerAuthenticated = section.getAttribute('data-customer-authenticated') === 'true';
    var requireCustomerAccess = section.getAttribute('data-require-customer-access') === 'true';
    var shelfClient = createShelfClient(section);
    var media = section.querySelector('[data-vd-recipe-media]');
    var schemaNode = section.querySelector('[data-vd-recipe-schema]');

    if ((!requestedSlug || requestedSlug === pageHandle) && querySlug) {
      requestedSlug = querySlug;
    }

    if (requestedSlug === pageHandle) {
      requestedSlug = '';
    }

    if (!requestedSlug && !pageHandle) {
      return;
    }

    var shelfReady = shelfClient.enabled
      ? shelfClient.fetch().then(function (payload) {
          var remoteState = shelfClient.applyRemote(payload);
          if (remoteState && remoteState.changed) {
            return shelfClient.syncLocalStores().catch(function () {});
          }
        }).catch(function () {})
      : Promise.resolve();

    Promise.all([
      fetch(registryUrl, { credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) throw new Error('registry');
          return response.json();
        }),
      shelfReady
    ])
      .then(function (response) {
        var payload = response[0];
        var recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
        var recipe = resolveRequestedRecipe(recipes, requestedSlug);

        if (!recipe) {
          renderError(section, 'Cette recette est introuvable pour le moment.');
          return;
        }

        recipe = applyEditorMedia(recipe, parseEditorMedia(section, requestedSlug));
        pushRecipeHistory(recipe);
        if (shelfClient.enabled) {
          shelfClient.syncLocalStores().catch(function () {});
        }

        var isLocked = requireCustomerAccess && recipe.access === 'member' && !customerAuthenticated;
        renderMedia(media, recipe);
        renderRecipeShell(section, recipe, isLocked, relatedRecipesFor(recipe, recipes));

        if (schemaNode) {
          schemaNode.textContent = JSON.stringify(buildStructuredData(recipe));
        }

        hydrateShop(section, recipe);

        if (!isLocked) {
          bindRecipe(section, recipe, shelfClient);
        }
      })
      .catch(function () {
        renderError(section, 'La recette ne peut pas être chargée pour le moment.');
      });
  }

  function initAll() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-vd-recipe]'), initRecipe);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  document.addEventListener('shopify:section:load', function (event) {
    initRecipe(event.target);
  });
})();
