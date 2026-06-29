/**
 * ShopEasy Home Page Control Module
 */

import { db } from '../firebase-config.js'
import { 
  collection, 
  getDocs, 
  limit, 
  query, 
  orderBy 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { injectHeaderAndNav, renderProductCard, renderSkeleton, renderEmptyState, renderErrorState } from '../ui.js'
import { handleFirestoreError, OperationType, redirect } from '../utils.js'

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inject common UI Header and Bottom Nav
  injectHeaderAndNav('home')

  // 2. Setup Search Form Submission
  const searchForm = document.getElementById('search-form')
  const searchInput = document.getElementById('search-input')
  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault()
      const queryStr = encodeURIComponent(searchInput.value.trim())
      redirect(`/search.html?q=${queryStr}`)
    })
  }

  // 3. Load Categories from Firestore
  const categoriesContainer = document.getElementById('categories-container')
  try {
    const catsSnapshot = await getDocs(collection(db, 'categories'))
    categoriesContainer.innerHTML = '' // Clear skeletons
    
    if (catsSnapshot.empty) {
      // Setup some default beautiful local categories if Firestore is empty
      const localCategories = [
        { id: 'electronics', name: 'Electronics', icon: '📱' },
        { id: 'fashion', name: 'Fashion', icon: '👕' },
        { id: 'agriculture', name: 'Agri & Food', icon: '🌽' },
        { id: 'home', name: 'Home & Living', icon: '🏡' },
        { id: 'vehicles', name: 'Vehicles', icon: '🚗' }
      ]
      
      localCategories.forEach(cat => {
        const catEl = document.createElement('div')
        catEl.className = 'category-item'
        catEl.innerHTML = `
          <div class="category-item__icon">${cat.icon}</div>
          <span class="category-item__name">${cat.name}</span>
        `
        catEl.addEventListener('click', () => {
          redirect(`/category.html?id=${cat.id}&name=${encodeURIComponent(cat.name)}`)
        })
        categoriesContainer.appendChild(catEl)
      })
    } else {
      catsSnapshot.forEach(doc => {
        const cat = doc.data()
        const catEl = document.createElement('div')
        catEl.className = 'category-item'
        catEl.innerHTML = `
          <div class="category-item__icon">${cat.icon || '📦'}</div>
          <span class="category-item__name">${cat.name}</span>
        `
        catEl.addEventListener('click', () => {
          redirect(`/category.html?id=${doc.id}&name=${encodeURIComponent(cat.name)}`)
        })
        categoriesContainer.appendChild(catEl)
      })
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'categories')
  }

  // 4. Load Latest Products from Firestore
  const productsContainer = document.getElementById('products-container')
  productsContainer.innerHTML = renderSkeleton(4) // Show skeleton loader
  
  try {
    const productsQuery = query(
      collection(db, 'products'),
      orderBy('createdAt', 'desc'),
      limit(6)
    )
    const prodsSnapshot = await getDocs(productsQuery)
    productsContainer.innerHTML = '' // Clear skeletons
    
    if (prodsSnapshot.empty) {
      // If Firestore database has no seeded data yet (standard rule for production), show a highly stylized welcome empty state
      productsContainer.parentElement.innerHTML = renderEmptyState(
        'store',
        'Welcome to ShopEasy Malawi',
        'Real local sellers from Blantyre, Lilongwe, Mzuzu, and Zomba populate this marketplace. Start browsing by clicking Shop below!',
        'Explore Shop',
        '/shop.html'
      )
    } else {
      prodsSnapshot.forEach(doc => {
        const product = doc.data()
        // Ensure ID is added to product
        product.id = doc.id
        productsContainer.innerHTML += renderProductCard(product)
      })
    }
  } catch (error) {
    productsContainer.innerHTML = renderErrorState('Unable to fetch latest listings. Please check your internet connection.')
    handleFirestoreError(error, OperationType.LIST, 'products')
  }
})
