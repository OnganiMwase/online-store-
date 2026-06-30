/**
 * ShopEasy Admin Portal - User Management Module
 */

import { db, functions } from '../firebase-config.js'
import { 
  collection, query, where, getDocs, getDoc, doc, updateDoc, addDoc, orderBy, limit, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js'
import { initAuth, currentUser } from '../auth.js'
import { formatMWK, formatDate, showToast } from '../utils.js'

// Global states
let allUsers = []
let filteredUsers = []
let activeTab = 'all' // 'all', 'buyers', 'sellers', 'admins', 'banned'
let searchQuery = ''
let selectedUser = null
let currentPage = 1
const USERS_PER_PAGE = 20

// Navigation badges setup
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

// Helper to watch live updates (we can import onSnapshot from firebase-firestore)
import { onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

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

  // Initialize listeners & load users
  setupEventListeners()
  loadUsersFeed()
})

function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('user-search')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim()
      currentPage = 1
      applyFiltersAndRender()
    })
  }

  // Tabs
  const tabs = ['all', 'buyers', 'sellers', 'admins', 'banned']
  tabs.forEach(tab => {
    const tabBtn = document.getElementById(`tab-${tab}`)
    if (tabBtn) {
      tabBtn.addEventListener('click', () => {
        tabs.forEach(t => document.getElementById(`tab-${t}`)?.classList.remove('active'))
        tabBtn.classList.add('active')
        activeTab = tab
        currentPage = 1
        applyFiltersAndRender()
      })
    }
  })

  // Pagination buttons
  const btnPrev = document.getElementById('btn-prev-page')
  const btnNext = document.getElementById('btn-next-page')
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--
        renderUsersTable()
      }
    })
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const maxPage = Math.ceil(filteredUsers.length / USERS_PER_PAGE)
      if (currentPage < maxPage) {
        currentPage++
        renderUsersTable()
      }
    })
  }

  // Sliding panel close
  const panelClose = document.getElementById('user-panel-close')
  const panelBackdrop = document.getElementById('user-panel-backdrop')
  if (panelClose) panelClose.addEventListener('click', closeUserDetailPanel)
  if (panelBackdrop) panelBackdrop.addEventListener('click', closeUserDetailPanel)

  // Ban modal cancellation
  const banCancel = document.getElementById('ban-btn-cancel')
  const banClose = document.getElementById('ban-modal-close')
  if (banCancel) banCancel.addEventListener('click', closeBanModal)
  if (banClose) banClose.addEventListener('click', closeBanModal)

  // Ban confirmation
  const banConfirm = document.getElementById('ban-btn-confirm')
  if (banConfirm) {
    banConfirm.addEventListener('click', confirmBanUser)
  }
}

function loadUsersFeed() {
  const tableBody = document.getElementById('users-table-body')
  const usersRef = collection(db, 'users')

  onSnapshot(usersRef, (snapshot) => {
    allUsers = []
    snapshot.forEach(docSnap => {
      allUsers.push({ id: docSnap.id, ...docSnap.data() })
    })

    // Sort by name or createdAt desc
    allUsers.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase()
      const nameB = (b.name || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })

    applyFiltersAndRender()
  }, (err) => {
    console.error('Error listening to users collection:', err)
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 24px;">Failed to load users list.</td></tr>`
    }
  })
}

function applyFiltersAndRender() {
  filteredUsers = allUsers.filter(user => {
    // 1. Filter by Tab
    if (activeTab === 'buyers' && user.role !== 'buyer') return false
    if (activeTab === 'sellers' && user.role !== 'seller') return false
    if (activeTab === 'admins' && user.role !== 'admin') return false
    if (activeTab === 'banned' && user.status !== 'banned') return false

    // 2. Filter by Search Query (supports name, email, city)
    if (searchQuery) {
      const name = (user.name || '').toLowerCase()
      const email = (user.email || '').toLowerCase()
      const city = (user.city || '').toLowerCase()
      return name.includes(searchQuery) || email.includes(searchQuery) || city.includes(searchQuery)
    }

    return true
  })

  renderUsersTable()
}

function renderUsersTable() {
  const tableBody = document.getElementById('users-table-body')
  if (!tableBody) return

  if (filteredUsers.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--grey-600); padding: 32px;">No matching users found.</td></tr>`
    document.getElementById('pagination-info').textContent = 'Showing 0-0 of 0 users'
    document.getElementById('btn-prev-page').disabled = true
    document.getElementById('btn-next-page').disabled = true
    return
  }

  const startIdx = (currentPage - 1) * USERS_PER_PAGE
  const endIdx = Math.min(startIdx + USERS_PER_PAGE, filteredUsers.length)
  const paginatedList = filteredUsers.slice(startIdx, endIdx)

  tableBody.innerHTML = ''
  paginatedList.forEach(user => {
    const tr = document.createElement('tr')
    tr.style.cursor = 'pointer'
    tr.onclick = () => openUserDetailPanel(user)

    const avatarUrl = user.avatar || ''
    const initial = (user.name || 'U').charAt(0).toUpperCase()
    
    // Role styling
    let roleClass = 'badge--neutral'
    if (user.role === 'admin') roleClass = 'badge--danger'
    if (user.role === 'seller') roleClass = 'badge--primary'
    if (user.role === 'buyer') roleClass = 'badge--success'

    // Status styling
    let statusText = 'Active'
    let statusClass = 'badge--success'
    if (user.status === 'banned') {
      statusText = 'Banned'
      statusClass = 'badge--danger'
    } else if (user.status === 'suspended') {
      statusText = 'Suspended'
      statusClass = 'badge--warning'
    }

    const dateText = user.createdAt ? formatDate(user.createdAt) : 'N/A'

    tr.innerHTML = `
      <td>
        <div style="display: flex; align-items: center; gap: 10px;">
          ${avatarUrl ? `
            <img src="${avatarUrl}" alt="${user.name}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
          ` : `
            <div style="width: 32px; height: 32px; border-radius: 50%; background-color: var(--primary-light); color: var(--primary); font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 0.85rem;">
              ${initial}
            </div>
          `}
          <span style="font-weight: 700;">${user.name || 'Unnamed User'}</span>
        </div>
      </td>
      <td style="color: var(--grey-800);">${user.email || 'N/A'}</td>
      <td><span class="badge ${roleClass}">${user.role || 'buyer'}</span></td>
      <td>${user.city || 'Malawi'}</td>
      <td style="color: var(--grey-600);">${dateText}</td>
      <td><span class="badge ${statusClass}">${statusText}</span></td>
    `
    tableBody.appendChild(tr)
  })

  // Update pagination UI
  document.getElementById('pagination-info').textContent = `Showing ${startIdx + 1}-${endIdx} of ${filteredUsers.length} users`
  document.getElementById('btn-prev-page').disabled = currentPage === 1
  document.getElementById('btn-next-page').disabled = endIdx >= filteredUsers.length
}

async function openUserDetailPanel(user) {
  selectedUser = user
  const content = document.getElementById('user-panel-content')
  if (!content) return

  content.innerHTML = '<p style="text-align: center; color: var(--grey-600); padding: 32px;">Retrieving purchase history...</p>'

  // Show sliding panel
  document.getElementById('user-panel-backdrop').classList.add('visible')
  document.getElementById('user-detail-panel').classList.add('visible')

  // Fetch real orders history count and spend
  let totalOrders = 0
  let totalSpend = 0

  try {
    const ordersQ = query(collection(db, 'orders'), where('buyerId', '==', user.id))
    const ordersSnap = await getDocs(ordersQ)
    ordersSnap.forEach(docSnap => {
      const order = docSnap.data()
      if (order.status !== 'cancelled') {
        totalOrders++
        totalSpend += Number(order.total || 0)
      }
    })
  } catch (err) {
    console.error('Error fetching user purchase details:', err)
  }

  // Check if store profile exists (if seller)
  let storeDetailsHtml = ''
  if (user.role === 'seller') {
    try {
      const storeSnap = await getDoc(doc(db, 'stores', user.id))
      if (storeSnap.exists()) {
        const store = storeSnap.data()
        storeDetailsHtml = `
          <div style="background-color: var(--grey-100); border-radius: 8px; padding: 12px; border-left: 3.5px solid var(--primary); margin-top: 10px;">
            <div style="font-weight: 800; font-size: 0.85rem; color: var(--secondary); margin-bottom: 4px;">🏪 ASSOCIATED STORE</div>
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--secondary);">${store.name || 'Unnamed Store'}</div>
            <div style="font-size: 0.72rem; color: var(--grey-600); margin-top: 2px;">Category: ${store.category || 'N/A'} • Total Sales: ${formatMWK(store.totalSales || 0)}</div>
          </div>
        `
      }
    } catch (err) {
      console.warn('Could not read associated store profile details:', err)
    }
  }

  // Create detail markup
  const initial = (user.name || 'U').charAt(0).toUpperCase()
  const avatarUrl = user.avatar || ''
  const isBanned = user.status === 'banned'
  const isOtherAdmin = user.role === 'admin' && user.id !== currentUser?.uid

  content.innerHTML = `
    <!-- Mini Profile -->
    <div style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; padding-bottom: 16px; border-bottom: 1.5px solid var(--grey-200);">
      ${avatarUrl ? `
        <img src="${avatarUrl}" alt="${user.name}" style="width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary-light);">
      ` : `
        <div style="width: 72px; height: 72px; border-radius: 50%; background-color: var(--primary-light); color: var(--primary); font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; border: 3px solid var(--primary-light);">
          ${initial}
        </div>
      `}
      <div style="font-weight: 800; font-size: 1.25rem; color: var(--secondary);">${user.name || 'Unnamed User'}</div>
      <div style="font-size: 0.8rem; color: var(--grey-600);">${user.email || 'N/A'}</div>
      <div style="margin-top: 4px; display: flex; gap: 8px;">
        <span class="badge ${user.role === 'admin' ? 'badge--danger' : user.role === 'seller' ? 'badge--primary' : 'badge--success'}">${user.role || 'buyer'}</span>
        <span class="badge ${isBanned ? 'badge--danger' : 'badge--success'}">${isBanned ? '🔴 Banned' : '🟢 Active'}</span>
      </div>
    </div>

    <!-- Analytics Info -->
    <div>
      <div style="font-weight: 800; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--grey-600); margin-bottom: 8px;">Activity Metrics</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div style="background-color: var(--grey-100); border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 1.15rem; font-weight: 800; color: var(--secondary);">${totalOrders}</div>
          <div style="font-size: 0.65rem; font-weight: 700; color: var(--grey-600); text-transform: uppercase; margin-top: 2px;">Completed Orders</div>
        </div>
        <div style="background-color: var(--grey-100); border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 1.15rem; font-weight: 800; color: var(--primary);">${formatMWK(totalSpend)}</div>
          <div style="font-size: 0.65rem; font-weight: 700; color: var(--grey-600); text-transform: uppercase; margin-top: 2px;">Total Spent</div>
        </div>
      </div>
      ${storeDetailsHtml}
    </div>

    <!-- Metadata Details -->
    <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.8rem; border-top: 1.5px solid var(--grey-200); padding-top: 16px;">
      <div><span style="color: var(--grey-600); font-weight: 500;">Phone:</span> <strong style="color: var(--secondary);">${user.phone || 'Not provided'}</strong></div>
      <div><span style="color: var(--grey-600); font-weight: 500;">City:</span> <strong style="color: var(--secondary);">${user.city || 'Malawi'}</strong></div>
      <div><span style="color: var(--grey-600); font-weight: 500;">Registration Date:</span> <strong style="color: var(--secondary);">${user.createdAt ? formatDate(user.createdAt) : 'N/A'}</strong></div>
      <div><span style="color: var(--grey-600); font-weight: 500;">Last Seen Online:</span> <strong style="color: var(--secondary);">${user.lastSeen ? formatDate(user.lastSeen) + ' ' + formatTime(user.lastSeen) : 'N/A'}</strong></div>
      ${isBanned && user.banReason ? `
        <div style="background-color: #FFEBEE; color: var(--danger); border-radius: 8px; padding: 12px; border-left: 3.5px solid var(--danger); font-size: 0.75rem; margin-top: 6px;">
          <strong style="display:block; margin-bottom: 2px;">⚠️ REASON FOR BAN:</strong>
          "${user.banReason}"
        </div>
      ` : ''}
    </div>

    <!-- Administrative Actions -->
    <div style="margin-top: auto; border-top: 1.5px solid var(--grey-200); padding-top: 20px; display: flex; flex-direction: column; gap: 10px;">
      ${isOtherAdmin ? `
        <p style="font-size: 0.75rem; color: var(--danger); font-weight: 700; text-align: center; background-color: #FFEBEE; padding: 10px; border-radius: 6px;">
          🛡️ Protection Guard: You are not authorized to modify, ban, or demote another system administrator.
        </p>
      ` : `
        ${isBanned ? `
          <button class="btn btn--success" id="btn-unban-user" style="width: 100%; padding: 10px; font-size: 0.8rem;">
            🟢 Lift Account Ban (Unban)
          </button>
        ` : `
          <button class="btn btn--danger" id="btn-ban-user" style="width: 100%; padding: 10px; font-size: 0.8rem;">
            🚫 Ban User Account
          </button>
        `}
        
        ${user.role !== 'admin' ? `
          <button class="btn btn--outline" id="btn-make-admin" style="width: 100%; border-color: var(--secondary); color: var(--secondary); padding: 10px; font-size: 0.8rem;">
            🛡️ Upgrade to Admin
          </button>
        ` : ''}
      `}
    </div>
  `

  // Bind actions
  if (!isOtherAdmin) {
    const banBtn = document.getElementById('btn-ban-user')
    const unbanBtn = document.getElementById('btn-unban-user')
    const adminBtn = document.getElementById('btn-make-admin')

    if (banBtn) banBtn.addEventListener('click', openBanModal)
    if (unbanBtn) unbanBtn.addEventListener('click', confirmUnbanUser)
    if (adminBtn) adminBtn.addEventListener('click', confirmMakeAdmin)
  }
}

function closeUserDetailPanel() {
  document.getElementById('user-panel-backdrop').classList.remove('visible')
  document.getElementById('user-detail-panel').classList.remove('visible')
  selectedUser = null
}

function openBanModal() {
  document.getElementById('ban-reason').value = ''
  document.getElementById('ban-reason-error').style.display = 'none'
  document.getElementById('ban-modal').classList.add('modal--visible')
}

function closeBanModal() {
  document.getElementById('ban-modal').classList.remove('modal--visible')
}

async function confirmBanUser() {
  if (!selectedUser) return
  
  const reasonInput = document.getElementById('ban-reason')
  const reasonText = reasonInput.value.trim()
  const errorMsg = document.getElementById('ban-reason-error')

  if (!reasonText) {
    errorMsg.style.display = 'block'
    return
  }
  errorMsg.style.display = 'none'

  const confirmBtn = document.getElementById('ban-btn-confirm')
  confirmBtn.disabled = true
  confirmBtn.textContent = 'Banning...'

  try {
    // 1. Update user profile status in Firestore
    await updateDoc(doc(db, 'users', selectedUser.id), {
      status: 'banned',
      banReason: reasonText,
      updatedAt: serverTimestamp()
    })

    // 2. Call Cloud Function to disable user in Firebase Authentication
    try {
      const disableAuthUserFn = httpsCallable(functions, 'disableAuthUser')
      await disableAuthUserFn({ uid: selectedUser.id })
    } catch (fnsErr) {
      console.warn('Cloud Function disableAuthUser call failed. This is expected if local emulator or function is not deployed:', fnsErr)
    }

    // 3. Write real-time system notification to the user
    await addDoc(collection(db, 'notifications'), {
      recipientId: selectedUser.id,
      userId: selectedUser.id,
      type: 'account_banned',
      title: '🚨 Account Banned',
      body: `Your ShopEasy account has been banned. Reason: ${reasonText}. For support, contact support@shopeasymalawi.com`,
      read: false,
      createdAt: serverTimestamp()
    })

    // 4. Log to adminLogs audit trail
    await addDoc(collection(db, 'adminLogs'), {
      adminUid: currentUser.uid,
      adminName: currentUser.displayName || 'ShopEasy Admin',
      action: 'ban_user',
      targetId: selectedUser.id,
      targetName: selectedUser.name || 'Unnamed',
      details: `Banned user. Reason: ${reasonText}`,
      createdAt: serverTimestamp()
    })

    showToast(`Successfully banned ${selectedUser.name || 'user'}.`, 'success')
    closeBanModal()
    closeUserDetailPanel()
  } catch (err) {
    console.error('Failed to ban user account:', err)
    showToast('Failed to complete ban action. Try again.', 'danger')
  } finally {
    confirmBtn.disabled = false
    confirmBtn.textContent = 'Ban User'
  }
}

async function confirmUnbanUser() {
  if (!selectedUser) return

  if (confirm(`Lift ban and activate account for "${selectedUser.name || 'user'}"?`)) {
    try {
      // 1. Update Firestore user status
      await updateDoc(doc(db, 'users', selectedUser.id), {
        status: 'active',
        banReason: null,
        updatedAt: serverTimestamp()
      })

      // 2. Call Cloud Function to enable auth user
      try {
        const enableAuthUserFn = httpsCallable(functions, 'enableAuthUser')
        await enableAuthUserFn({ uid: selectedUser.id })
      } catch (fnsErr) {
        console.warn('Cloud Function enableAuthUser call failed. This is expected if local emulator or function is not deployed:', fnsErr)
      }

      // 3. Write notification
      await addDoc(collection(db, 'notifications'), {
        recipientId: selectedUser.id,
        userId: selectedUser.id,
        type: 'account_unbanned',
        title: '🎉 Account Restored!',
        body: 'Your ShopEasy account ban has been lifted. You can now login and explore!',
        read: false,
        createdAt: serverTimestamp()
      })

      // 4. Log to adminLogs
      await addDoc(collection(db, 'adminLogs'), {
        adminUid: currentUser.uid,
        adminName: currentUser.displayName || 'ShopEasy Admin',
        action: 'unban_user',
        targetId: selectedUser.id,
        targetName: selectedUser.name || 'Unnamed',
        details: 'Unbanned user account.',
        createdAt: serverTimestamp()
      })

      showToast(`Restored active status for ${selectedUser.name || 'user'}.`, 'success')
      closeUserDetailPanel()
    } catch (err) {
      console.error('Failed to unban user account:', err)
      showToast('Error unbanning user.', 'danger')
    }
  }
}

async function confirmMakeAdmin() {
  if (!selectedUser) return

  const promptConfirm = confirm(`⚠️ SECURITY WARNING:\n\nUpgrade "${selectedUser.name || 'user'}" to a system Administrator?\nThis action gives them FULL control over ShopEasy, including user bans, payout approvals, and settings.`)
  if (promptConfirm) {
    const secondConfirm = confirm(`FINAL CONFIRMATION:\n\nAre you absolutely certain you want to make ${selectedUser.name || 'user'} an administrator?`)
    if (secondConfirm) {
      try {
        // 1. Update user role
        await updateDoc(doc(db, 'users', selectedUser.id), {
          role: 'admin',
          updatedAt: serverTimestamp()
        })

        // 2. Write notification
        await addDoc(collection(db, 'notifications'), {
          recipientId: selectedUser.id,
          userId: selectedUser.id,
          type: 'role_upgrade',
          title: '🛡️ Role Upgraded to Administrator',
          body: 'You have been granted system Administrator privileges on ShopEasy.',
          read: false,
          createdAt: serverTimestamp()
        })

        // 3. Log to adminLogs
        await addDoc(collection(db, 'adminLogs'), {
          adminUid: currentUser.uid,
          adminName: currentUser.displayName || 'ShopEasy Admin',
          action: 'make_admin',
          targetId: selectedUser.id,
          targetName: selectedUser.name || 'Unnamed',
          details: 'Upgraded user role to admin.',
          createdAt: serverTimestamp()
        })

        showToast(`Successfully upgraded ${selectedUser.name || 'user'} to Admin.`, 'success')
        closeUserDetailPanel()
      } catch (err) {
        console.error('Failed to make user admin:', err)
        showToast('Error granting administrator rights.', 'danger')
      }
    }
  }
}
