class DetailsDisclosure extends HTMLElement {
  constructor() {
    super();
    this.mainDetailsToggle = this.querySelector('details');
    this.content = this.mainDetailsToggle.querySelector('summary').nextElementSibling;

    this.mainDetailsToggle.addEventListener('focusout', this.onFocusOut.bind(this));
    this.mainDetailsToggle.addEventListener('toggle', this.onToggle.bind(this));
  }

  onFocusOut() {
    setTimeout(() => {
      if (!this.contains(document.activeElement)) this.close();
    });
  }

  onToggle() {
    if (!this.animations) this.animations = this.content.getAnimations();

    if (this.mainDetailsToggle.hasAttribute('open')) {
      this.animations.forEach((animation) => animation.play());
    } else {
      this.animations.forEach((animation) => animation.cancel());
    }
  }

  close() {
    this.mainDetailsToggle.removeAttribute('open');
    this.mainDetailsToggle.querySelector('summary').setAttribute('aria-expanded', false);
  }
}

customElements.define('details-disclosure', DetailsDisclosure);

class HeaderMenu extends DetailsDisclosure {
  constructor() {
    super();
    this.header = document.querySelector('.header-wrapper');
  }

  onToggle() {
    if (!this.header) return;
    this.header.preventHide = this.mainDetailsToggle.open;

    if (document.documentElement.style.getPropertyValue('--header-bottom-position-desktop') !== '') return;
    document.documentElement.style.setProperty(
      '--header-bottom-position-desktop',
      `${Math.floor(this.header.getBoundingClientRect().bottom)}px`
    );
  }
}

customElements.define('header-menu', HeaderMenu);

const headerMenuDesktopMedia = window.matchMedia('(min-width: 990px)');
const desktopMenuCloseTimers = new WeakMap();
let headerHeroRevealRafId = null;

function setDetailsExpandedState(detailsElement, isExpanded) {
  const summary = detailsElement.querySelector(':scope > summary');
  if (summary) summary.setAttribute('aria-expanded', isExpanded);
}

function closeDetailsTree(detailsElement) {
  detailsElement.querySelectorAll('details[open]').forEach((nestedDetails) => {
    nestedDetails.removeAttribute('open');
    setDetailsExpandedState(nestedDetails, false);
  });

  detailsElement.removeAttribute('open');
  setDetailsExpandedState(detailsElement, false);
}

function openDetailsElement(detailsElement) {
  const closeTimer = desktopMenuCloseTimers.get(detailsElement);
  if (closeTimer) {
    window.clearTimeout(closeTimer);
    desktopMenuCloseTimers.delete(detailsElement);
  }

  detailsElement.setAttribute('open', '');
  setDetailsExpandedState(detailsElement, true);
}

function scheduleCloseDetails(detailsElement, delay = 140) {
  const existingTimer = desktopMenuCloseTimers.get(detailsElement);
  if (existingTimer) window.clearTimeout(existingTimer);

  const timerId = window.setTimeout(() => {
    closeDetailsTree(detailsElement);
    desktopMenuCloseTimers.delete(detailsElement);
  }, delay);

  desktopMenuCloseTimers.set(detailsElement, timerId);
}

function closeOtherTopLevelMenus(currentDetails) {
  document.querySelectorAll('.header__inline-menu header-menu > details[open]').forEach((detailsElement) => {
    if (detailsElement !== currentDetails) closeDetailsTree(detailsElement);
  });
}

function closeSiblingNestedMenus(currentDetails) {
  const parentList = currentDetails.closest('ul');
  if (!parentList) return;

  parentList.querySelectorAll(':scope > li > details[open]').forEach((detailsElement) => {
    if (detailsElement !== currentDetails) closeDetailsTree(detailsElement);
  });
}

function bindDesktopSummaryNavigation(summary) {
  if (!summary || summary.dataset.vdNavBound === 'true') return;

  summary.dataset.vdNavBound = 'true';
  const menuUrl = summary.dataset.menuUrl;
  if (!menuUrl) return;

  summary.addEventListener('click', (event) => {
    if (!headerMenuDesktopMedia.matches) return;
    event.preventDefault();
    window.location.assign(menuUrl);
  });
}

function initDesktopHeaderMenus(root = document) {
  root.querySelectorAll('header-menu > details').forEach((topLevelDetails) => {
    if (topLevelDetails.dataset.vdHoverInit === 'true') return;

    topLevelDetails.dataset.vdHoverInit = 'true';
    const headerMenu = topLevelDetails.parentElement;
    const topLevelSummary = topLevelDetails.querySelector(':scope > summary');

    bindDesktopSummaryNavigation(topLevelSummary);

    headerMenu.addEventListener('mouseenter', () => {
      if (!headerMenuDesktopMedia.matches) return;
      closeOtherTopLevelMenus(topLevelDetails);
      openDetailsElement(topLevelDetails);
    });

    headerMenu.addEventListener('mouseleave', () => {
      if (!headerMenuDesktopMedia.matches) return;
      scheduleCloseDetails(topLevelDetails);
    });

    topLevelDetails.querySelectorAll('.header__submenu details').forEach((nestedDetails) => {
      if (nestedDetails.dataset.vdHoverInit === 'true') return;

      nestedDetails.dataset.vdHoverInit = 'true';
      const nestedSummary = nestedDetails.querySelector(':scope > summary');

      bindDesktopSummaryNavigation(nestedSummary);

      nestedDetails.addEventListener('mouseenter', () => {
        if (!headerMenuDesktopMedia.matches) return;
        closeSiblingNestedMenus(nestedDetails);
        openDetailsElement(nestedDetails);
      });

      nestedDetails.addEventListener('mouseleave', () => {
        if (!headerMenuDesktopMedia.matches) return;
        scheduleCloseDetails(nestedDetails);
      });
    });
  });
}

function updateHeaderHeroReveal() {
  const headerGroup = document.querySelector('.shopify-section-group-header-group');
  if (!headerGroup) return;

  const heroSection = document.querySelector('#MainContent > .shopify-section:first-child.section-vd-hero');
  if (!heroSection) {
    headerGroup.style.setProperty('--vd-header-backdrop-opacity', '1');
    return;
  }

  const headerHeight = headerGroup.getBoundingClientRect().height || 1;
  const heroBottom = heroSection.getBoundingClientRect().bottom;
  const revealDistance = headerHeight * 1.5;
  const progress = Math.max(0, Math.min(1, (headerHeight - heroBottom) / revealDistance));
  const easedProgress = progress * progress * (3 - 2 * progress);

  headerGroup.style.setProperty('--vd-header-backdrop-opacity', easedProgress.toFixed(3));
}

function requestHeaderHeroRevealUpdate() {
  if (headerHeroRevealRafId) return;

  headerHeroRevealRafId = window.requestAnimationFrame(() => {
    updateHeaderHeroReveal();
    headerHeroRevealRafId = null;
  });
}

function initHeaderHeroReveal() {
  if (document.documentElement.dataset.vdHeaderRevealInit !== 'true') {
    document.documentElement.dataset.vdHeaderRevealInit = 'true';
    window.addEventListener('scroll', requestHeaderHeroRevealUpdate, { passive: true });
    window.addEventListener('resize', requestHeaderHeroRevealUpdate);
  }

  requestHeaderHeroRevealUpdate();
}

document.addEventListener('DOMContentLoaded', () => initDesktopHeaderMenus());
document.addEventListener('DOMContentLoaded', initHeaderHeroReveal);
document.addEventListener('shopify:section:load', (event) => {
  initDesktopHeaderMenus(event.target);
  initHeaderHeroReveal();
});
headerMenuDesktopMedia.addEventListener('change', (event) => {
  if (event.matches) return;
  document.querySelectorAll('.header__inline-menu details[open]').forEach((detailsElement) => {
    closeDetailsTree(detailsElement);
  });
});
