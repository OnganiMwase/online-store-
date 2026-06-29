/**
 * ShopEasy Seller Dashboard Control Module
 */

import { auth, db } from '../firebase-config.js'
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

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { injectHeaderAndNav, renderEmptyState, renderErrorState, renderSkeleton } from '../ui.js'
import { formatMWK, showToast, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  // Inject default navigation
  injectHeaderAndNav('account')

  const container = document.getElementById('dashboard-items-container')
  const titleEl = document.getElementById('dashboard-title')

  // Metric selectors
  const salesMetric = document.getElementById('sales-metric')
  const listingsMetric = document.getElementById('listings-metric')
  const ordersMetric = document.getElementById('orders-metric')

  // Tab buttons
  const productsTabBtn = document.getElementById('products-tab-btn')
  const ordersTabBtn = document.getElementById('orders-tab-btn')

  let sellerProfile = null
  let sellerProducts = []
  let sellerOrders = []
  let activeTab = 'products' // 'products' or 'orders'

  // 1. Guard route and load profile
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirect('/login.html')
      return
    }

    try {
      const snapDoc = await getDoc(doc(db, 'users', user.uid))
      if (!snapDoc.exists() || snapDoc.data().role !== 'seller') {
        showToast('Access restricted. Please register your seller store first.', 'warning')
        redirect('/seller/setup.html')
        return
      }

      sellerProfile = snapDoc.data()
      if (titleEl) {
        titleEl.textContent = `${sellerProfile.storeName || 'My Store'} Dashboard`
      }

      // Load products and orders
      await loadDashboardData(user.uid)
    } catch (error) {
      container.innerHTML = renderErrorState('Access Denied. Error verification.')
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`)
    }
  })

  // 2. Fetch both products and relevant orders in parallel
  const loadDashboardData = async (uid) => {
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

      // Orders fetch - fetch all and filter locally for simplicity and robustness
      const ordersSnapshot = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')))
      sellerOrders = []
      
      ordersSnapshot.forEach(docSnap => {
        const order = docSnap.data()
        order.id = docSnap.id
        
        // Check if at least one item belongs to this seller
        const hasMyProduct = order.items?.some(item => item.sellerId === uid)
        if (hasMyProduct) {
          sellerOrders.push(order)
        }
      })

      // Calculate analytic metrics
      calculateMetrics(uid)

      // Render default view
      renderTabContent()

    } catch (error) {
      container.innerHTML = renderErrorState('Failed to populate dashboard data.')
      handleFirestoreError(error, OperationType.LIST, 'products/orders')
    }
  }

  // Calculate Metrics from listings and orders
  const calculateMetrics = (uid) => {
    // Total Sales: Sum prices of items in COMPLETED orders that belong to this seller
    let revenue = 0
    let pendingOrdersCount = 0

    sellerOrders.forEach(order => {
      const myItems = order.items?.filter(i => i.sellerId === uid) || []
      const orderValue = myItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0)
      
      if (order.status === 'completed') {
        revenue += orderValue
      }
      
      if (order.status === 'pending' || order.status === 'processing' || order.status === 'ready') {
        pendingOrdersCount++
      }
    })

    if (salesMetric) salesMetric.textContent = formatMWK(revenue)
    if (listingsMetric) listingsMetric.textContent = sellerProducts.length
    if (ordersMetric) ordersMetric.textContent = pendingOrdersCount
  }

  // 3. Render content depending on active tab
  const renderTabContent = () => {
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
      // Orders tab
      if (sellerOrders.length === 0) {
        container.innerHTML = renderEmptyState(
          'shoppingCart',
          'No Incoming Orders',
          'Incoming orders from interested Malawian buyers will appear here in real-time.',
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

  // 4. Component row renderers
  const renderSellerProductRow = (prod) => {
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

    // Wire edit button
    row.querySelector('.edit-btn').addEventListener('click', () => {
      redirect(`/seller/add-product.html?id=${prod.id}`)
    })

    // Wire delete button
    row.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm(`Are you sure you want to delete "${prod.name}" listing?`)) {
        try {
          await deleteDoc(doc(db, 'products', prod.id))
          showToast('Product successfully removed!', 'success')
          row.remove()
          sellerProducts = sellerProducts.filter(p => p.id !== prod.id)
          calculateMetrics(auth.currentUser.uid)
          if (sellerProducts.length === 0) renderTabContent()
        } catch (error) {
          showToast('Could not remove listing.', 'danger')
        }
      }
    })

    return row
  }

  const renderSellerOrderRow = (order) => {
    const row = document.createElement('div')
    row.className = 'card'
    row.style.cssText = 'padding: 12px; display: flex; flex-direction: column; gap: 8px;'

    const dateStr = order.createdAt?.toDate 
      ? order.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recently'

    const uid = auth.currentUser.uid
    const myItems = order.items?.filter(item => item.sellerId === uid) || []
    const mySubtotal = myItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)

    let badgeClass = 'badge--grey'
    let statusText = order.status || 'pending'
    if (statusText === 'pending') badgeClass = 'badge--warning'
    if (statusText === 'processing') badgeClass = 'badge--warning'
    if (statusText === 'ready') badgeClass = 'badge--primary'
    if (statusText === 'completed') badgeClass = 'badge--success'
    if (statusText === 'cancelled') badgeClass = 'badge--danger'

    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.75rem; font-weight: 700; color: var(--grey-600);">#${order.id.substring(0, 8).toUpperCase()}</span>
        <span class="badge ${badgeClass}">${statusText.toUpperCase()}</span>
      </div>
      
      <div style="font-size: 0.8rem; color: var(--grey-800);">
        <div style="font-weight: 700; color: var(--secondary);">Items ordered:</div>
        <div style="padding-left: 6px; margin-top: 2px;">
          ${myItems.map(item => `• ${item.name} (x${item.quantity}) - ${formatMWK(item.price * item.quantity)}`).join('<br>')}
        </div>
      </div>

      <div style="font-size: 0.8rem; color: var(--grey-800); border-top: 1px solid var(--grey-100); padding-top: 6px; margin-top: 4px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Buyer Name:</span>
          <strong>${order.buyerName || 'Local Buyer'}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 2px;">
          <span>Contact Phone:</span>
          <strong>${order.buyerPhone || 'No phone'}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 2px;">
          <span>My Subtotal:</span>
          <strong style="color: var(--primary); font-size: 0.9rem;">${formatMWK(mySubtotal)}</strong>
        </div>
      </div>

      <!-- Action Status Controller buttons inside the card -->
      <div style="display: flex; gap: 6px; margin-top: 8px; border-top: 1px dashed var(--grey-200); padding-top: 8px;">
        ${statusText === 'pending' ? `
          <button class="btn btn--secondary btn--sm update-status-btn" data-status="processing" style="flex: 1; padding: 6px 8px; font-size: 0.75rem;">Accept Order</button>
        ` : ''}
        ${statusText === 'processing' ? `
          <button class="btn btn--primary btn--sm update-status-btn" data-status="ready" style="flex: 1; padding: 6px 8px; font-size: 0.75rem;">Ready for Collection</button>
        ` : ''}
        ${statusText === 'ready' ? `
          <button class="btn btn--success btn--sm update-status-btn" data-status="completed" style="flex: 1; padding: 6px 8px; font-size: 0.75rem;">Mark as Completed</button>
        ` : ''}
        ${statusText !== 'completed' && statusText !== 'cancelled' ? `
          <button class="btn btn--outline btn--sm update-status-btn" data-status="cancelled" style="border-color: var(--danger); color: var(--danger); padding: 6px 8px; font-size: 0.75rem;">Cancel Order</button>
        ` : ''}
      </div>
    `

    // Hook action buttons dynamically inside the row card
    row.querySelectorAll('.update-status-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetStatus = btn.dataset.status
        if (confirm(`Transition order status to ${targetStatus.toUpperCase()}?`)) {
          try {
            await updateDoc(doc(db, 'orders', order.id), {
              status: targetStatus,
              updatedAt: serverTimestamp()
            })
            showToast(`Order status updated to ${targetStatus}!`, 'success')
            // Refresh data
            await loadDashboardData(auth.currentUser.uid)
          } catch (error) {
            showToast('Failed to transition order status.', 'danger')
          }
        }
      })
    })

    return row
  }

  // Tab switching logic
  if (productsTabBtn) {
    productsTabBtn.addEventListener('click', () => {
      if (activeTab === 'products') return
      activeTab = 'products'
      productsTabBtn.classList.add('tab-btn--active')
      ordersTabBtn.classList.remove('tab-btn--active')
      renderTabContent()
    })
  }

  if (ordersTabBtn) {
    ordersTabBtn.addEventListener('click', () => {
      if (activeTab === 'orders') return
      activeTab = 'orders'
      ordersTabBtn.classList.add('tab-btn--active')
      productsTabBtn.classList.remove('tab-btn--active')
      renderTabContent()
    })
  }
})
