/**
 * ShopEasy Admin Portal - Global Orders & Dispute Resolution Module
 */

import { db } from '../firebase-config.js'
import { 
  collection, query, where, getDocs, getDoc, doc, updateDoc, addDoc, onSnapshot, orderBy, limit, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { initAuth, currentUser } from '../auth.js'
import { formatMWK, formatDate, showToast } from '../utils.js'

// Global states
let allOrders = []
let filteredOrders = []
let activeFilters = {
  status: 'all',
  dateStart: '',
  dateEnd: '',
  city: 'all'
}
let currentPage = 1
const ORDERS_PER_PAGE = 20
let selectedOrderForDispute = null

// Sync navigation badges
function setupNavBadges() {
  const qSellers = query(collection(db, 'stores'), where('status', '==', 'pending_approval'))
  onSnapshot(qSellers, (snap) => {
    const badge = document.getElementById('badge-pending-sellers')
    if (badge) {
      if (snap.size > 0) {
        badge.textContent = snap.size
        badge.style.display = 'inline-flex'
      } else {
        badge.style.display = 'none'
      }
    }
  })

  const qDisputes = query(collection(db, 'disputes'), where('status', '==', 'open'))
  onSnapshot(qDisputes, (snap) => {
    const badge = document.getElementById('badge-disputes')
    if (badge) {
      if (snap.size > 0) {
        badge.textContent = snap.size
        badge.style.display = 'inline-flex'
      } else {
        badge.style.display = 'none'
      }
    }
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  const authState = await initAuth({ requireAuth: true, requireRole: 'admin' })
  if (!authState || !authState.user) return

  // Populate admin info
  const adminNameEl = document.getElementById('admin-user-name')
  const adminAvatarEl = document.getElementById('admin-user-avatar')
  if (adminNameEl && authState.userData) {
    adminNameEl.textContent = authState.userData.name || 'Administrator'
  }
  if (adminAvatarEl && authState.userData?.avatar) {
    adminAvatarEl.src = authState.userData.avatar
  }

  // Sync badges
  setupNavBadges()

  // Setup listeners
  setupEventListeners()

  // Load orders stream
  loadOrdersStream()
})

function setupEventListeners() {
  // Clear filters
  const btnClear = document.getElementById('btn-clear-filters')
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      document.getElementById('filter-status').value = 'all'
      document.getElementById('filter-date-start').value = ''
      document.getElementById('filter-date-end').value = ''
      document.getElementById('filter-city').value = 'all'

      activeFilters = { status: 'all', dateStart: '', dateEnd: '', city: 'all' }
      currentPage = 1
      applyFiltersAndRender()
      showToast('Filters cleared.', 'success')
    })
  }

  // Filter bindings
  const statusSelect = document.getElementById('filter-status')
  const dateStartInput = document.getElementById('filter-date-start')
  const dateEndInput = document.getElementById('filter-date-end')
  const citySelect = document.getElementById('filter-city')

  const triggerFilterUpdate = () => {
    activeFilters = {
      status: statusSelect.value,
      dateStart: dateStartInput.value,
      dateEnd: dateEndInput.value,
      city: citySelect.value
    }
    currentPage = 1
    applyFiltersAndRender()
  }

  if (statusSelect) statusSelect.addEventListener('change', triggerFilterUpdate)
  if (dateStartInput) dateStartInput.addEventListener('input', triggerFilterUpdate)
  if (dateEndInput) dateEndInput.addEventListener('input', triggerFilterUpdate)
  if (citySelect) citySelect.addEventListener('change', triggerFilterUpdate)

  // Pagination buttons
  const btnPrev = document.getElementById('btn-prev-page')
  const btnNext = document.getElementById('btn-next-page')
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--
        renderOrdersFeed()
      }
    })
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const maxPage = Math.ceil(filteredOrders.length / ORDERS_PER_PAGE)
      if (currentPage < maxPage) {
        currentPage++
        renderOrdersFeed()
      }
    })
  }

  // Dispute modal close
  const disputeClose = document.getElementById('dispute-modal-close')
  if (disputeClose) disputeClose.addEventListener('click', closeDisputePanel)
}

function loadOrdersStream() {
  const container = document.getElementById('global-orders-container')
  const ordersRef = collection(db, 'orders')
  const q = query(ordersRef, orderBy('createdAt', 'desc'))

  onSnapshot(q, (snapshot) => {
    allOrders = []
    snapshot.forEach(docSnap => {
      allOrders.push({ id: docSnap.id, ...docSnap.data() })
    })

    applyFiltersAndRender()
  }, (err) => {
    console.error('Error listening to global orders:', err)
    if (container) {
      container.innerHTML = `<p style="text-align: center; color: var(--danger); padding: 32px;">Failed to load order stream.</p>`
    }
  })
}

function applyFiltersAndRender() {
  filteredOrders = allOrders.filter(order => {
    // 1. Status Filter
    if (activeFilters.status !== 'all' && order.status !== activeFilters.status) return false

    // 2. City Filter
    if (activeFilters.city !== 'all' && order.city !== activeFilters.city) return false

    // 3. Date Range Filter
    const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0)
    
    if (activeFilters.dateStart) {
      const startBound = new Date(activeFilters.dateStart)
      startBound.setHours(0, 0, 0, 0)
      if (orderDate < startBound) return false
    }

    if (activeFilters.dateEnd) {
      const endBound = new Date(activeFilters.dateEnd)
      endBound.setHours(23, 59, 59, 999)
      if (orderDate > endBound) return false
    }

    return true
  })

  renderOrdersFeed()
}

function renderOrdersFeed() {
  const container = document.getElementById('global-orders-container')
  if (!container) return

  if (filteredOrders.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--grey-600); padding: 40px; background-color: var(--grey-100); border-radius: 8px;">No matching orders found matching criteria.</p>`
    document.getElementById('pagination-info').textContent = 'Showing 0-0 of 0 orders'
    document.getElementById('btn-prev-page').disabled = true
    document.getElementById('btn-next-page').disabled = true
    return
  }

  const startIdx = (currentPage - 1) * ORDERS_PER_PAGE
  const endIdx = Math.min(startIdx + ORDERS_PER_PAGE, filteredOrders.length)
  const paginatedList = filteredOrders.slice(startIdx, endIdx)

  container.innerHTML = ''
  paginatedList.forEach(order => {
    const card = document.createElement('div')
    
    const isDisputed = order.status === 'dispute_open'
    // Style disputed cards prominently as requested!
    card.className = isDisputed ? 'admin-card dispute-order-card' : 'admin-card'
    if (isDisputed) {
      card.style.borderLeft = '4px solid var(--warning)'
    }

    const storeName = order.storeName || order.items?.[0]?.storeName || 'ShopEasy Seller'
    const dateText = order.createdAt ? formatDate(order.createdAt) : 'N/A'
    const statusClass = getStatusBadgeClass(order.status)
    const statusText = order.status ? order.status.toUpperCase().replace('_', ' ') : 'PENDING'

    // Build items list preview
    let itemsPreviewHtml = ''
    if (order.items && order.items.length > 0) {
      itemsPreviewHtml = `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px; border-top: 1px solid var(--grey-200); padding-top: 8px;">
          ${order.items.map(item => `
            <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--grey-800);">
              <span>${item.name || 'Unnamed Product'} <strong>x${item.quantity || 1}</strong></span>
              <span>${formatMWK((item.price || 0) * (item.quantity || 1))}</span>
            </div>
          `).join('')}
        </div>
      `
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
        <div>
          <span style="font-size: 0.72rem; font-weight: 700; color: var(--grey-600);">ORDER ID: #${order.id.substring(0, 10).toUpperCase()}</span>
          <h3 style="font-weight: 800; font-size: 1.05rem; color: var(--secondary); margin-top: 2px;">
            Store: ${storeName}
          </h3>
          <p style="font-size: 0.78rem; color: var(--grey-600); margin-top: 2px;">
            Buyer: <strong>${order.buyerName || 'Malawi Buyer'}</strong> • Phone: <strong>${order.buyerPhone || 'N/A'}</strong>
          </p>
          <p style="font-size: 0.72rem; color: var(--grey-600);">
            Location: ${order.city || 'Malawi'} • Date: ${dateText} • Method: <strong>${order.deliveryMethod || 'Pickup'}</strong>
          </p>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <span class="badge ${statusClass}">${statusText}</span>
          <span style="font-weight: 800; font-size: 1.1rem; color: var(--primary); margin-top: 4px;">${formatMWK(order.total || 0)}</span>
        </div>
      </div>

      ${itemsPreviewHtml}

      ${isDisputed ? `
        <div class="dispute-banner">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span>⚠️</span>
            <strong>DISPUTE OPENED BY BUYER:</strong> Review claim immediately.
          </div>
          <button class="btn btn--warning btn--sm" id="btn-resolve-dispute-${order.id}" style="font-size: 0.72rem; padding: 4px 10px; background-color: #E65100; border-color: #E65100; color: #FFFFFF; font-weight: 700;">
            Review Claim
          </button>
        </div>
      ` : ''}
    `

    container.appendChild(card)

    // Bind dispute review button
    if (isDisputed) {
      const btn = document.getElementById(`btn-resolve-dispute-${order.id}`)
      if (btn) {
        btn.addEventListener('click', () => openDisputePanel(order))
      }
    }
  })

  // Update pagination info
  document.getElementById('pagination-info').textContent = `Showing ${startIdx + 1}-${endIdx} of ${filteredOrders.length} orders`
  document.getElementById('btn-prev-page').disabled = currentPage === 1
  document.getElementById('btn-next-page').disabled = endIdx >= filteredOrders.length
}

async function openDisputePanel(order) {
  selectedOrderForDispute = order
  const modalBody = document.getElementById('dispute-modal-body')
  if (!modalBody) return

  modalBody.innerHTML = '<p style="text-align: center; color: var(--grey-600); padding: 32px;">Fetching claim dossier...</p>'
  document.getElementById('dispute-modal').classList.add('modal--visible')

  try {
    // Read dispute document (shares orderId as its docId)
    const disputeSnap = await getDoc(doc(db, 'disputes', order.id))
    if (!disputeSnap.exists()) {
      modalBody.innerHTML = `
        <p style="text-align: center; color: var(--danger); padding: 24px; font-weight: 700;">
          Claim details not found. The dispute file might have been archived.
        </p>
      `
      return
    }

    const claim = disputeSnap.data()
    const pImage = order.items?.[0]?.image || order.items?.[0]?.images?.[0] || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'

    modalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        
        <!-- Claim Dossier -->
        <div style="background-color: #FFEBEE; border-radius: 8px; padding: 12px; border-left: 4px solid var(--danger);">
          <strong style="color: var(--danger); font-size: 0.72rem; letter-spacing: 0.5px; text-transform: uppercase; display: block; margin-bottom: 6px;">🛡️ BUYER COMPLAINT</strong>
          <div style="font-size: 0.85rem; font-weight: 800; color: var(--secondary);">Reason: ${claim.reason || 'N/A'}</div>
          <div style="font-size: 0.8rem; color: var(--grey-800); margin-top: 6px; line-height: 1.45;">
            "<sup>"</sup> ${claim.description || 'No explanation provided.'} <sub>"</sub>
          </div>
        </div>

        <!-- Evidence Images -->
        ${claim.photos && claim.photos.length > 0 ? `
          <div>
            <span style="font-weight: 700; font-size: 0.78rem; color: var(--grey-600); display: block; margin-bottom: 6px;">SUBMITTED PHOTO EVIDENCE:</span>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${claim.photos.map(url => `
                <a href="${url}" target="_blank" style="display:block; border-radius: 4px; overflow:hidden; border: 1.5px solid var(--grey-300);">
                  <img src="${url}" alt="Evidence" style="width: 80px; height: 80px; object-fit: cover;">
                </a>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Order details -->
        <div style="border-top: 1px solid var(--grey-200); padding-top: 12px;">
          <strong style="font-size: 0.72rem; text-transform: uppercase; color: var(--grey-600); display: block; margin-bottom: 6px;">TRANSACTION METADATA</strong>
          <div style="display: flex; align-items: center; gap: 10px; background-color: var(--grey-100); padding: 8px; border-radius: 6px;">
            <img src="${pImage}" alt="Product" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;">
            <div style="flex: 1;">
              <div style="font-weight: 700; font-size: 0.8rem; color: var(--secondary);">${order.items?.[0]?.name || 'Unnamed Product'}</div>
              <div style="font-size: 0.72rem; color: var(--grey-600);">Store: ${order.storeName || 'ShopEasy Seller'} • Qty: ${order.items?.[0]?.quantity || 1}</div>
            </div>
            <div style="font-weight: 800; color: var(--secondary); font-size: 0.88rem;">${formatMWK(order.total || 0)}</div>
          </div>
        </div>

        <!-- Contact Dossier -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border-top: 1px solid var(--grey-200); padding-top: 12px; font-size: 0.78rem;">
          <div>
            <strong style="display:block; color: var(--grey-600); margin-bottom: 2px;">BUYER DOSSIER:</strong>
            ${claim.buyerName || 'Malawi Buyer'}<br>
            Phone: ${claim.buyerPhone || 'N/A'}
          </div>
          <div>
            <strong style="display:block; color: var(--grey-600); margin-bottom: 2px;">SELLER DOSSIER:</strong>
            ${claim.storeName || 'ShopEasy Seller'}<br>
            City: ${order.city || 'Malawi'}
          </div>
        </div>

        <!-- Decision Resolution Input -->
        <div style="border-top: 1.5px solid var(--grey-200); padding-top: 14px; margin-top: 4px;">
          <div class="form-group">
            <label for="resolution-verdict" style="font-weight: 700;">Resolution Verdict Explanation *</label>
            <textarea id="resolution-verdict" placeholder="Specify the review outcome. Explain why you side with the buyer or seller. This will be sent as a direct system notification to both parties." rows="3" required></textarea>
            <span class="field-error-msg" id="resolution-verdict-error" style="display: none; color: var(--danger); font-size: 0.72rem; font-weight: 700; margin-top: 4px;">Verdict explanation is required.</span>
          </div>
        </div>

        <!-- Decision CTA Buttons -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px;">
          <button class="btn btn--danger" id="btn-side-buyer" style="padding: 10px; font-size: 0.78rem; font-weight: 700;">
            💸 Side with Buyer (Refund)
          </button>
          <button class="btn btn--success" id="btn-side-seller" style="padding: 10px; font-size: 0.78rem; font-weight: 700;">
            🤝 Side with Seller (Complete)
          </button>
        </div>

      </div>
    `

    // Bind resolution events
    document.getElementById('btn-side-buyer').addEventListener('click', () => resolveDispute('buyer'))
    document.getElementById('btn-side-seller').addEventListener('click', () => resolveDispute('seller'))

  } catch (err) {
    console.error('Error fetching dispute claim file:', err)
    modalBody.innerHTML = `<p style="text-align: center; color: var(--danger); font-size: 0.8rem; padding: 24px;">Failed to read claim dossiers.</p>`
  }
}

function closeDisputePanel() {
  document.getElementById('dispute-modal').classList.remove('modal--visible')
  selectedOrderForDispute = null
}

async function resolveDispute(winner) {
  if (!selectedOrderForDispute) return

  const verdictInput = document.getElementById('resolution-verdict')
  const verdictText = verdictInput.value.trim()
  const errorMsg = document.getElementById('resolution-verdict-error')

  if (!verdictText) {
    errorMsg.style.display = 'block'
    return
  }
  errorMsg.style.display = 'none'

  const buyerBtn = document.getElementById('btn-side-buyer')
  const sellerBtn = document.getElementById('btn-side-seller')

  buyerBtn.disabled = true
  sellerBtn.disabled = true

  const sellerId = selectedOrderForDispute.items?.[0]?.sellerId || ''
  const storeName = selectedOrderForDispute.storeName || selectedOrderForDispute.items?.[0]?.storeName || 'ShopEasy Seller'

  try {
    if (winner === 'buyer') {
      // SIDE WITH BUYER (Refund Approved)
      // 1. Update dispute document status
      await updateDoc(doc(db, 'disputes', selectedOrderForDispute.id), {
        status: 'resolved_buyer',
        verdict: verdictText,
        resolvedAt: serverTimestamp(),
        resolvedBy: currentUser.uid
      })

      // 2. Update order status to refund_approved
      await updateDoc(doc(db, 'orders', selectedOrderForDispute.id), {
        status: 'refund_approved',
        updatedAt: serverTimestamp()
      })

      // 3. Notify Buyer
      await addDoc(collection(db, 'notifications'), {
        recipientId: selectedOrderForDispute.buyerId,
        userId: selectedOrderForDispute.buyerId,
        type: 'dispute_resolved_buyer',
        title: '💸 Refund Approved for Order Dispute',
        body: `We reviewed your dispute for Order #${selectedOrderForDispute.id.substring(0,8).toUpperCase()}. Verdict: ${verdictText}. A refund of ${formatMWK(selectedOrderForDispute.total || 0)} will be processed via Paychangu in 3–5 business days.`,
        read: false,
        createdAt: serverTimestamp()
      })

      // 4. Notify Seller
      if (sellerId) {
        await addDoc(collection(db, 'notifications'), {
          recipientId: sellerId,
          userId: sellerId,
          type: 'dispute_resolved_seller',
          title: '⚠️ Order Dispute Resolved (Buyer Refunded)',
          body: `The administration reviewed the dispute for Order #${selectedOrderForDispute.id.substring(0,8).toUpperCase()} and sided with the buyer. Verdict: ${verdictText}. The order amount has been refunded to the buyer and deducted from your eligible payouts.`,
          read: false,
          createdAt: serverTimestamp()
        })
      }

      // 5. Log to adminLogs
      await addDoc(collection(db, 'adminLogs'), {
        adminUid: currentUser.uid,
        adminName: currentUser.displayName || 'ShopEasy Admin',
        action: 'resolve_dispute_buyer',
        targetId: selectedOrderForDispute.id,
        targetName: storeName,
        details: `Dispute resolved siding with Buyer. Refund approved. Verdict: ${verdictText}`,
        createdAt: serverTimestamp()
      })

      showToast('Dispute resolved: Refund approved for Buyer.', 'success')

    } else {
      // SIDE WITH SELLER (Order Completed)
      // 1. Update dispute document status
      await updateDoc(doc(db, 'disputes', selectedOrderForDispute.id), {
        status: 'resolved_seller',
        verdict: verdictText,
        resolvedAt: serverTimestamp(),
        resolvedBy: currentUser.uid
      })

      // 2. Update order status to completed
      await updateDoc(doc(db, 'orders', selectedOrderForDispute.id), {
        status: 'completed',
        updatedAt: serverTimestamp()
      })

      // 3. Notify Buyer
      await addDoc(collection(db, 'notifications'), {
        recipientId: selectedOrderForDispute.buyerId,
        userId: selectedOrderForDispute.buyerId,
        type: 'dispute_resolved_buyer',
        title: '🤝 Order Dispute Review Closed',
        body: `We completed our review of your dispute for Order #${selectedOrderForDispute.id.substring(0,8).toUpperCase()}. Verdict: ${verdictText}. The dispute has been closed and the transaction is finalized.`,
        read: false,
        createdAt: serverTimestamp()
      })

      // 4. Notify Seller
      if (sellerId) {
        await addDoc(collection(db, 'notifications'), {
          recipientId: sellerId,
          userId: sellerId,
          type: 'dispute_resolved_seller',
          title: '🎉 Dispute Resolved in Your Favor!',
          body: `The administration completed the review for Order #${selectedOrderForDispute.id.substring(0,8).toUpperCase()} and sided with your store. Verdict: ${verdictText}. The dispute is closed and funds are eligible for payout.`,
          read: false,
          createdAt: serverTimestamp()
        })
      }

      // 5. Log to adminLogs
      await addDoc(collection(db, 'adminLogs'), {
        adminUid: currentUser.uid,
        adminName: currentUser.displayName || 'ShopEasy Admin',
        action: 'resolve_dispute_seller',
        targetId: selectedOrderForDispute.id,
        targetName: storeName,
        details: `Dispute resolved siding with Seller. Order completed. Verdict: ${verdictText}`,
        createdAt: serverTimestamp()
      })

      showToast('Dispute resolved: Sided with Seller.', 'success')
    }

    closeDisputePanel()
  } catch (err) {
    console.error('Failed to log dispute resolution decision:', err)
    showToast('Failed to write decision. Try again.', 'danger')
  } finally {
    buyerBtn.disabled = false
    sellerBtn.disabled = false
  }
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'completed': return 'badge--success'
    case 'processing': return 'badge--info'
    case 'ready': return 'badge--warning'
    case 'pending': return 'badge--neutral'
    case 'cancelled': return 'badge--danger'
    case 'dispute_open': return 'badge--danger'
    case 'refund_approved': return 'badge--primary'
    default: return 'badge--neutral'
  }
}
