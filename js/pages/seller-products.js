/**
 * ShopEasy Seller Products Page Control Module (Production-Grade)
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

import { renderEmptyState, renderSkeleton } from '../ui.js'
import { formatMWK, showToast, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('products-list-container')
  const searchInput = document.getElementById('products-search-input')
  const tabs = document.querySelectorAll('.compact-tab-btn')

  // Modal elements
  const modal = document.getElementById('delete-flow-modal')
  const modalTitle = document.getElementById('modal-title-el')
  const modalDesc = document.getElementById('modal-desc-el')
  const modalBtns = document.getElementById('modal-btns-container')

  let currentUser = null
  let productsList = []
  let ordersList = [] // To check if product has orders
  let currentFilter = 'all' // 'all', 'active', 'draft', 'outofstock'
  let searchQuery = ''

  // 1. Authenticate and require seller role
  const authState = await initAuth({ requireAuth: true, requireRole: 'seller' })
  currentUser = authState.user

  try {
    // Check if store registration is approved
    const storeSnap = await getDoc(doc(db, 'stores', currentUser.uid))
    if (!storeSnap.exists() || storeSnap.data().status !== 'approved') {
      showToast('Store registration pending approval.', 'warning')
      redirect('/seller/setup.html')
      return
    }

    // Load seller products and orders
    await loadProductsData()
  } catch (error) {
    console.error('Failed to init products page:', error)
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--danger);">Failed to authorize store session.</div>`
  }

  // Load products & orders from DB
  async function loadProductsData() {
    container.innerHTML = renderSkeleton(3)

    try {
      // 1. Fetch products owned by seller
      const prodQuery = query(
        collection(db, 'products'), 
        where('sellerId', '==', currentUser.uid)
      )
      const prodSnapshot = await getDocs(prodQuery)
      productsList = []
      
      prodSnapshot.forEach(docSnap => {
        const item = docSnap.data()
        // Skip completely soft-deleted products (isDeleted: true)
        if (item.isDeleted === true) return
        item.id = docSnap.id
        productsList.push(item)
      })

      // Sort locally by createdAt desc to bypass index requirements
      productsList.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
        return dateB - dateA
      })

      // 2. Fetch all orders containing this seller's products to check for order dependency
      const ordersSnapshot = await getDocs(query(collection(db, 'orders')))
      ordersList = []
      ordersSnapshot.forEach(docSnap => {
        const order = docSnap.data()
        order.id = docSnap.id
        // Filter locally for simplicity and speed
        const hasMyProduct = order.items?.some(item => item.sellerId === currentUser.uid)
        if (hasMyProduct) {
          ordersList.push(order)
        }
      })

      renderProducts()

    } catch (error) {
      console.error('Error fetching seller products data:', error)
      container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--danger);">Failed to load product listings.</div>`
      handleFirestoreError(error, OperationType.GET, 'products')
    }
  }

  // Render products with filters and search applied
  function renderProducts() {
    container.innerHTML = ''

    // Apply filter and search query
    const filtered = productsList.filter(prod => {
      // Search search keyword match
      const titleMatch = prod.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         prod.description?.toLowerCase().includes(searchQuery.toLowerCase())

      if (!titleMatch) return false

      // Tab filters
      const isDraft = prod.isActive === false && !prod.isDeleted
      const isOutOfStock = Number(prod.stock || 0) === 0
      const isActive = prod.isActive !== false && Number(prod.stock || 0) > 0

      if (currentFilter === 'active') {
        return isActive
      } else if (currentFilter === 'draft') {
        return isDraft
      } else if (currentFilter === 'outofstock') {
        return isOutOfStock
      }
      return true
    })

    if (filtered.length === 0) {
      container.innerHTML = renderEmptyState(
        'package',
        'No matching products found',
        'Try typing another title, clearing filters or add a new listing to sell.',
        'Add New Product',
        '/seller/add-product.html'
      )
      return
    }

    filtered.forEach(prod => {
      const rowWrapper = document.createElement('div')
      rowWrapper.className = 'swipe-container'
      
      const card = document.createElement('div')
      card.className = 'product-list-card'
      
      const image = prod.image || prod.images?.[0] || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'
      const stockVal = Number(prod.stock || 0)
      
      let statusLabel = 'ACTIVE'
      let statusClass = 'status-active'
      if (prod.isActive === false) {
        statusLabel = 'DRAFT / INACTIVE'
        statusClass = 'status-draft'
      } else if (stockVal === 0) {
        statusLabel = 'OUT OF STOCK'
        statusClass = 'status-outofstock'
      }

      card.innerHTML = `
        <img src="${image}" alt="${prod.name}">
        <div class="product-card-details">
          <h4 class="product-card-title">${prod.name}</h4>
          <div class="product-card-price">${formatMWK(prod.price)}</div>
          <div class="product-card-meta">
            <span class="product-stock-badge">${stockVal} left</span>
            <span class="product-status-tag ${statusClass}">${statusLabel}</span>
          </div>
        </div>
      `

      // Swipe buttons underlay
      const underlay = document.createElement('div')
      underlay.className = 'swipe-actions-underlay'
      underlay.innerHTML = `
        <button class="underlay-btn underlay-edit" style="width: 70px;">Edit</button>
        <button class="underlay-btn underlay-delete" style="width: 70px;">Delete</button>
      `

      rowWrapper.appendChild(card)
      rowWrapper.appendChild(underlay)
      container.appendChild(rowWrapper)

      // Attach Swipe touch events
      let startX = 0
      let currentX = 0
      let isOpen = false

      card.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX
      }, { passive: true })

      card.addEventListener('touchmove', (e) => {
        currentX = e.touches[0].clientX
        let diff = currentX - startX
        
        if (diff < 0) {
          // Swiping left
          let move = Math.max(diff, -140)
          card.style.transform = `translateX(${move}px)`
        } else if (diff > 0 && isOpen) {
          // Swiping right to close
          let move = -140 + diff
          card.style.transform = `translateX(${Math.min(move, 0)}px)`
        }
      }, { passive: true })

      card.addEventListener('touchend', (e) => {
        let diff = currentX - startX
        if (diff < -50) {
          card.style.transform = 'translateX(-140px)'
          isOpen = true
        } else {
          card.style.transform = 'translateX(0)'
          isOpen = false
        }
      })

      // Standard desktop click edit/delete triggers (fallback context clicks)
      // Double tap or long hold or click edit directly:
      underlay.querySelector('.underlay-edit').addEventListener('click', () => {
        redirect(`/seller/edit-product.html?id=${prod.id}`)
      })

      underlay.querySelector('.underlay-delete').addEventListener('click', () => {
        triggerDeleteFlow(prod)
      })

      // Also tap card itself to navigate or close if swipe open
      card.addEventListener('click', () => {
        if (isOpen) {
          card.style.transform = 'translateX(0)'
          isOpen = false
        } else {
          redirect(`/seller/edit-product.html?id=${prod.id}`)
        }
      })
    })
  }

  // Handle deletion checks and prompt options
  function triggerDeleteFlow(prod) {
    // Check if this product is used in any orders
    const hasOrders = ordersList.some(order => order.items?.some(item => item.productId === prod.id))

    modalBtns.innerHTML = ''
    modal.style.display = 'flex'

    if (hasOrders) {
      modalTitle.textContent = 'Listing Has Orders'
      modalDesc.textContent = `"${prod.name}" has previous order records. To protect your order history, would you like to Deactivate this listing so customers can't buy it, or Delete it anyway?`
      
      modalBtns.innerHTML = `
        <button class="btn btn--primary" id="btn-modal-deactivate" style="width: 100%;">Deactivate Listing</button>
        <button class="btn btn--outline" id="btn-modal-delete-anyway" style="border-color: var(--danger); color: var(--danger); width: 100%;">Delete Listing Anyway</button>
        <button class="btn btn--grey" id="btn-modal-cancel" style="width: 100%; margin-top: 6px;">Cancel</button>
      `

      document.getElementById('btn-modal-deactivate').onclick = async () => {
        await deactivateListing(prod)
      }
      document.getElementById('btn-modal-delete-anyway').onclick = async () => {
        if (confirm(`Confirm permanent deletion of ${prod.name}?`)) {
          await softDeleteListing(prod)
        }
      }
    } else {
      modalTitle.textContent = 'Delete Listing Permanently?'
      modalDesc.textContent = `Are you sure you want to permanently delete "${prod.name}"? This action cannot be undone.`
      
      modalBtns.innerHTML = `
        <button class="btn btn--danger" id="btn-modal-delete" style="width: 100%;">Delete Listing</button>
        <button class="btn btn--grey" id="btn-modal-cancel" style="width: 100%; margin-top: 6px;">Cancel</button>
      `

      document.getElementById('btn-modal-delete').onclick = async () => {
        await softDeleteListing(prod)
      }
    }

    document.getElementById('btn-modal-cancel').onclick = () => {
      modal.style.display = 'none'
    }
  }

  // Deactivate listing (set isActive = false)
  async function deactivateListing(prod) {
    try {
      await updateDoc(doc(db, 'products', prod.id), {
        isActive: false,
        updatedAt: serverTimestamp()
      })
      showToast('Product deactivated successfully.', 'success')
      modal.style.display = 'none'
      await loadProductsData()
    } catch (err) {
      console.error(err)
      showToast('Could not deactivate listing.', 'danger')
      handleFirestoreError(err, OperationType.UPDATE, `products/${prod.id}`)
    }
  }

  // Soft delete listing (set isDeleted = true)
  async function softDeleteListing(prod) {
    try {
      await updateDoc(doc(db, 'products', prod.id), {
        isDeleted: true,
        isActive: false,
        updatedAt: serverTimestamp()
      })
      showToast('Product successfully deleted.', 'success')
      modal.style.display = 'none'
      await loadProductsData()
    } catch (err) {
      console.error(err)
      showToast('Could not delete listing.', 'danger')
      handleFirestoreError(err, OperationType.UPDATE, `products/${prod.id}`)
    }
  }

  // Search input handler
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim()
    renderProducts()
  })

  // Filter tab handler
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      currentFilter = tab.dataset.tab
      renderProducts()
    })
  })
})
