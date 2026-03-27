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
    return {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: recipe.title,
      description: recipe.description || recipe.summary || '',
      recipeYield: recipe.serves ? recipe.serves + ' portions' : '',
      recipeIngredient: (recipe.ingredient_groups || []).reduce(function (accumulator, group) {
        (group.items || []).forEach(function (item) {
          accumulator.push([item.quantity, item.unit, item.name].join(' ').trim());
        });
        return accumulator;
      }, []),
      recipeInstructions: (recipe.steps || []).map(function (step) {
        return {
          '@type': 'HowToStep',
          name: step.title,
          text: step.body
        };
      })
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

  function renderRecipeShell(section, recipe, isLocked) {
    var shell = section.querySelector('[data-vd-recipe-shell]');
    var loginUrl = section.getAttribute('data-login-url') || '/account/login';
    var registerUrl = section.getAttribute('data-register-url') || '/account/register';
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
        return '<p>Etape ' + (index + 1) + ' · ' + escapeHtml(step.title) + '</p>';
      })
      .join('');
    var recipeSummary = escapeHtml(recipe.description || recipe.summary || '');
    var recipeSubtitle = escapeHtml(recipe.subtitle || recipe.summary || '');
    var shopPanel =
      ((productUrl || collectionUrl)
        ? '<article class="vd-recipe-signature__shop"><div class="vd-recipe-signature__shop-copy"><span class="vd-recipe-signature__panel-kicker">Nos produits</span><h2>Tout retrouver au catalogue pour faire la recette.</h2><p>' + escapeHtml((recipe.product && recipe.product.note) || 'Retrouvez la vanille et les references conseillees pour realiser cette recette avec le bon produit.') + '</p></div><div class="vd-recipe-signature__shop-actions">' +
            (productUrl ? '<a href="' + escapeHtml(productUrl) + '" class="button button--primary">' + escapeHtml((recipe.product && recipe.product.primary_label) || 'Voir le produit') + '</a>' : '') +
            (collectionUrl ? '<a href="' + escapeHtml(collectionUrl) + '" class="button button--secondary">' + escapeHtml((recipe.product && recipe.product.secondary_label) || 'Voir la collection') + '</a>' : '') +
          '</div></article>'
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
          '<p>' + escapeHtml(isLocked ? 'Connectez-vous pour lancer le pas-a-pas, memoriser la progression et passer en plein ecran.' : 'Passez en focus, suivez etape par etape et gardez la progression en memoire locale.') + '</p>' +
          '<div class="vd-recipe-signature__hero-actions">' +
            (isLocked
              ? '<a href="' + escapeHtml(loginUrl) + '" class="button button--primary">Se connecter</a><a href="' + escapeHtml(registerUrl) + '" class="button button--secondary">Creer un compte</a>'
              : (productUrl ? '<a href="' + escapeHtml(productUrl) + '" class="button button--primary">' + escapeHtml((recipe.product && recipe.product.primary_label) || 'Voir le produit') + '</a>' : '') +
                (collectionUrl ? '<a href="' + escapeHtml(collectionUrl) + '" class="button button--secondary">' + escapeHtml((recipe.product && recipe.product.secondary_label) || 'Voir la collection') + '</a>' : '')
            ) +
          '</div>' +
        '</aside>' +
      '</div>' +
      (isLocked
        ? '<div class="vd-recipe-signature__gate">' +
            '<article class="vd-recipe-signature__overview"><div class="vd-recipe-signature__overview-head"><span class="vd-recipe-signature__panel-kicker">Descriptif</span><h2>La recette en un coup d oeil.</h2></div><div class="vd-recipe-signature__overview-body"><p>' + recipeSummary + '</p></div></article>' +
            '<div class="vd-recipe-signature__gate-card">' +
              '<span class="vd-recipe-signature__panel-kicker">Apercu</span>' +
              '<h2>Le mode complet se debloque apres connexion.</h2>' +
              '<p>La recette premium conserve une entree publique, puis ouvre la navigation immersive une fois le compte client connecte.</p>' +
              '<div class="vd-recipe-signature__gate-actions">' +
                '<a href="' + escapeHtml(loginUrl) + '" class="button button--primary">Se connecter</a>' +
                '<a href="' + escapeHtml(registerUrl) + '" class="button button--secondary">Creer un compte</a>' +
              '</div>' +
            '</div>' +
            '<div class="vd-recipe-signature__preview">' +
              '<article class="vd-recipe-signature__panel"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Ingredients</span><h2>Avant de cuisiner</h2></div></div><div class="vd-recipe-signature__panel-body vd-recipe-signature__preview-copy">' + previewIngredients + '</div></article>' +
              '<article class="vd-recipe-signature__panel"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Etapes</span><h2>Lecture libre</h2></div></div><div class="vd-recipe-signature__panel-body vd-recipe-signature__preview-copy">' + previewSteps + '</div></article>' +
            '</div>' + shopPanel +
          '</div>'
        : '<div class="vd-recipe-signature__utility">' +
            '<div class="vd-recipe-signature__utility-main">' +
              '<div class="vd-recipe-signature__progress"><span class="vd-recipe-signature__panel-kicker">Progression</span><div class="vd-recipe-signature__progress-bar"><span class="vd-recipe-signature__progress-fill" data-vd-recipe-progress-fill></span></div><div class="vd-recipe-signature__progress-text" data-vd-recipe-progress-text>0/' + escapeHtml(String((recipe.steps || []).length)) + ' etapes</div></div>' +
              '<div class="vd-recipe-signature__serves"><span class="vd-recipe-signature__panel-kicker">Portions</span><div class="vd-recipe-signature__serves-control"><button type="button" data-vd-recipe-minus aria-label="Diminuer">−</button><input type="number" min="1" value="' + escapeHtml(String(recipe.serves || 1)) + '" data-vd-recipe-serves><button type="button" data-vd-recipe-plus aria-label="Augmenter">+</button></div></div>' +
            '</div>' +
            '<div class="vd-recipe-signature__utility-actions">' +
              '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-focus>Mode focus</button>' +
              '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-fullscreen>Plein ecran</button>' +
              '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-toggle>Tout cocher</button>' +
              '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-copy>Copier</button>' +
              '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-download>Telecharger</button>' +
              '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-reset>Reinitialiser</button>' +
            '</div>' +
          '</div>' +
          '<article class="vd-recipe-signature__overview"><div class="vd-recipe-signature__overview-head"><span class="vd-recipe-signature__panel-kicker">Descriptif</span><h2>Ce que vous allez preparer.</h2></div><div class="vd-recipe-signature__overview-body"><p>' + recipeSummary + '</p></div></article>' +
          '<div class="vd-recipe-signature__layout">' +
            '<div class="vd-recipe-signature__main">' +
              '<article class="vd-recipe-signature__panel"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Ingredients</span><h2>Tout le necessaire pour <span data-vd-recipe-serves-slot>' + escapeHtml(String(recipe.serves || 1)) + '</span> personnes.</h2></div></div><div class="vd-recipe-signature__panel-body" data-vd-recipe-ingredients></div></article>' +
              '<article class="vd-recipe-signature__panel"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Preparation</span><h2>Le pas a pas complet de la recette.</h2></div><div class="vd-recipe-signature__step-nav"><button type="button" data-vd-recipe-prev-step>Etape precedente</button><button type="button" data-vd-recipe-next-step>Etape suivante</button></div></div><div class="vd-recipe-signature__panel-body" data-vd-recipe-steps></div></article>' +
            '</div>' +
            '<aside class="vd-recipe-signature__aside">' +
              (recipe.tips && recipe.tips.length
                ? '<article class="vd-recipe-signature__panel"><div class="vd-recipe-signature__panel-head"><div><span class="vd-recipe-signature__panel-kicker">Astuces</span><h2>Repères utiles en cuisine.</h2></div></div><div class="vd-recipe-signature__panel-body" data-vd-recipe-tips></div></article>'
                : '') +
            '</aside>' +
          '</div>' + shopPanel
      );
  }

  function bindRecipe(section, recipe) {
    var storageKey = 'vd-recipe-' + recipe.slug;
    var baseServes = Number(recipe.serves) || 1;
    var state = loadState(storageKey, baseServes, (recipe.steps || []).length);
    var quantityInput = section.querySelector('[data-vd-recipe-serves]');
    var minusButton = section.querySelector('[data-vd-recipe-minus]');
    var plusButton = section.querySelector('[data-vd-recipe-plus]');
    var progressFill = section.querySelector('[data-vd-recipe-progress-fill]');
    var progressText = section.querySelector('[data-vd-recipe-progress-text]');
    var ingredientsTarget = section.querySelector('[data-vd-recipe-ingredients]');
    var stepsTarget = section.querySelector('[data-vd-recipe-steps]');
    var tipsTarget = section.querySelector('[data-vd-recipe-tips]');
    var focusButton = section.querySelector('[data-vd-recipe-focus]');
    var fullscreenButton = section.querySelector('[data-vd-recipe-fullscreen]');
    var toggleButton = section.querySelector('[data-vd-recipe-toggle]');
    var copyButton = section.querySelector('[data-vd-recipe-copy]');
    var downloadButton = section.querySelector('[data-vd-recipe-download]');
    var resetButton = section.querySelector('[data-vd-recipe-reset]');
    var prevButton = section.querySelector('[data-vd-recipe-prev-step]');
    var nextButton = section.querySelector('[data-vd-recipe-next-step]');
    var cleanups = [];

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
                  '<span class="vd-recipe-signature__panel-kicker">Etape ' + (index + 1) + '</span>' +
                  (step.duration ? '<span class="vd-recipe-signature__chip" data-vd-recipe-step-duration>' + escapeHtml(step.duration) + '</span>' : '') +
                  (step.highlight ? '<span class="vd-recipe-signature__chip">' + escapeHtml(step.highlight) + '</span>' : '') +
                '</div>' +
                '<div class="vd-recipe-signature__step-actions">' +
                  '<label class="vd-recipe-signature__step-check"><input type="checkbox" data-vd-recipe-check data-item-type="step" data-item-id="' + escapeHtml(itemId) + '"' + (checked ? ' checked' : '') + '> Fait</label>' +
                  '<button type="button" class="vd-recipe-signature__utility-button" data-vd-recipe-step-select data-step-index="' + index + '">Centrer</button>' +
                '</div>' +
              '</div>' +
              '<div class="vd-recipe-signature__step-content"><strong data-vd-recipe-step-title>' + escapeHtml(step.title) + '</strong><p>' + escapeHtml(step.body) + '</p></div>' +
            '</article>'
          );
        })
        .join('');
    }

    function renderTips() {
      if (!tipsTarget) return;
      tipsTarget.innerHTML = (recipe.tips || [])
        .map(function (tip, index) {
          return (
            '<details class="vd-recipe-signature__tip"' + (index === 0 ? ' open' : '') + '>' +
              '<summary>' + escapeHtml(tip.title) + '</summary>' +
              '<div class="vd-recipe-signature__tip-content">' + escapeHtml(tip.body) + '</div>' +
            '</details>'
          );
        })
        .join('');
    }

    function syncServes() {
      var serveSlots = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-serves-slot]'));
      quantityInput.value = String(state.serves);
      serveSlots.forEach(function (slot) {
        slot.textContent = String(state.serves);
      });
      renderIngredients();
      bindDynamicEvents();
      saveState(storageKey, state);
    }

    function stepCards() {
      return Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-step-item]'));
    }

    function refreshProgress() {
      var stepChecks = Array.prototype.slice.call(section.querySelectorAll('[data-item-type="step"][data-vd-recipe-check]'));
      var completed = stepChecks.filter(function (checkbox) {
        return checkbox.checked;
      }).length;
      var percent = stepChecks.length ? Math.round((completed / stepChecks.length) * 100) : 0;

      if (progressFill) progressFill.style.width = percent + '%';
      if (progressText) progressText.textContent = completed + '/' + stepChecks.length + ' etapes';
    }

    function setActiveStep(index, shouldScroll) {
      var cards = stepCards();
      if (!cards.length) return;
      state.activeStepIndex = Math.max(0, Math.min(cards.length - 1, index));
      cards.forEach(function (card, cardIndex) {
        card.classList.toggle('is-active', cardIndex === state.activeStepIndex);
      });
      if (state.focusMode && shouldScroll && cards[state.activeStepIndex]) {
        cards[state.activeStepIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      saveState(storageKey, state);
    }

    function bindDynamicEvents() {
      Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-check]')).forEach(function (checkbox) {
        checkbox.addEventListener('change', function () {
          state.checked[checkbox.getAttribute('data-item-id')] = checkbox.checked;
          refreshProgress();
          saveState(storageKey, state);
        });
      });

      Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-step-select]')).forEach(function (button) {
        button.addEventListener('click', function () {
          setActiveStep(Number(button.getAttribute('data-step-index')) || 0, true);
        });
      });
    }

    function buildText() {
      var lines = [recipe.title, '', recipe.description || recipe.summary || '', '', 'Ingredients'];
      (recipe.ingredient_groups || []).forEach(function (group) {
        lines.push(group.title || '');
        (group.items || []).forEach(function (item) {
          lines.push('- ' + [scaledQuantity(item), item.unit, item.name].join(' ').trim());
        });
      });
      lines.push('', 'Preparation');
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
      showToast(section, 'Recette telechargee');
    }

    function registerMotion() {
      if (!window.gsap || !window.ScrollTrigger) return;
      var cards = stepCards();
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

    renderSteps();
    renderTips();
    syncServes();
    refreshProgress();
    setActiveStep(state.activeStepIndex, false);

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

    focusButton.addEventListener('click', function () {
      state.focusMode = !state.focusMode;
      section.classList.toggle('is-focus-mode', state.focusMode);
      focusButton.textContent = state.focusMode ? 'Vue complete' : 'Mode focus';
      saveState(storageKey, state);
    });

    fullscreenButton.addEventListener('click', function () {
      if (!document.fullscreenElement && section.requestFullscreen) {
        section.requestFullscreen();
        section.classList.add('is-fullscreen');
        showToast(section, 'Plein ecran active');
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
        section.classList.remove('is-fullscreen');
      }
    });

    document.addEventListener('fullscreenchange', function () {
      section.classList.toggle('is-fullscreen', document.fullscreenElement === section);
      fullscreenButton.textContent = document.fullscreenElement === section ? 'Quitter plein ecran' : 'Plein ecran';
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
      state.serves = baseServes;
      state.checked = {};
      state.activeStepIndex = 0;
      state.focusMode = false;
      section.classList.remove('is-focus-mode');
      focusButton.textContent = 'Mode focus';
      syncServes();
      refreshProgress();
      setActiveStep(0, false);
      showToast(section, 'Progression reinitialisee');
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

  function initRecipe(section) {
    if (!section || section.__vdRecipeReady) return;
    section.__vdRecipeReady = true;

    var registryUrl = section.getAttribute('data-registry-url');
    var requestedSlug = section.getAttribute('data-recipe-slug') || section.getAttribute('data-page-handle');
    var customerAuthenticated = section.getAttribute('data-customer-authenticated') === 'true';
    var requireCustomerAccess = section.getAttribute('data-require-customer-access') === 'true';
    var media = section.querySelector('[data-vd-recipe-media]');
    var schemaNode = section.querySelector('[data-vd-recipe-schema]');

    fetch(registryUrl, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('registry');
        return response.json();
      })
      .then(function (payload) {
        var recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
        var recipe = recipes.find(function (entry) {
          return entry.slug === requestedSlug;
        });

        if (!recipe) {
          renderError(section, 'Cette recette est introuvable dans le registre.');
          return;
        }

        var isLocked = requireCustomerAccess && recipe.access === 'member' && !customerAuthenticated;
        renderMedia(media, recipe);
        renderRecipeShell(section, recipe, isLocked);

        if (schemaNode) {
          schemaNode.textContent = JSON.stringify(buildStructuredData(recipe));
        }

        if (!isLocked) {
          bindRecipe(section, recipe);
        }
      })
      .catch(function () {
        renderError(section, 'Le registre recette ne repond pas pour le moment.');
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
