(function () {
  function parseQuantity(value) {
    if (typeof value !== 'string' || !value.trim()) return null;

    var normalized = value.replace(',', '.').trim();
    var parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatQuantity(value) {
    var rounded = Math.round(value * 100) / 100;

    if (Math.abs(rounded - Math.round(rounded)) < 0.001) {
      return String(Math.round(rounded));
    }

    return String(rounded).replace('.', ',');
  }

  function initRecipe(section) {
    if (!section || section.__vdRecipeReady) return;

    var isLocked = section.getAttribute('data-recipe-locked') === 'true';
    var storageKey = section.getAttribute('data-storage-key') || 'vd-recipe';
    var baseServes = Number(section.getAttribute('data-base-serves')) || 1;
    var quantityInput = section.querySelector('[data-vd-recipe-serves]');
    var minusButton = section.querySelector('[data-vd-recipe-minus]');
    var plusButton = section.querySelector('[data-vd-recipe-plus]');
    var toggleButton = section.querySelector('[data-vd-recipe-toggle]');
    var copyButton = section.querySelector('[data-vd-recipe-copy]');
    var downloadButton = section.querySelector('[data-vd-recipe-download]');
    var resetButton = section.querySelector('[data-vd-recipe-reset]');
    var focusButton = section.querySelector('[data-vd-recipe-focus]');
    var prevStepButton = section.querySelector('[data-vd-recipe-prev-step]');
    var nextStepButton = section.querySelector('[data-vd-recipe-next-step]');
    var toast = section.querySelector('[data-vd-recipe-toast]');
    var progressFill = section.querySelector('[data-vd-recipe-progress-fill]');
    var progressText = section.querySelector('[data-vd-recipe-progress-text]');
    var activeStepTitle = section.querySelector('[data-vd-recipe-active-step]');
    var activeStepMeta = section.querySelector('[data-vd-recipe-active-meta]');
    var serveSlots = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-serves-slot]'));
    var scalableQuantities = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-base-qty]'));
    var ingredientCheckboxes = Array.prototype.slice.call(section.querySelectorAll('[data-item-type="ingredient"][data-vd-recipe-check]'));
    var stepCheckboxes = Array.prototype.slice.call(section.querySelectorAll('[data-item-type="step"][data-vd-recipe-check]'));
    var allCheckboxes = ingredientCheckboxes.concat(stepCheckboxes);
    var stepCards = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-step-item]'));
    var selectButtons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-step-select]'));
    var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var state = {
      serves: baseServes,
      checked: {},
      activeStepIndex: 0,
      focusMode: false
    };
    var cleanups = [];

    if (isLocked || !quantityInput) return;

    section.__vdRecipeReady = true;

    function showToast(message) {
      if (!toast) return;

      toast.textContent = message;
      toast.classList.add('is-visible');
      window.clearTimeout(section.__vdRecipeToastTimer);
      section.__vdRecipeToastTimer = window.setTimeout(function () {
        toast.classList.remove('is-visible');
      }, 1500);
    }

    function saveState() {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (error) {}
    }

    function loadState() {
      try {
        var saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}');

        if (saved && typeof saved === 'object') {
          state.serves = Number(saved.serves) || baseServes;
          state.checked = saved.checked && typeof saved.checked === 'object' ? saved.checked : {};
          state.activeStepIndex = Math.max(0, Math.min(stepCards.length - 1, Number(saved.activeStepIndex) || 0));
          state.focusMode = !!saved.focusMode;
        }
      } catch (error) {}
    }

    function scaleQuantities() {
      var currentServes = Number(quantityInput.value) || baseServes;

      if (currentServes < 1) {
        currentServes = baseServes;
      }

      state.serves = currentServes;
      quantityInput.value = String(currentServes);

      serveSlots.forEach(function (slot) {
        slot.textContent = String(currentServes);
      });

      scalableQuantities.forEach(function (node) {
        var baseQuantity = parseQuantity(node.getAttribute('data-vd-recipe-base-qty'));

        if (baseQuantity === null) return;

        node.textContent = formatQuantity((baseQuantity * currentServes) / baseServes);
      });

      saveState();
    }

    function syncCheckboxes() {
      allCheckboxes.forEach(function (checkbox) {
        var itemId = checkbox.getAttribute('data-item-id');
        checkbox.checked = !!state.checked[itemId];
      });
    }

    function refreshToggleLabel() {
      if (!toggleButton) return;

      toggleButton.textContent = allCheckboxes.length && allCheckboxes.every(function (checkbox) {
        return checkbox.checked;
      })
        ? 'Tout decocher'
        : 'Tout cocher';
    }

    function refreshProgress() {
      var completedSteps = stepCheckboxes.filter(function (checkbox) {
        return checkbox.checked;
      }).length;
      var percent = stepCheckboxes.length ? Math.round((completedSteps / stepCheckboxes.length) * 100) : 0;
      var currentCard = stepCards[state.activeStepIndex];
      var titleNode = currentCard ? currentCard.querySelector('[data-vd-recipe-step-title]') : null;
      var durationNode = currentCard ? currentCard.querySelector('[data-vd-recipe-step-duration]') : null;

      if (progressFill) {
        progressFill.style.width = percent + '%';
      }

      if (progressText) {
        progressText.textContent = completedSteps + '/' + stepCheckboxes.length + ' etapes cochees';
      }

      if (activeStepTitle) {
        activeStepTitle.textContent = titleNode ? titleNode.textContent.trim() : 'Etape en cours';
      }

      if (activeStepMeta) {
        activeStepMeta.textContent = durationNode ? durationNode.textContent.trim() : 'Suivre la recette a votre rythme';
      }
    }

    function applyFocusMode() {
      section.classList.toggle('is-focus-mode', state.focusMode);
      if (focusButton) {
        focusButton.textContent = state.focusMode ? 'Vue complete' : 'Mode focus';
      }
    }

    function setActiveStep(index, shouldScroll) {
      if (!stepCards.length) return;

      state.activeStepIndex = Math.max(0, Math.min(stepCards.length - 1, index));

      stepCards.forEach(function (card, cardIndex) {
        card.classList.toggle('is-active', cardIndex === state.activeStepIndex);
      });

      if (state.focusMode && shouldScroll) {
        stepCards[state.activeStepIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      refreshProgress();
      saveState();
    }

    function buildRecipeText() {
      var title = section.querySelector('[data-vd-recipe-title]');
      var intro = section.querySelector('[data-vd-recipe-intro]');
      var ingredientRows = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-ingredient]'));
      var lines = [];

      if (title) {
        lines.push(title.textContent.trim());
        lines.push('');
      }

      if (intro) {
        lines.push(intro.textContent.replace(/\s+/g, ' ').trim());
        lines.push('');
      }

      lines.push('Ingredients pour ' + quantityInput.value + ' personnes');
      ingredientRows.forEach(function (row) {
        lines.push('- ' + row.textContent.replace(/\s+/g, ' ').trim());
      });
      lines.push('');
      lines.push('Preparation');
      stepCards.forEach(function (card, index) {
        lines.push(String(index + 1) + '. ' + card.textContent.replace(/\s+/g, ' ').trim());
      });

      return lines.join('\n');
    }

    function copyRecipe() {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        showToast('Copie indisponible');
        return;
      }

      navigator.clipboard.writeText(buildRecipeText()).then(function () {
        showToast('Recette copiee');
      }).catch(function () {
        showToast('Copie impossible');
      });
    }

    function downloadRecipe() {
      var text = buildRecipeText();
      var filename = section.getAttribute('data-download-name') || 'recette-vanille-desire';
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var url = window.URL.createObjectURL(blob);
      var anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = filename + '.txt';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      showToast('Recette telechargee');
    }

    function resetRecipe() {
      state.checked = {};
      state.serves = baseServes;
      state.activeStepIndex = 0;
      state.focusMode = false;
      quantityInput.value = String(baseServes);
      syncCheckboxes();
      scaleQuantities();
      applyFocusMode();
      setActiveStep(0, false);
      refreshToggleLabel();
      showToast('Progression reinitialisee');
      saveState();
    }

    function toggleAllChecks() {
      var nextState = !allCheckboxes.every(function (checkbox) {
        return checkbox.checked;
      });

      allCheckboxes.forEach(function (checkbox) {
        var itemId = checkbox.getAttribute('data-item-id');
        state.checked[itemId] = nextState;
      });

      syncCheckboxes();
      refreshToggleLabel();
      refreshProgress();
      saveState();
    }

    function attachCheckbox(checkbox) {
      checkbox.addEventListener('change', function () {
        var itemId = checkbox.getAttribute('data-item-id');
        state.checked[itemId] = checkbox.checked;
        refreshToggleLabel();
        refreshProgress();
        saveState();
      });
    }

    function registerMotion() {
      if (!window.gsap || !window.ScrollTrigger || prefersReducedMotion) return;

      window.gsap.set(stepCards, { y: 20, opacity: 0 });
      window.gsap.to(stepCards, {
        y: 0,
        opacity: 1,
        duration: 0.65,
        stagger: 0.06,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 68%'
        }
      });

      stepCards.forEach(function (card, index) {
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

    loadState();
    quantityInput.value = String(state.serves);
    syncCheckboxes();
    scaleQuantities();
    applyFocusMode();
    setActiveStep(state.activeStepIndex, false);
    refreshToggleLabel();

    if (minusButton) {
      minusButton.addEventListener('click', function () {
        quantityInput.value = String(Math.max(1, (Number(quantityInput.value) || state.serves) - 1));
        scaleQuantities();
      });
    }

    if (plusButton) {
      plusButton.addEventListener('click', function () {
        quantityInput.value = String((Number(quantityInput.value) || state.serves) + 1);
        scaleQuantities();
      });
    }

    quantityInput.addEventListener('input', scaleQuantities);

    if (toggleButton) {
      toggleButton.addEventListener('click', toggleAllChecks);
    }

    if (copyButton) {
      copyButton.addEventListener('click', copyRecipe);
    }

    if (downloadButton) {
      downloadButton.addEventListener('click', downloadRecipe);
    }

    if (resetButton) {
      resetButton.addEventListener('click', resetRecipe);
    }

    if (focusButton) {
      focusButton.addEventListener('click', function () {
        state.focusMode = !state.focusMode;
        applyFocusMode();
        saveState();
      });
    }

    if (prevStepButton) {
      prevStepButton.addEventListener('click', function () {
        setActiveStep(state.activeStepIndex - 1, true);
      });
    }

    if (nextStepButton) {
      nextStepButton.addEventListener('click', function () {
        setActiveStep(state.activeStepIndex + 1, true);
      });
    }

    selectButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var nextIndex = Number(button.getAttribute('data-step-index')) || 0;
        setActiveStep(nextIndex, true);
      });
    });

    allCheckboxes.forEach(attachCheckbox);
    registerMotion();

    document.addEventListener('shopify:section:unload', function (event) {
      if (!section.contains(event.target)) return;

      cleanups.forEach(function (cleanup) {
        cleanup();
      });
      cleanups.length = 0;
    });
  }

  function initRecipes() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-vd-recipe]'), initRecipe);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRecipes);
  } else {
    initRecipes();
  }

  document.addEventListener('shopify:section:load', function (event) {
    initRecipe(event.target);
  });
})();
