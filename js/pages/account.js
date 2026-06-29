/**
 * ShopEasy Account Page Control Module
 */

import { auth, db } from '../firebase-config.js'
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { injectHeaderAndNav, renderEmptyState } from '../ui.js'
import { showToast, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  // Inject common navigation UI
  injectHeaderAndNav('account')

  const profileCard = document.getElementById('profile-card')
  const sellerMenuOption = document.getElementById('seller-menu-option')
  const logoutBtn = document.getElementById('logout-btn')

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // Show unauthenticated welcome screen inside main content
      profileCard.outerHTML = `
        <div style="padding: 24px 0;">
          ${renderEmptyState(
            'user',
            'Your Profile Account',
            'Sign in to manage orders, customize saved items, or setup a store in Malawi.',
            'Login / Sign Up',
            '/login.html'
          )}
        </div>
      `
      // Remove options
      document.querySelector('.account-menu').style.display = 'none'
      return
    }

    // Load profile from firestore
    try {
      const docSnap = await getDoc(doc(db, 'users', user.uid))
      if (docSnap.exists()) {
        const profile = docSnap.data()
        renderProfileHeader(profile, user.email)
        renderSellerOptions(profile.role || 'buyer')
      } else {
        // Fallback placeholder if doc is missing
        renderProfileHeader({ name: 'ShopEasy User', city: 'Malawi', role: 'buyer' }, user.email)
        renderSellerOptions('buyer')
      }
    } catch (error) {
      showToast('Error loading account profile.', 'danger')
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`)
    }
  })

  // Render profile top card
  const renderProfileHeader = (profile, email) => {
    const avatar = profile.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(profile.name || 'S')
    profileCard.innerHTML = `
      <img class="profile-avatar" src="${avatar}" alt="Avatar">
      <h2 class="profile-name">${profile.name || 'ShopEasy Member'}</h2>
      <div class="profile-role-badge">${profile.role === 'seller' ? 'Seller Store' : 'Buyer Account'}</div>
      <div class="profile-details-row">
        <span>📍 ${profile.city || 'Malawi'}</span>
        <span>📞 ${profile.phone || 'No phone'}</span>
      </div>
    `
  }

  // Render Seller Options depending on whether they are buyer or seller
  const renderSellerOptions = (role) => {
    if (role === 'seller') {
      sellerMenuOption.innerHTML = `
        <a href="/seller/dashboard.html" class="menu-item" style="border-color: var(--primary-light);">
          <span class="menu-item__icon">📊</span>
          <span class="menu-item__text" style="color: var(--primary-dark);">Seller Store Dashboard</span>
          <span class="menu-item__arrow" style="color: var(--primary);">&rsaquo;</span>
        </a>
      `
    } else {
      sellerMenuOption.innerHTML = `
        <a href="/seller/setup.html" class="menu-item">
          <span class="menu-item__icon">📈</span>
          <span class="menu-item__text">Onboard as a Seller / Sell Items</span>
          <span class="menu-item__arrow">&rsaquo;</span>
        </a>
      `
    }
  }

  // Sign out click handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to sign out?')) {
        try {
          await signOut(auth)
          showToast('Successfully signed out!', 'success')
          setTimeout(() => redirect('/index.html'), 1000)
        } catch (error) {
          showToast('Failed to sign out.', 'danger')
        }
      }
    })
  }
})
