import { db, auth } from '../firebase-config.js'
import { initAuth, currentUserData } from '../auth.js'
import { 
  collection, query, orderBy, limit, 
  startAfter, getDocs, where
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { formatMWK, showToast } from '../utils.js'
import { renderProductCard, renderSkeleton, renderEmptyState } 
  from '../ui.js'

let lastProductDoc = null
const PAGE_SIZE = 12

const init = async () => {
  // Check auth state and personalise
  await initAuth()
  
  if (currentUserData) {
    showGreeting()
    updateCartBadge()
    updateMessageBadge()
  }
  
  await Promise.all([
    loadCategories(),
    loadLatestProducts(),
    loadSellers(),
    loadAllProducts()
  ])
}

const showGreeting = () => {
  document.getElementById('welcomeSection').classList.add('hidden')
  document.getElementById('greetingSection').classList.remove('hidden')
  
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' 
    : hour < 17 ? 'Good afternoon' 
    : 'Good evening'
  
  document.getElementById('greetingText').textContent = greeting
  document.getElementById('greetingName').textContent = 
    currentUserData.name.split(' ')[0]
  
  const avatar = document.getElementById('greetingAvatar')
  if (currentUserData.avatar) {
    avatar.style.backgroundImage = `url(${currentUserData.avatar})`
    avatar.classList.add('has-image')
  } else {
    avatar.textContent = currentUserData.name.charAt(0).toUpperCase()
  }
}

const updateCartBadge = async () => {
  const cartBadge = document.getElementById('cartBadge')
  if (!cartBadge || !auth.currentUser) return
  try {
    const snap = await getDocs(collection(db, `carts/${auth.currentUser.uid}/items`))
    const count = snap.size
    if (count > 0) {
      cartBadge.textContent = count
      cartBadge.classList.remove('hidden')
    } else {
      cartBadge.classList.add('hidden')
    }
  } catch (err) {
    console.error("Error updating cart badge: ", err)
  }
}

const updateMessageBadge = async () => {
  const msgBadge = document.getElementById('msgBadge')
  if (!msgBadge || !auth.currentUser) return
  try {
    const uid = auth.currentUser.uid
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
    
    if (unreadCount > 0) {
      msgBadge.textContent = unreadCount
      msgBadge.classList.remove('hidden')
    } else {
      msgBadge.classList.add('hidden')
    }
  } catch (err) {
    console.error("Error updating message badge: ", err)
  }
}

const loadCategories = async () => {
  const container = document.getElementById('categoriesList')
  try {
    const snap = await getDocs(
      query(collection(db, 'categories'), 
        orderBy('sortOrder', 'asc'))
    )
    
    if (snap.empty) {
      document.getElementById('categoriesSection').style.display = 'none'
      return
    }
    
    container.innerHTML = snap.docs.map(doc => {
      const c = doc.data()
      return `
        <a href="category.html?slug=${c.slug}" class="category-chip">
          <span class="category-chip__emoji">${c.emoji || '📦'}</span>
          <span class="category-chip__name">${c.name}</span>
        </a>
      `
    }).join('')
    
  } catch (err) {
    container.innerHTML = ''
  }
}

const loadLatestProducts = async () => {
  const container = document.getElementById('latestProducts')
  container.innerHTML = renderSkeleton(4)
  
  try {
    let snap
    try {
      snap = await getDocs(
        query(collection(db, 'products'),
          where('isActive', '==', true),
          orderBy('createdAt', 'desc'),
          limit(6))
      )
    } catch (queryErr) {
      console.warn("Index not found, falling back to client-side sorting/filtering for latest products", queryErr)
      const fallbackQuery = query(collection(db, 'products'), where('isActive', '==', true))
      const allSnap = await getDocs(fallbackQuery)
      let sortedDocs = [...allSnap.docs]
      sortedDocs.sort((a, b) => {
        const dateA = a.data().createdAt?.toDate ? a.data().createdAt.toDate() : new Date(a.data().createdAt || 0)
        const dateB = b.data().createdAt?.toDate ? b.data().createdAt.toDate() : new Date(b.data().createdAt || 0)
        return dateB - dateA
      })
      snap = {
        empty: sortedDocs.length === 0,
        docs: sortedDocs.slice(0, 6)
      }
    }
    
    if (snap.empty) {
      container.innerHTML = ''
      document.getElementById('latestEmpty').innerHTML = 
        renderEmptyState('package', 'No listings yet', 
          'Be the first to list a product!', 
          'Sell Something', 'sell-redirect.html')
      document.getElementById('latestEmpty')
        .classList.remove('hidden')
      return
    }
    
    container.innerHTML = snap.docs.map(doc => 
      renderProductCard({ id: doc.id, ...doc.data() })
    ).join('')
    
  } catch (err) {
    console.error("Error loading latest products: ", err)
    container.innerHTML = renderEmptyState(
      'package', 'Could not load products', 
      'Check your connection and refresh', 
      'Refresh', '#')
  }
}

const loadSellers = async () => {
  const container = document.getElementById('sellersList')
  try {
    let snap
    try {
      snap = await getDocs(
        query(collection(db, 'stores'),
          where('status', '==', 'approved'),
          orderBy('createdAt', 'desc'),
          limit(8))
      )
    } catch (queryErr) {
      console.warn("Index not found, falling back to client-side sorting/filtering for sellers", queryErr)
      const fallbackQuery = query(collection(db, 'stores'), where('status', '==', 'approved'))
      const allSnap = await getDocs(fallbackQuery)
      let sortedDocs = [...allSnap.docs]
      sortedDocs.sort((a, b) => {
        const dateA = a.data().createdAt?.toDate ? a.data().createdAt.toDate() : new Date(a.data().createdAt || 0)
        const dateB = b.data().createdAt?.toDate ? b.data().createdAt.toDate() : new Date(b.data().createdAt || 0)
        return dateB - dateA
      })
      snap = {
        empty: sortedDocs.length === 0,
        docs: sortedDocs.slice(0, 8)
      }
    }
    
    if (snap.empty) {
      document.getElementById('sellersSection').style.display = 'none'
      return
    }
    
    container.innerHTML = snap.docs.map(doc => {
      const s = doc.data()
      return `
        <a href="store.html?id=${doc.id}" class="store-chip">
          <div class="store-chip__logo">
            ${s.logo 
              ? `<img src="${s.logo}" alt="${s.name}">` 
              : `<span>${s.name.charAt(0)}</span>`}
          </div>
          <span class="store-chip__name">${s.name}</span>
          <span class="store-chip__city">${s.city}</span>
        </a>
      `
    }).join('')
    
  } catch (err) {
    console.error("Error loading sellers: ", err)
    document.getElementById('sellersSection').style.display = 'none'
  }
}

const loadAllProducts = async (loadMore = false) => {
  const container = document.getElementById('allProducts')
  if (!loadMore) container.innerHTML = renderSkeleton(12)
  
  try {
    let q = query(collection(db, 'products'),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE))
    
    if (loadMore && lastProductDoc) {
      q = query(collection(db, 'products'),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc'),
        startAfter(lastProductDoc),
        limit(PAGE_SIZE))
    } else {
      container.innerHTML = ''
    }
    
    let snap
    try {
      snap = await getDocs(q)
    } catch (queryErr) {
      console.warn("Index not found, falling back to client-side sorting/filtering for all products", queryErr)
      const fallbackQuery = query(collection(db, 'products'), where('isActive', '==', true))
      const allSnap = await getDocs(fallbackQuery)
      let sortedDocs = [...allSnap.docs]
      sortedDocs.sort((a, b) => {
        const dateA = a.data().createdAt?.toDate ? a.data().createdAt.toDate() : new Date(a.data().createdAt || 0)
        const dateB = b.data().createdAt?.toDate ? b.data().createdAt.toDate() : new Date(b.data().createdAt || 0)
        return dateB - dateA
      })
      
      const offset = loadMore && lastProductDoc ? sortedDocs.findIndex(d => d.id === lastProductDoc.id) + 1 : 0
      const paginatedDocs = sortedDocs.slice(offset, offset + PAGE_SIZE)
      
      snap = {
        empty: paginatedDocs.length === 0,
        docs: paginatedDocs
      }
    }
    
    if (snap.empty && !loadMore) {
      container.innerHTML = `<div style="text-align: center; padding: 32px; color: var(--grey-600); grid-column: span 2;">No products available.</div>`
      return
    }
    
    lastProductDoc = snap.docs[snap.docs.length - 1]
    
    const html = snap.docs.map(doc => 
      renderProductCard({ id: doc.id, ...doc.data() })
    ).join('')
    
    container.insertAdjacentHTML('beforeend', html)
    
    const loadMoreBtn = document.getElementById('loadMoreBtn')
    loadMoreBtn.style.display = 
      snap.docs.length === PAGE_SIZE ? 'block' : 'none'
    
  } catch (err) {
    console.error("Error loading all products: ", err)
    if (!loadMore) {
      container.innerHTML = renderEmptyState(
        'package', 'Could not load products', '', 'Refresh', '#')
    }
  }
}

document.getElementById('loadMoreBtn')
  .addEventListener('click', () => loadAllProducts(true))

init()
