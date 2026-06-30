/**
 * ShopEasy Admin Portal - System Settings, Category & Payout Manager Module
 */

import { db } from '../firebase-config.js'
import { 
  collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, serverTimestamp, orderBy 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { initAuth, currentUser } from '../auth.js'
import { formatMWK, formatDate, showToast } from '../utils.js'

// Global states
let activeSection = 'app' // 'app', 'categories', 'payouts'
let allCategories = []
let pendingPayouts = []
let paidPayouts = []

// Sync badges
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

  // Setup badges
  setupNavBadges()

  // Initialize event listeners & loads
  setupEventListeners()
  await loadAppSettings()
  await loadCategories()
  await loadPayouts()
})

function setupEventListeners() {
  // Tabs switching
  const tabApp = document.getElementById('settings-tab-app')
  const tabCategories = document.getElementById('settings-tab-categories')
  const tabPayouts = document.getElementById('settings-tab-payouts')

  const secApp = document.getElementById('settings-sec-app')
  const secCategories = document.getElementById('settings-sec-categories')
  const secPayouts = document.getElementById('settings-sec-payouts')

  if (tabApp && tabCategories && tabPayouts) {
    tabApp.addEventListener('click', () => {
      tabApp.classList.add('active')
      tabCategories.classList.remove('active')
      tabPayouts.classList.remove('active')
      secApp.style.display = 'block'
      secCategories.style.display = 'none'
      secPayouts.style.display = 'none'
      activeSection = 'app'
    })

    tabCategories.addEventListener('click', () => {
      tabCategories.classList.add('active')
      tabApp.classList.remove('active')
      tabPayouts.classList.remove('active')
      secApp.style.display = 'none'
      secCategories.style.display = 'flex'
      secPayouts.style.display = 'none'
      activeSection = 'categories'
    })

    tabPayouts.addEventListener('click', () => {
      tabPayouts.classList.add('active')
      tabApp.classList.remove('active')
      tabCategories.classList.remove('active')
      secApp.style.display = 'none'
      secCategories.style.display = 'none'
      secPayouts.style.display = 'flex'
      activeSection = 'payouts'
    })
  }

  // APP SETTINGS SUBMIT
  const settingsForm = document.getElementById('app-settings-form')
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      await saveAppSettings()
    })
  }

  // CATEGORIES MODAL & FORMS
  const btnAddCategory = document.getElementById('btn-add-category-modal')
  const catModal = document.getElementById('category-modal')
  const catClose = document.getElementById('category-modal-close')
  const catCancel = document.getElementById('category-btn-cancel')
  const catForm = document.getElementById('category-form')
  const catNameInput = document.getElementById('category-modal-name')
  const catSlugInput = document.getElementById('category-modal-slug')

  if (btnAddCategory) {
    btnAddCategory.addEventListener('click', () => {
      document.getElementById('category-modal-title').textContent = 'Add Category'
      document.getElementById('category-modal-id').value = ''
      document.getElementById('category-modal-emoji').value = ''
      catNameInput.value = ''
      catSlugInput.value = ''
      document.getElementById('category-modal-order').value = '1'
      catModal.classList.add('modal--visible')
    })
  }

  const closeCatModal = () => catModal.classList.remove('modal--visible')
  if (catClose) catClose.addEventListener('click', closeCatModal)
  if (catCancel) catCancel.addEventListener('click', closeCatModal)

  // Auto-generate slug from name input
  if (catNameInput && catSlugInput) {
    catNameInput.addEventListener('input', () => {
      catSlugInput.value = catNameInput.value
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
    })
  }

  if (catForm) {
    catForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      await saveCategory()
    })
  }
}

async function loadAppSettings() {
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'site'))
    if (docSnap.exists()) {
      const config = docSnap.data()
      document.getElementById('announcement-banner-enabled').checked = !!config.announcementBanner
      document.getElementById('announcement-banner-text').value = config.announcementText || ''
      document.getElementById('maintenance-mode-enabled').checked = !!config.maintenanceMode
      document.getElementById('support-contact-email').value = config.supportEmail || ''
    }
  } catch (err) {
    console.error('Error loading App settings:', err)
  }
}

async function saveAppSettings() {
  const btn = document.getElementById('btn-save-app-settings')
  btn.disabled = true
  btn.textContent = 'Saving Settings...'

  const announcementBanner = document.getElementById('announcement-banner-enabled').checked
  const announcementText = document.getElementById('announcement-banner-text').value.trim()
  const maintenanceMode = document.getElementById('maintenance-mode-enabled').checked
  const supportEmail = document.getElementById('support-contact-email').value.trim()

  try {
    // Save to real Firestore
    await setDoc(doc(db, 'settings', 'site'), {
      announcementBanner,
      announcementText,
      maintenanceMode,
      supportEmail,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    }, { merge: true })

    // Log admin action
    await addDoc(collection(db, 'adminLogs'), {
      adminUid: currentUser.uid,
      adminName: currentUser.displayName || 'ShopEasy Admin',
      action: 'update_site_settings',
      targetId: 'site',
      targetName: 'System Configurations',
      details: `Updated site configurations. Banner: ${announcementBanner}, Maintenance: ${maintenanceMode}`,
      createdAt: serverTimestamp()
    })

    showToast('System settings successfully saved.', 'success')
  } catch (err) {
    console.error('Failed to write settings to database:', err)
    showToast('Failed to save configurations.', 'danger')
  } finally {
    btn.disabled = false
    btn.textContent = 'Save System Configurations'
  }
}

async function loadCategories() {
  const container = document.getElementById('categories-grid-container')
  if (!container) return

  try {
    // Setup onSnapshot live tree
    onSnapshot(collection(db, 'categories'), async (snapshot) => {
      allCategories = []
      snapshot.forEach(docSnap => {
        allCategories.push({ id: docSnap.id, ...docSnap.data() })
      })

      // Sort categories by sortOrder
      allCategories.sort((a, b) => Number(a.sortOrder || 1) - Number(b.sortOrder || 1))

      container.innerHTML = ''
      for (const cat of allCategories) {
        const card = document.createElement('div')
        card.className = 'admin-card'
        card.style.display = 'flex'
        card.style.flexDirection = 'column'
        card.style.gap = '8px'
        card.style.padding = '14px'

        // Count products inside this category slug dynamically
        let productCount = 0
        try {
          const q = query(collection(db, 'products'), where('category', '==', cat.id))
          const prodSnap = await getDocs(q)
          productCount = prodSnap.size
        } catch (err) {
          console.warn('Could not load products count for category:', cat.id, err)
        }

        const emoji = cat.icon || cat.emoji || '📦'

        card.innerHTML = `
          <div style="display: flex; gap: 10px; align-items: center; border-bottom: 1px solid var(--grey-200); padding-bottom: 8px;">
            <span style="font-size: 1.5rem;">${emoji}</span>
            <div style="flex: 1;">
              <h3 style="font-weight: 800; font-size: 0.95rem; color: var(--secondary);">${cat.name || 'Unnamed'}</h3>
              <p style="font-size: 0.7rem; color: var(--grey-600); margin-top: 1px;">Slug: <strong>${cat.id}</strong></p>
            </div>
          </div>
          <div style="font-size: 0.75rem; color: var(--grey-600); display: flex; justify-content: space-between; margin-top: 4px;">
            <span>Products Count: <strong style="color: var(--secondary);">${productCount}</strong></span>
            <span>Sort Order: <strong style="color: var(--secondary);">${cat.sortOrder || 1}</strong></span>
          </div>
          <div style="display: flex; gap: 8px; border-top: 1px solid var(--grey-100); padding-top: 8px; margin-top: auto; justify-content: flex-end;">
            <button class="btn btn--outline btn--sm" id="btn-cat-edit-${cat.id}" style="padding: 2px 8px; font-size: 0.68rem; font-weight: 700;">
              Edit
            </button>
            <button class="btn btn--danger btn--sm" id="btn-cat-delete-${cat.id}" style="padding: 2px 8px; font-size: 0.68rem; font-weight: 700;" ${productCount > 0 ? 'disabled' : ''}>
              Delete
            </button>
          </div>
        `
        container.appendChild(card)

        // Event listener binds
        document.getElementById(`btn-cat-edit-${cat.id}`).addEventListener('click', () => openEditCategoryModal(cat))
        document.getElementById(`btn-cat-delete-${cat.id}`).addEventListener('click', () => deleteCategory(cat, productCount))
      }
    })
  } catch (err) {
    console.error('Error starting live categories stream:', err)
  }
}

function openEditCategoryModal(cat) {
  document.getElementById('category-modal-title').textContent = 'Edit Category'
  document.getElementById('category-modal-id').value = cat.id
  document.getElementById('category-modal-emoji').value = cat.icon || cat.emoji || '📦'
  document.getElementById('category-modal-name').value = cat.name || ''
  document.getElementById('category-modal-slug').value = cat.id
  document.getElementById('category-modal-order').value = cat.sortOrder || '1'
  document.getElementById('category-modal').classList.add('modal--visible')
}

async function saveCategory() {
  const idValue = document.getElementById('category-modal-id').value.trim()
  const emoji = document.getElementById('category-modal-emoji').value.trim() || '📦'
  const name = document.getElementById('category-modal-name').value.trim()
  const slug = document.getElementById('category-modal-slug').value.trim()
  const sortOrder = Number(document.getElementById('category-modal-order').value || 1)

  const btnSubmit = document.getElementById('category-btn-submit')
  btnSubmit.disabled = true
  btnSubmit.textContent = 'Saving...'

  try {
    const finalDocId = idValue || slug

    // Save to Firestore
    await setDoc(doc(db, 'categories', finalDocId), {
      name,
      icon: emoji,
      emoji: emoji,
      sortOrder,
      updatedAt: serverTimestamp()
    }, { merge: true })

    // Log admin action
    await addDoc(collection(db, 'adminLogs'), {
      adminUid: currentUser.uid,
      adminName: currentUser.displayName || 'ShopEasy Admin',
      action: idValue ? 'edit_category' : 'add_category',
      targetId: finalDocId,
      targetName: name,
      details: `${idValue ? 'Updated' : 'Added new'} marketplace category. Order: ${sortOrder}`,
      createdAt: serverTimestamp()
    })

    showToast(`Successfully saved category "${name}".`, 'success')
    document.getElementById('category-modal').classList.remove('modal--visible')
  } catch (err) {
    console.error('Error saving marketplace category:', err)
    showToast('Failed to write category payload.', 'danger')
  } finally {
    btnSubmit.disabled = false
    btnSubmit.textContent = idValue ? 'Update Category' : 'Add Category'
  }
}

async function deleteCategory(cat, productCount) {
  if (productCount > 0) {
    showToast('You cannot delete a category containing live active product listings.', 'danger')
    return
  }

  if (confirm(`Are you absolutely sure you want to delete the category "${cat.name || 'item'}"? This action is permanent.`)) {
    try {
      await deleteDoc(doc(db, 'categories', cat.id))

      // Log admin action
      await addDoc(collection(db, 'adminLogs'), {
        adminUid: currentUser.uid,
        adminName: currentUser.displayName || 'ShopEasy Admin',
        action: 'delete_category',
        targetId: cat.id,
        targetName: cat.name || 'Unnamed',
        details: 'Deleted marketplace category.',
        createdAt: serverTimestamp()
      })

      showToast(`Category "${cat.name}" has been deleted.`, 'success')
    } catch (err) {
      console.error('Failed to delete marketplace category:', err)
      showToast('Deletion failed. Try again.', 'danger')
    }
  }
}

async function loadPayouts() {
  const pendingBody = document.getElementById('payouts-pending-table-body')
  const historyBody = document.getElementById('payouts-history-table-body')

  if (!pendingBody || !historyBody) return

  // Setup live snapshots for payouts
  const payoutsRef = collection(db, 'payouts')
  onSnapshot(payoutsRef, (snapshot) => {
    pendingPayouts = []
    paidPayouts = []

    snapshot.forEach(docSnap => {
      const payout = { id: docSnap.id, ...docSnap.data() }
      if (payout.status === 'pending') {
        pendingPayouts.push(payout)
      } else {
        paidPayouts.push(payout)
      }
    })

    // Sort: Pending: oldest requestedAt first; Paid: newest paidAt first
    pendingPayouts.sort((a, b) => (a.requestedAt?.toDate?.() || 0) - (b.requestedAt?.toDate?.() || 0))
    paidPayouts.sort((a, b) => (b.paidAt?.toDate?.() || 0) - (a.paidAt?.toDate?.() || 0))

    renderPendingPayouts(pendingBody)
    renderPaidPayoutsHistory(historyBody)
  }, (err) => {
    console.error('Failed to subscribe payouts snap:', err)
  })
}

function renderPendingPayouts(tbody) {
  if (pendingPayouts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--grey-600); padding: 32px;">No pending seller payout requests at this time.</td></tr>`
    return
  }

  tbody.innerHTML = ''
  pendingPayouts.forEach(payout => {
    const tr = document.createElement('tr')

    const storeName = payout.storeName || 'ShopEasy Store'
    const amountMWK = formatMWK(payout.amount || 0)
    const dateText = payout.requestedAt ? formatDate(payout.requestedAt) : 'N/A'

    tr.innerHTML = `
      <td><strong style="color: var(--secondary);">${storeName}</strong></td>
      <td style="font-weight: 700; color: var(--primary);">${amountMWK}</td>
      <td><span class="badge badge--primary" style="text-transform: uppercase;">${payout.method || 'Airtel Money'}</span></td>
      <td style="font-family: monospace; font-size: 0.85rem;">${payout.accountNumber || payout.phone || 'N/A'}</td>
      <td style="color: var(--grey-600);">${dateText}</td>
      <td>
        <button class="btn btn--success btn--sm" id="btn-pay-${payout.id}" style="padding: 4px 8px; font-size: 0.68rem; font-weight: 700;">
          Mark as Paid
        </button>
      </td>
    `
    tbody.appendChild(tr)

    document.getElementById(`btn-pay-${payout.id}`).addEventListener('click', () => markPayoutAsPaid(payout))
  })
}

function renderPaidPayoutsHistory(tbody) {
  if (paidPayouts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--grey-600); padding: 32px;">No historical disbursements found in ledger logs.</td></tr>`
    return
  }

  tbody.innerHTML = ''
  paidPayouts.forEach(payout => {
    const tr = document.createElement('tr')

    const storeName = payout.storeName || 'ShopEasy Store'
    const amountMWK = formatMWK(payout.amount || 0)
    const paidDate = payout.paidAt ? formatDate(payout.paidAt) : 'N/A'
    const adminName = payout.paidByAdminName || 'ShopEasy Admin'

    tr.innerHTML = `
      <td><strong style="color: var(--secondary);">${storeName}</strong></td>
      <td style="font-weight: 700; color: var(--success);">${amountMWK}</td>
      <td><span class="badge badge--neutral" style="text-transform: uppercase;">${payout.method || 'Airtel Money'}</span></td>
      <td style="font-family: monospace; font-size: 0.85rem;">${payout.accountNumber || payout.phone || 'N/A'}</td>
      <td style="color: var(--grey-600);">${paidDate}</td>
      <td><span style="font-weight: 600; font-size: 0.78rem; color: var(--grey-800);">${adminName}</span></td>
    `
    tbody.appendChild(tr)
  })
}

async function markPayoutAsPaid(payout) {
  const storeName = payout.storeName || 'store'
  const method = payout.method || 'Airtel Money'
  const targetAcc = payout.accountNumber || payout.phone || 'number'
  const amountStr = formatMWK(payout.amount || 0)

  const promptConfirm = confirm(`PAYOUT DISBURSEMENT CONFIRMATION:\n\nConfirm you have processed and sent ${amountStr} to ${storeName} via ${method} (Account: ${targetAcc})?\n\nThis will write a permanent disbursement audit log entry in ShopEasy.`)
  if (promptConfirm) {
    try {
      // 1. Update payout document status: paid
      await updateDoc(doc(db, 'payouts', payout.id), {
        status: 'paid',
        paidAt: serverTimestamp(),
        paidBy: currentUser.uid,
        paidByAdminName: currentUser.displayName || 'ShopEasy Admin'
      })

      // 2. Notify seller store owner
      await addDoc(collection(db, 'notifications'), {
        recipientId: payout.sellerId,
        userId: payout.sellerId,
        type: 'payout_processed',
        title: '💰 Payout Request Disbursed!',
        body: `Your payout claim of ${amountStr} has been successfully sent to ${targetAcc} via ${method}. Check your mobile ledger!`,
        read: false,
        createdAt: serverTimestamp()
      })

      // 3. Log to adminLogs
      await addDoc(collection(db, 'adminLogs'), {
        adminUid: currentUser.uid,
        adminName: currentUser.displayName || 'ShopEasy Admin',
        action: 'payout_approved',
        targetId: payout.id,
        targetName: storeName,
        details: `Disbursed payout request of ${amountStr} via ${method} to ${targetAcc}`,
        createdAt: serverTimestamp()
      })

      showToast(`Marked payout of ${amountStr} to ${storeName} as paid.`, 'success')
    } catch (err) {
      console.error('Failed to finalize payout record:', err)
      showToast('Disbursement logging failed.', 'danger')
    }
  }
}
