/**
 * ShopEasy Shop Page Control Module
 */

import { db, auth } from '../firebase-config.js'
import { initAuth, currentUserData, currentUser } from '../auth.js'
import { 
  collection, 
  getDocs, 
  query, 
  orderBy,
  where,
  limit,
  startAfter
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { renderProductCard, renderSkeleton, renderEmptyState, renderErrorState } from '../ui.js'
import { handleFirestoreError, OperationType, showToast } from '../utils.js'

const PAGE_SIZE = 6

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Auth
  await initAuth()

  let activeTab = 'for-you' // for-you, new-arrivals, popular, by-location
  let lastProductDoc = null
  let isFetching = false

  const productGrid = document.getElementById('shopProductGrid')
  const emptyStateContainer = document.getElementById('shopEmptyState')
  const loadMoreBtn = document.getElementById('loadMoreBtn')
  const sidebarCategoryList = document.getElementById('sidebarCategoryList')
  const allProductsLink = document.getElementById('allProductsLink')

  // Mobile Sidebar elements
  const shopSidebar = document.getElementById('shopSidebar')
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn')
  const closeSidebarBtn = document.getElementById('closeSidebarBtn')
  const sidebarBackdrop = document.getElementById('sidebarBackdrop')
  const filterFab = document.getElementById('filterFab')

  // Badges update
  updateBadges()

  // --- Mobile Sidebar Controls ---
  const openSidebar = () => {
    shopSidebar.classList.add('active')
    sidebarBackdrop.classList.add('active')
  }

  const closeSidebar = () => {
    shopSidebar.classList.remove('active')
    sidebarBackdrop.classList.remove('active')
  }

  if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', openSidebar)
  if (filterFab) filterFab.addEventListener('click', openSidebar)
  if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar)
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar)

  // --- Load Categories ---
  const loadCategories = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'categories'), orderBy('sortOrder', 'asc'))
      )
      
      if (snap.empty) {
        sidebarCategoryList.innerHTML = `<li style="padding: 10px; font-size: 0.85rem; color: var(--grey-600);">No categories found.</li>`
        return
      }

      sidebarCategoryList.innerHTML = snap.docs.map(doc => {
        const cat = doc.data()
        const slug = cat.slug || doc.id
        const name = cat.name || 'Unnamed'
        const emoji = cat.emoji || cat.icon || '📦'
        const count = cat.productCount || 0

        return `
          <li class="sidebar-category-item" data-slug="${slug}">
            <span class="sidebar-category-item__meta">
              <span>${emoji}</span>
              <span>${name}</span>
            </span>
            <span class="sidebar-category-item__count">${count}</span>
          </li>
        `
      }).join('')

      // Click handler on category items to navigate
      document.querySelectorAll('.sidebar-category-item').forEach(item => {
        item.addEventListener('click', () => {
          const slug = item.dataset.slug
          window.location.href = `category.html?slug=${slug}`
        })
      })

    } catch (err) {
      console.error("Error loading categories:", err)
      sidebarCategoryList.innerHTML = `<li style="padding: 10px; font-size: 0.85rem; color: var(--grey-600);">Could not load categories</li>`
    }
  }

  // --- Load Products ---
  const loadProducts = async (append = false) => {
    if (isFetching) return
    isFetching = true

    if (!append) {
      productGrid.innerHTML = renderSkeleton(PAGE_SIZE)
      emptyStateContainer.classList.add('hidden')
      loadMoreBtn.style.display = 'none'
      lastProductDoc = null
    } else {
      loadMoreBtn.textContent = 'Loading...'
      loadMoreBtn.disabled = true
    }

    try {
      let q
      const constraints = [where('isActive', '==', true)]

      if (activeTab === 'for-you' || activeTab === 'new-arrivals') {
        constraints.push(orderBy('createdAt', 'desc'))
      } else if (activeTab === 'popular') {
        constraints.push(orderBy('sold', 'desc'))
      } else if (activeTab === 'by-location') {
        const userCity = currentUserData?.city || 'Lilongwe'
        constraints.push(where('city', '==', userCity))
        constraints.push(orderBy('createdAt', 'desc'))
      }

      constraints.push(limit(PAGE_SIZE))

      if (append && lastProductDoc) {
        constraints.push(startAfter(lastProductDoc))
      }

      q = query(collection(db, 'products'), ...constraints)

      let snap
      try {
        snap = await getDocs(q)
      } catch (queryErr) {
        // Fallback if index is not ready yet
        console.warn("Index not found, falling back to client-side sorting/filtering for: " + activeTab, queryErr)
        
        let fallbackConstraints = [where('isActive', '==', true)]
        if (activeTab === 'by-location') {
          const userCity = currentUserData?.city || 'Lilongwe'
          fallbackConstraints.push(where('city', '==', userCity))
        }
        
        const fallbackQuery = query(collection(db, 'products'), ...fallbackConstraints)
        const allSnap = await getDocs(fallbackQuery)
        
        // Manual sorting
        let sortedDocs = [...allSnap.docs]
        if (activeTab === 'popular') {
          sortedDocs.sort((a, b) => Number(b.data().sold || 0) - Number(a.data().sold || 0))
        } else {
          sortedDocs.sort((a, b) => {
            const dateA = a.data().createdAt?.toDate ? a.data().createdAt.toDate() : new Date(a.data().createdAt || 0)
            const dateB = b.data().createdAt?.toDate ? b.data().createdAt.toDate() : new Date(b.data().createdAt || 0)
            return dateB - dateA
          })
        }

        // Handle simple client pagination manually
        const offset = append && lastProductDoc ? sortedDocs.findIndex(d => d.id === lastProductDoc.id) + 1 : 0
        const paginatedDocs = sortedDocs.slice(offset, offset + PAGE_SIZE)
        
        snap = {
          empty: paginatedDocs.length === 0,
          docs: paginatedDocs
        }
      }

      if (!append) {
        productGrid.innerHTML = ''
      }

      if (snap.empty) {
        if (!append) {
          showEmptyStateForTab()
        }
        loadMoreBtn.style.display = 'none'
        isFetching = false
        return
      }

      lastProductDoc = snap.docs[snap.docs.length - 1]

      const productsHTML = snap.docs.map(doc => {
        return renderProductCard({ id: doc.id, ...doc.data() })
      }).join('')

      productGrid.insertAdjacentHTML('beforeend', productsHTML)

      // Only show Load More if we fetched full page size
      if (snap.docs.length === PAGE_SIZE) {
        loadMoreBtn.style.display = 'block'
        loadMoreBtn.textContent = 'Load More'
        loadMoreBtn.disabled = false
      } else {
        loadMoreBtn.style.display = 'none'
      }

    } catch (err) {
      console.error("Error loading products:", err)
      if (!append) {
        productGrid.innerHTML = renderErrorState('Failed to load listings. Please try again.')
      } else {
        showToast('Error loading more items', 'danger')
        loadMoreBtn.textContent = 'Load More'
        loadMoreBtn.disabled = false
      }
    } finally {
      isFetching = false
    }
  }

  const showEmptyStateForTab = () => {
    let title = 'No Listings Found'
    let msg = 'Be the first to list an item in this category!'
    let btnText = 'Sell Something'
    let btnHref = 'seller/add-product.html'

    if (activeTab === 'by-location') {
      const city = currentUserData?.city || 'your city'
      title = `No Items in ${city}`
      msg = `Be the first to list an item in ${city}!`
    }

    emptyStateContainer.innerHTML = renderEmptyState('package', title, msg, btnText, btnHref)
    emptyStateContainer.classList.remove('hidden')
  }

  // --- Tabs Click Handlers ---
  document.querySelectorAll('.shop-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('shop-tab--active'))
      tab.classList.add('shop-tab--active')
      activeTab = tab.dataset.tab

      // Special check for Location tab authentication or city settings
      if (activeTab === 'by-location') {
        if (!currentUser) {
          productGrid.innerHTML = ''
          emptyStateContainer.innerHTML = renderEmptyState(
            'user',
            'Authentication Required',
            'Sign in to browse products listed in your city.',
            'Sign In',
            'login.html'
          )
          emptyStateContainer.classList.remove('hidden')
          loadMoreBtn.style.display = 'none'
          return
        } else if (!currentUserData?.city) {
          productGrid.innerHTML = ''
          emptyStateContainer.innerHTML = renderEmptyState(
            'user',
            'Set Your Location',
            'Please update your profile with your city to see nearby products.',
            'Update Profile',
            'account.html'
          )
          emptyStateContainer.classList.remove('hidden')
          loadMoreBtn.style.display = 'none'
          return
        }
      }

      loadProducts(false)
    })
  })

  // Load More event listener
  loadMoreBtn.addEventListener('click', () => loadProducts(true))

  // --- App initialization ---
  await loadCategories()
  await loadProducts()
})

// Badges count fetching
async function updateBadges() {
  const cartBadge = document.getElementById('cartBadge')
  const msgBadge = document.getElementById('msgBadge')
  if (!auth.currentUser) return

  const uid = auth.currentUser.uid

  // Cart count
  try {
    const snap = await getDocs(collection(db, `carts/${uid}/items`))
    const count = snap.size
    if (cartBadge) {
      if (count > 0) {
        cartBadge.textContent = count
        cartBadge.classList.remove('hidden')
      } else {
        cartBadge.classList.add('hidden')
      }
    }
  } catch (err) {
    console.error("Cart badge update error:", err)
  }

  // Unread messages count
  try {
    const buyerQuery = query(collection(db, 'conversations'), where('buyerId', '==', uid))
    const sellerQuery = query(collection(db, 'conversations'), where('sellerId', '==', uid))
    const [buyerSnap, sellerSnap] = await Promise.all([
      getDocs(buyerQuery),
      getDocs(sellerQuery)
    ])
    
    let unreadCount = 0
    const countedConvos = new Set()
    
    const countUnread = (docSnap) => {
      const data = docSnap.data()
      if (countedConvos.has(docSnap.id)) return
      countedConvos.add(docSnap.id)
      
      if (data.unreadCount > 0 && data.lastSenderId !== uid) {
        unreadCount += data.unreadCount
      }
    }
    
    buyerSnap.forEach(countUnread)
    sellerSnap.forEach(countUnread)
    
    if (msgBadge) {
      if (unreadCount > 0) {
        msgBadge.textContent = unreadCount
        msgBadge.classList.remove('hidden')
      } else {
        msgBadge.classList.add('hidden')
      }
    }
  } catch (err) {
    console.error("Messages badge update error:", err)
  }
}
