(function () {
  function initRecipesHub(section) {
    if (!section || section.__vdRecipesHubReady) return;

    var input = section.querySelector('[data-vd-recipes-search-input]');
    var clearButton = section.querySelector('[data-vd-recipes-search-clear]');
    var count = section.querySelector('[data-vd-recipes-count]');
    var empty = section.querySelector('[data-vd-recipes-empty]');
    var cards = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipe-card]'));
    var accessButtons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipes-access]'));
    var difficultyButtons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-recipes-difficulty]'));
    var state = {
      query: '',
      access: 'all',
      difficulty: 'all'
    };

    if (!input || !cards.length) return;

    section.__vdRecipesHubReady = true;

    function normalize(value) {
      return (value || '').toLowerCase().trim();
    }

    function refreshFilters() {
      var visibleCount = 0;

      cards.forEach(function (card) {
        var haystack = normalize(card.getAttribute('data-search'));
        var access = normalize(card.getAttribute('data-access'));
        var difficulty = normalize(card.getAttribute('data-difficulty'));
        var matchesQuery = !state.query || haystack.indexOf(state.query) !== -1;
        var matchesAccess = state.access === 'all' || access === state.access;
        var matchesDifficulty = state.difficulty === 'all' || difficulty === state.difficulty;
        var isVisible = matchesQuery && matchesAccess && matchesDifficulty;

        card.hidden = !isVisible;

        if (isVisible) {
          visibleCount += 1;
        }
      });

      if (count) {
        count.textContent = visibleCount + ' recette' + (visibleCount > 1 ? 's' : '');
      }

      if (empty) {
        empty.classList.toggle('is-visible', visibleCount === 0);
      }

      if (clearButton) {
        clearButton.hidden = !input.value.length;
      }
    }

    function setButtonState(buttons, value) {
      buttons.forEach(function (button) {
        button.classList.toggle('is-active', button.getAttribute('data-value') === value);
      });
    }

    input.addEventListener('input', function () {
      state.query = normalize(input.value);
      refreshFilters();
    });

    if (clearButton) {
      clearButton.addEventListener('click', function () {
        input.value = '';
        state.query = '';
        input.focus();
        refreshFilters();
      });
    }

    accessButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.access = button.getAttribute('data-value') || 'all';
        setButtonState(accessButtons, state.access);
        refreshFilters();
      });
    });

    difficultyButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.difficulty = button.getAttribute('data-value') || 'all';
        setButtonState(difficultyButtons, state.difficulty);
        refreshFilters();
      });
    });

    if (window.gsap && window.ScrollTrigger) {
      window.gsap.set(cards, { y: 18, opacity: 0 });
      window.gsap.to(cards, {
        y: 0,
        opacity: 1,
        duration: 0.7,
        ease: 'power2.out',
        stagger: 0.08,
        scrollTrigger: {
          trigger: section,
          start: 'top 70%'
        }
      });
    }

    refreshFilters();
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
