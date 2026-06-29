/**
 * ShopEasy Category Page Control Module
 */

import { db } from '../firebase-config.js'
import { 
  collection, 
  getDocs, 
  query, 
  where,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { injectHeaderAndNav, renderProductCard, renderSkeleton, renderEmptyState, renderErrorState } from '../ui.js'
import { handleFirestoreError, OperationType, getUrlParam } from '../utils.js'

document.addEventListener('DOMContentLoaded', async () => {
  // Inject navigation
  injectHeaderAndNav('shop')

  const catId = getUrlParam('id')
  const catName = getUrlParam('name') || 'Category Listings'

  // Update Page Title
  const titleEl = document.getElementById('category-page-title')
  if (titleEl) {
    titleEl.textContent = catName
  }

  if (!catId) {
    document.getElementById('category-products-grid').innerHTML = renderErrorState('Invalid Category Specified.')
    return
  }

  let products = []
  const gridEl = document.getElementById('category-products-grid')
  const countEl = document.getElementById('items-count')
  const sortSelect = document.getElementById('category-sort')

  const fetchCategoryProducts = async () => {
    gridEl.innerHTML = renderSkeleton(4)
    try {
      const q = query(
        collection(db, 'products'),
        where('category', '==', catId)
      )
      
      const snapshot = await getDocs(q)
      products = []
      
      snapshot.forEach(doc => {
        const product = doc.data()
        product.id = doc.id
        products.push(product)
      })

      renderResults()
    } catch (error) {
      gridEl.innerHTML = renderErrorState('Failed to fetch category items.')
      handleFirestoreError(error, OperationType.LIST, `products (category: ${catId})`)
    }
  }

  const renderResults = () => {
    // Apply sorting
    const sortVal = sortSelect ? sortSelect.value : 'newest'
    if (sortVal === 'price-asc') {
      products.sort((a, b) => Number(a.price || 0) - Number(b.price || 0))
    } else if (sortVal === 'price-desc') {
      products.sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
    } else {
      products.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
        return dateB - dateA
      })
    }

    if (countEl) {
      countEl.textContent = `${products.length} item${products.length === 1 ? '' : 's'} found`
    }

    gridEl.innerHTML = ''
    if (products.length === 0) {
      gridEl.innerHTML = `
        <div style="grid-column: 1 / -1; width: 100%;">
          ${renderEmptyState(
            'package',
            'No Items Yet',
            `Be the first to list an item in ${catName}!`,
            'Go Back',
            '/shop.html'
          )}
        </div>
      `
    } else {
      products.forEach(product => {
        gridEl.innerHTML += renderProductCard(product)
      })
    }
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', renderResults)
  }

  await fetchCategoryProducts()
})
