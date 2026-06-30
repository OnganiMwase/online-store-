/**
 * ShopEasy Admin Portal - Sellers & Onboarding Applications Module
 */

import { db } from '../firebase-config.js'
import { 
  collection, query, where, getDocs, doc, updateDoc, addDoc, onSnapshot, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { initAuth, currentUser } from '../auth.js'
import { formatMWK, formatDate, showToast } from '../utils.js'

// Global states
let pendingStores = []
let approvedStores = []
let activeTab = 'pending' // 'pending', 'approved'
let selectedStoreId = null

// Sync badges & pending applications count live
function setupNavAndTabBadges() {
  const qSellers = query(collection(db, 'stores'), where('status', '==', 'pending_approval'))
  onSnapshot(qSellers, (snap) => {
    // Nav count badge
    const navBadge = document.getElementById('badge-pending-sellers')
    if (navBadge) {
      if (snap.size > 0) {
        navBadge.textContent = snap.size
        navBadge.style.display = 'inline-flex'
      } else {
        navBadge.style.display = 'none'
      }
    }

    // Tab count text
    const tabCount = document.getElementById('pending-count')
    if (tabCount) {
      tabCount.textContent = snap.size
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

  // Setup live badges
  setupNavAndTabBadges()

  // Initialize listeners
  setupEventListeners()

  // Initialize live queries
  loadStoresData()
})

function setupEventListeners() {
  // Tabs
  const tabPending = document.getElementById('tab-pending')
  const tabApproved = document.getElementById('tab-approved')
  const pendingContainer = document.getElementById('pending-applications-container')
  const approvedSection = document.getElementById('approved-sellers-section')

  if (tabPending && tabApproved) {
    tabPending.addEventListener('click', () => {
      tabPending.classList.add('active')
      tabApproved.classList.remove('active')
      activeTab = 'pending'
      pendingContainer.style.display = 'flex'
      approvedSection.style.display = 'none'
    })

    tabApproved.addEventListener('click', () => {
      tabApproved.classList.add('active')
      tabPending.classList.remove('active')
      activeTab = 'approved'
      pendingContainer.style.display = 'none'
      approvedSection.style.display = 'block'
    })
  }

  // Docs modal close
  const docsClose = document.getElementById('docs-modal-close')
  const docsBtnClose = document.getElementById('docs-modal-btn-close')
  if (docsClose) docsClose.addEventListener('click', closeDocsModal)
  if (docsBtnClose) docsBtnClose.addEventListener('click', closeDocsModal)

  // Zoom modal close
  const zoomClose = document.getElementById('zoom-close-btn')
  const zoomModal = document.getElementById('image-zoom-modal')
  if (zoomClose) zoomClose.addEventListener('click', closeZoomModal)
  if (zoomModal) {
    zoomModal.addEventListener('click', (e) => {
      if (e.target.id === 'image-zoom-modal') {
        closeZoomModal()
      }
    })
  }

  // Docs modal click zoom binds
  const idFrontImg = document.getElementById('modal-id-front')
  const idBackImg = document.getElementById('modal-id-back')
  if (idFrontImg) {
    idFrontImg.addEventListener('click', () => openZoomModal(idFrontImg.src))
  }
  if (idBackImg) {
    idBackImg.addEventListener('click', () => openZoomModal(idBackImg.src))
  }

  // Rejection modal close
  const rejectCancel = document.getElementById('reject-btn-cancel')
  const rejectClose = document.getElementById('reject-modal-close')
  if (rejectCancel) rejectCancel.addEventListener('click', closeRejectModal)
  if (rejectClose) rejectClose.addEventListener('click', closeRejectModal)

  // Rejection confirm
  const rejectConfirm = document.getElementById('reject-btn-confirm')
  if (rejectConfirm) {
    rejectConfirm.addEventListener('click', confirmRejectStore)
  }
}

function loadStoresData() {
  const storesRef = collection(db, 'stores')

  onSnapshot(storesRef, (snapshot) => {
    pendingStores = []
    approvedStores = []

    snapshot.forEach(docSnap => {
      const store = { id: docSnap.id, ...docSnap.data() }
      if (store.status === 'pending_approval') {
        pendingStores.push(store)
      } else if (store.status === 'approved' || store.status === 'suspended') {
        approvedStores.push(store)
      }
    })

    // Sort outputs
    pendingStores.sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0))
    approvedStores.sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0))

    renderPendingStores()
    renderApprovedStores()
  }, (err) => {
    console.error('Error fetching stores stream:', err)
    showToast('Failed to sync store listings.', 'danger')
  })
}

function renderPendingStores() {
  const container = document.getElementById('pending-applications-container')
  if (!container) return

  if (pendingStores.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--grey-600); padding: 40px; background-color: var(--grey-100); border-radius: 12px; border: 1.5px dashed var(--grey-300); width: 100%;">
        <span style="font-size: 2rem; display: block; margin-bottom: 8px;">🎉</span>
        <h3 style="font-size: 1rem; color: var(--secondary); font-weight: 700;">No Pending Applications</h3>
        <p style="font-size: 0.8rem; margin-top: 4px;">All onboarding sellers have been processed!</p>
      </div>
    `
    return
  }

  container.innerHTML = ''
  pendingStores.forEach(store => {
    const card = document.createElement('div')
    card.className = 'admin-card'
    card.style.display = 'flex'
    card.style.flexDirection = 'column'
    card.style.gap = '14px'

    const logoUrl = store.logo || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'
    const dateText = store.createdAt ? formatDate(store.createdAt) : 'N/A'

    card.innerHTML = `
      <div style="display: flex; gap: 14px; border-bottom: 1px solid var(--grey-200); padding-bottom: 12px; align-items: flex-start; flex-wrap: wrap;">
        <img src="${logoUrl}" alt="${store.name}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover; background-color: var(--grey-200);">
        <div style="flex: 1; min-width: 200px;">
          <h3 style="font-weight: 800; font-size: 1.05rem; color: var(--secondary);">${store.name || 'Unnamed Store'}</h3>
          <p style="font-size: 0.78rem; color: var(--grey-600); margin-top: 2px;">City: <strong>${store.city || 'Malawi'}</strong> • Phone: <strong>${store.phone || 'N/A'}</strong></p>
          <p style="font-size: 0.72rem; color: var(--grey-600);">Category Slug: <strong>${store.category || 'general'}</strong> • Application Date: ${dateText}</p>
        </div>
        <div class="badge badge--warning" style="padding: 6px 12px; font-weight: 700; font-size: 0.72rem; text-transform: uppercase;">Pending Verification</div>
      </div>

      <div style="font-size: 0.8rem; color: var(--grey-800); line-height: 1.4;">
        <span style="font-weight: 700; color: var(--secondary); display: block; margin-bottom: 4px;">STORE DESCRIPTION:</span>
        "${store.description || 'No description provided.'}"
      </div>

      <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: auto; border-top: 1px solid var(--grey-200); padding-top: 12px;">
        <button class="btn btn--outline btn--sm" id="btn-docs-${store.id}" style="font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          Inspect KYC Documents
        </button>
        <button class="btn btn--success btn--sm" id="btn-approve-${store.id}" style="font-size: 0.75rem; font-weight: 700; margin-left: auto;">
          Approve Application
        </button>
        <button class="btn btn--danger btn--sm" id="btn-reject-${store.id}" style="font-size: 0.75rem; font-weight: 700;">
          Reject Application
        </button>
      </div>
    `

    container.appendChild(card)

    // Event listeners
    document.getElementById(`btn-docs-${store.id}`).addEventListener('click', () => openDocsModal(store))
    document.getElementById(`btn-approve-${store.id}`).addEventListener('click', () => approveStore(store))
    document.getElementById(`btn-reject-${store.id}`).addEventListener('click', () => openRejectModal(store.id))
  })
}

function renderApprovedStores() {
  const tbody = document.getElementById('approved-sellers-body')
  if (!tbody) return

  if (approvedStores.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--grey-600); padding: 32px;">No approved sellers found in system directory.</td></tr>`
    return
  }

  tbody.innerHTML = ''
  approvedStores.forEach(store => {
    const tr = document.createElement('tr')
    
    const logoUrl = store.logo || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'
    const totalSalesMWK = formatMWK(store.totalSales || 0)
    const ratingStars = '⭐ ' + (store.rating ? store.rating.toFixed(1) : '5.0')
    const isSuspended = store.status === 'suspended'

    tr.innerHTML = `
      <td>
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${logoUrl}" alt="${store.name}" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover; background-color: var(--grey-200);">
          <div>
            <div style="font-weight: 700; color: var(--secondary);">${store.name || 'Unnamed'}</div>
            <div style="font-size: 0.7rem; color: var(--grey-600);">${store.phone || 'N/A'}</div>
          </div>
        </div>
      </td>
      <td>${store.city || 'Malawi'}</td>
      <td><span class="badge badge--neutral">${store.category || 'General'}</span></td>
      <td style="font-weight: 700; color: var(--success);">${totalSalesMWK}</td>
      <td style="color: var(--secondary); font-weight: 600;">${ratingStars}</td>
      <td>
        <span class="badge ${isSuspended ? 'badge--danger' : 'badge--success'}">
          ${isSuspended ? 'Suspended' : 'Live'}
        </span>
      </td>
      <td>
        ${isSuspended ? `
          <button class="btn btn--success btn--sm" id="btn-suspend-${store.id}" style="padding: 4px 8px; font-size: 0.68rem;">
            Reactivate
          </button>
        ` : `
          <button class="btn btn--danger btn--sm" id="btn-suspend-${store.id}" style="padding: 4px 8px; font-size: 0.68rem;">
            Suspend Store
          </button>
        `}
      </td>
    `
    tbody.appendChild(tr)

    // Event listener
    document.getElementById(`btn-suspend-${store.id}`).addEventListener('click', () => toggleSuspendStore(store))
  })
}

function openDocsModal(store) {
  const idFrontImg = document.getElementById('modal-id-front')
  const idBackImg = document.getElementById('modal-id-back')

  idFrontImg.src = store.idFront || 'https://images.unsplash.com/photo-1557683316-973673baf926?w=400&q=80'
  idBackImg.src = store.idBack || 'https://images.unsplash.com/photo-1557683316-973673baf926?w=400&q=80'

  document.getElementById('docs-modal').classList.add('modal--visible')
}

function closeDocsModal() {
  document.getElementById('docs-modal').classList.remove('modal--visible')
}

function openZoomModal(src) {
  const zoomedImg = document.getElementById('zoomed-image-el')
  zoomedImg.src = src
  document.getElementById('image-zoom-modal').classList.add('visible')
}

function closeZoomModal() {
  document.getElementById('image-zoom-modal').classList.remove('visible')
}

function openRejectModal(storeId) {
  selectedStoreId = storeId
  const reasonInput = document.getElementById('reject-reason')
  reasonInput.value = ''
  document.getElementById('reject-reason-error').style.display = 'none'
  document.getElementById('reject-modal').classList.add('modal--visible')
}

function closeRejectModal() {
  document.getElementById('reject-modal').classList.remove('modal--visible')
  selectedStoreId = null
}

async function approveStore(store) {
  if (confirm(`Approve Onboarding Application for "${store.name || 'store'}"? This will make the seller store live.`)) {
    try {
      // 1. Update store status in Firestore
      await updateDoc(doc(db, 'stores', store.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      // Also upgrade user role to 'seller' to be absolutely sure they can access seller resources
      await updateDoc(doc(db, 'users', store.sellerId), {
        role: 'seller',
        updatedAt: serverTimestamp()
      })

      // 2. Write notification to seller
      await addDoc(collection(db, 'notifications'), {
        recipientId: store.sellerId,
        userId: store.sellerId,
        type: 'seller_approved',
        title: '🎉 Your store is approved!',
        body: `Congratulations! "${store.name}" is now live. Start listing your products!`,
        read: false,
        createdAt: serverTimestamp()
      })

      // 3. Log admin action
      await addDoc(collection(db, 'adminLogs'), {
        adminUid: currentUser.uid,
        adminName: currentUser.displayName || 'ShopEasy Admin',
        action: 'approve_store',
        targetId: store.id,
        targetName: store.name || 'Unnamed Store',
        details: 'Approved store onboarding application.',
        createdAt: serverTimestamp()
      })

      showToast(`Successfully approved "${store.name || 'store'}".`, 'success')
    } catch (err) {
      console.error('Error approving seller application:', err)
      showToast('Approval action failed. Retry connection.', 'danger')
    }
  }
}

async function confirmRejectStore() {
  if (!selectedStoreId) return

  const reasonInput = document.getElementById('reject-reason')
  const reasonText = reasonInput.value.trim()
  const errorMsg = document.getElementById('reject-reason-error')

  if (!reasonText) {
    errorMsg.style.display = 'block'
    return
  }
  errorMsg.style.display = 'none'

  const confirmBtn = document.getElementById('reject-btn-confirm')
  confirmBtn.disabled = true
  confirmBtn.textContent = 'Rejecting...'

  try {
    // 1. Read store doc to get sellerId and name
    const storeSnap = await getDocs(query(collection(db, 'stores'), where('sellerId', '==', selectedStoreId)))
    let storeData = null
    let storeDocId = selectedStoreId

    // Note: ID of stores collection is user's sellerId (authUID)
    const directDocSnap = await getDocs(query(collection(db, 'stores')))
    directDocSnap.forEach(snap => {
      if (snap.id === selectedStoreId) {
        storeData = snap.data()
        storeDocId = snap.id
      }
    })

    const targetStoreName = storeData?.name || 'Your Store'
    const targetSellerId = storeData?.sellerId || selectedStoreId

    // 2. Update store document in Firestore
    await updateDoc(doc(db, 'stores', storeDocId), {
      status: 'rejected',
      rejectionReason: reasonText,
      updatedAt: serverTimestamp()
    })

    // 3. Write rejection alert notification to the seller user
    await addDoc(collection(db, 'notifications'), {
      recipientId: targetSellerId,
      userId: targetSellerId,
      type: 'seller_rejected',
      title: '❌ Store Application Rejected',
      body: `Your store application for "${targetStoreName}" was rejected. Reason: ${reasonText}. You can submit a new application after resolving the issues.`,
      read: false,
      createdAt: serverTimestamp()
    })

    // 4. Log to adminLogs
    await addDoc(collection(db, 'adminLogs'), {
      adminUid: currentUser.uid,
      adminName: currentUser.displayName || 'ShopEasy Admin',
      action: 'reject_store',
      targetId: storeDocId,
      targetName: targetStoreName,
      details: `Rejected store application. Reason: ${reasonText}`,
      createdAt: serverTimestamp()
    })

    showToast('Onboarding application has been rejected.', 'success')
    closeRejectModal()
  } catch (err) {
    console.error('Failed to reject store application:', err)
    showToast('Failed to log rejection.', 'danger')
  } finally {
    confirmBtn.disabled = false
    confirmBtn.textContent = 'Confirm Reject'
  }
}

async function toggleSuspendStore(store) {
  const isSuspended = store.status === 'suspended'
  const actionText = isSuspended ? 'reactivate' : 'suspend'
  const targetStatus = isSuspended ? 'approved' : 'suspended'

  if (confirm(`Are you sure you want to ${actionText} the store "${store.name || 'store'}"?`)) {
    try {
      // 1. Update store status
      await updateDoc(doc(db, 'stores', store.id), {
        status: targetStatus,
        updatedAt: serverTimestamp()
      })

      // 2. Notify seller
      await addDoc(collection(db, 'notifications'), {
        recipientId: store.sellerId,
        userId: store.sellerId,
        type: isSuspended ? 'store_reactivated' : 'store_suspended',
        title: isSuspended ? '🟢 Store Reactivated!' : '🚨 Store Suspended',
        body: isSuspended 
          ? `Your store "${store.name}" has been reactivated. Your product listings are active again.`
          : `Your store "${store.name}" has been suspended due to system policy or dispute reviews. For clarifications contact support.`,
        read: false,
        createdAt: serverTimestamp()
      })

      // 3. Log to adminLogs
      await addDoc(collection(db, 'adminLogs'), {
        adminUid: currentUser.uid,
        adminName: currentUser.displayName || 'ShopEasy Admin',
        action: isSuspended ? 'reactivate_store' : 'suspend_store',
        targetId: store.id,
        targetName: store.name || 'Unnamed',
        details: `${isSuspended ? 'Reactivated' : 'Suspended'} seller store account.`,
        createdAt: serverTimestamp()
      })

      showToast(`Successfully ${isSuspended ? 'reactivated' : 'suspended'} "${store.name}".`, 'success')
    } catch (err) {
      console.error('Failed to toggle store suspension:', err)
      showToast('Action failed. Try again.', 'danger')
    }
  }
}
