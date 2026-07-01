/**
 * ShopEasy Product Details Control Module - Full Production-Ready Implementation
 */

import { auth, db, storage } from '../firebase-config.js'
import { initAuth, currentUser, currentUserData } from '../auth.js'
import { 
  doc, 
  getDoc, 
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'
import { injectHeaderAndNav, renderProductCard, renderSkeleton, renderEmptyState, renderErrorState } from '../ui.js'
import { getUrlParam, formatMWK, formatDate, showToast, showLoading, hideLoading, redirect, handleFirestoreError, OperationType } from '../utils.js'

// Global state
let product = null
let seller = null
let reviews = []
let filteredReviews = []
let visibleReviewsCount = 5
let activeReviewFilter = 'all'

let currentSlide = 0
let totalSlides = 0
let selectedVariants = {}
let currentQty = 1

// Photo upload state (for Write Review)
let reviewFiles = []

// Helper: Escape HTML
function escapeHTML(str) {
  if (!str) return ''
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
}

// Helper: Star stars rating html
function getStarsHtml(rating) {
  const rounded = Math.round(rating || 5)
  let html = ''
  for (let i = 1; i <= 5; i++) {
    html += i <= rounded ? '★' : '☆'
  }
  return html
}

// Helper: Format review author name (First name + Last initial)
function formatReviewerName(fullName) {
  if (!fullName) return 'Anonymous Buyer'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

// Scroll header visual interaction
function setupScrollHeader() {
  const header = document.getElementById('productHeader')
  if (!header) return
  window.addEventListener('scroll', () => {
    if (window.scrollY > 150) {
      header.classList.add('product-header--scrolled')
    } else {
      header.classList.remove('product-header--scrolled')
    }
  })
}

// Sync bottom navigation cart count badge
async function syncCartBadge() {
  if (!currentUser) return
  try {
    const snap = await getDocs(collection(db, `carts/${currentUser.uid}/items`))
    const count = snap.size
    
    // Find the cart link in the bottom navigation
    const cartItem = document.querySelector('a[href="cart.html"]')
    if (cartItem) {
      // Remove any existing badge
      const existingBadge = cartItem.querySelector('.cart-badge')
      if (existingBadge) existingBadge.remove()
      
      if (count > 0) {
        cartItem.style.position = 'relative'
        const badge = document.createElement('span')
        badge.className = 'cart-badge'
        badge.style.cssText = 'position: absolute; top: 4px; right: 18px; background-color: var(--primary); color: white; border-radius: 50%; font-size: 0.65rem; font-weight: bold; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; z-index: 10;'
        badge.textContent = count
        cartItem.appendChild(badge)
      }
    }
  } catch (error) {
    console.warn("Failed to sync cart badge count:", error)
  }
}

// -----------------------------------------------------------------
// Core Loader & Renderer Functions
// -----------------------------------------------------------------
async function loadProductDetails(productId) {
  const container = document.getElementById('productContainer')
  if (!container) return

  try {
    // 1. Fetch Product
    const prodDoc = await getDoc(doc(db, 'products', productId))
    if (!prodDoc.exists() || !prodDoc.data().isActive) {
      container.innerHTML = `
        <div style="text-align: center; padding: 64px 16px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--grey-400)" stroke-width="2" style="margin: 0 auto 16px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <h3 style="font-size: 1.15rem; color: var(--secondary); font-weight: 700;">Listing Not Found</h3>
          <p style="color: var(--grey-600); font-size: 0.85rem; margin-top: 6px; max-width: 260px; margin-left: auto; margin-right: auto;">The product you are looking for does not exist or has been removed by the seller.</p>
          <a href="shop.html" class="btn btn--primary btn--sm" style="margin-top: 16px; display: inline-flex;">Go to Shop</a>
        </div>
      `
      return
    }

    product = prodDoc.data()
    product.id = prodDoc.id

    // Update dynamic header title
    const scrollHeaderTitle = document.getElementById('scrollHeaderTitle')
    if (scrollHeaderTitle) {
      scrollHeaderTitle.textContent = product.title || product.name || 'Product Details'
    }

    // 2. Fetch Seller Profile Info
    if (product.sellerId) {
      const sellerDoc = await getDoc(doc(db, 'users', product.sellerId))
      if (sellerDoc.exists()) {
        seller = sellerDoc.data()
        seller.id = sellerDoc.id
      }
    }

    // 3. Fetch Reviews
    await fetchReviews(productId)

    // 4. Render main product sections
    renderMainPage()

    // 5. Check order status for Review Eligibility
    await checkReviewEligibility(productId)

    // 6. Fetch Similar listings
    await fetchSimilarProducts(productId, product.category)

    // 7. Update initial wishlist & follow buttons state
    await syncInteractionsState(productId)

  } catch (error) {
    container.innerHTML = renderErrorState('Failed to load product details. Check your connection and try again.')
    handleFirestoreError(error, OperationType.GET, `products/${productId}`)
  }
}

function renderMainPage() {
  const container = document.getElementById('productContainer')
  if (!container) return

  // Compile image list
  const imgList = []
  if (product.images && Array.isArray(product.images) && product.images.length > 0) {
    product.images.forEach(img => { if (img) imgList.push(img) })
  } else if (product.image) {
    imgList.push(product.image)
  }

  const hasImages = imgList.length > 0
  totalSlides = imgList.length

  // Main Section HTML
  let html = ''

  // --- IMAGE CAROUSEL GALLERY ---
  html += `
    <section class="carousel-container">
      <div class="carousel-viewport" id="carouselViewport">
        ${hasImages ? imgList.map((img, index) => `
          <div class="carousel-slide" data-index="${index}">
            <img src="${img}" alt="${escapeHTML(product.title)}" class="zoomable-image" referrerPolicy="no-referrer">
          </div>
        `).join('') : `
          <div class="carousel-slide">
            <div class="carousel-placeholder">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="lucide lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              <span style="font-size: 0.82rem; font-weight: 500;">No images available</span>
            </div>
          </div>
        `}
      </div>
      
      ${totalSlides > 1 ? `
        <div class="carousel-dots" id="carouselDots">
          ${imgList.map((_, idx) => `<span class="carousel-dot ${idx === 0 ? 'active' : ''}" data-index="${idx}"></span>`).join('')}
        </div>
        <div class="carousel-thumbnails" id="carouselThumbnails">
          ${imgList.map((img, idx) => `
            <div class="carousel-thumb ${idx === 0 ? 'active' : ''}" data-index="${idx}">
              <img src="${img}" alt="Thumbnail ${idx + 1}" referrerPolicy="no-referrer">
            </div>
          `).join('')}
        </div>
      ` : ''}
    </section>
  `

  // --- PRODUCT TITLE & INFO ---
  const city = product.city || product.sellerCity || seller?.city || 'Malawi'
  const dateFormatted = product.createdAt ? formatDate(product.createdAt) : 'Recently'
  html += `
    <section class="product-info-section">
      <h1>${escapeHTML(product.title || product.name)}</h1>
      <div class="product-meta-row">
        <div class="product-meta-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>Listed in ${escapeHTML(city)}, Malawi</span>
        </div>
        <div class="product-meta-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Listed ${dateFormatted}</span>
        </div>
      </div>
    </section>
  `

  // --- PRICE SECTION ---
  const isFreeDelivery = product.freeDelivery === true || product.deliveryType === 'free'
  html += `
    <section class="product-price-section">
      <div class="price-main">${formatMWK(product.price)}</div>
      
      <div class="delivery-pill-box">
        ${isFreeDelivery ? `
          <span class="delivery-pill delivery-pill--free">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            Free local delivery
          </span>
        ` : `
          <span class="delivery-pill delivery-pill--arranged">
            Delivery arranged with seller
          </span>
        `}
      </div>
      
      <div class="pickup-info-text">
        📍 Pickup available in ${escapeHTML(city)}
      </div>
    </section>
  `

  // --- VARIANTS ---
  if (product.variants && typeof product.variants === 'object' && Object.keys(product.variants).length > 0) {
    html += `
      <section class="product-variants-section" id="variantsSection">
        ${Object.entries(product.variants).map(([groupName, options]) => {
          if (!Array.isArray(options) || options.length === 0) return ''
          return `
            <div class="variant-group" data-group="${escapeHTML(groupName)}">
              <div class="variant-label">Select ${escapeHTML(groupName)}:</div>
              <div class="variant-chips">
                ${options.map((opt, oIdx) => `
                  <button class="variant-chip ${oIdx === 0 ? 'active' : ''}" data-value="${escapeHTML(opt)}">
                    ${escapeHTML(opt)}
                  </button>
                `).join('')}
              </div>
            </div>
          `
        }).join('')}
      </section>
    `
  }

  // --- QUANTITY SELECTOR ---
  const stock = typeof product.stock === 'number' ? product.stock : 10
  const isOutOfStock = stock <= 0
  html += `
    <section class="qty-selector-section">
      <div class="qty-label-container">
        <span class="title">Quantity</span>
        ${isOutOfStock ? `
          <span class="stock-info" style="color: var(--danger); font-weight: 700;">Out of Stock</span>
        ` : stock < 5 ? `
          <span class="stock-info" style="color: #E65100; font-weight: 700;">Only ${stock} left!</span>
        ` : `
          <span class="stock-info">Available Stock: ${stock} items</span>
        `}
      </div>
      
      <div class="qty-controls">
        <button class="qty-btn" id="qtyMinus" ${isOutOfStock ? 'disabled' : ''}>−</button>
        <div class="qty-number" id="qtyVal">${isOutOfStock ? 0 : 1}</div>
        <button class="qty-btn" id="qtyPlus" ${isOutOfStock ? 'disabled' : ''}>+</button>
      </div>
    </section>
  `

  // --- DELIVERY INFO BOX ---
  html += `
    <section class="delivery-box">
      <div class="delivery-box__icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24a1.79 1.79 0 0 0-1.8 0L2.3 6.24a1.8 1.8 0 0 0-.9 1.56v5.82a1.8 1.8 0 0 0 .9 1.56l3.45 2a1.79 1.79 0 0 0 1.8 0L16.5 12V9.4z"/><path d="m7.5 4.2 9 5.2 9-5.2"/><path d="M22.5 6.2v11.6a1.8 1.8 0 0 1-.9 1.56l-5.4 3.12a1.8 1.8 0 0 1-1.8 0L9 19.4"/><path d="m16.5 14.6 6-3.5"/><path d="M7.5 14.6V22"/></svg>
      </div>
      <div class="delivery-box__content">
        <h4>Delivery Options</h4>
        <p>${isFreeDelivery ? `This seller offers free local delivery in ${escapeHTML(city)} and surrounding areas.` : `Pick up directly from the seller in ${escapeHTML(city)} or message them to arrange convenient shipping.`}</p>
        <p style="font-weight: 700; margin-top: 4px; color: var(--secondary);">Message the seller to arrange delivery details.</p>
      </div>
    </section>
  `

  // --- SELLER INFO CARD ---
  const storeName = seller?.storeName || seller?.name || 'Local Store'
  const storeId = seller?.id || product.sellerId || ''
  const responseRate = seller?.responseRate || 95
  const joinYear = seller?.createdAt ? (seller.createdAt.toDate ? seller.createdAt.toDate().getFullYear() : new Date(seller.createdAt).getFullYear()) : '2025'
  const storeRating = typeof seller?.rating === 'number' ? seller.rating.toFixed(1) : '5.0'
  const followerCount = seller?.followerCount || 0

  html += `
    <section class="seller-card-container">
      <div class="seller-profile-header">
        <div class="seller-avatar-wrapper">
          ${seller?.avatar ? `<img src="${seller.avatar}" alt="${escapeHTML(storeName)}" referrerPolicy="no-referrer">` : storeName[0]}
        </div>
        <div class="seller-header-info">
          <div class="seller-name">
            <a href="store.html?id=${storeId}">${escapeHTML(storeName)}</a>
          </div>
          <div class="seller-sub-meta">
            <span>📍 ${escapeHTML(city)}</span>
            <span>•</span>
            <span style="color: #FFA000; font-weight: 700; display: inline-flex; align-items: center; gap: 2px;">
              ★ ${storeRating}
            </span>
          </div>
        </div>
      </div>
      
      <div class="seller-stats-grid">
        <div class="seller-stat-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Member since ${joinYear}</span>
        </div>
        <div class="seller-stat-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>${responseRate}% response rate</span>
        </div>
      </div>
      
      <div class="seller-card-buttons">
        <button class="btn btn--outline btn--sm" id="sellerMessageBtn" style="padding: 6px 12px; font-size: 0.78rem;">
          💬 Message Seller
        </button>
        <button class="btn btn--secondary btn--sm" id="sellerVisitBtn" style="padding: 6px 12px; font-size: 0.78rem;">
          🏪 Visit Store
        </button>
      </div>
      
      <button class="seller-follow-toggle-btn" id="sellerFollowBtn">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" id="followHeartIcon"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
        <span id="followBtnText">Follow this store</span>
        <span style="font-size: 0.72rem; opacity: 0.8; font-weight: 500;" id="followerCountLabel">(${followerCount})</span>
      </button>
    </section>
  `

  // --- DESCRIPTION SECTION ---
  html += `
    <section class="details-block">
      <h2>About this product</h2>
      <div class="details-block__text" style="white-space: pre-line;">${escapeHTML(product.description || 'No description provided.')}</div>
      
      ${product.specs && typeof product.specs === 'object' && Object.keys(product.specs).length > 0 ? `
        <div style="margin-top: 16px;">
          <h3 style="font-size: 0.82rem; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; color: var(--secondary);">Product Specifications</h3>
          <table class="specs-table">
            ${Object.entries(product.specs).map(([k, v]) => `
              <tr>
                <td class="key">${escapeHTML(k)}</td>
                <td class="val">${escapeHTML(v)}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      ` : ''}
    </section>
  `

  // --- BULK PRICING ---
  if (product.isBulk === true && product.bulkPricing && Array.isArray(product.bulkPricing) && product.bulkPricing.length > 0) {
    html += `
      <section class="details-block">
        <h2>Bulk Pricing Deals</h2>
        <table class="bulk-pricing-table">
          <thead>
            <tr>
              <th>Order Quantity</th>
              <th>Price per item</th>
            </tr>
          </thead>
          <tbody>
            ${product.bulkPricing.map(row => `
              <tr>
                <td>${escapeHTML(row.quantity || row.qty || '10+')} units</td>
                <td style="color: var(--primary); font-weight: 700;">${formatMWK(row.price)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p style="font-size: 0.75rem; color: var(--grey-500); margin-top: 8px;">* Contact the seller directly to negotiate custom rates for larger wholesale quantities.</p>
      </section>
    `
  }

  // --- REVIEWS SECTION ---
  html += `
    <section class="reviews-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2>Reviews (<span id="reviewHeaderCount">${reviews.length}</span>)</h2>
        <button class="btn btn--primary btn--sm hidden" id="openReviewBtn" style="padding: 6px 12px; font-size: 0.75rem;">
          ✍️ Write a Review
        </button>
      </div>
      
      <div class="reviews-summary-card">
        <div class="reviews-summary-score">
          <div class="reviews-score-big" id="avgScoreLabel">${typeof product.rating === 'number' ? product.rating.toFixed(1) : '5.0'}</div>
          <div class="stars-display" id="avgStarsRow">${getStarsHtml(product.rating || 5)}</div>
          <div class="reviews-score-label" id="scoreMetaLabel">${reviews.length} reviews</div>
        </div>
        
        <div class="reviews-breakdown-bars" id="reviewsBreakdownBars">
          <!-- Breakdown injected by Javascript -->
        </div>
      </div>
      
      <!-- Filter Tabs -->
      <div class="reviews-tabs" id="reviewsFilterTabs">
        <button class="reviews-tab active" data-filter="all">All</button>
        <button class="reviews-tab" data-filter="5">⭐ 5</button>
        <button class="reviews-tab" data-filter="4">⭐ 4</button>
        <button class="reviews-tab" data-filter="3">⭐ 3 & below</button>
        <button class="reviews-tab" data-filter="photos">With Photos</button>
      </div>
      
      <!-- Review Cards List -->
      <div class="review-cards-list" id="reviewCardsList">
        <!-- Rendered dynamically -->
      </div>
      
      <button class="btn btn--outline btn--full" id="loadMoreReviewsBtn" style="display: none; margin-top: 16px; font-size: 0.8rem; padding: 10px;">
        Load More Reviews
      </button>
    </section>
  `

  // --- SIMILAR PRODUCTS GRID ---
  html += `
    <section class="similar-section" id="similarSection" style="display: none; margin-bottom: 24px;">
      <h2>You Might Also Like</h2>
      <div class="grid-2" id="similarProductsGrid">
        <!-- Products injected dynamically -->
      </div>
    </section>
  `

  // Inject assembled HTML
  container.innerHTML = html

  // Wire all newly created elements & events
  setupCarouselEvents()
  setupQuantitySelector(stock)
  setupVariantSelection()
  setupReviewFiltering()
  setupSellerButtonEvents(storeId, storeName)
  setupStickyBottomActionEvents(stock)

  // Show bottom actions bar
  const stickyActionsBar = document.getElementById('stickyActionsBar')
  if (stickyActionsBar) {
    stickyActionsBar.style.display = 'flex'
  }
}

// -----------------------------------------------------------------
// Visual Widget Setups (Carousel, Variants, Qty)
// -----------------------------------------------------------------
function setupCarouselEvents() {
  const viewport = document.getElementById('carouselViewport')
  const dotsContainer = document.getElementById('carouselDots')
  const thumbnailsContainer = document.getElementById('carouselThumbnails')
  if (!viewport) return

  const dots = dotsContainer ? Array.from(dotsContainer.querySelectorAll('.carousel-dot')) : []
  const thumbs = thumbnailsContainer ? Array.from(thumbnailsContainer.querySelectorAll('.carousel-thumb')) : []

  const updateActiveSlide = (idx) => {
    if (idx < 0 || idx >= totalSlides) return
    currentSlide = idx

    // Scroll viewport
    const slideEl = viewport.querySelector(`[data-index="${idx}"]`)
    if (slideEl) {
      viewport.scrollTo({
        left: slideEl.offsetLeft,
        behavior: 'smooth'
      })
    }

    // Sync dots
    dots.forEach((dot, dIdx) => {
      dot.classList.toggle('active', dIdx === idx)
    })

    // Sync thumbnails
    thumbs.forEach((thumb, tIdx) => {
      thumb.classList.toggle('active', tIdx === idx)
    })
  }

  // Click on dot
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = Number(dot.dataset.index)
      updateActiveSlide(idx)
    })
  })

  // Click on thumbnail
  thumbs.forEach(thumb => {
    thumb.addEventListener('click', () => {
      const idx = Number(thumb.dataset.index)
      updateActiveSlide(idx)
    })
  })

  // Mobile swipe/drag detection
  let startX = 0
  let isDragging = false

  viewport.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX
    isDragging = true
  }, { passive: true })

  viewport.addEventListener('touchend', (e) => {
    if (!isDragging) return
    const endX = e.changedTouches[0].clientX
    const diff = startX - endX

    if (Math.abs(diff) > 60) {
      if (diff > 0 && currentSlide < totalSlides - 1) {
        // Swipe left -> Next
        updateActiveSlide(currentSlide + 1)
      } else if (diff < 0 && currentSlide > 0) {
        // Swipe right -> Prev
        updateActiveSlide(currentSlide - 1)
      }
    }
    isDragging = false
  }, { passive: true })

  // Photo click zoom expand action
  viewport.querySelectorAll('.zoomable-image').forEach(img => {
    img.addEventListener('click', () => {
      openImageZoom(img.src)
    })
  })
}

function openImageZoom(src) {
  const modal = document.getElementById('imageExpandModal')
  const img = document.getElementById('expandedImg')
  if (!modal || !img) return
  img.src = src
  modal.style.display = 'flex'

  const closeBtn = document.getElementById('closeExpandModal')
  const closeModal = () => {
    modal.style.display = 'none'
  }
  closeBtn.onclick = closeModal
  modal.onclick = (e) => {
    if (e.target === modal) closeModal()
  }
}

function setupQuantitySelector(stock) {
  const minusBtn = document.getElementById('qtyMinus')
  const plusBtn = document.getElementById('qtyPlus')
  const qtyVal = document.getElementById('qtyVal')

  if (!minusBtn || !plusBtn || !qtyVal) return

  minusBtn.addEventListener('click', () => {
    if (currentQty > 1) {
      currentQty--
      qtyVal.textContent = currentQty
    }
  })

  plusBtn.addEventListener('click', () => {
    if (currentQty < stock) {
      currentQty++
      qtyVal.textContent = currentQty
    } else {
      showToast(`Cannot exceed available stock (${stock} units)`, 'warning')
    }
  })
}

function setupVariantSelection() {
  const container = document.getElementById('variantsSection')
  if (!container) return

  // Preset initial defaults
  container.querySelectorAll('.variant-group').forEach(group => {
    const groupName = group.dataset.group
    const activeChip = group.querySelector('.variant-chip.active')
    if (activeChip) {
      selectedVariants[groupName] = activeChip.dataset.value
    }

    // Add click listeners to all variant options
    group.querySelectorAll('.variant-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        group.querySelectorAll('.variant-chip').forEach(c => c.classList.remove('active'))
        chip.classList.add('active')
        selectedVariants[groupName] = chip.dataset.value
      })
    })
  })
}

// Setup seller message / visit store buttons inside the seller card
function setupSellerButtonEvents(storeId, storeName) {
  const messageBtn = document.getElementById('sellerMessageBtn')
  const visitBtn = document.getElementById('sellerVisitBtn')
  const followBtn = document.getElementById('sellerFollowBtn')

  if (messageBtn) {
    messageBtn.addEventListener('click', () => messageSellerFlow())
  }
  if (visitBtn) {
    visitBtn.addEventListener('click', () => {
      redirect(`store.html?id=${storeId}`)
    })
  }
  if (followBtn) {
    followBtn.addEventListener('click', () => toggleFollowStore())
  }
}

function setupStickyBottomActionEvents(stock) {
  const bottomChatBtn = document.getElementById('bottomChatBtn')
  const bottomWishlistBtn = document.getElementById('bottomWishlistBtn')
  const bottomAddToCartBtn = document.getElementById('bottomAddToCartBtn')
  const bottomBuyNowBtn = document.getElementById('bottomBuyNowBtn')

  if (bottomChatBtn) {
    bottomChatBtn.addEventListener('click', () => messageSellerFlow())
  }
  if (bottomWishlistBtn) {
    bottomWishlistBtn.addEventListener('click', () => toggleWishlistFlow())
  }
  if (bottomAddToCartBtn) {
    bottomAddToCartBtn.addEventListener('click', () => {
      if (stock <= 0) {
        showToast('This listing is out of stock', 'warning')
        return
      }
      addToCartFlow(false)
    })
  }
  if (bottomBuyNowBtn) {
    bottomBuyNowBtn.addEventListener('click', () => {
      if (stock <= 0) {
        showToast('This listing is out of stock', 'warning')
        return
      }
      addToCartFlow(true) // redirect to checkout/cart
    })
  }
}

// -----------------------------------------------------------------
// Interaction Flows (Cart, Wishlist, Follow, Messages, Share)
// -----------------------------------------------------------------
async function addToCartFlow(checkoutImmediately = false) {
  if (!currentUser) {
    showToast('Please sign in to buy or add items to cart', 'warning')
    setTimeout(() => redirect('/login.html'), 1500)
    return
  }

  const addBtn = document.getElementById('bottomAddToCartBtn')
  const buyBtn = document.getElementById('bottomBuyNowBtn')
  const btnEl = checkoutImmediately ? buyBtn : addBtn

  showLoading(btnEl, checkoutImmediately ? 'Processing...' : 'Adding...')
  
  try {
    const cartItemRef = doc(db, `carts/${currentUser.uid}/items`, product.id)
    const cartSnap = await getDoc(cartItemRef)

    let finalQty = currentQty
    if (cartSnap.exists()) {
      const currentCartQty = cartSnap.data().quantity || 0
      finalQty = Math.min(product.stock || 10, currentCartQty + currentQty)
    }

    await setDoc(cartItemRef, {
      id: product.id,
      name: product.title || product.name,
      price: product.price,
      image: product.images?.[0] || product.image || '',
      quantity: finalQty,
      sellerId: product.sellerId || '',
      variants: selectedVariants,
      addedAt: serverTimestamp()
    })

    hideLoading(btnEl)
    showToast(checkoutImmediately ? 'Proceeding to checkout!' : 'Successfully added to Cart!', 'success')
    
    await syncCartBadge()

    if (checkoutImmediately) {
      setTimeout(() => redirect('/cart.html'), 800)
    }
  } catch (err) {
    hideLoading(btnEl)
    showToast('Could not add item to cart.', 'danger')
    handleFirestoreError(err, OperationType.WRITE, `carts/${currentUser.uid}/items/${product.id}`)
  }
}

async function toggleWishlistFlow() {
  if (!currentUser) {
    showToast('Please sign in to save items to your wishlist', 'warning')
    return
  }

  const headerHeart = document.getElementById('wishlistHeartIcon')
  const stickyHeart = document.getElementById('stickyWishlistIcon')

  try {
    const docRef = doc(db, `wishlists/${currentUser.uid}/items`, product.id)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      // Remove
      await deleteDoc(docRef)
      if (headerHeart) {
        headerHeart.setAttribute('fill', 'none')
        headerHeart.setAttribute('stroke', 'currentColor')
      }
      if (stickyHeart) {
        stickyHeart.setAttribute('fill', 'none')
        stickyHeart.setAttribute('stroke', 'currentColor')
        stickyHeart.parentElement.classList.remove('active')
      }
      showToast('Removed from saved wishlist', 'success')
    } else {
      // Add
      await setDoc(docRef, {
        productId: product.id,
        name: product.title || product.name,
        price: product.price,
        image: product.images?.[0] || product.image || '',
        savedAt: serverTimestamp()
      })
      if (headerHeart) {
        headerHeart.setAttribute('fill', 'var(--primary)')
        headerHeart.setAttribute('stroke', 'var(--primary)')
      }
      if (stickyHeart) {
        stickyHeart.setAttribute('fill', 'var(--primary)')
        stickyHeart.setAttribute('stroke', 'var(--primary)')
        stickyHeart.parentElement.classList.add('active')
      }
      showToast('Saved to your Wishlist!', 'success')
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `wishlists/${currentUser.uid}/items/${product.id}`)
  }
}

async function toggleFollowStore() {
  if (!currentUser) {
    showToast('Please sign in to follow stores', 'warning')
    return
  }

  const followBtn = document.getElementById('sellerFollowBtn')
  const followIcon = document.getElementById('followHeartIcon')
  const followText = document.getElementById('followBtnText')
  const followerCountLabel = document.getElementById('followerCountLabel')

  if (!followBtn || !product.sellerId) return

  followBtn.disabled = true

  try {
    const followRef = doc(db, `followedStores/${currentUser.uid}/stores`, product.sellerId)
    const followSnap = await getDoc(followRef)

    const sellerRef = doc(db, 'users', product.sellerId)
    const currentFollowers = seller?.followerCount || 0

    if (followSnap.exists()) {
      // Unfollow
      await deleteDoc(followRef)
      
      const newCount = Math.max(0, currentFollowers - 1)
      await updateDoc(sellerRef, { followerCount: newCount })
      if (seller) seller.followerCount = newCount

      followBtn.classList.remove('following')
      if (followIcon) {
        followIcon.setAttribute('fill', 'none')
        followIcon.setAttribute('stroke', 'currentColor')
      }
      if (followText) followText.textContent = 'Follow this store'
      if (followerCountLabel) followerCountLabel.textContent = `(${newCount})`

      showToast(`Unfollowed ${seller?.storeName || 'seller'}`, 'success')
    } else {
      // Follow
      await setDoc(followRef, {
        storeId: product.sellerId,
        storeName: seller?.storeName || seller?.name || 'Local Seller',
        followedAt: serverTimestamp()
      })

      const newCount = currentFollowers + 1
      await updateDoc(sellerRef, { followerCount: newCount })
      if (seller) seller.followerCount = newCount

      followBtn.classList.add('following')
      if (followIcon) {
        followIcon.setAttribute('fill', 'var(--white)')
        followIcon.setAttribute('stroke', 'var(--white)')
      }
      if (followText) followText.textContent = 'Following store'
      if (followerCountLabel) followerCountLabel.textContent = `(${newCount})`

      showToast(`Now following ${seller?.storeName || 'seller'}!`, 'success')
    }
  } catch (err) {
    showToast('Action failed. Try again.', 'danger')
    handleFirestoreError(err, OperationType.WRITE, `followedStores`)
  } finally {
    followBtn.disabled = false
  }
}

async function messageSellerFlow() {
  if (!currentUser) {
    showToast('Please sign in to contact the seller', 'warning')
    setTimeout(() => redirect('/login.html'), 1500)
    return
  }

  if (currentUser.uid === product.sellerId) {
    showToast('You cannot send a message to yourself (your listing)', 'warning')
    return
  }

  try {
    // Determine unique conversation ID deterministically to avoid duplicates
    const convId = [currentUser.uid, product.sellerId].sort().join('_')
    const convRef = doc(db, 'conversations', convId)
    const convSnap = await getDoc(convRef)

    if (convSnap.exists()) {
      // Already exists, just redirect
      redirect(`chat.html?id=${convId}`)
    } else {
      // Create new conversation document
      await setDoc(convRef, {
        id: convId,
        buyerId: currentUser.uid,
        buyerName: currentUserData?.name || 'Malawi Buyer',
        sellerId: product.sellerId,
        sellerName: seller?.storeName || seller?.name || 'Local Seller',
        lastMessage: `Hello, I'm interested in "${product.title || product.name}" listed for ${formatMWK(product.price)}. Is it still available?`,
        lastMessageTime: serverTimestamp(),
        productId: product.id,
        productName: product.title || product.name,
        unreadCount: 1,
        updatedAt: serverTimestamp()
      })

      // Add the initial message to messages subcollection
      const msgRef = collection(db, `conversations/${convId}/messages`)
      await addDoc(msgRef, {
        senderId: currentUser.uid,
        text: `Hello, I'm interested in "${product.title || product.name}" listed for ${formatMWK(product.price)}. Is it still available?`,
        timestamp: serverTimestamp()
      })

      showToast('Starting conversation...', 'success')
      setTimeout(() => redirect(`chat.html?id=${convId}`), 800)
    }
  } catch (err) {
    showToast('Failed to start chat with seller.', 'danger')
    handleFirestoreError(err, OperationType.WRITE, 'conversations')
  }
}

function setupSharingButton(productId) {
  const shareBtn = document.getElementById('shareBtn')
  if (!shareBtn) return

  shareBtn.addEventListener('click', () => {
    const pTitle = product?.title || product?.name || 'Listing'
    const pPriceFormatted = formatMWK(product?.price || 0)
    const shareUrl = `${window.location.origin}/product.html?id=${productId}`
    const textMsg = `Check this out on ShopEasy 🇲🇼\n${pTitle}\nPrice: ${pPriceFormatted}\n`

    const waUrl = `https://wa.me/?text=${encodeURIComponent(textMsg + shareUrl)}`
    
    // Attempt navigator.share first on mobile, fallback to WhatsApp web link or clipboard copy
    if (navigator.share) {
      navigator.share({
        title: pTitle,
        text: textMsg,
        url: shareUrl
      }).catch(() => {
        window.open(waUrl, '_blank')
      })
    } else {
      navigator.clipboard.writeText(shareUrl)
      showToast('Link copied to clipboard! Opening WhatsApp...', 'success')
      setTimeout(() => {
        window.open(waUrl, '_blank')
      }, 1200)
    }
  })
}

// Sync wishlist/follower visual active state on load
async function syncInteractionsState(productId) {
  if (!currentUser) return

  const headerHeart = document.getElementById('wishlistHeartIcon')
  const stickyHeart = document.getElementById('stickyWishlistIcon')
  const followBtn = document.getElementById('sellerFollowBtn')
  const followIcon = document.getElementById('followHeartIcon')
  const followText = document.getElementById('followBtnText')

  // Wishlist
  try {
    const wishSnap = await getDoc(doc(db, `wishlists/${currentUser.uid}/items`, productId))
    if (wishSnap.exists()) {
      if (headerHeart) {
        headerHeart.setAttribute('fill', 'var(--primary)')
        headerHeart.setAttribute('stroke', 'var(--primary)')
      }
      if (stickyHeart) {
        stickyHeart.setAttribute('fill', 'var(--primary)')
        stickyHeart.setAttribute('stroke', 'var(--primary)')
        stickyHeart.parentElement.classList.add('active')
      }
    }
  } catch (e) {
    console.warn("Failed to retrieve saved state:", e)
  }

  // Follower
  if (product.sellerId) {
    try {
      const followSnap = await getDoc(doc(db, `followedStores/${currentUser.uid}/stores`, product.sellerId))
      if (followSnap.exists()) {
        if (followBtn) followBtn.classList.add('following')
        if (followIcon) {
          followIcon.setAttribute('fill', 'var(--white)')
          followIcon.setAttribute('stroke', 'var(--white)')
        }
        if (followText) followText.textContent = 'Following store'
      }
    } catch (e) {
      console.warn("Failed to retrieve followed stores state:", e)
    }
  }
}

// -----------------------------------------------------------------
// Reviews Database Methods
// -----------------------------------------------------------------
async function fetchReviews(productId) {
  try {
    const snap = await getDocs(
      query(collection(db, 'reviews'), where('productId', '==', productId), orderBy('createdAt', 'desc'))
    )
    reviews = []
    snap.forEach(docSnap => {
      reviews.push({ id: docSnap.id, ...docSnap.data() })
    })
    filteredReviews = [...reviews]
  } catch (error) {
    console.error("Error loading reviews list:", error)
  }
}

function renderReviewsSummary() {
  const barsContainer = document.getElementById('reviewsBreakdownBars')
  if (!barsContainer) return

  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  reviews.forEach(r => {
    const stars = Math.round(r.rating || 5)
    if (counts[stars] !== undefined) counts[stars]++
  })

  const total = reviews.length || 1
  let barsHtml = ''
  
  for (let s = 5; s >= 1; s--) {
    const percent = Math.round((counts[s] / total) * 100)
    barsHtml += `
      <div class="breakdown-row">
        <span class="breakdown-label">${s} ★</span>
        <div class="breakdown-bar-bg">
          <div class="breakdown-bar-fill" style="width: ${percent}%;"></div>
        </div>
        <span class="breakdown-percent">${percent}%</span>
      </div>
    `
  }

  barsContainer.innerHTML = barsHtml
}

function setupReviewFiltering() {
  renderReviewsSummary()
  renderFilteredReviewsList()

  const tabs = document.querySelectorAll('#reviewsFilterTabs [data-filter]')
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')

      activeReviewFilter = tab.dataset.filter
      applyReviewsFilter()
    })
  })

  // Load more reviews click event
  const loadMoreBtn = document.getElementById('loadMoreReviewsBtn')
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      visibleReviewsCount += 5
      renderFilteredReviewsList()
    })
  }
}

function applyReviewsFilter() {
  if (activeReviewFilter === 'all') {
    filteredReviews = [...reviews]
  } else if (activeReviewFilter === 'photos') {
    filteredReviews = reviews.filter(r => r.photos && Array.isArray(r.photos) && r.photos.length > 0)
  } else if (activeReviewFilter === '5') {
    filteredReviews = reviews.filter(r => Math.round(r.rating) === 5)
  } else if (activeReviewFilter === '4') {
    filteredReviews = reviews.filter(r => Math.round(r.rating) === 4)
  } else if (activeReviewFilter === '3') {
    filteredReviews = reviews.filter(r => Math.round(r.rating) <= 3)
  }

  visibleReviewsCount = 5
  renderFilteredReviewsList()
}

function renderFilteredReviewsList() {
  const listContainer = document.getElementById('reviewCardsList')
  const loadMoreBtn = document.getElementById('loadMoreReviewsBtn')
  if (!listContainer) return

  if (filteredReviews.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 24px 8px; color: var(--grey-500); font-size: 0.8rem;">
        No reviews match the selected filter.
      </div>
    `
    if (loadMoreBtn) loadMoreBtn.style.display = 'none'
    return
  }

  const itemsToShow = filteredReviews.slice(0, visibleReviewsCount)
  
  listContainer.innerHTML = itemsToShow.map(r => {
    const authorInit = r.buyerName ? r.buyerName[0].toUpperCase() : 'B'
    const cleanAuthorName = formatReviewerName(r.buyerName)
    const dateFormatted = r.createdAt ? formatDate(r.createdAt) : 'Recently'
    const rPhotos = r.photos || []
    const starsHtml = getStarsHtml(r.rating || 5)

    // Check if user has already voted as helpful in this session
    const votedKeys = JSON.parse(localStorage.getItem('se_voted_reviews') || '[]')
    const hasVoted = votedKeys.includes(r.id)

    return `
      <div class="review-card" id="rev-${r.id}">
        <div class="review-card__header">
          <div class="review-card__author">
            <div class="author-circle">${authorInit}</div>
            <div class="author-name">${escapeHTML(cleanAuthorName)}</div>
          </div>
          <div class="review-date">${dateFormatted}</div>
        </div>
        
        <div class="review-card__stars stars-display">${starsHtml}</div>
        
        <div class="review-card__text">${escapeHTML(r.text)}</div>
        
        ${rPhotos.length > 0 ? `
          <div class="review-card__photos">
            ${rPhotos.map(p => `<img src="${p}" class="review-card-img" alt="Review photo" referrerPolicy="no-referrer">`).join('')}
          </div>
        ` : ''}
        
        <div class="review-card__actions">
          <button class="helpful-btn ${hasVoted ? 'voted' : ''}" data-id="${r.id}">
            👍 Helpful (<span class="helpful-count">${r.helpfulCount || 0}</span>)
          </button>
        </div>
      </div>
    `
  }).join('')

  // Bind helpful click events
  listContainer.querySelectorAll('.helpful-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const reviewId = btn.dataset.id
      voteHelpfulReview(reviewId, btn)
    })
  })

  // Bind thumbnail expands
  listContainer.querySelectorAll('.review-card-img').forEach(img => {
    img.addEventListener('click', () => {
      openImageZoom(img.src)
    })
  })

  // Set toggle visibility of Load More button
  if (loadMoreBtn) {
    loadMoreBtn.style.display = filteredReviews.length > visibleReviewsCount ? 'block' : 'none'
  }
}

async function voteHelpfulReview(reviewId, btnEl) {
  const votedKeys = JSON.parse(localStorage.getItem('se_voted_reviews') || '[]')
  if (votedKeys.includes(reviewId)) {
    showToast('You already voted this review as helpful', 'warning')
    return
  }

  try {
    const reviewRef = doc(db, 'reviews', reviewId)
    const reviewSnap = await getDoc(reviewRef)
    if (reviewSnap.exists()) {
      const currentHelpful = reviewSnap.data().helpfulCount || 0
      await updateDoc(reviewRef, {
        helpfulCount: currentHelpful + 1
      })
      
      votedKeys.push(reviewId)
      localStorage.setItem('se_voted_reviews', JSON.stringify(votedKeys))
      
      btnEl.classList.add('voted')
      const countLabel = btnEl.querySelector('.helpful-count')
      if (countLabel) countLabel.textContent = currentHelpful + 1
      showToast('Thanks for your helpful vote!', 'success')
    }
  } catch (error) {
    console.error("Failed to increment helpful vote:", error)
  }
}

// -----------------------------------------------------------------
// Review Eligibility & Submission Modal
// -----------------------------------------------------------------
async function checkReviewEligibility(productId) {
  if (!currentUser) return

  const openReviewBtn = document.getElementById('openReviewBtn')
  if (!openReviewBtn) return

  try {
    // Look up orders matching conditions
    const q = query(
      collection(db, 'orders'),
      where('buyerId', '==', currentUser.uid),
      where('status', '==', 'completed')
    )

    const snap = await getDocs(q)
    let eligible = false
    let eligibleOrderDoc = null
    let eligibleItemIndex = -1

    snap.forEach(docSnap => {
      const order = docSnap.data()
      // Skip if order marked as overall submitted or check items list
      const items = order.items || []
      items.forEach((item, idx) => {
        const itemProdId = item.productId || item.id
        if (itemProdId === productId && item.reviewSubmitted !== true && order.reviewSubmitted !== true) {
          eligible = true
          eligibleOrderDoc = docSnap
          eligibleItemIndex = idx
        }
      })
    })

    if (eligible && eligibleOrderDoc) {
      openReviewBtn.classList.remove('hidden')
      setupWriteReviewModal(productId, eligibleOrderDoc.id, eligibleItemIndex)
    }
  } catch (error) {
    console.warn("Error checking review eligibility:", error)
  }
}

function setupWriteReviewModal(productId, orderId, itemIndex) {
  const openReviewBtn = document.getElementById('openReviewBtn')
  const modal = document.getElementById('reviewModal')
  const closeBtn = document.getElementById('closeReviewModal')
  const form = document.getElementById('reviewForm')

  if (!openReviewBtn || !modal || !closeBtn || !form) return

  // Show Modal click
  openReviewBtn.addEventListener('click', () => {
    modal.classList.add('modal--visible')
    form.reset()
    resetStars()
    resetPhotoUpload()
  })

  // Close Modal click
  closeBtn.addEventListener('click', () => {
    modal.classList.remove('modal--visible')
  })

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('modal--visible')
  })

  // Star select interaction
  const stars = Array.from(document.querySelectorAll('#starRatingSelect .star-select-item'))
  const ratingInput = document.getElementById('reviewRatingInput')

  const resetStars = () => {
    stars.forEach(s => s.classList.remove('selected', 'hover'))
    ratingInput.value = ''
  }

  stars.forEach(star => {
    star.addEventListener('click', () => {
      const rating = Number(star.dataset.rating)
      ratingInput.value = rating
      stars.forEach((s, idx) => {
        s.classList.toggle('selected', idx < rating)
      })
    })

    star.addEventListener('mouseenter', () => {
      const rating = Number(star.dataset.rating)
      stars.forEach((s, idx) => {
        s.classList.toggle('hover', idx < rating)
      })
    })

    star.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.remove('hover'))
    })
  })

  // Textarea character count & min validation limit (min 20, max 500)
  const textarea = document.getElementById('reviewText')
  const charCountLabel = document.getElementById('charCount')
  const charWarning = document.getElementById('charWarning')

  textarea.addEventListener('input', () => {
    const len = textarea.value.length
    charCountLabel.textContent = `${len} / 500 characters`
    if (len >= 20) {
      charWarning.style.display = 'none'
    } else {
      charWarning.style.display = 'inline'
    }
  })

  // Photo uploads
  const imageInput = document.getElementById('reviewImageInput')
  const thumbnailsContainer = document.getElementById('uploadedThumbnails')

  const resetPhotoUpload = () => {
    reviewFiles = []
    thumbnailsContainer.innerHTML = ''
  }

  imageInput.addEventListener('change', () => {
    const selected = Array.from(imageInput.files)
    if (reviewFiles.length + selected.length > 3) {
      showToast('You can upload up to 3 photos max', 'warning')
      return
    }

    selected.forEach(file => {
      reviewFiles.push(file)
      
      const reader = new FileReader()
      reader.onload = (e) => {
        const wrap = document.createElement('div')
        wrap.className = 'uploaded-thumb-wrapper'
        wrap.innerHTML = `
          <img src="${e.target.result}" alt="Review file thumbnail">
          <span class="uploaded-thumb-remove">&times;</span>
        `
        // Bind removal
        wrap.querySelector('.uploaded-thumb-remove').addEventListener('click', () => {
          reviewFiles = reviewFiles.filter(f => f !== file)
          wrap.remove()
        })
        thumbnailsContainer.appendChild(wrap)
      }
      reader.readAsDataURL(file)
    })
    imageInput.value = '' // Reset input
  })

  // Form Submit Action
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const textVal = textarea.value.trim()
    const ratingVal = Number(ratingInput.value)

    if (!ratingVal) {
      showToast('Please choose a star rating (1-5)', 'warning')
      return
    }

    if (textVal.length < 20) {
      showToast('Your review text must be at least 20 characters', 'warning')
      charWarning.style.display = 'inline'
      return
    }

    if (textVal.length > 500) {
      showToast('Your review text must not exceed 500 characters', 'warning')
      return
    }

    const submitBtn = document.getElementById('submitReviewBtn')
    showLoading(submitBtn, 'Submitting...')

    try {
      const uploadedUrls = []
      
      // 1. Upload review photos if any
      for (let i = 0; i < reviewFiles.length; i++) {
        const file = reviewFiles[i]
        const storageRef = ref(storage, `reviews/${productId}/${Date.now()}_review_${i}_${file.name}`)
        const snapshot = await uploadBytes(storageRef, file)
        const downloadUrl = await getDownloadURL(snapshot.ref)
        uploadedUrls.push(downloadUrl)
      }

      // 2. Write review document
      await addDoc(collection(db, 'reviews'), {
        productId,
        buyerId: currentUser.uid,
        buyerName: currentUserData?.name || currentUser.email || 'Malawi Buyer',
        rating: ratingVal,
        text: textVal,
        photos: uploadedUrls,
        helpfulCount: 0,
        createdAt: serverTimestamp()
      })

      // 3. Recalculate average rating & reviewCount on current Product
      const prodRef = doc(db, 'products', productId)
      const currentReviewsSnap = await getDocs(
        query(collection(db, 'reviews'), where('productId', '==', productId))
      )

      let totalRatingSum = 0
      currentReviewsSnap.forEach(rDoc => {
        totalRatingSum += (rDoc.data().rating || 5)
      })
      const reviewCount = currentReviewsSnap.size
      const avgRating = Number((totalRatingSum / (reviewCount || 1)).toFixed(1))

      await updateDoc(prodRef, {
        rating: avgRating,
        reviewCount: reviewCount
      })

      // 4. Update the Order: Mark item as reviewSubmitted = true
      const orderRef = doc(db, 'orders', orderId)
      const orderSnap = await getDoc(orderRef)
      if (orderSnap.exists()) {
        const orderData = orderSnap.data()
        const orderItems = orderData.items || []
        if (orderItems[itemIndex]) {
          orderItems[itemIndex].reviewSubmitted = true
        }
        await updateDoc(orderRef, {
          items: orderItems,
          reviewSubmitted: true // Mark order overall or specifically
        })
      }

      // Hide modal & reset form
      modal.classList.remove('modal--visible')
      showToast('Review submitted successfully. Thank you!', 'success')
      
      // Reload reviews and re-render sections dynamically
      await fetchReviews(productId)
      
      // Update local product rating info
      if (product) {
        product.rating = avgRating
        product.reviewCount = reviewCount
      }

      // Hide Write review button
      openReviewBtn.classList.add('hidden')

      // Re-render
      renderMainPage()

    } catch (err) {
      showToast('Submission failed. Check connection.', 'danger')
      handleFirestoreError(err, OperationType.WRITE, `reviews/${productId}`)
    } finally {
      hideLoading(submitBtn)
    }
  })
}

// -----------------------------------------------------------------
// Similar Products Grid Loader
// -----------------------------------------------------------------
async function fetchSimilarProducts(productId, category) {
  const section = document.getElementById('similarSection')
  const grid = document.getElementById('similarProductsGrid')
  if (!section || !grid || !category) return

  try {
    const snap = await getDocs(
      query(
        collection(db, 'products'),
        where('category', '==', category),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc'),
        limit(10)
      )
    )

    const items = []
    snap.forEach(docSnap => {
      const data = docSnap.data()
      if (docSnap.id !== productId) {
        items.push({ id: docSnap.id, ...data })
      }
    })

    const sliced = items.slice(0, 6)

    if (sliced.length === 0) {
      section.style.display = 'none'
      return
    }

    grid.innerHTML = sliced.map(p => renderProductCard(p)).join('')
    section.style.display = 'block'

  } catch (error) {
    console.warn("Failed to load similar products:", error)
  }
}

// -----------------------------------------------------------------
// Page Entry bootstrap
// -----------------------------------------------------------------
async function init() {
  const productId = getUrlParam('id')
  
  // Set up header elements scroll interaction
  setupScrollHeader()

  try {
    // 1. Initialize Auth module
    await initAuth()
    
    // 2. Highlight Nav bottom bar item (Shop tab)
    injectHeaderAndNav('shop')
    
    // 3. Setup sharing logic with correct params
    setupSharingButton(productId)
    
    // 4. Load dynamic layout sections
    if (productId) {
      await loadProductDetails(productId)
    }
    
    // 5. Update Cart tab Badge count
    await syncCartBadge()

  } catch (err) {
    console.error("Auth / Init error in product details:", err)
  }
}

document.addEventListener('DOMContentLoaded', init)
