/**
 * ShopEasy Seller Orders Fulfillment Page Control Module (Production-Grade)
 */

import { auth, db } from '../firebase-config.js'
import { initAuth } from '../auth.js'
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  updateDoc,
  addDoc,
  query, 
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { renderEmptyState, renderSkeleton } from '../ui.js'
import { formatMWK, showToast, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('orders-list-container')
  const tabs = document.querySelectorAll('.order-tab-item')
  const badgeNewCount = document.getElementById('badge-new-count')

  let currentUser = null
  let allOrders = []
  let filteredOrders = []
  let activeTab = 'new' // 'new', 'processing', 'ready', 'completed', 'cancelled', 'dispute'

  // 1. Authenticate and require seller role
  const authState = await initAuth({ requireAuth: true, requireRole: 'seller' })
  currentUser = authState.user

  try {
    // Check store registration
    const storeSnap = await getDoc(doc(db, 'stores', currentUser.uid))
    if (!storeSnap.exists() || storeSnap.data().status !== 'approved') {
      showToast('Store approval pending.', 'warning')
      redirect('/seller/setup.html')
      return
    }

    // Load orders
    await loadSellerOrders()
  } catch (error) {
    console.error('Failed to init orders page:', error)
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--danger);">Failed to authorize store session.</div>`
  }

  // Fetch all orders for this seller
  async function loadSellerOrders() {
    container.innerHTML = renderSkeleton(3)

    try {
      // Query all orders from Firestore (Locally filter by seller ID to bypass index setup limits)
      const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      
      allOrders = []
      let newCount = 0

      snapshot.forEach(docSnap => {
        const order = docSnap.data()
        order.id = docSnap.id
        
        // Check if at least one item is owned by this seller
        const hasMyProduct = order.items?.some(item => item.sellerId === currentUser.uid)
        
        if (hasMyProduct) {
          allOrders.push(order)
          
          // Count unread/new orders (status = pending or pending_payment)
          if (order.status === 'pending' || order.status === 'pending_payment') {
            newCount++
          }
        }
      })

      // Update unread count badge
      if (newCount > 0) {
        badgeNewCount.textContent = newCount
        badgeNewCount.style.display = 'flex'
      } else {
        badgeNewCount.style.display = 'none'
      }

      renderFilteredOrders()

    } catch (error) {
      console.error('Error fetching seller orders:', error)
      container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--danger);">Failed to load order queue.</div>`
      handleFirestoreError(error, OperationType.GET, 'orders')
    }
  }

  // Filter and render list based on activeTab
  function renderFilteredOrders() {
    container.innerHTML = ''

    filteredOrders = allOrders.filter(order => {
      const status = order.status || 'pending'
      
      if (activeTab === 'new') {
        return status === 'pending' || status === 'pending_payment' || status === 'paid'
      } else if (activeTab === 'processing') {
        return status === 'processing'
      } else if (activeTab === 'ready') {
        return status === 'ready' || status === 'dispatched' || status === 'shipped'
      } else if (activeTab === 'completed') {
        return status === 'completed' || status === 'received'
      } else if (activeTab === 'cancelled') {
        return status === 'cancelled' || status === 'refunded'
      } else if (activeTab === 'dispute') {
        return status === 'dispute_open' || status === 'return_requested' || status === 'disputed'
      }
      return false
    })

    if (filteredOrders.length === 0) {
      container.innerHTML = renderEmptyState(
        'shopping-bag',
        `No ${activeTab} orders found`,
        'Orders will appear here as soon as customers buy your items.',
        'View My Dashboard',
        '/seller/dashboard.html'
      )
      return
    }

    filteredOrders.forEach(order => {
      const card = document.createElement('div')
      card.className = 'order-full-card'

      // Calculate seller subtotal and seller items
      const myItems = order.items?.filter(item => item.sellerId === currentUser.uid) || []
      const sellerSubtotal = myItems.reduce((acc, item) => acc + (Number(item.price || 0) * Number(item.quantity || 1)), 0)

      // Buyer Info display
      const buyerFirstName = order.buyerName ? order.buyerName.split(' ')[0] : 'Buyer'
      const buyerPhoneLastFour = order.buyerPhone ? '***** ' + order.buyerPhone.slice(-4) : 'Private Phone'

      // Formatted Date
      let orderDateStr = 'Recent Date'
      if (order.createdAt) {
        const d = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt)
        orderDateStr = d.toLocaleDateString('en-MW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      }

      // Home delivery vs local pickup details
      const isHomeDelivery = order.deliveryType === 'home'
      const deliveryText = isHomeDelivery ? '🏠 Home Delivery' : '🚶 Store Pickup'

      // Thumbnails HTML
      const thumbnailsHtml = myItems.map(item => `
        <img class="thumbnail-box" src="${item.image || item.images?.[0] || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=60&q=80'}" alt="${item.name}" title="${item.name}">
      `).join('')

      // Status Labels
      let statusClass = 'status-active'
      let statusLabel = order.status?.toUpperCase() || 'PENDING'
      if (order.status === 'pending' || order.status === 'pending_payment') {
        statusClass = 'status-draft'
        statusLabel = 'NEW'
      } else if (order.status === 'ready') {
        statusClass = 'status-active'
        statusLabel = 'AWAITING DISPATCH / READY'
      } else if (order.status === 'cancelled') {
        statusClass = 'status-outofstock'
        statusLabel = 'CANCELLED'
      }

      card.innerHTML = `
        <div class="order-card-header">
          <span class="order-header-id">ORDER #${order.id.slice(-6).toUpperCase()}</span>
          <span class="order-header-date">${orderDateStr}</span>
        </div>
        
        <div class="order-card-body" id="body-${order.id}">
          <div class="buyer-info-row">
            <span class="buyer-name-lbl">${buyerFirstName} (${buyerPhoneLastFour})</span>
            <span class="order-type-badge">${deliveryText}</span>
          </div>
          
          <div class="ordered-thumbnails">
            ${thumbnailsHtml}
          </div>
          
          <div style="font-size: 0.78rem; color: var(--grey-700); margin-bottom: 8px;">
            ${myItems.map(item => `• ${item.name} (${item.quantity}x)`).join('<br>')}
          </div>

          <div class="order-totals-row">
            <div>
              <span style="font-size: 0.75rem; color: var(--grey-500); display: block;">My Payout</span>
              <span style="font-size: 0.9rem; font-weight: 850; color: var(--primary);">${formatMWK(sellerSubtotal)}</span>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 0.75rem; color: var(--grey-500); display: block;">Order Grand Total</span>
              <span style="font-size: 0.82rem; font-weight: 800; color: var(--secondary);">${formatMWK(order.total)}</span>
            </div>
          </div>
        </div>

        <!-- Dispute Box if relevant -->
        ${order.status === 'dispute_open' || order.status === 'return_requested' ? `
          <div class="dispute-panel">
            <div style="font-size: 0.7rem; font-weight: 850; color: var(--danger); margin-bottom: 4px;">⚠️ DISPUTE / RETURN FILED</div>
            <div style="font-size: 0.75rem; color: var(--grey-700); font-style: italic;">"Reason: ${order.disputeReason || 'Not provided'}"</div>
          </div>
        ` : ''}

        <!-- Actions Panel -->
        <div class="order-actions-bar" style="padding: 10px 12px; border-top: 1px solid var(--grey-100); display: flex; gap: 8px; justify-content: flex-end;">
          ${renderActionsForOrder(order)}
        </div>

        <!-- Collapsible Accordion details -->
        <div class="order-accordion-details" id="accordion-${order.id}">
          <h4 style="font-weight: 850; margin-bottom: 6px; color: var(--secondary); font-size: 0.8rem;">Delivery Details</h4>
          <p style="margin-bottom: 8px; line-height: 1.4;">
            <strong>Recipient:</strong> ${order.buyerName || 'Not provided'}<br>
            <strong>Contact Phone:</strong> ${order.buyerPhone || 'Not provided'}<br>
            <strong>Delivery Type:</strong> ${isHomeDelivery ? 'Doorstep Shipping' : 'Local Collection'}<br>
            ${isHomeDelivery ? `
              <strong>City:</strong> ${order.deliveryCity || 'Not specified'}<br>
              <strong>Area / Landmark:</strong> ${order.deliveryArea || 'Not specified'}<br>
              <strong>Address Note:</strong> ${order.deliveryAddress || 'None'}
            ` : `
              <strong>Pickup Area Selected:</strong> ${order.pickupArea || 'Seller location'}
            `}
          </p>

          <h4 style="font-weight: 850; margin-bottom: 4px; color: var(--secondary); font-size: 0.8rem;">Payment Status</h4>
          <p style="margin-bottom: 8px;">
            Method: <span style="text-transform: uppercase;">${order.paymentMethod || 'Awaiting Payment'}</span><br>
            Payment Status: <span style="font-weight: 700; color: #2E7D32;">${order.paymentStatus || 'Completed'}</span>
          </p>

          ${order.trackingNote ? `
            <div style="background: var(--white); padding: 8px; border-radius: 4px; border: 1px solid var(--grey-200);">
              <strong>Tracking Note / Instructions:</strong><br>
              <span style="font-style: italic;">"${order.trackingNote}"</span>
            </div>
          ` : ''}
        </div>
      `

      container.appendChild(card)

      // Add Accordion toggler on card body click
      document.getElementById(`body-${order.id}`).addEventListener('click', () => {
        const detailsEl = document.getElementById(`accordion-${order.id}`)
        detailsEl.classList.toggle('active')
      })

      // Attach actions button click listeners
      attachActionsListeners(order)
    })
  }

  // HTML render helpers for buttons based on state
  function renderActionsForOrder(order) {
    const status = order.status || 'pending'
    let buttons = ''

    if (status === 'pending' || status === 'pending_payment') {
      buttons += `<button class="btn btn--primary btn--sm" id="btn-accept-${order.id}" style="padding: 6px 12px; font-size: 0.72rem; font-weight: 850;">Accept & Process</button>`
    } else if (status === 'processing') {
      buttons += `
        <div style="width: 100%;">
          <div class="tracking-note-box" id="tracking-box-${order.id}">
            <label style="font-size: 0.7rem; font-weight: 800; display: block; margin-bottom: 4px;">Optional Tracking Note (e.g. tracking number, delivery time):</label>
            <input type="text" id="tracking-input-${order.id}" class="form-input" placeholder="e.g. Dispatching with local rider at 2 PM" style="padding: 6px; font-size: 0.75rem; margin-bottom: 8px;">
          </div>
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px;">
            <button class="btn btn--outline btn--sm" id="btn-track-toggle-${order.id}" style="padding: 6px 10px; font-size: 0.72rem; color: var(--grey-700); border-color: var(--grey-300);">+ Tracking Note</button>
            <button class="btn btn--primary btn--sm" id="btn-ready-${order.id}" style="padding: 6px 12px; font-size: 0.72rem; font-weight: 850;">Mark as Ready</button>
          </div>
        </div>
      `
    } else if (status === 'ready' || status === 'dispatched' || status === 'shipped') {
      buttons += `<span style="font-size: 0.75rem; font-weight: 800; color: var(--grey-600); margin-right: auto; align-self: center;">Awaiting buyer delivery confirmation</span>`
    } else if (status === 'completed' || status === 'received') {
      buttons += `<span style="font-size: 0.75rem; font-weight: 800; color: #2E7D32; margin-right: auto; align-self: center;">✅ Completed</span>`
    } else if (status === 'cancelled' || status === 'refunded') {
      buttons += `<span style="font-size: 0.75rem; font-weight: 800; color: var(--danger); margin-right: auto; align-self: center;">❌ Cancelled</span>`
    } else if (status === 'dispute_open' || status === 'return_requested' || status === 'disputed') {
      buttons += `
        <button class="btn btn--outline btn--sm" id="btn-dispute-reject-${order.id}" style="border-color: var(--danger); color: var(--danger); padding: 6px 10px; font-size: 0.72rem;">Reject Dispute</button>
        <button class="btn btn--primary btn--sm" id="btn-dispute-accept-${order.id}" style="padding: 6px 12px; font-size: 0.72rem;">Accept Return</button>
      `
    }

    // Always add Chat option
    buttons += `<button class="btn btn--outline btn--sm" id="btn-chat-${order.id}" style="padding: 6px 10px; font-size: 0.72rem; border-color: var(--grey-400); color: var(--grey-700);">💬 Contact</button>`

    return buttons
  }

  // Attach button action handlers
  function attachActionsListeners(order) {
    const orderId = order.id

    // Contact button listener
    const btnChat = document.getElementById(`btn-chat-${orderId}`)
    if (btnChat) {
      btnChat.onclick = () => {
        if (!order.buyerId) {
          showToast('Could not find buyer account.', 'danger')
          return
        }
        redirect(`/messages.html?uid=${order.buyerId}`)
      }
    }

    // Accept order listener
    const btnAccept = document.getElementById(`btn-accept-${orderId}`)
    if (btnAccept) {
      btnAccept.onclick = async () => {
        try {
          await updateDoc(doc(db, 'orders', orderId), {
            status: 'processing',
            acceptedAt: serverTimestamp()
          })

          // Notify buyer
          await addDoc(collection(db, 'notifications'), {
            userId: order.buyerId,
            type: 'order_update',
            title: 'Order accepted! 📦',
            body: `Your order is being processed by the seller.`,
            orderId: orderId,
            read: false,
            createdAt: serverTimestamp()
          })

          showToast('Order accepted and moved to processing.', 'success')
          await loadSellerOrders()
        } catch (err) {
          console.error(err)
          showToast('Could not accept order.', 'danger')
        }
      }
    }

    // Toggle Tracking Input visibility
    const btnTrackToggle = document.getElementById(`btn-track-toggle-${orderId}`)
    if (btnTrackToggle) {
      btnTrackToggle.onclick = () => {
        const tBox = document.getElementById(`tracking-box-${orderId}`)
        tBox.classList.toggle('active')
      }
    }

    // Mark as Ready / Dispatched listener
    const btnReady = document.getElementById(`btn-ready-${orderId}`)
    if (btnReady) {
      btnReady.onclick = async () => {
        const noteInput = document.getElementById(`tracking-input-${orderId}`)
        const trackingNoteVal = noteInput ? noteInput.value.trim() : ''

        try {
          await updateDoc(doc(db, 'orders', orderId), {
            status: 'ready',
            readyAt: serverTimestamp(),
            trackingNote: trackingNoteVal || null
          })

          // Notify buyer
          await addDoc(collection(db, 'notifications'), {
            userId: order.buyerId,
            type: 'order_ready',
            title: 'Your order is ready! 🎉',
            body: order.deliveryType === 'home' 
              ? `Expect delivery soon. Note: ${trackingNoteVal || 'No additional notes'}`
              : `Your order is ready for collection at the store pickup area.`,
            orderId: orderId,
            read: false,
            createdAt: serverTimestamp()
          })

          showToast('Order marked as ready and buyer notified!', 'success')
          await loadSellerOrders()
        } catch (err) {
          console.error(err)
          showToast('Could not transition order status.', 'danger')
        }
      }
    }

    // Accept Return (Dispute flow)
    const btnDisputeAccept = document.getElementById(`btn-dispute-accept-${orderId}`)
    if (btnDisputeAccept) {
      btnDisputeAccept.onclick = async () => {
        if (confirm('Are you sure you want to accept this return and refund the buyer?')) {
          try {
            await updateDoc(doc(db, 'orders', orderId), {
              status: 'refunded',
              refundedAt: serverTimestamp()
            })

            await addDoc(collection(db, 'notifications'), {
              userId: order.buyerId,
              type: 'dispute_refunded',
              title: 'Return accepted! 💵',
              body: `The seller has approved your return request. A refund has been issued.`,
              orderId: orderId,
              read: false,
              createdAt: serverTimestamp()
            })

            showToast('Return accepted and refund complete.', 'success')
            await loadSellerOrders()
          } catch (err) {
            console.error(err)
            showToast('Could not approve return.', 'danger')
          }
        }
      }
    }

    // Reject/Dispute (Dispute flow)
    const btnDisputeReject = document.getElementById(`btn-dispute-reject-${orderId}`)
    if (btnDisputeReject) {
      btnDisputeReject.onclick = async () => {
        if (confirm('Reject this dispute? This will escalate the claim to ShopEasy support.')) {
          try {
            await updateDoc(doc(db, 'orders', orderId), {
              status: 'disputed',
              escalatedAt: serverTimestamp()
            })

            await addDoc(collection(db, 'notifications'), {
              userId: order.buyerId,
              type: 'dispute_escalated',
              title: 'Dispute escalated ⚖️',
              body: `The seller rejected your return request. ShopEasy support is reviewing the case.`,
              orderId: orderId,
              read: false,
              createdAt: serverTimestamp()
            })

            showToast('Dispute escalated to support.', 'info')
            await loadSellerOrders()
          } catch (err) {
            console.error(err)
            showToast('Could not escalate dispute.', 'danger')
          }
        }
      }
    }
  }

  // Tab switching handler
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      activeTab = tab.dataset.tab
      renderFilteredOrders()
    })
  })
})
