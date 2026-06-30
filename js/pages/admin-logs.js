/**
 * ShopEasy Admin Portal - Admin Action Audit Logs Module
 */

import { db } from '../firebase-config.js'
import { 
  collection, query, onSnapshot, orderBy, where, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { initAuth, currentUser } from '../auth.js'
import { formatDate, formatTime, showToast } from '../utils.js'

// Global states
let allLogs = []
let currentPage = 1
const LOGS_PER_PAGE = 20

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

  // Load logs
  loadLogsFeed()
})

function setupEventListeners() {
  const btnPrev = document.getElementById('btn-prev-page-logs')
  const btnNext = document.getElementById('btn-next-page-logs')

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--
        renderLogsTable()
      }
    })
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const maxPage = Math.ceil(allLogs.length / LOGS_PER_PAGE)
      if (currentPage < maxPage) {
        currentPage++
        renderLogsTable()
      }
    })
  }
}

function loadLogsFeed() {
  const tbody = document.getElementById('logs-table-body')
  const logsRef = collection(db, 'adminLogs')
  const q = query(logsRef, orderBy('createdAt', 'desc'))

  onSnapshot(q, (snapshot) => {
    allLogs = []
    snapshot.forEach(docSnap => {
      allLogs.push({ id: docSnap.id, ...docSnap.data() })
    })

    renderLogsTable()
  }, (err) => {
    console.error('Error listening to adminLogs collection:', err)
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger); padding: 24px;">Failed to load system audit trail.</td></tr>`
    }
  })
}

function renderLogsTable() {
  const tbody = document.getElementById('logs-table-body')
  if (!tbody) return

  if (allLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--grey-600); padding: 32px;">No logged admin activities in audit ledger.</td></tr>`
    document.getElementById('pagination-info-logs').textContent = 'Showing 0-0 of 0 logs'
    document.getElementById('btn-prev-page-logs').disabled = true
    document.getElementById('btn-next-page-logs').disabled = true
    return
  }

  const startIdx = (currentPage - 1) * LOGS_PER_PAGE
  const endIdx = Math.min(startIdx + LOGS_PER_PAGE, allLogs.length)
  const paginatedLogs = allLogs.slice(startIdx, endIdx)

  tbody.innerHTML = ''
  paginatedLogs.forEach(log => {
    const tr = document.createElement('tr')

    const dateText = log.createdAt ? `${formatDate(log.createdAt)} ${formatTime(log.createdAt)}` : 'N/A'
    const cleanActionText = formatActionText(log.action)
    const actionClass = getActionBadgeClass(log.action)

    tr.innerHTML = `
      <td><strong style="color: var(--secondary);">${log.adminName || 'System Admin'}</strong></td>
      <td><span class="badge ${actionClass}">${cleanActionText}</span></td>
      <td style="font-weight: 500;">${log.targetName || 'System Setting'}</td>
      <td style="color: var(--grey-600); font-size: 0.78rem;">${dateText}</td>
      <td style="color: var(--grey-800); font-size: 0.82rem; font-weight: 500; line-height: 1.45;">${log.details || ''}</td>
    `
    tbody.appendChild(tr)
  })

  // Update pagination info
  document.getElementById('pagination-info-logs').textContent = `Showing ${startIdx + 1}-${endIdx} of ${allLogs.length} logs`
  document.getElementById('btn-prev-page-logs').disabled = currentPage === 1
  document.getElementById('btn-next-page-logs').disabled = endIdx >= allLogs.length
}

function formatActionText(action) {
  if (!action) return 'ACTION'
  return action.toUpperCase().replace('_', ' ')
}

function getActionBadgeClass(action) {
  if (!action) return 'badge--neutral'
  const act = action.toLowerCase()

  if (act.includes('approve') || act.includes('restore') || act.includes('reactivate')) {
    return 'badge--success'
  }
  if (act.includes('reject') || act.includes('ban') || act.includes('remove') || act.includes('delete') || act.includes('suspend')) {
    return 'badge--danger'
  }
  if (act.includes('update') || act.includes('edit')) {
    return 'badge--info'
  }
  if (act.includes('add') || act.includes('make_admin')) {
    return 'badge--primary'
  }
  return 'badge--neutral'
}
