/**
 * ShopEasy Global Search Page Control Module
 */

import { db } from '../firebase-config.js'
import { initAuth, currentUser } from '../auth.js'
import { 
  collection, query, where, orderBy, 
  limit, startAfter, getDocs,
  doc, getDoc, setDoc, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { getUrlParam, handleFirestoreError, OperationType } from '../utils.js'
import { injectHeaderAndNav, renderProductCard, renderSkeleton, renderEmptyState, renderErrorState } from '../ui.js'

const HISTORY_KEY = 'se_search_history'
let activeFilters = {}
let sortBy = 'newest'
let lastDoc = null
let currentQuery = ''

const searchInput = document.getElementById('searchInput')
const clearSearchBtn = document.getElementById('clearSearch')

// Safe HTML escaping
function escapeHTML(str) {
  if (!str) return ''
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
}

// Auto-focus search input on load
if (searchInput) {
  searchInput.focus()
  
  // Show/hide clear button based on text
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim()
    if (clearSearchBtn) {
      clearSearchBtn.style.display = q ? 'block' : 'none'
    }
  })

  // Run search on input submit
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = searchInput.value.trim()
      if (q) {
        // Update URL without reload
        history.replaceState(null, '', `search.html?q=${encodeURIComponent(q)}`)
        runSearch(q)
      }
    }
  })
}

// Clear button logic
if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = ''
      searchInput.focus()
    }
    clearSearchBtn.style.display = 'none'
    history.replaceState(null, '', 'search.html')
    showInitialState()
  })
}

// Load Search History list
function loadSearchHistory() {
  const historyList = document.getElementById('searchHistoryList')
  const historySection = document.getElementById('searchHistorySection')
  if (!historyList || !historySection) return

  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  if (history.length === 0) {
    historySection.classList.add('hidden')
    return
  }

  historySection.classList.remove('hidden')
  historyList.innerHTML = history.map((term, index) => {
    return `
      <div class="history-item">
        <div class="history-item__left" data-term="${encodeURIComponent(term)}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>${escapeHTML(term)}</span>
        </div>
        <button class="history-item__remove" data-term="${encodeURIComponent(term)}" aria-label="Remove search term">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
    `
  }).join('')

  // Add click listeners to items
  historyList.querySelectorAll('.history-item__left').forEach(el => {
    el.addEventListener('click', () => {
      const term = decodeURIComponent(el.dataset.term)
      if (searchInput) {
        searchInput.value = term
      }
      history.replaceState(null, '', `search.html?q=${encodeURIComponent(term)}`)
      runSearch(term)
    })
  })

  // Add click listeners to individual remove buttons
  historyList.querySelectorAll('.history-item__remove').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      const term = decodeURIComponent(el.dataset.term)
      removeSearchTerm(term)
    })
  })
}

function removeSearchTerm(term) {
  let historyList = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  historyList = historyList.filter(h => h !== term)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyList))
  
  // Sync to Firestore if logged in
  if (currentUser) {
    setDoc(doc(db, 'users', currentUser.uid, 'searchHistory', 'recent'), {
      terms: historyList,
      updatedAt: serverTimestamp()
    }).catch((e) => console.error("Firestore history sync error:", e))
  }
  
  loadSearchHistory()
}

// Clear all search history
const clearAllBtn = document.getElementById('clearAllHistory')
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY)
    if (currentUser) {
      setDoc(doc(db, 'users', currentUser.uid, 'searchHistory', 'recent'), {
        terms: [],
        updatedAt: serverTimestamp()
      }).catch((e) => console.error("Firestore history clear error:", e))
    }
    loadSearchHistory()
  })
}

// Fetch and load active categories
async function loadCategories() {
  const categoryChipsGrid = document.getElementById('categoryChipsGrid')
  if (!categoryChipsGrid) return

  categoryChipsGrid.innerHTML = `
    <div style="display: flex; gap: 8px; width: 100%; flex-wrap: wrap;">
      ${renderSkeleton(3)}
    </div>
  `

  try {
    const snap = await getDocs(
      query(collection(db, 'categories'), 
        where('productCount', '>', 0))
    )

    if (snap.empty) {
      categoryChipsGrid.innerHTML = '<p style="font-size: 0.85rem; color: var(--grey-600); width: 100%; text-align: center;">No active categories</p>'
      return
    }

    categoryChipsGrid.innerHTML = snap.docs.map(doc => {
      const c = doc.data()
      return `
        <a href="category.html?slug=${c.slug}" class="category-chip">
          <span class="category-chip__emoji">${c.emoji || '📦'}</span>
          <span class="category-chip__name">${c.name}</span>
        </a>
      `
    }).join('')
  } catch (error) {
    categoryChipsGrid.innerHTML = '<p style="font-size: 0.85rem; color: var(--grey-600); width: 100%;">Could not load browse categories</p>'
    console.error("Categories fetch error:", error)
  }
}

function showInitialState() {
  document.getElementById('initialState').classList.remove('hidden')
  document.getElementById('resultsState').classList.add('hidden')
  if (clearSearchBtn) clearSearchBtn.style.display = 'none'
  
  loadSearchHistory()
  loadCategories()
}

function showResultsState(q) {
  document.getElementById('initialState').classList.add('hidden')
  document.getElementById('resultsState').classList.remove('hidden')
  if (clearSearchBtn) clearSearchBtn.style.display = q ? 'block' : 'none'
}

async function runSearch(q) {
  currentQuery = q
  lastDoc = null
  showResultsState(q)
  saveSearchHistory(q)
  await fetchResults()
}

async function fetchResults(append = false) {
  const container = document.getElementById('resultsGrid')
  if (!container) return

  const keyword = currentQuery.toLowerCase().trim().split(' ')[0]
  
  if (!append) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; width: 100%;">
        ${renderSkeleton(4)}
      </div>
    `
  }
  
  try {
    const sortMap = {
      'newest': ['createdAt', 'desc'],
      'popular': ['sold', 'desc'],
      'price-asc': ['price', 'asc'],
      'price-desc': ['price', 'desc']
    }
    const [sf, sd] = sortMap[sortBy]
    
    // Setup queries with constraints
    const constraints = [
      where('isActive', '==', true),
      where('searchKeywords', 'array-contains', keyword),
      orderBy(sf, sd),
      limit(20)
    ]
    
    if (activeFilters.city) {
      constraints.splice(2, 0, where('city', '==', activeFilters.city))
    }
    if (activeFilters.freeDelivery) {
      constraints.splice(2, 0, where('freeDelivery', '==', true))
    }
    if (activeFilters.maxPrice) {
      constraints.splice(2, 0, where('price', '<=', activeFilters.maxPrice))
    }
    
    if (append && lastDoc) {
      constraints.push(startAfter(lastDoc))
    }
    
    let snap
    let isFallback = false
    
    try {
      const q = query(collection(db, 'products'), ...constraints)
      snap = await getDocs(q)
    } catch (err) {
      // Robust Fallback: client-side filtering if composite indexes are missing
      console.warn("Index query failed, falling back to broader query with client-side filtering:", err)
      isFallback = true
      
      const fallbackConstraints = [
        where('isActive', '==', true),
        where('searchKeywords', 'array-contains', keyword),
        orderBy(sf, sd),
        limit(100) // Fetch broader set to allow quality client-side filtering
      ]
      
      if (append && lastDoc) {
        fallbackConstraints.push(startAfter(lastDoc))
      }
      
      const fallbackQuery = query(collection(db, 'products'), ...fallbackConstraints)
      snap = await getDocs(fallbackQuery)
    }
    
    lastDoc = snap.docs[snap.docs.length - 1]
    
    let results = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    
    // Apply client-side filters if we used fallback
    if (isFallback) {
      if (activeFilters.city) {
        results = results.filter(p => p.city === activeFilters.city)
      }
      if (activeFilters.freeDelivery) {
        results = results.filter(p => p.freeDelivery === true || p.deliveryType === 'free')
      }
      if (activeFilters.maxPrice) {
        results = results.filter(p => p.price <= activeFilters.maxPrice)
      }
    }
    
    // Multi-word refine
    const words = currentQuery.toLowerCase().trim().split(' ')
    if (words.length > 1) {
      results = results.filter(p => 
        words.every(w => {
          const titleText = (p.title || p.name || '').toLowerCase()
          return titleText.includes(w)
        })
      )
    }
    
    if (!append) container.innerHTML = ''
    
    if (results.length === 0 && !append) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; width: 100%;">
          ${renderEmptyState(
            'search',
            `No results for "${escapeHTML(currentQuery)}"`,
            'Try a different word or browse by category',
            'Browse Categories',
            'shop.html'
          )}
        </div>
      `
      document.getElementById('loadMoreBtn').style.display = 'none'
      document.getElementById('resultCount').textContent = '0 results'
      return
    }
    
    document.getElementById('resultCount').textContent = 
      `${results.length}${snap.docs.length === 20 ? '+' : ''} result${results.length !== 1 ? 's' : ''} for "${currentQuery}"`
    
    container.insertAdjacentHTML('beforeend',
      results.map(p => renderProductCard(p)).join('')
    )
    
    document.getElementById('loadMoreBtn').style.display = 
      snap.docs.length === 20 ? 'block' : 'none'
    
  } catch (err) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; width: 100%;">
        ${renderErrorState('Search failed. Check your connection.')}
      </div>
    `
    handleFirestoreError(err, OperationType.GET, 'products')
  }
}

function saveSearchHistory(q) {
  if (!q) return
  let historyList = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  historyList = [q, ...historyList.filter(h => h !== q)].slice(0, 10)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyList))
  
  // Sync to Firestore if logged in
  if (currentUser) {
    setDoc(doc(db, 'users', currentUser.uid, 'searchHistory', 'recent'), {
      terms: historyList,
      updatedAt: serverTimestamp()
    }).catch((e) => console.error("Firestore sync error:", e))
  }
}

// Filter chip toggles
const filterChips = document.querySelectorAll('#filterChipsContainer [data-filter]')
filterChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const filterKey = chip.dataset.filter
    const filterVal = chip.dataset.value

    if (filterKey === 'all') {
      activeFilters = {}
      filterChips.forEach(c => {
        if (c.dataset.filter !== 'all') c.classList.remove('active')
      })
      chip.classList.add('active')
    } else {
      const allChip = document.querySelector('#filterChipsContainer [data-filter="all"]')
      if (allChip) allChip.classList.remove('active')

      chip.classList.toggle('active')

      if (chip.classList.contains('active')) {
        if (filterKey === 'maxPrice') {
          // Deselect other price filters
          filterChips.forEach(c => {
            if (c !== chip && c.dataset.filter === 'maxPrice') {
              c.classList.remove('active')
            }
          })
          activeFilters.maxPrice = Number(filterVal)
        } else if (filterKey === 'city') {
          // Deselect other city filters
          filterChips.forEach(c => {
            if (c !== chip && c.dataset.filter === 'city') {
              c.classList.remove('active')
            }
          })
          activeFilters.city = filterVal
        } else if (filterKey === 'freeDelivery') {
          activeFilters.freeDelivery = true
        }
      } else {
        if (filterKey === 'maxPrice') {
          delete activeFilters.maxPrice
        } else if (filterKey === 'city') {
          delete activeFilters.city
        } else if (filterKey === 'freeDelivery') {
          delete activeFilters.freeDelivery
        }
      }

      // If no chips are active, reset to 'all'
      const anyActive = Array.from(filterChips).some(c => c.dataset.filter !== 'all' && c.classList.contains('active'))
      if (!anyActive && allChip) {
        allChip.classList.add('active')
      }
    }

    lastDoc = null
    fetchResults()
  })
})

// Sort dropdown
const sortBySelect = document.getElementById('sortBySelect')
if (sortBySelect) {
  sortBySelect.addEventListener('change', () => {
    sortBy = sortBySelect.value
    lastDoc = null
    fetchResults()
  })
}

// Load more action
const loadMoreBtn = document.getElementById('loadMoreBtn')
if (loadMoreBtn) {
  loadMoreBtn.addEventListener('click', () => fetchResults(true))
}

// Initialization flow
async function init() {
  injectHeaderAndNav('shop') // Shop tab highlighted in footer
  
  try {
    const authResult = await initAuth()
    // Sync search history from Firestore if logged in
    if (currentUser) {
      try {
        const docSnap = await getDoc(doc(db, 'users', currentUser.uid, 'searchHistory', 'recent'))
        if (docSnap.exists()) {
          const dbHistory = docSnap.data().terms || []
          let localHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
          let merged = [...new Set([...dbHistory, ...localHistory])].slice(0, 10)
          localStorage.setItem(HISTORY_KEY, JSON.stringify(merged))
        }
      } catch (err) {
        console.warn("Could not retrieve Firestore search history:", err)
      }
    }
  } catch (err) {
    console.error("Auth init error in search:", err)
  }

  const initialQ = getUrlParam('q')
  if (initialQ) {
    if (searchInput) {
      searchInput.value = initialQ
    }
    if (clearSearchBtn) {
      clearSearchBtn.style.display = 'block'
    }
    runSearch(initialQ)
  } else {
    showInitialState()
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', init)
