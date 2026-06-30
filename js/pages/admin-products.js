/**
 * ShopEasy Admin Portal - Product Moderation Module
 */

import { db } from '../firebase-config.js'
import { 
  collection, query, where, getDocs, doc, updateDoc, addDoc, onSnapshot, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { initAuth, currentUser } from '../auth.js'
import { formatMWK, formatDate, showToast } from '../utils.js'

// Global states
let allProducts = []
let filteredProducts = []
let activeTab = 'all' // 'all', 'featured', 'banned'
let searchQuery = ''
let selectedProductId = null
let currentPage = 1
const PRODUCTS_PER_PAGE = 20

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

  // Load products feed
  loadProductsFeed()
})

function setupEventListeners() {
  // Search
  const searchInput = document.getElementById('product-search')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim()
      currentPage = 1
      applyFiltersAndRender()
    })
  }

  // Tabs
  const tabs = ['all', 'featured', 'banned']
  tabs.forEach(tab => {
    const btn = document.getElementById(`tab-${tab}`)
    if (btn) {
      btn.addEventListener('click', () => {
        tabs.forEach(t => document.getElementById(`tab-${t}`)?.classList.remove('active'))
        btn.classList.add('active')
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
        renderProductsTable()
      }
    })
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const maxPage = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE)
      if (currentPage < maxPage) {
        currentPage++
        renderProductsTable()
      }
    })
  }

  // Ban modal close
  const banCancel = document.getElementById('ban-product-cancel')
  const banClose = document.getElementById('ban-product-close')
  if (banCancel) banCancel.addEventListener('click', closeBanModal)
  if (banClose) banClose.addEventListener('click', closeBanModal)

  // Ban confirm
  const banConfirm = document.getElementById('ban-product-confirm')
  if (banConfirm) {
    banConfirm.addEventListener('click', confirmBanProduct)
  }
}

function loadProductsFeed() {
  const tableBody = document.getElementById('products-table-body')
  const productsRef = collection(db, 'products')

  onSnapshot(productsRef, (snapshot) => {
    allProducts = []
    snapshot.forEach(docSnap => {
      allProducts.push({ id: docSnap.id, ...docSnap.data() })
    })

    // Sort by name or date (newest first)
    allProducts.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
      return dateB - dateA
    })

    applyFiltersAndRender()
  }, (err) => {
    console.error('Error listening to products collection:', err)
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 24px;">Failed to load products list.</td></tr>`
    }
  })
}

function applyFiltersAndRender() {
  filteredProducts = allProducts.filter(prod => {
    // 1. Filter by Tab
    const isBanned = prod.isActive === false

    if (activeTab === 'featured' && !prod.isFeatured) return false
    if (activeTab === 'banned' && !isBanned) return false
    if (activeTab === 'all' && isBanned) return false // Hide banned items from 'All' tab to mirror clean moderation directories!

    // 2. Search filter (title, seller name, category slug)
    if (searchQuery) {
      const title = (prod.name || '').toLowerCase()
      const seller = (prod.storeName || '').toLowerCase()
      const category = (prod.categoryName || prod.category || '').toLowerCase()
      return title.includes(searchQuery) || seller.includes(searchQuery) || category.includes(searchQuery)
    }

    return true
  })

  renderProductsTable()
}

function renderProductsTable() {
  const tableBody = document.getElementById('products-table-body')
  if (!tableBody) return

  if (filteredProducts.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--grey-600); padding: 32px;">No matching products found.</td></tr>`
    document.getElementById('pagination-info').textContent = 'Showing 0-0 of 0 products'
    document.getElementById('btn-prev-page').disabled = true
    document.getElementById('btn-next-page').disabled = true
    return
  }

  const startIdx = (currentPage - 1) * PRODUCTS_PER_PAGE
  const endIdx = Math.min(startIdx + PRODUCTS_PER_PAGE, filteredProducts.length)
  const paginatedList = filteredProducts.slice(startIdx, endIdx)

  tableBody.innerHTML = ''
  paginatedList.forEach(prod => {
    const tr = document.createElement('tr')

    const image = prod.image || prod.images?.[0] || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'
    const sellerName = prod.storeName || 'ShopEasy Seller'
    const priceText = formatMWK(prod.price || 0)
    const isBanned = prod.isActive === false

    // Featured toggle checkbox styling
    const featuredCheckboxHtml = `
      <label class="switch" style="transform: scale(0.85);">
        <input type="checkbox" id="feature-toggle-${prod.id}" ${prod.isFeatured ? 'checked' : ''} ${isBanned ? 'disabled' : ''}>
        <span class="slider"></span>
      </label>
    `

    // Status styling
    let statusText = 'Active'
    let statusClass = 'badge--success'
    if (isBanned) {
      statusText = 'Banned'
      statusClass = 'badge--danger'
    } else if (prod.stock <= 0) {
      statusText = 'Out of Stock'
      statusClass = 'badge--warning'
    }

    tr.innerHTML = `
      <td>
        <div style="display: flex; align-items: center; gap: 10px; max-width: 250px;">
          <img src="${image}" alt="${prod.name}" style="width: 36px; height: 36px; border-radius: 4px; object-fit: cover; background-color: var(--grey-200);">
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <div style="font-weight: 700; color: var(--secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${prod.name || 'Unnamed Product'}</div>
            <div style="font-size: 0.7rem; color: var(--grey-600);">${prod.categoryName || prod.category || 'General'}</div>
          </div>
        </div>
      </td>
      <td style="font-weight: 500;">${sellerName}</td>
      <td>${prod.city || 'Malawi'}</td>
      <td style="font-weight: 700; color: var(--secondary);">${priceText}</td>
      <td style="color: var(--grey-800); font-weight: 600;">${prod.sold || 0}</td>
      <td>${featuredCheckboxHtml}</td>
      <td><span class="badge ${statusClass}">${statusText}</span></td>
      <td>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${isBanned ? `
            <button class="btn btn--success btn--sm" id="btn-restore-${prod.id}" style="padding: 4px 8px; font-size: 0.68rem; font-weight: 700;">
              Restore
            </button>
          ` : `
            <button class="btn btn--danger btn--sm" id="btn-ban-${prod.id}" style="padding: 4px 8px; font-size: 0.68rem; font-weight: 700;">
              Ban / Remove
            </button>
          `}
        </div>
      </td>
    `
    tableBody.appendChild(tr)

    // Bind checkbox change
    const cb = document.getElementById(`feature-toggle-${prod.id}`)
    if (cb) {
      cb.addEventListener('change', (e) => toggleProductFeatured(prod, e.target.checked))
    }

    // Bind action buttons
    const banBtn = document.getElementById(`btn-ban-${prod.id}`)
    const restoreBtn = document.getElementById(`btn-restore-${prod.id}`)
    if (banBtn) {
      banBtn.addEventListener('click', () => openBanModal(prod.id))
    }
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => restoreProduct(prod))
    }
  })

  // Update pagination info
  document.getElementById('pagination-info').textContent = `Showing ${startIdx + 1}-${endIdx} of ${filteredProducts.length} products`
  document.getElementById('btn-prev-page').disabled = currentPage === 1
  document.getElementById('btn-next-page').disabled = endIdx >= filteredProducts.length
}

async function toggleProductFeatured(prod, isFeatured) {
  try {
    // 1. Update product isFeatured state in Firestore
    await updateDoc(doc(db, 'products', prod.id), {
      isFeatured: isFeatured,
      updatedAt: serverTimestamp()
    })

    // 2. Log admin action
    await addDoc(collection(db, 'adminLogs'), {
      adminUid: currentUser.uid,
      adminName: currentUser.displayName || 'ShopEasy Admin',
      action: isFeatured ? 'feature_product' : 'unfeature_product',
      targetId: prod.id,
      targetName: prod.name || 'Unnamed',
      details: `${isFeatured ? 'Promoted' : 'Removed from'} home page featured carousel.`,
      createdAt: serverTimestamp()
    })

    showToast(`Successfully ${isFeatured ? 'featured' : 'unfeatured'} "${prod.name}".`, 'success')
  } catch (err) {
    console.error('Failed to update product featured flag:', err)
    showToast('Failed to modify listing promotion.', 'danger')
  }
}

function openBanModal(productId) {
  selectedProductId = productId
  const reasonInput = document.getElementById('ban-product-reason')
  reasonInput.value = ''
  document.getElementById('ban-product-reason-error').style.display = 'none'
  document.getElementById('ban-product-modal').classList.add('modal--visible')
}

function closeBanModal() {
  document.getElementById('ban-product-modal').classList.remove('modal--visible')
  selectedProductId = null
}

async function confirmBanProduct() {
  if (!selectedProductId) return

  const reasonInput = document.getElementById('ban-product-reason')
  const reasonText = reasonInput.value.trim()
  const errorMsg = document.getElementById('ban-product-reason-error')

  if (!reasonText) {
    errorMsg.style.display = 'block'
    return
  }
  errorMsg.style.display = 'none'

  const confirmBtn = document.getElementById('ban-product-confirm')
  confirmBtn.disabled = true
  confirmBtn.textContent = 'Removing...'

  try {
    // 1. Fetch product to obtain sellerId and title
    let prodData = null
    allProducts.forEach(p => {
      if (p.id === selectedProductId) prodData = p
    })

    if (!prodData) throw new Error('Product metadata missing.')

    // 2. Update product fields in Firestore: isActive = false, banReason = reason
    await updateDoc(doc(db, 'products', selectedProductId), {
      isActive: false,
      isFeatured: false, // Turn off featured automatically if banned!
      banReason: reasonText,
      updatedAt: serverTimestamp()
    })

    // 3. Write real notification to product seller
    await addDoc(collection(db, 'notifications'), {
      recipientId: prodData.sellerId,
      userId: prodData.sellerId,
      type: 'product_banned',
      title: '🚫 Product Listing Removed',
      body: `Your product listing "${prodData.name}" has been removed by administration. Reason: ${reasonText}`,
      read: false,
      createdAt: serverTimestamp()
    })

    // 4. Log to adminLogs
    await addDoc(collection(db, 'adminLogs'), {
      adminUid: currentUser.uid,
      adminName: currentUser.displayName || 'ShopEasy Admin',
      action: 'remove_product',
      targetId: selectedProductId,
      targetName: prodData.name || 'Unnamed',
      details: `Banned product listing. Reason: ${reasonText}`,
      createdAt: serverTimestamp()
    })

    showToast('Product listing removed and banned.', 'success')
    closeBanModal()
  } catch (err) {
    console.error('Failed to ban product listing:', err)
    showToast('Failed to complete moderation.', 'danger')
  } finally {
    confirmBtn.disabled = false
    confirmBtn.textContent = 'Remove Listing'
  }
}

async function restoreProduct(prod) {
  if (confirm(`Restore product listing "${prod.name || 'item'}"? This will make it active and searchable on ShopEasy.`)) {
    try {
      // 1. Update product in Firestore: isActive = true
      await updateDoc(doc(db, 'products', prod.id), {
        isActive: true,
        banReason: null,
        updatedAt: serverTimestamp()
      })

      // 2. Write notification
      await addDoc(collection(db, 'notifications'), {
        recipientId: prod.sellerId,
        userId: prod.sellerId,
        type: 'product_restored',
        title: '✅ Product Listing Restored',
        body: `Your product listing "${prod.name}" has been restored and is now active on ShopEasy.`,
        read: false,
        createdAt: serverTimestamp()
      })

      // 3. Log to adminLogs
      await addDoc(collection(db, 'adminLogs'), {
        adminUid: currentUser.uid,
        adminName: currentUser.displayName || 'ShopEasy Admin',
        action: 'restore_product',
        targetId: prod.id,
        targetName: prod.name || 'Unnamed',
        details: 'Restored active status for product listing.',
        createdAt: serverTimestamp()
      })

      showToast(`Restored "${prod.name}" successfully.`, 'success')
    } catch (err) {
      console.error('Error restoring product listing:', err)
      showToast('Restoration action failed.', 'danger')
    }
  }
}
