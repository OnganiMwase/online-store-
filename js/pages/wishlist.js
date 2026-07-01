/**
 * ShopEasy Saved Wishlist Control Module
 */

import { auth, db } from '../firebase-config.js';
import { 
  collection, 
  getDocs, 
  doc, 
  deleteDoc, 
  setDoc, 
  getDoc, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { injectHeaderAndNav, renderSkeleton } from '../ui.js';
import { redirect, showToast, formatMWK, handleFirestoreError, OperationType } from '../utils.js';
import { initAuth } from '../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Inject navigation
  injectHeaderAndNav('account');

  const gridEl = document.getElementById('wishlist-products-grid');
  const wishlistTitle = document.getElementById('wishlist-title');
  const selectToggleBtn = document.getElementById('wishlist-select-toggle');
  const selectionActionBar = document.getElementById('selection-action-bar');
  const selectedCountEl = document.getElementById('selected-count');
  const batchRemoveBtn = document.getElementById('batch-remove-btn');
  const batchAddToCartBtn = document.getElementById('batch-add-to-cart-btn');

  let isSelectionMode = false;
  let savedItems = [];
  let selectedProductIds = new Set();
  let authUser = null;

  // Initialize Auth
  gridEl.innerHTML = renderSkeleton(4);
  const authState = await initAuth({ requireAuth: true });
  authUser = authState.user;

  if (!authUser) {
    return; // Redirect is automatically handled by initAuth
  }

  // Load Wishlist Items
  await loadWishlist();

  // Handle select toggle activation
  selectToggleBtn.addEventListener('click', () => {
    isSelectionMode = !isSelectionMode;
    if (isSelectionMode) {
      selectToggleBtn.textContent = 'Cancel';
      selectToggleBtn.style.color = 'var(--grey-600)';
      showSelectionUI();
    } else {
      selectToggleBtn.textContent = 'Select';
      selectToggleBtn.style.color = 'var(--primary)';
      hideSelectionUI();
    }
  });

  // Batch Remove Event
  batchRemoveBtn.addEventListener('click', async () => {
    if (selectedProductIds.size === 0) {
      showToast('No items selected.', 'warning');
      return;
    }

    if (!confirm(`Are you sure you want to remove ${selectedProductIds.size} item(s) from your wishlist?`)) {
      return;
    }

    const itemsToRemove = Array.from(selectedProductIds);
    let successCount = 0;

    for (const prodId of itemsToRemove) {
      try {
        await deleteDoc(doc(db, `wishlists/${authUser.uid}/items`, prodId));
        const card = document.getElementById(`wish-card-${prodId}`);
        if (card) {
          card.classList.add('fade-out');
          setTimeout(() => card.remove(), 300);
        }
        successCount++;
      } catch (err) {
        console.error("Error deleting item:", prodId, err);
      }
    }

    showToast(`Removed ${successCount} item(s) from wishlist.`, 'success');
    
    // Update local list
    savedItems = savedItems.filter(item => !selectedProductIds.has(item.id));
    selectedProductIds.clear();
    updateSelectionCount();
    updateHeaderCount();

    // Reset UI selection
    isSelectionMode = false;
    selectToggleBtn.textContent = 'Select';
    selectToggleBtn.style.color = 'var(--primary)';
    hideSelectionUI();

    if (savedItems.length === 0) {
      renderEmptyState();
    }
  });

  // Batch Add To Cart Event
  batchAddToCartBtn.addEventListener('click', async () => {
    if (selectedProductIds.size === 0) {
      showToast('No items selected.', 'warning');
      return;
    }

    batchAddToCartBtn.disabled = true;
    batchAddToCartBtn.textContent = 'Adding...';

    const itemsToAdd = savedItems.filter(item => selectedProductIds.has(item.id));
    let successCount = 0;

    for (const item of itemsToAdd) {
      try {
        const cartItemRef = doc(db, `carts/${authUser.uid}/items`, item.id);
        const cartSnap = await getDoc(cartItemRef);
        let qty = 1;
        if (cartSnap.exists()) {
          qty = (cartSnap.data().quantity || 1) + 1;
        }

        await setDoc(cartItemRef, {
          id: item.id,
          name: item.title || item.name || 'Product Listing',
          price: item.price || 0,
          image: item.image || '',
          quantity: qty,
          sellerId: item.sellerId || '',
          addedAt: serverTimestamp()
        });
        successCount++;
      } catch (err) {
        console.error("Error adding to cart:", item.id, err);
      }
    }

    showToast(`Added ${successCount} item(s) to Cart!`, 'success');
    batchAddToCartBtn.disabled = false;
    batchAddToCartBtn.textContent = 'Add to Cart';

    // Reset UI selection
    isSelectionMode = false;
    selectToggleBtn.textContent = 'Select';
    selectToggleBtn.style.color = 'var(--primary)';
    hideSelectionUI();
    selectedProductIds.clear();

    // Update cart badges
    syncCartBadges();
  });

  // Main load wishlist items function
  async function loadWishlist() {
    try {
      const colPath = `wishlists/${authUser.uid}/items`;
      const snapshot = await getDocs(collection(db, colPath));
      gridEl.innerHTML = '';
      savedItems = [];

      if (snapshot.empty) {
        renderEmptyState();
        return;
      }

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        savedItems.push({
          id: docSnap.id,
          ...data
        });
      });

      // Sort client-side by addedAt or savedAt desc to avoid requiring composite indexes
      savedItems.sort((a, b) => {
        const timeA = a.addedAt?.toDate ? a.addedAt.toDate().getTime() : (a.savedAt?.toDate ? a.savedAt.toDate().getTime() : 0);
        const timeB = b.addedAt?.toDate ? b.addedAt.toDate().getTime() : (b.savedAt?.toDate ? b.savedAt.toDate().getTime() : 0);
        return timeB - timeA;
      });

      updateHeaderCount();
      selectToggleBtn.style.display = 'block';

      // Render cards
      savedItems.forEach(item => {
        renderCard(item);
      });

    } catch (error) {
      gridEl.innerHTML = `
        <div style="grid-column: 1 / -1;">
          <div class="error-state" style="text-align: center; padding: 32px 16px; color: var(--danger); background-color: var(--primary-light); border-radius: var(--radius); margin: 16px 0;">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="margin: 0 auto 12px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <p style="font-size: 0.9rem; font-weight: 500;">Failed to load wishlist items. Please refresh the page.</p>
          </div>
        </div>
      `;
      handleFirestoreError(error, OperationType.LIST, `wishlists/${authUser.uid}/items`);
    }
  }

  // Render standard card
  function renderCard(item) {
    const productId = item.id;
    const name = item.title || item.name || 'Unnamed Product';
    const image = item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80';
    const city = item.city || 'Malawi';
    const price = item.price || 0;

    const card = document.createElement('div');
    card.className = 'product-card wishlist-card';
    card.id = `wish-card-${productId}`;
    card.dataset.productId = productId;

    card.innerHTML = `
      <div class="select-checkbox-container">
        <input type="checkbox" class="select-checkbox" data-id="${productId}">
      </div>
      
      <div class="product-card__image-container">
        <a href="product.html?id=${productId}" class="card-body-link">
          <img class="product-card__image" src="${image}" alt="${name}" loading="lazy" referrerPolicy="no-referrer" />
        </a>
        <button class="product-card__wishlist product-card__wishlist--active remove-wishlist-btn" data-id="${productId}" aria-label="Remove from wishlist" style="color: var(--primary);">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="var(--primary)" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
        </button>
      </div>
      <div class="product-card__content" style="padding: 10px; display: flex; flex-direction: column; gap: 4px;">
        <div class="product-card__meta">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>${city}</span>
        </div>
        <a href="product.html?id=${productId}" class="card-body-link">
          <h3 class="product-card__title" style="font-size: 0.85rem; font-weight: 600; color: var(--secondary); line-height: 1.25; height: 2.5rem; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${name}</h3>
        </a>
        <div class="product-card__price" style="font-size: 0.95rem; font-weight: 700; color: var(--primary); margin-top: 4px;">${formatMWK(price)}</div>
        <button class="btn btn--primary btn--sm add-to-cart-btn" data-id="${productId}" style="margin-top: 8px; width: 100%; font-weight: 800; text-transform: uppercase;">
          Add to Cart
        </button>
      </div>
    `;

    // Bind heart click to remove item
    const heartBtn = card.querySelector('.remove-wishlist-btn');
    heartBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await removeSingleWishlist(productId);
    });

    // Bind Single Add to Cart click
    const cartBtn = card.querySelector('.add-to-cart-btn');
    cartBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await addSingleToCart(item);
    });

    // Handle overall card body clicks in selection mode vs normal mode
    card.addEventListener('click', (e) => {
      if (isSelectionMode) {
        e.preventDefault();
        e.stopPropagation();
        
        // Don't trigger if clicked exactly on the checkbox since it toggles natively
        if (e.target.className !== 'select-checkbox') {
          const checkbox = card.querySelector('.select-checkbox');
          checkbox.checked = !checkbox.checked;
          toggleCheckboxSelection(productId, checkbox.checked);
        }
      }
    });

    // Bind checkbox change
    const checkboxEl = card.querySelector('.select-checkbox');
    checkboxEl.addEventListener('change', (e) => {
      toggleCheckboxSelection(productId, e.target.checked);
    });

    gridEl.appendChild(card);
  }

  // Handle single item wishlist removal
  async function removeSingleWishlist(productId) {
    try {
      await deleteDoc(doc(db, `wishlists/${authUser.uid}/items`, productId));
      
      const card = document.getElementById(`wish-card-${productId}`);
      if (card) {
        card.classList.add('fade-out');
        setTimeout(() => {
          card.remove();
          if (gridEl.children.length === 0) {
            renderEmptyState();
          }
        }, 300);
      }

      savedItems = savedItems.filter(i => i.id !== productId);
      selectedProductIds.delete(productId);
      
      updateSelectionCount();
      updateHeaderCount();
      showToast('Removed from wishlist', 'success');
    } catch (err) {
      showToast('Could not remove item from wishlist.', 'danger');
      console.error(err);
    }
  }

  // Handle single item add to cart
  async function addSingleToCart(item) {
    try {
      const cartItemRef = doc(db, `carts/${authUser.uid}/items`, item.id);
      const cartSnap = await getDoc(cartItemRef);
      let qty = 1;
      if (cartSnap.exists()) {
        qty = (cartSnap.data().quantity || 1) + 1;
      }

      await setDoc(cartItemRef, {
        id: item.id,
        name: item.title || item.name || 'Product Listing',
        price: item.price || 0,
        image: item.image || '',
        quantity: qty,
        sellerId: item.sellerId || '',
        addedAt: serverTimestamp()
      });

      showToast('Added to cart!', 'success');
      syncCartBadges();
    } catch (err) {
      showToast('Could not add item to cart.', 'danger');
      console.error(err);
    }
  }

  // Toggle single checkbox selection helper
  function toggleCheckboxSelection(productId, isChecked) {
    if (isChecked) {
      selectedProductIds.add(productId);
      document.getElementById(`wish-card-${productId}`)?.classList.add('selected-glow');
    } else {
      selectedProductIds.delete(productId);
      document.getElementById(`wish-card-${productId}`)?.classList.remove('selected-glow');
    }
    updateSelectionCount();
  }

  // Update batch UI
  function showSelectionUI() {
    selectedProductIds.clear();
    updateSelectionCount();

    // Show checkboxes
    const checkboxContainers = document.querySelectorAll('.select-checkbox-container');
    checkboxContainers.forEach(container => {
      container.style.display = 'block';
    });

    // Slide up bottom bar
    selectionActionBar.style.bottom = '0px';

    // Disable wishlist remove button & single cart buttons visual or prevent click
    const addBtns = document.querySelectorAll('.add-to-cart-btn');
    addBtns.forEach(b => b.style.opacity = '0.5');
    const hearts = document.querySelectorAll('.remove-wishlist-btn');
    hearts.forEach(h => h.style.opacity = '0.5');
  }

  function hideSelectionUI() {
    selectedProductIds.clear();

    // Hide checkboxes
    const checkboxContainers = document.querySelectorAll('.select-checkbox-container');
    checkboxContainers.forEach(container => {
      container.style.display = 'none';
      const checkbox = container.querySelector('.select-checkbox');
      if (checkbox) checkbox.checked = false;
    });

    // Remove active styles from card
    const cards = document.querySelectorAll('.wishlist-card');
    cards.forEach(c => c.classList.remove('selected-glow'));

    // Slide down bottom bar
    selectionActionBar.style.bottom = '-80px';

    // Restore buttons opacity
    const addBtns = document.querySelectorAll('.add-to-cart-btn');
    addBtns.forEach(b => b.style.opacity = '1');
    const hearts = document.querySelectorAll('.remove-wishlist-btn');
    hearts.forEach(h => h.style.opacity = '1');
  }

  function updateSelectionCount() {
    selectedCountEl.textContent = `${selectedProductIds.size} selected`;
  }

  function updateHeaderCount() {
    wishlistTitle.textContent = `❤️ Wishlist (${savedItems.length})`;
  }

  // Render clean Empty State
  function renderEmptyState() {
    gridEl.innerHTML = `
      <div style="grid-column: 1 / -1; width: 100%;">
        <div class="empty-state" style="text-align: center; padding: 48px 16px; display: flex; flex-direction: column; align-items: center; gap: 16px; color: var(--grey-600);">
          <div style="font-size: 4rem; color: var(--primary); font-weight: 300; line-height: 1;">💔</div>
          <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--secondary); margin: 0;">No saved items</h3>
          <p style="font-size: 0.85rem; max-width: 280px; line-height: 1.4; color: var(--grey-600); margin: 0;">Browse products and tap ❤️ to save them here</p>
          <a href="shop.html" class="btn btn--primary" style="margin-top: 10px; font-weight: 800; padding: 10px 24px; text-transform: uppercase;">Browse Products</a>
        </div>
      </div>
    `;
    wishlistTitle.textContent = '❤️ Wishlist (0)';
    selectToggleBtn.style.display = 'none';
  }

  // Sync general cart count indicators in layout navigation
  async function syncCartBadges() {
    try {
      const snap = await getDocs(collection(db, `carts/${authUser.uid}/items`));
      const count = snap.size;
      const cartItem = document.querySelector('a[href="cart.html"]');
      if (cartItem) {
        const existingBadge = cartItem.querySelector('.cart-badge');
        if (existingBadge) existingBadge.remove();
        
        if (count > 0) {
          cartItem.style.position = 'relative';
          const badge = document.createElement('span');
          badge.className = 'cart-badge';
          badge.style.cssText = 'position: absolute; top: 4px; right: 18px; background-color: var(--primary); color: white; border-radius: 50%; font-size: 0.65rem; font-weight: bold; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; z-index: 10;';
          badge.textContent = count;
          cartItem.appendChild(badge);
        }
      }
    } catch (err) {
      console.warn("Failed to sync cart count badges:", err);
    }
  }
});
