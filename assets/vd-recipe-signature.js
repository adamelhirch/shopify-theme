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

    var baseServes = Number(section.getAttribute('data-base-serves')) || 1;
    var quantityInput = section.querySelector('[data-vd-recipe-serves]');
    var minusButton = section.querySelector('[data-vd-recipe-minus]');
    var plusButton = section.querySelector('[data-vd-recipe-plus]');
    var toggleButton = section.querySelector('[data-vd-recipe-toggle]');
    var copyButton = section.querySelector('[data-vd-recipe-copy]');
    var downloadButton = section.querySelector('[data-vd-recipe-download]');
    var toast = section.querySelector('[data-vd-recipe-toast]');
    var serveSlots = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-serves-slot]'));
    var scalableQuantities = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-base-qty]'));
    var checkboxes = Array.prototype.slice.call(section.querySelectorAll('input[type="checkbox"][data-vd-recipe-check]'));

    if (!quantityInput) return;

    section.__vdRecipeReady = true;

    function showToast(message) {
      if (!toast) return;

      toast.textContent = message;
      toast.classList.add('is-visible');
      window.clearTimeout(section.__vdRecipeToastTimer);
      section.__vdRecipeToastTimer = window.setTimeout(function () {
        toast.classList.remove('is-visible');
      }, 1600);
    }

    function scaleQuantities() {
      var currentServes = Number(quantityInput.value) || baseServes;

      if (currentServes < 1) {
        currentServes = baseServes;
        quantityInput.value = String(baseServes);
      }

      serveSlots.forEach(function (slot) {
        slot.textContent = String(currentServes);
      });

      scalableQuantities.forEach(function (node) {
        var baseQuantity = parseQuantity(node.getAttribute('data-vd-recipe-base-qty'));

        if (baseQuantity === null) return;

        node.textContent = formatQuantity((baseQuantity * currentServes) / baseServes);
      });
    }

    function toggleAllChecks() {
      var nextState = !checkboxes.every(function (checkbox) {
        return checkbox.checked;
      });

      checkboxes.forEach(function (checkbox) {
        checkbox.checked = nextState;
      });

      toggleButton.textContent = nextState ? 'Tout décocher' : 'Tout cocher';
    }

    function refreshToggleLabel() {
      if (!toggleButton) return;

      toggleButton.textContent = checkboxes.length && checkboxes.every(function (checkbox) {
        return checkbox.checked;
      })
        ? 'Tout décocher'
        : 'Tout cocher';
    }

    function buildRecipeText() {
      var title = section.querySelector('[data-vd-recipe-title]');
      var intro = section.querySelector('[data-vd-recipe-intro]');
      var ingredientRows = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-ingredient]'));
      var stepRows = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-step]'));
      var lines = [];

      if (title) {
        lines.push(title.textContent.trim());
        lines.push('');
      }

      if (intro) {
        lines.push(intro.textContent.replace(/\s+/g, ' ').trim());
        lines.push('');
      }

      lines.push('Ingrédients pour ' + quantityInput.value + ' personnes');
      ingredientRows.forEach(function (row) {
        lines.push('- ' + row.textContent.replace(/\s+/g, ' ').trim());
      });
      lines.push('');
      lines.push('Préparation');
      stepRows.forEach(function (row, index) {
        lines.push(String(index + 1) + '. ' + row.textContent.replace(/\s+/g, ' ').trim());
      });

      return lines.join('\n');
    }

    function copyRecipe() {
      var text = buildRecipeText();

      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        showToast('Copie indisponible');
        return;
      }

      navigator.clipboard.writeText(text).then(function () {
        showToast('Recette copiée');
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
      showToast('Recette téléchargée');
    }

    if (minusButton) {
      minusButton.addEventListener('click', function () {
        quantityInput.value = String(Math.max(1, (Number(quantityInput.value) || baseServes) - 1));
        scaleQuantities();
      });
    }

    if (plusButton) {
      plusButton.addEventListener('click', function () {
        quantityInput.value = String((Number(quantityInput.value) || baseServes) + 1);
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

    checkboxes.forEach(function (checkbox) {
      checkbox.addEventListener('change', refreshToggleLabel);
    });

    scaleQuantities();
    refreshToggleLabel();
  }

  function initRecipes() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-vd-recipe]'), initRecipe);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRecipes);
  } else {
    initRecipes();
  }

  document.addEventListener('shopify:section:load', initRecipes);
})();
