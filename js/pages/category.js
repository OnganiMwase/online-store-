/**
 * ShopEasy Category Page Control Module
 */

import { db, auth } from '../firebase-config.js'
import { initAuth } from '../auth.js'
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs, 
  doc, 
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { formatMWK, getUrlParam, showToast } from '../utils.js'
import { renderProductCard, renderSkeleton, renderEmptyState, renderErrorState } from '../ui.js'

const slug = getUrlParam('slug') || ''
let filters = {
  minPrice: getUrlParam('minPrice') ? Number(getUrlParam('minPrice')) : null,
  maxPrice: getUrlParam('maxPrice') ? Number(getUrlParam('maxPrice')) : null,
  city: getUrlParam('city') || null
}
let sortBy = getUrlParam('sort') || 'newest'
let lastDoc = null
let loadedProductsCount = 0
let approxTotalProducts = 0
let loadedDocsList = [] // Keep track of all loaded documents for client sorting fallback

const PAGE_SIZE = 12

// --- DOM ELEMENTS ---
const categoryBackBtn = document.getElementById('categoryBackBtn')
const categoryNameHeader = document.getElementById('categoryNameHeader')
const categoryProductCount = document.getElementById('categoryProductCount')
const productGrid = document.getElementById('productGrid')
const loadMoreBtn = document.getElementById('loadMoreBtn')
const showingCountText = document.getElementById('showingCountText')

// Bottom sheet drawers
const filterSheet = document.getElementById('filterSheet')
const sortSheet = document.getElementById('sortSheet')

// Action buttons
const openFiltersBtn = document.getElementById('openFiltersBtn')
const openSortBtn = document.getElementById('openSortBtn')
const closeFilterSheet = document.getElementById('closeFilterSheet')
const closeSortSheet = document.getElementById('closeSortSheet')
const applyFiltersBtn = document.getElementById('applyFiltersBtn')
const clearFiltersBtn = document.getElementById('clearFiltersBtn')
const currentSortText = document.getElementById('currentSortText')
const activeFilterChips = document.getElementById('activeFilterChips')

// Filter inputs
const minPriceInput = document.getElementById('minPrice')
const maxPriceInput = document.getElementById('maxPrice')

// --- Back Button Handler ---
if (categoryBackBtn) {
  categoryBackBtn.addEventListener('click', () => {
    if (document.referrer && document.referrer.includes(window.location.host)) {
      history.back()
    } else {
      window.location.href = 'shop.html'
    }
  })
}

// --- Initialize Inputs from URL ---
const initInputsFromUrl = () => {
  if (minPriceInput && filters.minPrice) minPriceInput.value = filters.minPrice
  if (maxPriceInput && filters.maxPrice) maxPriceInput.value = filters.maxPrice

  if (filters.city) {
    document.querySelectorAll('input[name="cityFilter"]').forEach(cb => {
      if (cb.value === filters.city) {
        cb.checked = true
        cb.closest('.city-checkbox-label')?.classList.add('city-checkbox-label--selected')
      } else {
        cb.checked = false
        cb.closest('.city-checkbox-label')?.classList.remove('city-checkbox-label--selected')
      }
    })
  } else {
    // Select 'all' by default
    const allCb = document.querySelector('input[name="cityFilter"][value="all"]')
    if (allCb) {
      allCb.checked = true
      allCb.closest('.city-checkbox-label')?.classList.add('city-checkbox-label--selected')
    }
  }

  // Set active sort item in UI
  document.querySelectorAll('.sort-option-item').forEach(item => {
    if (item.dataset.sort === sortBy) {
      item.classList.add('sort-option-item--active')
    } else {
      item.classList.remove('sort-option-item--active')
    }
  })

  updateSortLabelText()
}

// Update the main sort action button label text
const updateSortLabelText = () => {
  if (!currentSortText) return
  const sortMap = {
    'newest': 'Sort: Newest',
    'price-asc': 'Price: Low-High',
    'price-desc': 'Price: High-Low',
    'popular': 'Sort: Most Sold'
  }
  currentSortText.textContent = sortMap[sortBy] || 'Sort: Newest'
}

// --- Open/Close Drawer Sheets ---
const openDrawer = (drawer) => {
  if (!drawer) return
  drawer.classList.add('bottom-sheet--visible')
}

const closeDrawer = (drawer) => {
  if (!drawer) return
  drawer.classList.remove('bottom-sheet--visible')
}

if (openFiltersBtn) openFiltersBtn.addEventListener('click', () => openDrawer(filterSheet))
if (openSortBtn) openSortBtn.addEventListener('click', () => openDrawer(sortSheet))
if (closeFilterSheet) closeFilterSheet.addEventListener('click', () => closeDrawer(filterSheet))
if (closeSortSheet) closeSortSheet.addEventListener('click', () => closeDrawer(sortSheet))

// Close on clicking outside content
window.addEventListener('click', (e) => {
  if (e.target === filterSheet) closeDrawer(filterSheet)
  if (e.target === sortSheet) closeDrawer(sortSheet)
})

// --- City Checkboxes UX ---
document.querySelectorAll('input[name="cityFilter"]').forEach(cb => {
  cb.addEventListener('change', () => {
    const label = cb.closest('.city-checkbox-label')
    if (cb.value === 'all') {
      if (cb.checked) {
        // Uncheck all other cities
        document.querySelectorAll('input[name="cityFilter"]').forEach(otherCb => {
          if (otherCb.value !== 'all') {
            otherCb.checked = false
            otherCb.closest('.city-checkbox-label')?.classList.remove('city-checkbox-label--selected')
          }
        })
        label?.classList.add('city-checkbox-label--selected')
      }
    } else {
      if (cb.checked) {
        // Uncheck 'all'
        const allCb = document.querySelector('input[name="cityFilter"][value="all"]')
        if (allCb) {
          allCb.checked = false
          allCb.closest('.city-checkbox-label')?.classList.remove('city-checkbox-label--selected')
        }
        label?.classList.add('city-checkbox-label--selected')
      } else {
        label?.classList.remove('city-checkbox-label--selected')
        
        // If none is checked, check 'all'
        const anyChecked = Array.from(document.querySelectorAll('input[name="cityFilter"]')).some(c => c.checked)
        if (!anyChecked) {
          const allCb = document.querySelector('input[name="cityFilter"][value="all"]')
          if (allCb) {
            allCb.checked = true
            allCb.closest('.city-checkbox-label')?.classList.add('city-checkbox-label--selected')
          }
        }
      }
    }
  })
})

// --- Category Header Details ---
const loadCategoryDetails = async () => {
  if (!slug) {
    categoryNameHeader.textContent = 'Browse Shop'
    return
  }

  try {
    let catData = null
    // Try finding by ID directly
    const directDoc = await getDoc(doc(db, 'categories', slug))
    if (directDoc.exists()) {
      catData = directDoc.data()
    } else {
      // Query by slug
      const q = query(collection(db, 'categories'), where('slug', '==', slug))
      const snap = await getDocs(q)
      if (!snap.empty) {
        catData = snap.docs[0].data()
      }
    }

    if (catData) {
      const name = catData.name || 'Category'
      const emoji = catData.emoji || catData.icon || '📦'
      categoryNameHeader.textContent = `${name} ${emoji}`
      
      approxTotalProducts = catData.productCount || 0
      categoryProductCount.textContent = `${approxTotalProducts} product${approxTotalProducts === 1 ? '' : 's'}`
    } else {
      // Capitalize slug as fallback
      const readableName = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ')
      categoryNameHeader.textContent = readableName
      categoryProductCount.textContent = '0 products'
    }
  } catch (err) {
    console.error("Error loading category metadata:", err)
    categoryNameHeader.textContent = 'Category'
  }
}

// --- Active Filter Chips Renderer ---
const renderActiveFilters = () => {
  if (!activeFilterChips) return
  activeFilterChips.innerHTML = ''

  const createChip = (label, onRemove) => {
    const chip = document.createElement('div')
    chip.className = 'filter-chip'
    chip.innerHTML = `
      <span>${label}</span>
      <button class="filter-chip__remove" aria-label="Remove filter">&times;</button>
    `
    chip.querySelector('.filter-chip__remove').addEventListener('click', onRemove)
    activeFilterChips.appendChild(chip)
  }

  if (filters.minPrice) {
    createChip(`Min: ${filters.minPrice.toLocaleString()} MWK`, () => {
      filters.minPrice = null
      if (minPriceInput) minPriceInput.value = ''
      applyFiltersAndSyncUrl()
    })
  }

  if (filters.maxPrice) {
    createChip(`Max: ${filters.maxPrice.toLocaleString()} MWK`, () => {
      filters.maxPrice = null
      if (maxPriceInput) maxPriceInput.value = ''
      applyFiltersAndSyncUrl()
    })
  }

  if (filters.city) {
    createChip(`City: ${filters.city}`, () => {
      filters.city = null
      // Reset checkboxes
      document.querySelectorAll('input[name="cityFilter"]').forEach(cb => {
        cb.checked = cb.value === 'all'
        const label = cb.closest('.city-checkbox-label')
        if (cb.value === 'all') {
          label?.classList.add('city-checkbox-label--selected')
        } else {
          label?.classList.remove('city-checkbox-label--selected')
        }
      })
      applyFiltersAndSyncUrl()
    })
  }
}

// --- Firestore Query Builder with fallbacks ---
const buildQuery = (afterDoc = null) => {
  const constraints = [
    where('isActive', '==', true)
  ]
  
  if (slug) {
    constraints.push(where('category', '==', slug))
  }
  
  if (filters.minPrice) {
    constraints.push(where('price', '>=', filters.minPrice))
  }
  if (filters.maxPrice) {
    constraints.push(where('price', '<=', filters.maxPrice))
  }
  if (filters.city) {
    constraints.push(where('city', '==', filters.city))
  }
  
  const sortMap = {
    'newest': ['createdAt', 'desc'],
    'price-asc': ['price', 'asc'],
    'price-desc': ['price', 'desc'],
    'popular': ['sold', 'desc']
  }
  const [sortField, sortDir] = sortMap[sortBy] || ['createdAt', 'desc']
  constraints.push(orderBy(sortField, sortDir))
  constraints.push(limit(PAGE_SIZE))
  
  if (afterDoc) {
    constraints.push(startAfter(afterDoc))
  }
  
  return query(collection(db, 'products'), ...constraints)
}

// Fetch products with smart dual-mode querying
const fetchProducts = async (append = false) => {
  if (!append) {
    productGrid.innerHTML = renderSkeleton(6)
    lastDoc = null
    loadedProductsCount = 0
    loadedDocsList = []
    if (showingCountText) showingCountText.style.display = 'none'
  }

  try {
    let snap
    let fellBack = false

    try {
      const q = buildQuery(append ? lastDoc : null)
      snap = await getDocs(q)
    } catch (queryError) {
      console.warn("Direct Firestore filtered/sorted query failed, falling back to client-side model...", queryError)
      fellBack = true

      // Fallback model: fetch active items in category first
      const fallbackConstraints = [where('isActive', '==', true)]
      if (slug) {
        fallbackConstraints.push(where('category', '==', slug))
      }
      
      const qFallback = query(collection(db, 'products'), ...fallbackConstraints)
      const fullSnap = await getDocs(qFallback)
      
      // Map and filter client-side
      let filtered = fullSnap.docs.map(d => ({ id: d.id, rawDoc: d, ...d.data() }))
      
      if (filters.minPrice) {
        filtered = filtered.filter(p => Number(p.price || 0) >= filters.minPrice)
      }
      if (filters.maxPrice) {
        filtered = filtered.filter(p => Number(p.price || 0) <= filters.maxPrice)
      }
      if (filters.city) {
        filtered = filtered.filter(p => p.city === filters.city)
      }
      
      // Sort client-side
      if (sortBy === 'price-asc') {
        filtered.sort((a, b) => Number(a.price || 0) - Number(b.price || 0))
      } else if (sortBy === 'price-desc') {
        filtered.sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
      } else if (sortBy === 'popular') {
        filtered.sort((a, b) => Number(b.sold || 0) - Number(a.sold || 0))
      } else {
        filtered.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
          return dateB - dateA
        })
      }
      
      approxTotalProducts = filtered.length

      // Paginate client-side
      const startIdx = append && lastDoc ? loadedDocsList.findIndex(doc => doc.id === lastDoc.id) + 1 : 0
      const pageDocs = filtered.slice(startIdx, startIdx + PAGE_SIZE)
      
      snap = {
        empty: pageDocs.length === 0,
        docs: pageDocs.map(p => p.rawDoc)
      }
    }

    if (!append) {
      productGrid.innerHTML = ''
    }

    if (snap.empty) {
      if (!append) {
        showEmptyStateForCategory()
      }
      loadMoreBtn.style.display = 'none'
      if (showingCountText) showingCountText.style.display = 'none'
      return
    }

    lastDoc = snap.docs[snap.docs.length - 1]
    loadedDocsList.push(...snap.docs)
    loadedProductsCount += snap.docs.length

    const productsHTML = snap.docs.map(doc => {
      return renderProductCard({ id: doc.id, ...doc.data() })
    }).join('')

    productGrid.insertAdjacentHTML('beforeend', productsHTML)

    // Update approximate counts
    if (approxTotalProducts < loadedProductsCount) {
      approxTotalProducts = loadedProductsCount
    }
    
    if (categoryProductCount && !append) {
      categoryProductCount.textContent = `${approxTotalProducts} product${approxTotalProducts === 1 ? '' : 's'}`
    }

    if (showingCountText) {
      showingCountText.textContent = `Showing ${loadedProductsCount} of approximately ${approxTotalProducts} products`
      showingCountText.style.display = 'block'
    }

    // Toggle Load More button
    if (snap.docs.length === PAGE_SIZE) {
      loadMoreBtn.style.display = 'block'
    } else {
      loadMoreBtn.style.display = 'none'
    }

  } catch (err) {
    console.error("Error loading category products:", err)
    if (!append) {
      productGrid.innerHTML = renderErrorState('Failed to load listings. Please try again.')
    } else {
      showToast('Error loading more items', 'danger')
    }
  }
}

const showEmptyStateForCategory = () => {
  const isFiltered = filters.minPrice || filters.maxPrice || filters.city
  
  if (isFiltered) {
    productGrid.innerHTML = renderEmptyState(
      'search',
      'No match found',
      'No products in this category match your specified filters.',
      'Clear Filters',
      `category.html?slug=${slug}`
    )
    
    const clearBtn = productGrid.querySelector('.btn')
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault()
        clearAllFilters()
      })
    }
  } else {
    const catName = categoryNameHeader.textContent.split(' ')[0] || 'this category'
    productGrid.innerHTML = renderEmptyState(
      'package',
      `No items in ${catName} yet`,
      `Be the first to list an item here!`,
      `Sell in this category →`,
      'seller/add-product.html'
    )
  }
}

// --- Sync state to URL and apply ---
const applyFiltersAndSyncUrl = () => {
  const params = new URLSearchParams()
  if (slug) params.set('slug', slug)
  if (filters.minPrice) params.set('minPrice', filters.minPrice)
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice)
  if (filters.city) params.set('city', filters.city)
  if (sortBy !== 'newest') params.set('sort', sortBy)

  history.replaceState(null, '', '?' + params.toString())
  
  renderActiveFilters()
  fetchProducts(false)
}

const clearAllFilters = () => {
  filters.minPrice = null
  filters.maxPrice = null
  filters.city = null
  
  if (minPriceInput) minPriceInput.value = ''
  if (maxPriceInput) maxPriceInput.value = ''

  document.querySelectorAll('input[name="cityFilter"]').forEach(cb => {
    cb.checked = cb.value === 'all'
    const label = cb.closest('.city-checkbox-label')
    if (cb.value === 'all') {
      label?.classList.add('city-checkbox-label--selected')
    } else {
      label?.classList.remove('city-checkbox-label--selected')
    }
  })

  applyFiltersAndSyncUrl()
}

// --- Wire up filter sheet buttons ---
if (applyFiltersBtn) {
  applyFiltersBtn.addEventListener('click', () => {
    const minVal = minPriceInput ? Number(minPriceInput.value) : 0
    const maxVal = maxPriceInput ? Number(maxPriceInput.value) : 0
    filters.minPrice = minVal > 0 ? minVal : null
    filters.maxPrice = maxVal > 0 ? maxVal : null

    // Find checked city excluding 'all'
    let selectedCity = null
    document.querySelectorAll('input[name="cityFilter"]:checked').forEach(cb => {
      if (cb.value !== 'all') {
        selectedCity = cb.value
      }
    })
    filters.city = selectedCity

    closeDrawer(filterSheet)
    applyFiltersAndSyncUrl()
  })
}

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener('click', () => {
    clearAllFilters()
    closeDrawer(filterSheet)
  })
}

// --- Wire up sort items click ---
document.querySelectorAll('.sort-option-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.sort-option-item').forEach(el => {
      el.classList.remove('sort-option-item--active')
    })
    item.classList.add('sort-option-item--active')
    sortBy = item.dataset.sort

    updateSortLabelText()
    closeDrawer(sortSheet)
    applyFiltersAndSyncUrl()
  })
})

// --- Wire up load more button ---
if (loadMoreBtn) {
  loadMoreBtn.addEventListener('click', () => fetchProducts(true))
}

// --- App Initialization ---
const init = async () => {
  await initAuth()
  initInputsFromUrl()
  renderActiveFilters()
  await loadCategoryDetails()
  await fetchProducts(false)
}

init()
