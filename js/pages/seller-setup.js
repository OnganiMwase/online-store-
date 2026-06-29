/**
 * ShopEasy Seller Setup Control Module
 */

import { auth, db } from '../firebase-config.js'
import { doc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { showToast, showLoading, hideLoading, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('seller-setup-form')
  const submitBtn = document.getElementById('setup-submit-btn')

  // Auto-fill existing details from profile if available
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirect('/login.html')
      return
    }

    try {
      const docSnap = await getDoc(doc(db, 'users', user.uid))
      if (docSnap.exists()) {
        const profile = docSnap.data()
        
        // If already a seller, redirect them directly to dashboard
        if (profile.role === 'seller') {
          redirect('/seller/dashboard.html')
          return
        }

        document.getElementById('store-name').value = profile.storeName || profile.name || ''
        document.getElementById('store-phone').value = profile.storePhone || profile.phone || ''
        document.getElementById('store-city').value = profile.city || 'Lilongwe'
      }
    } catch (err) {
      console.warn('Failed to fetch profile details for autofill')
    }
  })

  // Handle onboarding form submission
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const user = auth.currentUser
      if (!user) return

      const storeName = document.getElementById('store-name').value.trim()
      const storeDescription = document.getElementById('store-description').value.trim()
      const storePhone = document.getElementById('store-phone').value.trim()
      const city = document.getElementById('store-city').value

      showLoading(submitBtn, 'Setting up store...')

      try {
        await updateDoc(doc(db, 'users', user.uid), {
          role: 'seller',
          storeName,
          storeDescription,
          storePhone,
          city,
          updatedAt: serverTimestamp()
        })

        hideLoading(submitBtn)
        showToast('Store successfully registered! Welcome to ShopEasy.', 'success')
        
        // Redirect to seller dashboard after short delay
        setTimeout(() => {
          redirect('/seller/dashboard.html')
        }, 1200)

      } catch (error) {
        hideLoading(submitBtn)
        showToast('Could not register seller account. Please try again.', 'danger')
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`)
      }
    })
  }
})
