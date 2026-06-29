/**
 * ShopEasy Orders List Page Control Module
 */

import { auth, db } from '../firebase-config.js'
import { 
  collection, 
  getDocs, 
  query, 
  where,
  orderBy 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { injectHeaderAndNav, renderEmptyState, renderErrorState } from '../ui.js'
import { formatMWK, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  // Inject common UI Header and Bottom Nav
  injectHeaderAndNav('account')

  const container = document.getElementById('orders-list')

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirect('/login.html')
      return
    }

    try {
      const q = query(
        collection(db, 'orders'),
        where('buyerId', '==', user.uid),
        orderBy('createdAt', 'desc')
      )
      const snapshot = await getDocs(q)
      container.innerHTML = ''

      if (snapshot.empty) {
        container.innerHTML = renderEmptyState(
          'package',
          'No Orders Yet',
          'You have not placed any orders. Start shopping today!',
          'Browse Shop',
          '/shop.html'
        )
        return
      }

      snapshot.forEach(doc => {
        const order = doc.data()
        order.id = doc.id
        container.appendChild(renderOrderCard(order))
      })

    } catch (error) {
      container.innerHTML = renderErrorState('Unable to load orders. Please pull to refresh.')
      handleFirestoreError(error, OperationType.LIST, 'orders')
    }
  })

  // Helper to render an individual order summary item card
  const renderOrderCard = (order) => {
    const card = document.createElement('div')
    card.className = 'order-item-card'
    
    const formattedDate = order.createdAt?.toDate 
      ? order.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recently'

    const itemCount = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 1
    const firstItem = order.items?.[0] || { name: 'Marketplace Order', image: '' }
    const firstImg = firstItem.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'

    // Map status classes
    let badgeClass = 'badge--grey'
    let statusText = order.status || 'pending'
    if (statusText === 'pending') badgeClass = 'badge--warning'
    if (statusText === 'processing') badgeClass = 'badge--warning'
    if (statusText === 'ready') badgeClass = 'badge--primary'
    if (statusText === 'completed') badgeClass = 'badge--success'
    if (statusText === 'cancelled') badgeClass = 'badge--danger'

    card.innerHTML = `
      <div class="order-item-card__header">
        <span class="order-item-card__id">#${order.id.substring(0, 8).toUpperCase()}</span>
        <span class="order-item-card__date">${formattedDate}</span>
      </div>
      <div class="order-item-card__body">
        <img class="order-item-card__img" src="${firstImg}" alt="Product">
        <div class="order-item-card__info">
          <h4 class="order-item-card__title">
            ${firstItem.name} 
            ${order.items?.length > 1 ? `<span>+ ${order.items.length - 1} more item(s)</span>` : ''}
          </h4>
          <p class="order-item-card__meta">${itemCount} item${itemCount === 1 ? '' : 's'}</p>
        </div>
      </div>
      <div class="order-item-card__footer">
        <span class="order-item-card__price">${formatMWK(order.totalPrice)}</span>
        <span class="badge ${badgeClass}">${statusText.toUpperCase()}</span>
      </div>
    `

    // Click handler to open order detail page
    card.addEventListener('click', () => {
      redirect(`/order-detail.html?id=${order.id}`)
    })

    return card
  }
})
