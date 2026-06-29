/**
 * ShopEasy Order Detail Page Control Module
 */

import { auth, db } from '../firebase-config.js'
import { doc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { injectHeaderAndNav, renderErrorState } from '../ui.js'
import { getUrlParam, formatMWK, showToast, showLoading, hideLoading, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  // Inject navigation
  injectHeaderAndNav('account')

  const orderId = getUrlParam('id')
  const container = document.getElementById('order-details-content')

  if (!orderId) {
    container.innerHTML = renderErrorState('Invalid Order Reference.')
    return
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      container.innerHTML = renderErrorState('Please sign in to view order details.')
      return
    }

    try {
      const orderRef = doc(db, 'orders', orderId)
      const docSnap = await getDoc(orderRef)
      
      if (!docSnap.exists()) {
        container.innerHTML = renderErrorState('Order does not exist or has been removed.')
        return
      }

      const order = docSnap.data()
      order.id = docSnap.id

      // Ensure buyer belongs to the order
      if (order.buyerId !== user.uid) {
        container.innerHTML = renderErrorState('Unauthorized access to this order.')
        return
      }

      renderOrderDetails(order)
    } catch (error) {
      container.innerHTML = renderErrorState('Failed to load order details.')
      handleFirestoreError(error, OperationType.GET, `orders/${orderId}`)
    }
  })

  // Render Order Details HTML
  const renderOrderDetails = (order) => {
    const formattedDate = order.createdAt?.toDate 
      ? order.createdAt.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Recently'

    // Status mapping
    let badgeClass = 'badge--grey'
    let statusText = order.status || 'pending'
    if (statusText === 'pending') badgeClass = 'badge--warning'
    if (statusText === 'processing') badgeClass = 'badge--warning'
    if (statusText === 'ready') badgeClass = 'badge--primary'
    if (statusText === 'completed') badgeClass = 'badge--success'
    if (statusText === 'cancelled') badgeClass = 'badge--danger'

    const delivery = order.deliveryDetails || {}
    const isPending = order.status === 'pending'

    container.innerHTML = `
      <!-- Status Card -->
      <div class="card" style="padding: 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--grey-600); text-transform: uppercase;">Order Identifier</span>
          <span class="badge ${badgeClass}">${statusText.toUpperCase()}</span>
        </div>
        <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--secondary);">#${order.id.toUpperCase()}</h3>
        <div style="font-size: 0.75rem; color: var(--grey-400);">${formattedDate}</div>
      </div>

      <!-- Items Ordered -->
      <section class="section" style="margin-bottom: 16px;">
        <h3 class="checkout-section-title">Items Ordered</h3>
        <div class="card" style="padding: 12px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
          ${order.items?.map(item => `
            <div class="breakdown-row" style="align-items: center;">
              <img src="${item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'}" alt="${item.name}" style="width: 42px; height: 42px; object-fit: cover; border-radius: var(--radius-sm); margin-right: 8px;">
              <span class="breakdown-item-name" style="font-size: 0.8rem;">${item.name}</span>
              <span class="breakdown-item-qty" style="font-size: 0.8rem;">x${item.quantity}</span>
              <span class="breakdown-item-price" style="font-size: 0.8rem;">${formatMWK(item.price * item.quantity)}</span>
            </div>
          `).join('')}
          <div style="border-top: 1px dashed var(--grey-200); margin: 6px 0;"></div>
          <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 0.9rem; color: var(--secondary);">
            <span>Order Grand Total</span>
            <span style="color: var(--primary); font-weight: 800;">${formatMWK(order.totalPrice)}</span>
          </div>
        </div>
      </section>

      <!-- Delivery and Payment Information -->
      <section class="section" style="margin-bottom: 24px;">
        <h3 class="checkout-section-title">Delivery & Payment</h3>
        <div class="card" style="padding: 12px; margin-top: 8px; display: flex; flex-direction: column; gap: 10px; font-size: 0.8rem; color: var(--grey-800);">
          <div>
            <div style="font-weight: 700; color: var(--secondary); margin-bottom: 2px;">Recipient</div>
            <div>${delivery.name || order.buyerName || 'Local Buyer'}</div>
            <div>${delivery.phone || order.buyerPhone || ''}</div>
          </div>
          <div style="border-top: 1px solid var(--grey-100); padding-top: 6px;">
            <div style="font-weight: 700; color: var(--secondary); margin-bottom: 2px;">Address Details</div>
            <div>${delivery.address || ''}, ${delivery.city || 'Malawi'}</div>
          </div>
          <div style="border-top: 1px solid var(--grey-100); padding-top: 6px;">
            <div style="font-weight: 700; color: var(--secondary); margin-bottom: 2px;">Payment Details</div>
            <div>Method: ${order.paymentMethod?.toUpperCase() || 'COD'}</div>
            ${order.momoNumber ? `<div>Momo No: ${order.momoNumber}</div>` : ''}
            <div>Payment status: <span style="font-weight: 600; color: var(--primary);">${(order.paymentStatus || 'Pending').toUpperCase()}</span></div>
          </div>
        </div>
      </section>

      <!-- Cancel Action Button -->
      ${isPending ? `
        <button class="btn btn--outline btn--full" id="cancel-order-btn" style="border-color: var(--danger); color: var(--danger);">
          Cancel This Order
        </button>
      ` : ''}
    `

    // Hook Cancel Order Button
    if (isPending) {
      const cancelBtn = document.getElementById('cancel-order-btn')
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
          if (confirm('Are you sure you want to cancel this order?')) {
            showLoading(cancelBtn, 'Cancelling...')
            try {
              await updateDoc(doc(db, 'orders', order.id), {
                status: 'cancelled',
                updatedAt: serverTimestamp()
              })
              showToast('Order cancelled successfully.', 'success')
              location.reload()
            } catch (error) {
              hideLoading(cancelBtn)
              showToast('Failed to cancel order.', 'danger')
              handleFirestoreError(error, OperationType.WRITE, `orders/${order.id}`)
            }
          }
        })
      }
    }
  }
})
