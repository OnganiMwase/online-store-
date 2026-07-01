/**
 * ShopEasy Shared UI Component Rendering and Control Functions
 */

import { formatMWK, getRelativePath } from './utils.js'

/**
 * Renders a standard ShopEasy product card
 * @param {object} product - Product details from Firestore
 * @returns {string} - HTML markup string
 */
export const renderProductCard = (product) => {
  if (!product) return ''
  
  const id = product.id || ''
  const name = product.name || 'Unnamed Product'
  const image = product.image || product.images?.[0] || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80'
  const city = product.city || product.sellerCity || 'Lilongwe'
  const price = product.price || 0
  const freeDelivery = product.freeDelivery === true || product.deliveryType === 'free'
  
  return `
    <div class="product-card" id="prod-${id}">
      <div class="product-card__image-container">
        <a href="${getRelativePath('/product.html')}?id=${id}">
          <img class="product-card__image" src="${image}" alt="${name}" loading="lazy" />
        </a>
        ${freeDelivery ? `<span class="product-card__badge">Free Delivery</span>` : ''}
        <button class="product-card__wishlist" onclick="toggleWishlist('${id}')" aria-label="Add to wishlist">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
        </button>
      </div>
      <div class="product-card__content">
        <div class="product-card__meta">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>${city}</span>
        </div>
        <a href="${getRelativePath('/product.html')}?id=${id}">
          <h3 class="product-card__title">${name}</h3>
        </a>
        <div class="product-card__price">${formatMWK(price)}</div>
      </div>
    </div>
  `
}

/**
 * Returns skeleton HTML for loading states
 * @param {number} count - Number of skeleton cards to render
 * @returns {string} - HTML markup string
 */
export const renderSkeleton = (count = 4) => {
  let html = ''
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton skeleton-text skeleton-title"></div>
        <div class="skeleton skeleton-text skeleton-price"></div>
      </div>
    `
  }
  return html
}

/**
 * Returns a styled empty state UI
 */
export const renderEmptyState = (iconName, title, message, buttonText, buttonHref) => {
  const iconMarkup = getIconSvg(iconName, 48)
  return `
    <div class="empty-state" style="text-align: center; padding: 48px 16px; display: flex; flex-direction: column; align-items: center; gap: 16px; color: var(--grey-600);">
      <div class="empty-state__icon" style="color: var(--grey-400);">${iconMarkup}</div>
      <h3 class="empty-state__title" style="font-size: 1.2rem; font-weight: 600; color: var(--secondary); margin-top: 8px;">${title}</h3>
      <p class="empty-state__message" style="font-size: 0.9rem; max-width: 280px; line-height: 1.4;">${message}</p>
      ${buttonText && buttonHref ? `
        <a href="${getRelativePath(buttonHref)}" class="btn btn--primary btn--sm" style="margin-top: 8px;">${buttonText}</a>
      ` : ''}
    </div>
  `
}

/**
 * Returns a styled error state UI
 */
export const renderErrorState = (message) => {
  return `
    <div class="error-state" style="text-align: center; padding: 32px 16px; color: var(--danger); background-color: var(--primary-light); border-radius: var(--radius); margin: 16px 0;">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="margin: 0 auto 12px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <p style="font-size: 0.9rem; font-weight: 500;">${message || 'An unexpected error occurred. Please try again.'}</p>
    </div>
  `
}

/**
 * Sets up custom logic for closing and opening a modal dialog by ID
 */
export const initModal = (modalId) => {
  const modal = document.getElementById(modalId)
  if (!modal) return
  
  const closeBtn = modal.querySelector('.modal__close') || modal.querySelector('[data-close]')
  
  const closeModal = () => {
    modal.classList.remove('modal--visible')
  }
  
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal)
  }
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal()
    }
  })
}

/**
 * Dynamically injects Header and Bottom Navigation elements
 */
export const injectHeaderAndNav = (activeTab = 'home') => {
  const headerContainer = document.getElementById('header-container')
  const navContainer = document.getElementById('nav-container')
  
  if (headerContainer) {
    headerContainer.innerHTML = `
      <header class="header">
        <a href="${getRelativePath('/index.html')}" class="header__logo">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-store"><path d="m2 7 4.41-3.67A2 2 0 0 1 7.73 3h8.54a2 2 0 0 1 1.32.53L22 7"/><path d="M4 12V7"/><path d="M12 12V7"/><path d="M20 12V7"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M14 12H10"/></svg>
          <span style="letter-spacing: -0.5px;">ShopEasy</span>
        </a>
        <div class="header__actions">
          <a href="${getRelativePath('/search.html')}" class="header__btn" aria-label="Search" style="display: flex;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </a>
          <a href="${getRelativePath('/wishlist.html')}" class="header__btn" aria-label="Wishlist" style="display: flex;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          </a>
        </div>
      </header>
    `
  }
  
  if (navContainer) {
    navContainer.innerHTML = `
      <nav class="bottom-nav">
        <a href="${getRelativePath('/index.html')}" class="bottom-nav__item ${activeTab === 'home' ? 'bottom-nav__item--active' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-home"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </a>
        <a href="${getRelativePath('/shop.html')}" class="bottom-nav__item ${activeTab === 'shop' ? 'bottom-nav__item--active' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-grid"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
          <span>Shop</span>
        </a>
        <a href="${getRelativePath('/cart.html')}" class="bottom-nav__item ${activeTab === 'cart' ? 'bottom-nav__item--active' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-cart"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
          <span>Cart</span>
        </a>
        <a href="${getRelativePath('/messages.html')}" class="bottom-nav__item ${activeTab === 'messages' ? 'bottom-nav__item--active' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-circle"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
          <span>Messages</span>
        </a>
        <a href="${getRelativePath('/account.html')}" class="bottom-nav__item ${activeTab === 'account' ? 'bottom-nav__item--active' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Account</span>
        </a>
      </nav>
    `
  }
}

/**
 * Helper to generate simple inline SVGs based on icon names
 */
export function getIconSvg(name, size = 24) {
  const svgs = {
    shoppingCart: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-cart"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
    heart: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    messageSquare: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    store: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-store"><path d="m2 7 4.41-3.67A2 2 0 0 1 7.73 3h8.54a2 2 0 0 1 1.32.53L22 7"/><path d="M4 12V7"/><path d="M12 12V7"/><path d="M20 12V7"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M14 12H10"/></svg>`,
    user: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    home: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-home"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    search: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
    package: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package"><path d="M16.5 9.4 7.55 4.24a1.79 1.79 0 0 0-1.8 0L2.3 6.24a1.8 1.8 0 0 0-.9 1.56v5.82a1.8 1.8 0 0 0 .9 1.56l3.45 2a1.79 1.79 0 0 0 1.8 0L16.5 12V9.4z"/><path d="m7.5 4.2 9 5.2 9-5.2"/><path d="M22.5 6.2v11.6a1.8 1.8 0 0 1-.9 1.56l-5.4 3.12a1.8 1.8 0 0 1-1.8 0L9 19.4"/><path d="m16.5 14.6 6-3.5"/><path d="M7.5 14.6V22"/></svg>`
  }
  return svgs[name] || svgs.package
}

// Global toggle helper (bound for convenience)
window.toggleWishlist = function(productId) {
  const btn = document.querySelector(`#prod-${productId} .product-card__wishlist`)
  if (btn) {
    btn.classList.toggle('product-card__wishlist--active')
    const isActive = btn.classList.contains('product-card__wishlist--active')
    import('./utils.js').then(u => {
      u.showToast(isActive ? 'Product saved to Wishlist!' : 'Product removed from Wishlist!', 'success')
    })
  }
}

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(getRelativePath('/sw.js'))
      .then(reg => {
        console.log('ShopEasy Service Worker registered successfully with scope:', reg.scope)
      })
      .catch(err => {
        console.error('ShopEasy Service Worker registration failed:', err)
      })
  })
}

// --- PWA Add to Home Screen Prompt ---
let deferredPrompt = null

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault()
  // Stash the event so it can be triggered later
  deferredPrompt = e
  // Don't show if already dismissed in this session
  if (sessionStorage.getItem('installBannerDismissed') === 'true') {
    return
  }
  // Show install promotion banner
  showInstallBanner()
})

function showInstallBanner() {
  // Check if banner already exists
  if (document.querySelector('.install-banner')) return

  const banner = document.createElement('div')
  banner.className = 'install-banner'
  banner.innerHTML = `
    <div class="install-banner__content">
      <img src="assets/icons/icon-512.png" alt="ShopEasy Logo" style="width: 48px; height: 48px; border-radius: 8px;">
      <div>
        <h4 style="margin: 0; font-size: 0.95rem; font-weight: 600;">Install ShopEasy</h4>
        <p style="margin: 2px 0 0; font-size: 0.8rem; color: var(--grey-600);">Add to your home screen for quick access and offline use</p>
      </div>
    </div>
    <div class="install-banner__actions">
      <button class="btn btn--outline btn--sm" id="btnNo" style="padding: 6px 12px; font-size: 0.8rem;">Not Now</button>
      <button class="btn btn--primary btn--sm" id="btnYes" style="padding: 6px 12px; font-size: 0.8rem;">Install</button>
    </div>
  `
  document.body.appendChild(banner)
  
  document.getElementById('btnNo').addEventListener('click', () => {
    banner.remove()
    sessionStorage.setItem('installBannerDismissed', 'true')
  })
  
  document.getElementById('btnYes').addEventListener('click', () => {
    banner.remove()
    if (deferredPrompt) {
      deferredPrompt.prompt()
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt')
        }
        deferredPrompt = null
      })
    }
  })
}
