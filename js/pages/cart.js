/**
 * ShopEasy Shopping Cart Page Control Module
 */

import { auth, db } from '../firebase-config.js'
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { injectHeaderAndNav, renderEmptyState, renderErrorState } from '../ui.js'
import { formatMWK, showToast, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inject navigation
  injectHeaderAndNav('cart')

  const container = document.getElementById('cart-items-container')
  const summaryPanel = document.getElementById('cart-summary')
  const subtotalEl = document.getElementById('cart-subtotal')
  const totalEl = document.getElementById('cart-total')
  const checkoutBtn = document.getElementById('checkout-btn')

  let unsubscribeCart = null

  // 2. Listen to Authentication State
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      // Unsubscribe if logged out
      if (unsubscribeCart) unsubscribeCart()
      
      container.innerHTML = `
        <div style="grid-column: 1 / -1; width: 100%;">
          ${renderEmptyState(
            'user',
            'Please Sign In',
            'You must be signed in to access your shopping cart and complete purchases.',
            'Sign In',
            '/login.html'
          )}
        </div>
      `
      if (summaryPanel) summaryPanel.style.display = 'none'
      return
    }

    // 3. Listen to reactive Cart Changes in Firestore
    const cartPath = `carts/${user.uid}/items`
    unsubscribeCart = onSnapshot(collection(db, cartPath), (snapshot) => {
      container.innerHTML = ''
      
      if (snapshot.empty) {
        container.innerHTML = `
          <div style="grid-column: 1 / -1; width: 100%;">
            ${renderEmptyState(
              'shoppingCart',
              'Your Cart is Empty',
              'Discover awesome listings from local Malawian sellers today!',
              'Explore Shop',
              '/shop.html'
            )}
          </div>
        `
        if (summaryPanel) summaryPanel.style.display = 'none'
        return
      }

      let subtotal = 0
      snapshot.forEach(snapDoc => {
        const item = snapDoc.data()
        item.id = snapDoc.id
        subtotal += Number(item.price || 0) * Number(item.quantity || 1)
        
        container.appendChild(renderCartRow(item, user.uid))
      })

      // Update subtotals
      if (subtotalEl) subtotalEl.textContent = formatMWK(subtotal)
      if (totalEl) totalEl.textContent = formatMWK(subtotal)
      
      if (summaryPanel) summaryPanel.style.display = 'block'
    }, (error) => {
      container.innerHTML = renderErrorState('Failed to sync shopping cart items.')
      handleFirestoreError(error, OperationType.LIST, cartPath)
    })
  })

  // 4. Helper to render individual cart item rows
  const renderCartRow = (item, uid) => {
    const row = document.createElement('div')
    row.className = 'cart-row'
    
    row.innerHTML = `
      <img src="${item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'}" alt="${item.name}" class="cart-row__img">
      <div class="cart-row__info">
        <h4 class="cart-row__name">${item.name || 'Listing'}</h4>
        <div class="cart-row__price">${formatMWK(item.price)}</div>
        <div class="cart-row__controls">
          <button class="cart-qty-btn" data-action="minus">&minus;</button>
          <span class="cart-qty-val">${item.quantity || 1}</span>
          <button class="cart-qty-btn" data-action="plus">&plus;</button>
        </div>
      </div>
      <button class="cart-row__delete" aria-label="Remove item">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
      </button>
    `

    // Hook minus button
    row.querySelector('[data-action="minus"]').addEventListener('click', async () => {
      if (item.quantity <= 1) return
      try {
        await updateDoc(doc(db, `carts/${uid}/items`, item.id), {
          quantity: item.quantity - 1
        })
      } catch (error) {
        showToast('Could not update quantity.', 'danger')
      }
    })

    // Hook plus button
    row.querySelector('[data-action="plus"]').addEventListener('click', async () => {
      try {
        await updateDoc(doc(db, `carts/${uid}/items`, item.id), {
          quantity: item.quantity + 1
        })
      } catch (error) {
        showToast('Could not update quantity.', 'danger')
      }
    })

    // Hook delete button
    row.querySelector('.cart-row__delete').addEventListener('click', async () => {
      try {
        await deleteDoc(doc(db, `carts/${uid}/items`, item.id))
        showToast('Item removed from cart.', 'success')
      } catch (error) {
        showToast('Could not delete item.', 'danger')
      }
    })

    return row
  }

  // 5. Wire Checkout redirect button
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      redirect('/checkout.html')
    })
  }
})
