class CookieBanner extends HTMLElement {
  constructor() {
    super();
    this.launcherButton = this.querySelector('[data-cookie-launcher]');
    this.closeButton = this.querySelector('[data-cookie-close]');
    this.acceptButton = this.querySelector('[data-cookie-accept]');
    this.rejectButton = this.querySelector('[data-cookie-reject]');
    this.saveButton = this.querySelector('[data-cookie-save]');
    this.togglePreferencesButton = this.querySelector('[data-cookie-toggle-preferences]');
    this.preferencesPanel = this.querySelector('[data-cookie-preferences]');
    this.preferenceInputs = Array.from(this.querySelectorAll('[data-consent-category]'));
  }

  connectedCallback() {
    if (!window.Shopify || typeof window.Shopify.loadFeatures !== 'function') return;

    this.launcherButton?.addEventListener('click', () => this.toggleOpen());
    this.closeButton?.addEventListener('click', () => this.close());

    this.acceptButton?.addEventListener('click', () => {
      this.applyConsent({
        analytics: true,
        marketing: true,
        preferences: true,
      });
    });

    this.rejectButton?.addEventListener('click', () => {
      this.applyConsent({
        analytics: false,
        marketing: false,
        preferences: false,
      });
    });

    this.saveButton?.addEventListener('click', () => {
      this.applyConsent({
        analytics: this.isChecked('analytics'),
        marketing: this.isChecked('marketing'),
        preferences: this.isChecked('preferences'),
      });
    });

    this.togglePreferencesButton?.addEventListener('click', () => {
      const shouldOpen = this.preferencesPanel.hasAttribute('hidden');
      this.preferencesPanel.toggleAttribute('hidden', !shouldOpen);
      this.saveButton.toggleAttribute('hidden', !shouldOpen);
      this.togglePreferencesButton.setAttribute('aria-expanded', String(shouldOpen));
      if (shouldOpen) this.open();
    });

    document.addEventListener('click', (event) => {
      if (!this.classList.contains('is-open')) return;
      if (this.contains(event.target)) return;
      this.close();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
    });

    window.Shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], (error) => {
      if (error || !window.Shopify.customerPrivacy) return;

      this.customerPrivacy = window.Shopify.customerPrivacy;
      this.syncInputsFromConsent();
      this.hidden = false;
      this.classList.toggle('cookie-banner--pending', this.customerPrivacy.shouldShowBanner());
    });
  }

  open() {
    this.classList.add('is-open');
    this.launcherButton?.setAttribute('aria-expanded', 'true');
  }

  close() {
    this.classList.remove('is-open');
    this.launcherButton?.setAttribute('aria-expanded', 'false');
  }

  toggleOpen() {
    if (this.classList.contains('is-open')) {
      this.close();
      return;
    }

    this.open();
  }

  isChecked(category) {
    return this.querySelector(`[data-consent-category="${category}"]`)?.checked || false;
  }

  syncInputsFromConsent() {
    if (!this.customerPrivacy || typeof this.customerPrivacy.currentVisitorConsent !== 'function') return;

    const consent = this.customerPrivacy.currentVisitorConsent();
    this.preferenceInputs.forEach((input) => {
      const value = consent[input.dataset.consentCategory];
      input.checked = value === true || value === 'yes' || value === 'granted';
    });
  }

  applyConsent(consent) {
    if (!this.customerPrivacy || typeof this.customerPrivacy.setTrackingConsent !== 'function') return;

    this.toggleButtons(true);

    this.customerPrivacy.setTrackingConsent(consent, () => {
      window.dispatchEvent(new CustomEvent('vd:cookie-consent-updated', { detail: consent }));
      this.classList.remove('cookie-banner--pending');
      this.close();
      this.toggleButtons(false);
    });
  }

  toggleButtons(disabled) {
    [this.acceptButton, this.rejectButton, this.saveButton, this.togglePreferencesButton, this.closeButton].forEach(
      (button) => {
        if (button) button.disabled = disabled;
      }
    );
  }
}

customElements.define('cookie-banner', CookieBanner);
