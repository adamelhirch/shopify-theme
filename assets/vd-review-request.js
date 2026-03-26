(function () {
  function getQueryParam(name) {
    var url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  function setResponse(node, message, status) {
    if (!node) return;
    node.textContent = message || '';
    node.classList.remove('is-success', 'is-error');
    if (status) node.classList.add(status);
  }

  function renderProduct(root, product) {
    if (!root || !product) return;

    var media = root.querySelector('[data-vd-review-request-product-media]');
    var title = root.querySelector('[data-vd-review-request-product-title]');
    var meta = root.querySelector('[data-vd-review-request-product-meta]');
    var handleInput = document.querySelector('[data-vd-review-request-product-handle]');

    if (title) title.textContent = product.title || 'Produit';
    if (meta) meta.textContent = product.vendor ? product.vendor : product.handle;
    if (handleInput) handleInput.value = product.handle || '';

    if (media && product.featured_image) {
      media.innerHTML = '<img src="' + product.featured_image + '" alt="' + (product.title || 'Produit') + '">';
    }
  }

  function buildPayload(form) {
    var formData = new FormData(form);
    return {
      rating: Number(formData.get('rating') || 0),
      author: formData.get('author') || '',
      email: formData.get('email') || '',
      order_name: formData.get('order_name') || '',
      title: formData.get('title') || '',
      quote: formData.get('quote') || '',
      context: formData.get('context') || '',
      product_handle: formData.get('product_handle') || '',
      token: formData.get('token') || ''
    };
  }

  function wireRating(section) {
    var ratingInput = section.querySelector('[data-vd-review-request-rating-input]');
    var buttons = Array.prototype.slice.call(section.querySelectorAll('[data-vd-review-request-rating]'));

    function update(value) {
      ratingInput.value = value;
      buttons.forEach(function (button) {
        button.classList.toggle('is-active', Number(button.value) <= value);
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        update(Number(button.value));
      });
    });

    update(Number(ratingInput.value || 5));
  }

  function loadProduct(section) {
    var handle = getQueryParam('product');
    var token = getQueryParam('token');
    var tokenInput = section.querySelector('[data-vd-review-request-token]');
    if (tokenInput && token) tokenInput.value = token;
    if (!handle) return;

    fetch(window.Shopify.routes.root + 'products/' + handle + '.js')
      .then(function (response) {
        if (!response.ok) throw new Error('Product not found');
        return response.json();
      })
      .then(function (product) {
        renderProduct(section, product);
      })
      .catch(function () {});
  }

  function wireSubmit(section) {
    var form = section.querySelector('[data-vd-review-request-form]');
    var endpoint = section.getAttribute('data-vd-review-request-endpoint');
    var responseNode = section.querySelector('[data-vd-review-request-response]');
    var submitButton = section.querySelector('[data-vd-review-request-submit]');

    if (!form || !endpoint) return;

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      if (submitButton) submitButton.disabled = true;
      setResponse(responseNode, 'Envoi de votre avis...', '');

      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(buildPayload(form))
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('Submit failed');
          }

          return response.json().catch(function () {
            return {};
          });
        })
        .then(function () {
          form.reset();
          wireRating(section);
          setResponse(responseNode, 'Merci. Votre avis a bien ete recu et sera verifie avant publication.', 'is-success');
        })
        .catch(function () {
          setResponse(responseNode, "L'app reviews n'est pas encore branchee a cet endpoint. Le formulaire storefront est pret, mais il manque le back-end de collecte.", 'is-error');
        })
        .finally(function () {
          if (submitButton) submitButton.disabled = false;
        });
    });
  }

  document.querySelectorAll('[data-vd-review-request]').forEach(function (section) {
    wireRating(section);
    loadProduct(section);
    wireSubmit(section);
  });
})();
