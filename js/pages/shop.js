/**
 * ShopEasy Shop Page Control Module
 */

import { db } from '../firebase-config.js'
import { 
  collection, 
  getDocs, 
  query, 
  orderBy,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { injectHeaderAndNav, renderProductCard, renderSkeleton, renderEmptyState, renderErrorState } from '../ui.js'
import { handleFirestoreError, OperationType, redirect } from '../utils.js'

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inject common UI Header and Bottom Nav
  injectHeaderAndNav('shop')

  let allProducts = []
  let activeCategory = 'all'
  let searchQuery = ''
  let activeSort = 'newest'

  const productsGrid = document.getElementById('shop-products-grid')
  const categoriesContainer = document.getElementById('shop-categories')
  const sortSelect = document.getElementById('sort-select')
  const searchInput = document.getElementById('shop-search-input')

  // Load and Render Categories tabs
  const loadCategories = async () => {
    try {
      const catsSnapshot = await getDocs(collection(db, 'categories'))
      if (!catsSnapshot.empty) {
        catsSnapshot.forEach(doc => {
          const cat = doc.data()
          const btn = document.createElement('button')
          btn.className = 'filter-tab'
          btn.textContent = cat.name
          btn.dataset.id = doc.id
          
          btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('filter-tab--active'))
            btn.classList.add('filter-tab--active')
            activeCategory = btn.dataset.id
            applyFilters()
          })
          
          categoriesContainer.appendChild(btn)
        })
      } else {
        // Fallback default tabs if categories collection is empty
        const defaultCats = [
          { id: 'electronics', name: 'Electronics' },
          { id: 'fashion', name: 'Fashion' },
          { id: 'agriculture', name: 'Agri & Food' },
          { id: 'home', name: 'Home & Living' },
          { id: 'vehicles', name: 'Vehicles' }
        ]
        defaultCats.forEach(cat => {
          const btn = document.createElement('button')
          btn.className = 'filter-tab'
          btn.textContent = cat.name
          btn.dataset.id = cat.id
          btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('filter-tab--active'))
            btn.classList.add('filter-tab--active')
            activeCategory = cat.id
            applyFilters()
          })
          categoriesContainer.appendChild(btn)
        })
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'categories')
    }
  }

  // Set up click on "All Items"
  const allTab = categoriesContainer.querySelector('[data-id="all"]')
  if (allTab) {
    allTab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('filter-tab--active'))
      allTab.classList.add('filter-tab--active')
      activeCategory = 'all'
      applyFilters()
    })
  }

  // Load All Products from Firestore
  const fetchProducts = async () => {
    productsGrid.innerHTML = renderSkeleton(6)
    try {
      // Query everything ordered by newest
      const prodsQuery = query(collection(db, 'products'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(prodsQuery)
      
      allProducts = []
      snapshot.forEach(doc => {
        const product = doc.data()
        product.id = doc.id
        allProducts.push(product)
      })
      
      applyFilters()
    } catch (error) {
      productsGrid.innerHTML = renderErrorState('Failed to load listings. Please pull down to refresh.')
      handleFirestoreError(error, OperationType.LIST, 'products')
    }
  }

  // Local filtering & sorting logic for high performance and offline capabilities
  const applyFilters = () => {
    let filtered = [...allProducts]

    // Category filter
    if (activeCategory !== 'all') {
      filtered = filtered.filter(p => p.category === activeCategory)
    }

    // Search query filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.city && p.city.toLowerCase().includes(q))
      )
    }

    // Sort
    if (activeSort === 'price-asc') {
      filtered.sort((a, b) => Number(a.price || 0) - Number(b.price || 0))
    } else if (activeSort === 'price-desc') {
      filtered.sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
    } else {
      // Default: newest (createdAt)
      filtered.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
        return dateB - dateA
      })
    }

    // Render results
    productsGrid.innerHTML = ''
    if (filtered.length === 0) {
      productsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; width: 100%;">
          ${renderEmptyState(
            'search',
            'No Listings Found',
            'Try adjusting your search terms or filters to find items.',
            'Clear Search',
            '#'
          )}
        </div>
      `
      // Handle the Clear Search action in the empty state
      const clearBtn = productsGrid.querySelector('.btn')
      if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
          e.preventDefault()
          if (searchInput) searchInput.value = ''
          searchQuery = ''
          applyFilters()
        })
      }
    } else {
      filtered.forEach(product => {
        productsGrid.innerHTML += renderProductCard(product)
      })
    }
  }

  // Listen for Sorting filter changes
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      activeSort = e.target.value
      applyFilters()
    })
  }

  // Listen for local Search changes
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim()
      applyFilters()
    })
  }

  // Initialize
  await loadCategories()
  await fetchProducts()
})
