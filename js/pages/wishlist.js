/**
 * ShopEasy Saved Wishlist Control Module
 */

import { auth, db } from '../firebase-config.js'
import { collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { injectHeaderAndNav, renderProductCard, renderSkeleton, renderEmptyState, renderErrorState } from '../ui.js'
import { redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  // Inject navigation
  injectHeaderAndNav('account')

  const gridEl = document.getElementById('wishlist-products-grid')

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirect('/login.html')
      return
    }

    gridEl.innerHTML = renderSkeleton(4)

    try {
      const q = query(
        collection(db, `wishlists/${user.uid}/items`),
        orderBy('savedAt', 'desc')
      )
      const snapshot = await getDocs(q)
      gridEl.innerHTML = ''

      if (snapshot.empty) {
        gridEl.innerHTML = `
          <div style="grid-column: 1 / -1; width: 100%;">
            ${renderEmptyState(
              'heart',
              'No Saved Items',
              'Explore standard products and tap the Heart icon to add items to your personal wishlist.',
              'Go Shopping',
              '/shop.html'
            )}
          </div>
        `
        return
      }

      snapshot.forEach(docSnap => {
        const item = docSnap.data()
        // Map saved item format back to standard product structure
        const product = {
          id: docSnap.id,
          name: item.name,
          price: item.price,
          image: item.image,
          city: item.city || 'Malawi'
        }
        gridEl.innerHTML += renderProductCard(product)
      })

    } catch (error) {
      gridEl.innerHTML = renderErrorState('Failed to load wishlist. Please pull down to refresh.')
      handleFirestoreError(error, OperationType.LIST, `wishlists/${user.uid}/items`)
    }
  })
})
