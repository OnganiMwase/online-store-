/**
 * ShopEasy Followed Stores Page Control Module
 */

import { auth, db } from '../firebase-config.js'
import { collection, getDocs, doc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { injectHeaderAndNav, renderEmptyState, renderErrorState } from '../ui.js'
import { redirect, showToast, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  // Inject navigation
  injectHeaderAndNav('account')

  const container = document.getElementById('followed-stores-container')

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirect('/login.html')
      return
    }

    try {
      const qSnap = await getDocs(collection(db, `followedStores/${user.uid}/stores`))
      container.innerHTML = ''

      if (qSnap.empty) {
        container.innerHTML = renderEmptyState(
          'store',
          'No Followed Stores',
          'Follow sellers in Malawi to get real-time notifications about their fresh arrivals.',
          'Browse Shop',
          '/shop.html'
        )
        return
      }

      qSnap.forEach(snapDoc => {
        const store = snapDoc.data()
        store.id = snapDoc.id
        container.appendChild(renderStoreRow(store, user.uid))
      })

    } catch (error) {
      container.innerHTML = renderErrorState('Failed to load followed stores.')
      handleFirestoreError(error, OperationType.LIST, `followedStores/${user.uid}/stores`)
    }
  })

  // Helper row renderer
  const renderStoreRow = (store, uid) => {
    const row = document.createElement('div')
    row.className = 'card'
    row.style.cssText = 'padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px;'

    const avatarSeed = encodeURIComponent(store.storeName || 'S')
    const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${avatarSeed}`

    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; flex: 1; cursor: pointer;" class="store-info-btn">
        <img src="${avatarUrl}" alt="Avatar" style="width: 44px; height: 44px; border-radius: 50%; background-color: var(--grey-200); object-fit: cover;">
        <div>
          <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--secondary);">${store.storeName}</h4>
          <span style="font-size: 0.75rem; color: var(--grey-600);">Local Seller Store</span>
        </div>
      </div>
      <button class="btn btn--outline btn--sm unfollow-btn" style="border-color: var(--grey-300); color: var(--grey-600); padding: 4px 10px; font-size: 0.75rem;">
        Unfollow
      </button>
    `

    // Row clicks go to store details
    row.querySelector('.store-info-btn').addEventListener('click', () => {
      redirect(`/shop.html?sellerId=${store.storeId}`)
    })

    // Unfollow click
    const unfollowBtn = row.querySelector('.unfollow-btn')
    unfollowBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (confirm(`Unfollow ${store.storeName}?`)) {
        try {
          await deleteDoc(doc(db, `followedStores/${uid}/stores`, store.storeId))
          showToast('Unfollowed successfully.', 'success')
          row.remove()
          if (container.children.length === 0) {
            location.reload()
          }
        } catch (error) {
          showToast('Could not unfollow store.', 'danger')
        }
      }
    })

    return row
  }
})
