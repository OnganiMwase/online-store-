/**
 * ShopEasy Seller Dashboard Control Module (Production-Grade)
 */

import { auth, db } from '../firebase-config.js'
import { initAuth } from '../auth.js'
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  updateDoc,
  deleteDoc,
  query, 
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { renderEmptyState, renderErrorState, renderSkeleton } from '../ui.js'
import { formatMWK, showToast, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('dashboard-items-container')
  const storeHeaderElement = document.getElementById('store-header-element')

  // Top bar notifications
  const navBadgeCount = document.getElementById('nav-badge-count')

  // Metrics elements
  const salesThisMonthVal = document.getElementById('sales-this-month-val')
  const totalOrdersVal = document.getElementById('total-orders-val')
  const pendingOrdersVal = document.getElementById('pending-orders-val')
  const activeProductsVal = document.getElementById('active-products-val')
  const storeRatingVal = document.getElementById('store-rating-val')
  const followersVal = document.getElementById('followers-val')

  // Low stock warning elements
  const sectionLowStock = document.getElementById('section-low-stock')
  const lowStockRowsContainer = document.getElementById('low-stock-rows-container')

  // Tab buttons
  const productsTabBtn = document.getElementById('products-tab-btn')
  const ordersTabBtn = document.getElementById('orders-tab-btn')

  // Navigation tiles & links
  const tileViewOrders = document.getElementById('tile-view-orders')
  const linkViewAllOrders = document.getElementById('link-view-all-orders')

  let sellerStore = null
  let sellerProducts = []
  let sellerOrders = []
  let activeTab = 'products' // 'products' or 'orders'
  let salesChartInstance = null

  // 1. Guard route and load profile
  const authState = await initAuth({ requireAuth: true, requireRole: 'seller' })
  const currentUser = authState.user

  try {
    const storeSnap = await getDoc(doc(db, 'stores', currentUser.uid))
    
    // Check if store registration is approved
    if (!storeSnap.exists() || storeSnap.data().status !== 'approved') {
      showToast('Store approval pending. Redirecting to setup.', 'warning')
      redirect('/seller/setup.html')
      return
    }

    sellerStore = storeSnap.data()
    
    // Render store header
    renderStoreHeader(sellerStore)

    // Load full dataset (products, orders, notifications)
    await loadDashboardData(currentUser.uid)

  } catch (error) {
    console.error('Failed to load seller store profile:', error)
    if (storeHeaderElement) {
      storeHeaderElement.innerHTML = renderErrorState('Access Denied. Error retrieving store credentials.')
    }
  }

  // Render Store Header Details
  function renderStoreHeader(store) {
    if (!storeHeaderElement) return

    const logo = store.logo || 'https://images.unsplash.com/photo-1472851294608-062f824d296e?w=100&q=80'
    const rating = Number(store.rating || 0).toFixed(1)
    const ratingCount = store.ratingCount || 0

    storeHeaderElement.innerHTML = `
      <img src="${logo}" alt="${store.name}" class="store-header-logo">
      <div class="store-header-info">
        <div class="store-header-name-row">
          <h1 class="store-header-name">${store.name}</h1>
          <span class="store-status-active">● Active</span>
        </div>
        <div class="store-header-meta">
          <span>📍 ${store.city || 'Malawi'}</span>
          <span>⭐ ${rating} (${ratingCount} reviews)</span>
        </div>
      </div>
    `

    // Update avatar in top-bar header
    const avatarEl = document.getElementById('seller-avatar')
    if (avatarEl && store.logo) {
      avatarEl.src = store.logo
    }
  }

  // 2. Fetch products and orders in parallel
  async function loadDashboardData(uid) {
    container.innerHTML = renderSkeleton(3)

    try {
      // Products fetch
      const prodQuery = query(collection(db, 'products'), where('sellerId', '==', uid))
      const prodSnapshot = await getDocs(prodQuery)
      sellerProducts = []
      
      prodSnapshot.forEach(docSnap => {
        const item = docSnap.data()
        item.id = docSnap.id
        sellerProducts.push(item)
      })

      // Orders fetch - Fetch all and filter locally for maximum resilience and multi-seller robustness
      const ordersSnapshot = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')))
      sellerOrders = []
      
      ordersSnapshot.forEach(docSnap => {
        const order = docSnap.data()
        order.id = docSnap.id
        
        // Determine if at least one item belongs to this seller
        const hasMyProduct = order.items?.some(item => item.sellerId === uid)
        if (hasMyProduct) {
          sellerOrders.push(order)
        }
      })

      // Perform all calculation metrics
      calculateMetrics(uid)

      // Handle low stock scans
      checkLowStockAlerts()

      // Render sales chart
      renderSalesChart(uid)

      // Render recent orders compact rows
      renderRecentOrdersList(uid)

      // Render default Manager Console tab view
      renderTabContent()

    } catch (error) {
      container.innerHTML = renderErrorState('Failed to fetch store dashboard metrics.')
      console.error(error)
    }
  }

  // Calculate Metrics
  function calculateMetrics(uid) {
    let salesThisMonthSum = 0
    let totalOrdersCount = sellerOrders.length
    let pendingOrdersCount = 0
    let activeProductsCount = sellerProducts.filter(p => p.isActive !== false).length

    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    sellerOrders.forEach(order => {
      // Calculate my subtotal value inside this order
      const myItems = order.items?.filter(item => item.sellerId === uid) || []
      const orderSubtotal = myItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || item.quantity || 1)), 0)

      // Filter for COMPLETED status
      if (order.status === 'completed') {
        const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date()
        const isThisMonth = orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear
        
        if (isThisMonth) {
          salesThisMonthSum += orderSubtotal
        }
      }

      // Filter for PENDING statuses
      if (order.status === 'pending' || order.status === 'processing' || order.status === 'ready') {
        pendingOrdersCount++
      }
    })

    // Assign stats
    if (salesThisMonthVal) salesThisMonthVal.textContent = formatMWK(salesThisMonthSum)
    if (totalOrdersVal) totalOrdersVal.textContent = totalOrdersCount
    if (pendingOrdersVal) pendingOrdersVal.textContent = pendingOrdersCount
    if (activeProductsVal) activeProductsVal.textContent = activeProductsCount
    
    // From store document
    if (storeRatingVal && sellerStore) {
      const rating = Number(sellerStore.rating || 0).toFixed(1)
      storeRatingVal.textContent = rating
    }
    if (followersVal && sellerStore) {
      followersVal.textContent = sellerStore.followerCount || 0
    }
  }

  // Low Stock Scans
  function checkLowStockAlerts() {
    if (!sectionLowStock || !lowStockRowsContainer) return

    const lowStockItems = sellerProducts.filter(p => p.isActive !== false && Number(p.stock) <= 5)

    if (lowStockItems.length === 0) {
      sectionLowStock.style.display = 'none'
      return
    }

    lowStockRowsContainer.innerHTML = ''
    lowStockItems.forEach(item => {
      const row = document.createElement('div')
      row.className = 'low-stock-row'
      row.innerHTML = `
        <span class="low-stock-name">${item.name}</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="low-stock-count">${item.stock} left</span>
          <a href="/seller/add-product.html?id=${item.id}" class="btn btn--outline btn--sm" style="padding: 2px 6px; font-size: 0.68rem; border-color: var(--primary); color: var(--primary);">Update Stock</a>
        </div>
      `
      lowStockRowsContainer.appendChild(row)
    })

    sectionLowStock.style.display = 'flex'
  }

  // Render Daily Sales Chart (Chart.js via CDN)
  function renderSalesChart(uid) {
    const canvas = document.getElementById('salesHistoryChart')
    if (!canvas) return

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const labels = []
    const dailyValues = [0, 0, 0, 0, 0, 0, 0]

    // Initialize labels for the last 7 calendar days
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      labels.push(daysOfWeek[d.getDay()])
    }

    // Process Completed Orders for the last 7 days
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(today.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    sellerOrders.forEach(order => {
      if (order.status !== 'completed') return

      const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : null
      if (!orderDate || orderDate < sevenDaysAgo || orderDate > today) return

      // Determine precise day offset index (0 to 6)
      const diffTime = Math.abs(today.getTime() - orderDate.getTime())
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      const index = 6 - diffDays

      if (index >= 0 && index < 7) {
        const myItems = order.items?.filter(item => item.sellerId === uid) || []
        const myVal = myItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || item.quantity || 1)), 0)
        dailyValues[index] += myVal
      }
    })

    // Destroy previous chart if exists
    if (salesChartInstance) {
      salesChartInstance.destroy()
    }

    const ctx = canvas.getContext('2d')
    salesChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Completed Sales (MWK)',
          data: dailyValues,
          backgroundColor: '#E53935',
          borderRadius: 4,
          maxBarThickness: 24
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              font: {
                size: 9,
                weight: 'bold'
              },
              callback: function(value) {
                if (value >= 1000000) return (value / 1000000) + 'M'
                if (value >= 1000) return (value / 1000) + 'K'
                return value
              }
            },
            grid: {
              color: 'rgba(0,0,0,0.05)'
            }
          },
          x: {
            ticks: {
              font: {
                size: 10,
                weight: 'bold'
              }
            },
            grid: {
              display: false
            }
          }
        }
      }
    })
  }

  // Render Compact Recent Orders List
  function renderRecentOrdersList(uid) {
    const containerEl = document.getElementById('recent-orders-compact-container')
    if (!containerEl) return

    if (sellerOrders.length === 0) {
      containerEl.innerHTML = '<p style="font-size: 0.78rem; color: var(--grey-600); text-align: center; padding: 10px 0;">No orders yet</p>'
      return
    }

    containerEl.innerHTML = ''
    
    // Sort and grab top 5
    const topOrders = [...sellerOrders].slice(0, 5)

    topOrders.forEach(order => {
      const myItems = order.items?.filter(item => item.sellerId === uid) || []
      const subtotal = myItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || item.quantity || 1)), 0)

      const row = document.createElement('div')
      row.className = 'order-compact-row'
      
      let badgeClass = 'badge--grey'
      const statusText = order.status || 'pending'
      if (statusText === 'pending' || statusText === 'pending_payment') badgeClass = 'badge--warning'
      if (statusText === 'processing') badgeClass = 'badge--warning'
      if (statusText === 'ready') badgeClass = 'badge--primary'
      if (statusText === 'completed') badgeClass = 'badge--success'
      if (statusText === 'cancelled') badgeClass = 'badge--danger'

      // Get first name of buyer
      const nameParts = (order.buyerName || 'Buyer').split(' ')
      const firstName = nameParts[0]

      row.innerHTML = `
        <div class="order-compact-left">
          <span class="order-compact-id">#${order.id.substring(0, 8).toUpperCase()}</span>
          <span class="order-compact-buyer">Buyer: ${firstName} &bull; ${myItems.length} items</span>
        </div>
        <div class="order-compact-right">
          <span class="order-compact-mwk">${formatMWK(subtotal)}</span>
          <span class="badge ${badgeClass} badge-compact" style="font-size: 0.52rem; padding: 1px 3px;">${statusText}</span>
        </div>
      `

      // Row clicking shortcut: redirects to dedicated Orders page
      row.addEventListener('click', () => {
        redirect('/seller/orders.html')
      })

      containerEl.appendChild(row)
    })
  }

  // Tabbed Manager Console Content
  function renderTabContent() {
    if (!container) return
    container.innerHTML = ''

    if (activeTab === 'products') {
      if (sellerProducts.length === 0) {
        container.innerHTML = renderEmptyState(
          'package',
          'No Products Listed',
          'Get started by adding items to your virtual ShopEasy store catalog.',
          'Add First Product',
          '/seller/add-product.html'
        )
        return
      }

      sellerProducts.forEach(prod => {
        container.appendChild(renderSellerProductRow(prod))
      })
    } else {
      if (sellerOrders.length === 0) {
        container.innerHTML = renderEmptyState(
          'shoppingCart',
          'No Incoming Orders',
          'Incoming orders from Malawian buyers will appear here in real-time.',
          'Explore Storefront',
          '/shop.html'
        )
        return
      }

      sellerOrders.forEach(order => {
        container.appendChild(renderSellerOrderRow(order))
      })
    }
  }

  // Component Row Renderer: Products List
  function renderSellerProductRow(prod) {
    const row = document.createElement('div')
    row.className = 'seller-prod-row'

    const image = prod.image || prod.images?.[0] || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'

    row.innerHTML = `
      <img src="${image}" alt="${prod.name}">
      <div class="seller-prod-row__info">
        <h4 class="seller-prod-row__name">${prod.name}</h4>
        <div class="seller-prod-row__price">${formatMWK(prod.price)}</div>
      </div>
      <div class="seller-prod-row__actions">
        <button class="btn btn--outline btn--sm edit-btn" style="padding: 6px 10px; font-size: 0.75rem;">Edit</button>
        <button class="btn btn--outline btn--sm delete-btn" style="border-color: var(--danger); color: var(--danger); padding: 6px 10px; font-size: 0.75rem;">Delete</button>
      </div>
    `

    // Edit button linking
    row.querySelector('.edit-btn').addEventListener('click', () => {
      redirect(`/seller/add-product.html?id=${prod.id}`)
    })

    // Delete listing handler
    row.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm(`Are you sure you want to delete the product listing: "${prod.name}"?`)) {
        try {
          await deleteDoc(doc(db, 'products', prod.id))
          showToast('Listing successfully deleted!', 'success')
          row.remove()
          sellerProducts = sellerProducts.filter(p => p.id !== prod.id)
          calculateMetrics(currentUser.uid)
          checkLowStockAlerts()
          if (sellerProducts.length === 0) renderTabContent()
        } catch (error) {
          console.error(error)
          showToast('Could not remove listing.', 'danger')
        }
      }
    })

    return row
  }

  // Component Row Renderer: Order Cards
  function renderSellerOrderRow(order) {
    const row = document.createElement('div')
    row.className = 'card'
    row.id = `order-card-${order.id}`
    row.style.cssText = 'padding: 14px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px;'

    const dateStr = order.createdAt?.toDate 
      ? order.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recently'

    const myItems = order.items?.filter(item => item.sellerId === currentUser.uid) || []
    const mySubtotal = myItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || item.quantity || 1)), 0)

    let badgeClass = 'badge--grey'
    let statusText = order.status || 'pending'
    if (statusText === 'pending' || statusText === 'pending_payment') badgeClass = 'badge--warning'
    if (statusText === 'processing') badgeClass = 'badge--warning'
    if (statusText === 'ready') badgeClass = 'badge--primary'
    if (statusText === 'completed') badgeClass = 'badge--success'
    if (statusText === 'cancelled') badgeClass = 'badge--danger'

    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.75rem; font-weight: 850; color: var(--grey-600);">#${order.id.substring(0, 8).toUpperCase()}</span>
        <span class="badge ${badgeClass}">${statusText.toUpperCase()}</span>
      </div>
      
      <div style="font-size: 0.8rem; color: var(--grey-800); margin-top: 4px;">
        <div style="font-weight: 800; color: var(--secondary);">Items ordered:</div>
        <div style="padding-left: 6px; margin-top: 2px; line-height: 1.4;">
          ${myItems.map(item => `&bull; ${item.name} (x${item.qty || item.quantity || 1}) - ${formatMWK(item.price * (item.qty || item.quantity || 1))}`).join('<br>')}
        </div>
      </div>

      <div style="font-size: 0.78rem; color: var(--grey-800); border-top: 1px solid var(--grey-100); padding-top: 8px; margin-top: 6px; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--grey-600); font-weight: 700;">Customer Name:</span>
          <strong>${order.buyerName || 'Local Buyer'}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--grey-600); font-weight: 700;">Phone:</span>
          <strong>${order.buyerPhone || 'No contact phone'}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--grey-600); font-weight: 700;">City:</span>
          <strong>${order.deliveryInfo?.city || 'Lilongwe'}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; border-top: 1px dashed var(--grey-200); padding-top: 6px; margin-top: 2px;">
          <span style="color: var(--grey-600); font-weight: 700;">My Payout Subtotal:</span>
          <strong style="color: var(--primary); font-size: 0.95rem;">${formatMWK(mySubtotal)}</strong>
        </div>
      </div>

      <!-- Action status workflow panel -->
      <div style="display: flex; gap: 6px; margin-top: 10px; border-top: 1px dashed var(--grey-200); padding-top: 10px;">
        ${statusText === 'pending' || statusText === 'pending_payment' ? `
          <button class="btn btn--secondary btn--sm update-status-btn" data-status="processing" style="flex: 1; padding: 6px 8px; font-size: 0.75rem;">Accept Order</button>
        ` : ''}
        ${statusText === 'processing' ? `
          <button class="btn btn--primary btn--sm update-status-btn" data-status="ready" style="flex: 1; padding: 6px 8px; font-size: 0.75rem;">Ready for Collection</button>
        ` : ''}
        ${statusText === 'ready' ? `
          <button class="btn btn--success btn--sm update-status-btn" data-status="completed" style="flex: 1; padding: 6px 8px; font-size: 0.75rem;">Completed</button>
        ` : ''}
        ${statusText !== 'completed' && statusText !== 'cancelled' ? `
          <button class="btn btn--outline btn--sm update-status-btn" data-status="cancelled" style="border-color: var(--danger); color: var(--danger); padding: 6px 8px; font-size: 0.75rem;">Cancel</button>
        ` : ''}
      </div>
    `

    // Connect action buttons to real database status updates
    row.querySelectorAll('.update-status-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetStatus = btn.dataset.status
        if (confirm(`Update order status to ${targetStatus.toUpperCase()}?`)) {
          try {
            await updateDoc(doc(db, 'orders', order.id), {
              status: targetStatus,
              updatedAt: serverTimestamp()
            })
            showToast(`Order status transitioned to ${targetStatus}!`, 'success')
            
            // Reload local analytics and lists
            await loadDashboardData(currentUser.uid)
          } catch (err) {
            console.error('Order Status Update Error:', err)
            showToast('Failed to update order status.', 'danger')
          }
        }
      })
    })

    return row
  }

  // Tab controller actions (Redirect to dedicated full screen pages)
  if (productsTabBtn) {
    productsTabBtn.addEventListener('click', () => {
      redirect('/seller/products.html')
    })
  }

  if (ordersTabBtn) {
    ordersTabBtn.addEventListener('click', () => {
      redirect('/seller/orders.html')
    })
  }

  if (tileViewOrders) {
    tileViewOrders.addEventListener('click', () => {
      redirect('/seller/orders.html')
    })
  }

  if (linkViewAllOrders) {
    linkViewAllOrders.addEventListener('click', (e) => {
      e.preventDefault()
      redirect('/seller/orders.html')
    })
  }
})
