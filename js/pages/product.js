/**
 * ShopEasy Product Details Control Module
 */

import { auth, db } from '../firebase-config.js'
import { 
  doc, 
  getDoc, 
  setDoc,
  collection,
  addDoc,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { initModal } from '../ui.js'
import { getUrlParam, formatMWK, showToast, showLoading, hideLoading, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', async () => {
  const productId = getUrlParam('id')
  const container = document.getElementById('product-details-container')
  const actionsBar = document.getElementById('actions-bar')
  const contactModal = document.getElementById('contact-modal')
  
  if (!productId) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 16px;">
        <h3>Product Not Found</h3>
        <p style="color: var(--grey-600); margin-top: 8px;">The item you are looking for does not exist or has been removed.</p>
        <a href="/shop.html" class="btn btn--primary btn--sm" style="margin-top: 16px;">Back to Shop</a>
      </div>
    `
    return
  }

  // 1. Initialize Contact/Chat Modal
  initModal('contact-modal')

  let product = null
  let seller = null

  // 2. Fetch Product & Seller Info
  const loadProduct = async () => {
    try {
      const prodDoc = await getDoc(doc(db, 'products', productId))
      if (!prodDoc.exists()) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 16px;">
            <h3>Listing Removed</h3>
            <p style="color: var(--grey-600); margin-top: 8px;">This item is no longer active on the marketplace.</p>
            <a href="/shop.html" class="btn btn--primary btn--sm" style="margin-top: 16px;">Back to Shop</a>
          </div>
        `
        return
      }

      product = prodDoc.data()
      product.id = prodDoc.id

      // Fetch Seller Details
      if (product.sellerId) {
        const sellerDoc = await getDoc(doc(db, 'users', product.sellerId))
        if (sellerDoc.exists()) {
          seller = sellerDoc.data()
        }
      }

      renderDetails()
    } catch (error) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; color: var(--danger);">
          <p>Failed to load product details.</p>
          <button class="btn btn--outline btn--sm" style="margin-top: 12px;" onclick="location.reload()">Retry</button>
        </div>
      `
      handleFirestoreError(error, OperationType.GET, `products/${productId}`)
    }
  }

  // 3. Render HTML Details
  const renderDetails = () => {
    const name = product.name || 'Unnamed Product'
    const image = product.image || product.images?.[0] || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80'
    const price = product.price || 0
    const description = product.description || 'No description provided.'
    const categoryName = product.categoryName || product.category || 'General'
    const location = product.city || product.sellerCity || seller?.city || 'Malawi'
    const freeDelivery = product.freeDelivery === true || product.deliveryType === 'free'
    
    container.innerHTML = `
      <div class="product-image-wrap">
        <img src="${image}" alt="${name}">
      </div>

      <div class="product-price-block">
        <div class="product-price-val">${formatMWK(price)}</div>
        <div class="product-meta-badges">
          <span class="badge badge--grey">${categoryName}</span>
          ${freeDelivery ? `<span class="badge badge--success">Free Delivery</span>` : ''}
        </div>
      </div>

      <h1 class="product-title-text">${name}</h1>

      <!-- Seller Info Widget -->
      <div class="seller-widget">
        <img class="seller-widget__avatar" src="${seller?.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(seller?.name || 'S')}" alt="Seller">
        <div class="seller-widget__info">
          <div class="seller-widget__name">${seller?.name || 'Local Seller'}</div>
          <div class="seller-widget__location">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${location}</span>
          </div>
        </div>
        <button class="seller-widget__btn" id="follow-seller-btn">Follow</button>
      </div>

      <!-- Description Block -->
      <div class="product-description-block">
        <h2 class="product-sub-title">Description</h2>
        <p class="product-description-text">${description}</p>
      </div>
      
      <!-- Safe Shopping Advice -->
      <div style="background: #FFF8E1; border: 1px solid #FFE082; border-radius: var(--radius); padding: 12px; margin-top: 16px;">
        <h4 style="color: #F57F17; font-size: 0.85rem; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Safety & Trust Advice
        </h4>
        <p style="font-size: 0.75rem; color: #5D4037; line-height: 1.4;">Meet the seller in a public, safe space (e.g. city center, bank branch) to inspect the item before making any payment.</p>
      </div>
    `

    // Show actions panel
    if (actionsBar) {
      actionsBar.style.display = 'flex'
    }

    // Wire Follow Seller Button
    const followBtn = document.getElementById('follow-seller-btn')
    if (followBtn && product.sellerId) {
      followBtn.addEventListener('click', async () => {
        const user = auth.currentUser
        if (!user) {
          showToast('Please sign in to follow stores', 'warning')
          return
        }
        try {
          await setDoc(doc(db, `followedStores/${user.uid}/stores`, product.sellerId), {
            storeId: product.sellerId,
            storeName: seller?.name || 'Local Seller',
            followedAt: serverTimestamp()
          })
          followBtn.textContent = 'Followed'
          followBtn.disabled = true
          showToast(`Now following ${seller?.name || 'seller'}!`, 'success')
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `followedStores/${user.uid}/stores/${product.sellerId}`)
        }
      })
    }
  }

  // 4. Wire Add to Cart Button
  const addCartBtn = document.getElementById('add-cart-btn')
  if (addCartBtn) {
    addCartBtn.addEventListener('click', async () => {
      const user = auth.currentUser
      if (!user) {
        showToast('Please sign in to add items to cart', 'warning')
        setTimeout(() => redirect('/login.html'), 1500)
        return
      }

      showLoading(addCartBtn, 'Adding...')
      try {
        const cartItemRef = doc(db, `carts/${user.uid}/items`, productId)
        await setDoc(cartItemRef, {
          id: productId,
          name: product.name,
          price: product.price,
          image: product.image || product.images?.[0] || '',
          quantity: 1,
          sellerId: product.sellerId || '',
          addedAt: serverTimestamp()
        })
        hideLoading(addCartBtn)
        showToast('Added to Cart successfully!', 'success')
      } catch (error) {
        hideLoading(addCartBtn)
        showToast('Could not add to cart.', 'danger')
        handleFirestoreError(error, OperationType.WRITE, `carts/${user.uid}/items/${productId}`)
      }
    })
  }

  // 5. Wire Wishlist Button
  const wishlistBtn = document.getElementById('wishlist-action-btn')
  if (wishlistBtn) {
    wishlistBtn.addEventListener('click', async () => {
      const user = auth.currentUser
      if (!user) {
        showToast('Please sign in to save items', 'warning')
        return
      }

      try {
        const docRef = doc(db, `wishlists/${user.uid}/items`, productId)
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          // Already saved, click removes it
          wishlistBtn.classList.remove('product-card__wishlist--active')
          wishlistBtn.style.color = ''
          await setDoc(docRef, null) // delete
          showToast('Removed from saved items', 'success')
        } else {
          wishlistBtn.classList.add('product-card__wishlist--active')
          wishlistBtn.style.color = 'var(--primary)'
          await setDoc(docRef, {
            productId,
            name: product.name,
            price: product.price,
            image: product.image || product.images?.[0] || '',
            savedAt: serverTimestamp()
          })
          showToast('Saved to Wishlist!', 'success')
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `wishlists/${auth.currentUser?.uid}/items/${productId}`)
      }
    })
  }

  // 6. Wire Chat Seller Dialog
  const chatBtn = document.getElementById('chat-action-btn')
  if (chatBtn) {
    chatBtn.addEventListener('click', () => {
      const user = auth.currentUser
      if (!user) {
        showToast('Please sign in to send messages', 'warning')
        setTimeout(() => redirect('/login.html'), 1500)
        return
      }
      contactModal.classList.add('modal--visible')
    })
  }

  // 7. Handle Contact Form Submission
  const contactForm = document.getElementById('contact-form')
  const contactSubmitBtn = document.getElementById('contact-submit-btn')
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const user = auth.currentUser
      const msgText = document.getElementById('contact-msg').value.trim()

      if (!user || !product) return

      showLoading(contactSubmitBtn, 'Sending...')
      try {
        // Create conversation
        const convId = [user.uid, product.sellerId].sort().join('_')
        const convRef = doc(db, 'conversations', convId)
        
        await setDoc(convRef, {
          id: convId,
          buyerId: user.uid,
          sellerId: product.sellerId,
          lastMessage: msgText,
          lastMessageTime: serverTimestamp(),
          productId: productId,
          productName: product.name,
          unreadCount: 1,
          updatedAt: serverTimestamp()
        })

        // Add message inside subcollection
        const msgRef = collection(db, `conversations/${convId}/messages`)
        await addDoc(msgRef, {
          senderId: user.uid,
          text: msgText,
          timestamp: serverTimestamp()
        })

        hideLoading(contactSubmitBtn)
        contactModal.classList.remove('modal--visible')
        showToast('Message sent! View in Messages tab.', 'success')
        setTimeout(() => redirect('/messages.html'), 1500)
      } catch (error) {
        hideLoading(contactSubmitBtn)
        showToast('Failed to send message.', 'danger')
        handleFirestoreError(error, OperationType.WRITE, `conversations`)
      }
    })
  }

  // 8. Wire Share button
  const shareBtn = document.getElementById('share-btn')
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({
          title: product?.name || 'ShopEasy Listing',
          text: `Check out this listing on ShopEasy: ${product?.name}`,
          url: window.location.href
        }).catch(() => {})
      } else {
        navigator.clipboard.writeText(window.location.href)
        showToast('Link copied to clipboard!', 'success')
      }
    })
  }

  // Initialize page load
  await loadProduct()
})
