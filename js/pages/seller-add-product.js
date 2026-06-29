/**
 * ShopEasy Seller Add / Edit Product Page Control Module
 */

import { auth, db } from '../firebase-config.js'
import { 
  doc, 
  getDoc,
  setDoc,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { getUrlParam, generateId, showToast, showLoading, hideLoading, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  const productId = getUrlParam('id')
  
  const form = document.getElementById('add-product-form')
  const submitBtn = document.getElementById('prod-submit-btn')
  const pageTitle = document.getElementById('form-page-title')

  let isEditMode = false
  let existingProduct = null

  // Category mapper names
  const categoryNames = {
    'electronics': 'Electronics',
    'fashion': 'Fashion',
    'agriculture': 'Agri & Food',
    'home': 'Home & Living',
    'vehicles': 'Vehicles'
  }

  // Check login & check if in EDIT mode
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirect('/login.html')
      return
    }

    if (productId) {
      isEditMode = true
      if (pageTitle) pageTitle.textContent = 'Edit Product Listing'
      if (submitBtn) submitBtn.textContent = 'Save Changes'
      
      await loadProductDetails(user.uid)
    }
  })

  // Pre-load existing details for Editing
  const loadProductDetails = async (uid) => {
    try {
      const docSnap = await getDoc(doc(db, 'products', productId))
      if (!docSnap.exists()) {
        showToast('Listing does not exist', 'danger')
        redirect('/seller/dashboard.html')
        return
      }

      existingProduct = docSnap.data()

      // Authorization guard: Make sure seller owns the product
      if (existingProduct.sellerId !== uid) {
        showToast('Unauthorized operation.', 'danger')
        redirect('/seller/dashboard.html')
        return
      }

      // Populate form fields
      document.getElementById('prod-name').value = existingProduct.name || ''
      document.getElementById('prod-price').value = existingProduct.price || ''
      document.getElementById('prod-category').value = existingProduct.category || ''
      document.getElementById('prod-image').value = existingProduct.image || ''
      document.getElementById('prod-desc').value = existingProduct.description || ''
      document.getElementById('prod-delivery').checked = existingProduct.freeDelivery === true

    } catch (error) {
      showToast('Error loading listing details.', 'danger')
      handleFirestoreError(error, OperationType.GET, `products/${productId}`)
    }
  }

  // Handle Form submission
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const user = auth.currentUser
      if (!user) return

      const name = document.getElementById('prod-name').value.trim()
      const price = Number(document.getElementById('prod-price').value)
      const category = document.getElementById('prod-category').value
      const image = document.getElementById('prod-image').value.trim()
      const description = document.getElementById('prod-desc').value.trim()
      const freeDelivery = document.getElementById('prod-delivery').checked

      showLoading(submitBtn, isEditMode ? 'Saving Changes...' : 'Publishing...')

      try {
        const id = isEditMode ? productId : generateId()
        const productRef = doc(db, 'products', id)

        const productData = {
          name,
          price,
          category,
          categoryName: categoryNames[category] || 'General',
          image,
          description,
          freeDelivery,
          sellerId: user.uid,
          city: user.city || 'Malawi', // seller location city
          updatedAt: serverTimestamp()
        }

        // Add createdAt only if creating a new listing
        if (!isEditMode) {
          productData.createdAt = serverTimestamp()
        } else {
          productData.createdAt = existingProduct.createdAt // preserve original date
        }

        await setDoc(productRef, productData, { merge: true })

        hideLoading(submitBtn)
        showToast(isEditMode ? 'Listing successfully saved!' : 'Listing successfully published!', 'success')
        
        setTimeout(() => {
          redirect('/seller/dashboard.html')
        }, 1200)

      } catch (error) {
        hideLoading(submitBtn)
        showToast('Failed to publish listing. Please check parameters.', 'danger')
        handleFirestoreError(error, OperationType.WRITE, 'products')
      }
    })
  }
})
