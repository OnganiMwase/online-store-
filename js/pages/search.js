/**
 * ShopEasy Global Search Page Control Module
 */

import { db } from '../firebase-config.js'
import { 
  collection, 
  getDocs, 
  query, 
  orderBy 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { injectHeaderAndNav, renderProductCard, renderSkeleton, renderEmptyState, renderErrorState } from '../ui.js'
import { handleFirestoreError, OperationType, getUrlParam } from '../utils.js'

document.addEventListener('DOMContentLoaded', async () => {
  // Inject navigation
  injectHeaderAndNav('shop')

  const searchInput = document.getElementById('search-results-input')
  const gridEl = document.getElementById('search-products-grid')
  const statusEl = document.getElementById('search-status')

  let initialQuery = getUrlParam('q') || ''
  let allProducts = []

  if (searchInput) {
    searchInput.value = initialQuery
  }

  const fetchAndFilterProducts = async () => {
    gridEl.innerHTML = renderSkeleton(4)
    try {
      const qSnap = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc')))
      allProducts = []
      qSnap.forEach(doc => {
        const item = doc.data()
        item.id = doc.id
        allProducts.push(item)
      })

      performSearch()
    } catch (error) {
      gridEl.innerHTML = renderErrorState('Failed to search marketplace products.')
      handleFirestoreError(error, OperationType.LIST, 'products')
    }
  }

  const performSearch = () => {
    const term = searchInput ? searchInput.value.trim().toLowerCase() : ''
    
    const results = allProducts.filter(p => 
      p.name.toLowerCase().includes(term) ||
      (p.description && p.description.toLowerCase().includes(term)) ||
      (p.city && p.city.toLowerCase().includes(term)) ||
      (p.categoryName && p.categoryName.toLowerCase().includes(term))
    )

    if (statusEl) {
      statusEl.textContent = term 
        ? `${results.length} result${results.length === 1 ? '' : 's'} for "${term}"`
        : `Showing all ${results.length} products`
    }

    gridEl.innerHTML = ''
    if (results.length === 0) {
      gridEl.innerHTML = `
        <div style="grid-column: 1 / -1; width: 100%;">
          ${renderEmptyState(
            'search',
            'No Results Match',
            'Please check your spelling or search for alternative items.',
            'Clear Search',
            '#'
          )}
        </div>
      `
      const clearBtn = gridEl.querySelector('.btn')
      if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
          e.preventDefault()
          if (searchInput) searchInput.value = ''
          performSearch()
        })
      }
    } else {
      results.forEach(product => {
        gridEl.innerHTML += renderProductCard(product)
      })
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', performSearch)
  }

  await fetchAndFilterProducts()
})
