/**
 * ShopEasy Admin Portal - Dashboard Page Module
 */

import { db } from '../firebase-config.js'
import { 
  collection, query, where, getDocs, onSnapshot, orderBy, limit, doc, getDoc, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { initAuth } from '../auth.js'
import { formatMWK, formatDate, formatTime } from '../utils.js'

// Navigation badge sync helper
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

// Format date strictly as local midnight
const getTodayMidnight = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// Initialise page and secure admin role guard
document.addEventListener('DOMContentLoaded', async () => {
  const authState = await initAuth({ requireAuth: true, requireRole: 'admin' })
  if (!authState || !authState.user) return

  // Populate admin info in the top bar
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

  // Load KPI data and render trends
  await loadDashboardKPIs()
  await loadTopSellersAndProducts()
  setupLiveRecentOrders()
})

async function loadDashboardKPIs() {
  const updateLabel = document.getElementById('dashboard-last-updated')
  try {
    // 1. Total Users Count
    const usersSnap = await getDocs(collection(db, 'users'))
    document.getElementById('kpi-total-users').textContent = usersSnap.size.toLocaleString()

    // 2. Active Sellers Count
    const sellersQuery = query(collection(db, 'stores'), where('status', '==', 'approved'))
    const sellersSnap = await getDocs(sellersQuery)
    document.getElementById('kpi-active-sellers').textContent = sellersSnap.size.toLocaleString()

    // 3. Orders Today Count
    const todayMidnight = getTodayMidnight()
    const ordersQuery = query(collection(db, 'orders'))
    const ordersSnap = await getDocs(ordersQuery)
    
    let ordersTodayCount = 0
    let revenueTodayMWK = 0

    ordersSnap.forEach((doc) => {
      const orderData = doc.data()
      const orderDate = orderData.createdAt?.toDate ? orderData.createdAt.toDate() : new Date(orderData.createdAt)
      
      if (orderDate >= todayMidnight) {
        ordersTodayCount++
        // Revenue is calculated if payment was processed successfully (any completed or processed/paid status)
        if (orderData.status !== 'cancelled' && orderData.status !== 'pending') {
          revenueTodayMWK += Number(orderData.total || 0)
        }
      }
    })

    document.getElementById('kpi-orders-today').textContent = ordersTodayCount.toLocaleString()
    document.getElementById('kpi-revenue-today').textContent = formatMWK(revenueTodayMWK)

    // 4. Pending Approvals Count
    const pendingQuery = query(collection(db, 'stores'), where('status', '==', 'pending_approval'))
    const pendingSnap = await getDocs(pendingQuery)
    const pCount = pendingSnap.size
    document.getElementById('kpi-pending-approvals').textContent = pCount.toLocaleString()
    
    const pBadge = document.getElementById('kpi-pending-badge')
    const pIcon = document.getElementById('pending-approvals-icon')
    if (pCount > 0) {
      pBadge.textContent = pCount
      pBadge.style.display = 'inline-flex'
      pIcon.style.color = 'var(--danger)'
      pIcon.style.backgroundColor = '#FFEBEE'
    } else {
      pBadge.style.display = 'none'
      pIcon.style.color = 'var(--primary)'
      pIcon.style.backgroundColor = 'var(--primary-light)'
    }

    // 5. Open Disputes Count
    const disputesQuery = query(collection(db, 'disputes'), where('status', '==', 'open'))
    const disputesSnap = await getDocs(disputesQuery)
    const dCount = disputesSnap.size
    document.getElementById('kpi-open-disputes').textContent = dCount.toLocaleString()

    const dBadge = document.getElementById('kpi-disputes-badge')
    const dIcon = document.getElementById('open-disputes-icon')
    if (dCount > 0) {
      dBadge.textContent = dCount
      dBadge.style.display = 'inline-flex'
      dIcon.style.color = 'var(--danger)'
      dIcon.style.backgroundColor = '#FFEBEE'
    } else {
      dBadge.style.display = 'none'
      dIcon.style.color = 'var(--primary)'
      dIcon.style.backgroundColor = 'var(--primary-light)'
    }

    if (updateLabel) {
      updateLabel.textContent = `Last updated: ${new Date().toLocaleTimeString()}`
    }

    // Render chart with actual data
    renderRevenueChart(ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })))

  } catch (err) {
    console.error('Error fetching dashboard KPI stats:', err)
    if (updateLabel) {
      updateLabel.textContent = 'Sync failed. Retry connection.'
    }
  }
}

function renderRevenueChart(ordersList) {
  const ctx = document.getElementById('revenueChart')
  if (!ctx) return

  // Calculate past 7 days dates starting 6 days ago
  const days = []
  const dailyRevenue = {}

  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    days.push(dateStr)
    
    // Set matching midnight bounds for daily aggregation
    const boundStart = new Date(d)
    boundStart.setHours(0,0,0,0)
    const boundEnd = new Date(d)
    boundEnd.setHours(23,59,59,999)

    let daySum = 0
    ordersList.forEach(order => {
      if (order.status === 'cancelled' || order.status === 'pending') return
      const oDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt)
      if (oDate >= boundStart && oDate <= boundEnd) {
        daySum += Number(order.total || 0)
      }
    })
    dailyRevenue[dateStr] = daySum
  }

  const chartData = days.map(day => dailyRevenue[day])

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        label: 'Revenue (MWK)',
        data: chartData,
        backgroundColor: '#E53935',
        borderRadius: 6,
        borderWidth: 0,
        maxBarThickness: 40
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              if (value >= 1e6) return 'MK ' + (value / 1e6).toFixed(1) + 'M'
              if (value >= 1e3) return 'MK ' + (value / 1e3).toFixed(0) + 'K'
              return 'MK ' + value
            },
            font: { weight: '600', size: 10 }
          },
          grid: { color: '#EEEEEE' }
        },
        x: {
          ticks: { font: { weight: '700', size: 10 } },
          grid: { display: false }
        }
      }
    }
  })
}

async function loadTopSellersAndProducts() {
  const topSellersContainer = document.getElementById('top-sellers-list')
  const topProductsContainer = document.getElementById('top-products-list')

  try {
    // Top Sellers query (Stores orderBy totalSales desc limit 5)
    const sellersQ = query(
      collection(db, 'stores'),
      where('status', '==', 'approved'),
      orderBy('totalSales', 'desc'),
      limit(5)
    )
    const sellersSnap = await getDocs(sellersQ)
    
    if (topSellersContainer) {
      if (sellersSnap.empty) {
        topSellersContainer.innerHTML = '<p style="text-align: center; font-size: 0.8rem; color: var(--grey-600); padding: 16px;">No approved sellers found.</p>'
      } else {
        topSellersContainer.innerHTML = ''
        sellersSnap.forEach(docSnap => {
          const store = docSnap.data()
          const logo = store.logo || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'
          const row = document.createElement('div')
          row.className = 'admin-list-item'
          row.style.cursor = 'pointer'
          row.onclick = () => { location.href = `/admin/sellers.html` }
          
          row.innerHTML = `
            <img src="${logo}" alt="${store.name}" onerror="this.src='https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'">
            <div class="admin-list-item__body">
              <div class="admin-list-item__title">${store.name || 'Unnamed Store'}</div>
              <div class="admin-list-item__subtitle">${store.city || 'Malawi'} • ${store.category || 'General'}</div>
            </div>
            <div class="admin-list-item__meta" style="color: var(--success);">
              ${formatMWK(store.totalSales || 0)}
            </div>
          `
          topSellersContainer.appendChild(row)
        })
      }
    }

    // Top Products query (Products orderBy sold desc limit 5)
    const productsQ = query(
      collection(db, 'products'),
      orderBy('sold', 'desc'),
      limit(5)
    )
    const productsSnap = await getDocs(productsQ)

    if (topProductsContainer) {
      if (productsSnap.empty) {
        topProductsContainer.innerHTML = '<p style="text-align: center; font-size: 0.8rem; color: var(--grey-600); padding: 16px;">No products sold yet.</p>'
      } else {
        topProductsContainer.innerHTML = ''
        productsSnap.forEach(docSnap => {
          const prod = docSnap.data()
          const image = prod.image || prod.images?.[0] || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'
          const row = document.createElement('div')
          row.className = 'admin-list-item'
          row.style.cursor = 'pointer'
          row.onclick = () => { location.href = `/admin/products.html` }
          
          // Calculate revenue
          const totalRevenue = (prod.sold || 0) * (prod.price || 0)

          row.innerHTML = `
            <img src="${image}" alt="${prod.name}" onerror="this.src='https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'">
            <div class="admin-list-item__body">
              <div class="admin-list-item__title">${prod.name || 'Unnamed Product'}</div>
              <div class="admin-list-item__subtitle">${prod.sold || 0} items sold</div>
            </div>
            <div class="admin-list-item__meta">
              <span style="display:block; font-size: 0.85rem; color: var(--secondary);">${formatMWK(prod.price || 0)}</span>
              <span style="display:block; font-size: 0.72rem; color: var(--grey-600);">Revenue: ${formatMWK(totalRevenue)}</span>
            </div>
          `
          topProductsContainer.appendChild(row)
        })
      }
    }

  } catch (err) {
    console.error('Error loading top metrics lists:', err)
  }
}

function setupLiveRecentOrders() {
  const container = document.getElementById('recent-orders-list')
  if (!container) return

  // Subscribe real-time onSnapshot: last 10 orders orderBy createdAt desc
  const ordersQ = query(
    collection(db, 'orders'),
    orderBy('createdAt', 'desc'),
    limit(10)
  )

  onSnapshot(ordersQ, (snap) => {
    if (snap.empty) {
      container.innerHTML = '<p style="text-align: center; font-size: 0.8rem; color: var(--grey-600); padding: 16px;">No orders found in database.</p>'
      return
    }

    container.innerHTML = ''
    snap.forEach(docSnap => {
      const order = docSnap.data()
      const row = document.createElement('div')
      row.className = 'admin-list-item'
      row.style.cursor = 'pointer'
      row.onclick = () => { location.href = `/admin/orders.html` }

      // Get store names list
      const storeName = order.storeName || order.items?.[0]?.storeName || 'ShopEasy Store'
      const statusClass = getStatusBadgeClass(order.status)
      const dateText = order.createdAt ? formatDate(order.createdAt) : ''

      row.innerHTML = `
        <div class="admin-list-item__body">
          <div class="admin-list-item__title">Order #${docSnap.id.substring(0, 8).toUpperCase()}</div>
          <div class="admin-list-item__subtitle">
            Buyer: <strong>${order.buyerName || 'Malawi Buyer'}</strong> • Store: ${storeName}
          </div>
          <div style="font-size: 0.7rem; color: var(--grey-600); margin-top: 2px;">
            ${dateText} • ${order.city || 'Malawi'}
          </div>
        </div>
        <div class="admin-list-item__meta" style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <span style="font-weight: 700; color: var(--secondary);">${formatMWK(order.total || 0)}</span>
          <span class="badge ${statusClass}">${order.status || 'pending'}</span>
        </div>
      `
      container.appendChild(row)
    })
  }, (err) => {
    console.error('Failed to subscribe live orders stream:', err)
    container.innerHTML = '<p style="text-align: center; color: var(--danger); font-size: 0.8rem; padding: 16px;">Live connection error.</p>'
  })
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
