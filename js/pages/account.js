/**
 * ShopEasy Account Page Control Module (Production-Grade)
 */

import { auth, db, storage } from '../firebase-config.js'
import { doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { onAuthStateChanged, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'

import { injectHeaderAndNav } from '../ui.js'
import { showToast, redirect, handleFirestoreError, OperationType } from '../utils.js'
import { t, applyTranslations } from '../i18n.js'

document.addEventListener('DOMContentLoaded', () => {
  // Inject default navigation tab
  injectHeaderAndNav('account')

  const accountLoading = document.getElementById('account-loading')
  const accountContainer = document.getElementById('account-container')
  const avatarFileInput = document.getElementById('avatar-file-input')

  // Logged-out confirmation modal selectors
  const logoutModal = document.getElementById('logout-confirm-modal')
  const logoutCancelBtn = document.getElementById('logout-cancel-btn')
  const logoutConfirmBtn = document.getElementById('logout-confirm-btn')

  let currentUser = null
  let userProfile = null

  // Listen to Auth State
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null
      userProfile = null
      renderLoggedOutState()
      if (accountLoading) accountLoading.style.display = 'none'
      if (accountContainer) accountContainer.style.display = 'block'
      return
    }

    currentUser = user
    try {
      // 1. Fetch user profile from users/{uid}
      const userDocRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userDocRef)
      
      if (userSnap.exists()) {
        userProfile = userSnap.data()
      } else {
        // Fallback user profile in case registration is incomplete
        userProfile = {
          name: user.displayName || 'ShopEasy Member',
          city: 'Lilongwe',
          role: 'buyer',
          createdAt: serverTimestamp()
        }
      }

      // 2. Fetch orders statistics
      const ordersCount = {
        pending_payment: 0,
        processing: 0,
        ready: 0,
        completed: 0,
        dispute_open: 0
      }

      try {
        const ordersQuery = query(
          collection(db, 'orders'),
          where('buyerId', '==', user.uid)
        )
        const ordersSnap = await getDocs(ordersQuery)
        ordersSnap.forEach(orderDoc => {
          const status = orderDoc.data().status
          if (ordersCount.hasOwnProperty(status)) {
            ordersCount[status]++
          }
        })
      } catch (err) {
        console.warn('Could not load order counts:', err)
      }

      // 3. Fetch store profile if role == 'seller'
      let sellerStore = null
      if (userProfile.role === 'seller') {
        try {
          const storeDoc = await getDoc(doc(db, 'stores', user.uid))
          if (storeDoc.exists()) {
            sellerStore = storeDoc.data()
          }
        } catch (err) {
          console.warn('Could not load store details:', err)
        }
      }

      // 4. Render Logged-In State
      renderLoggedInState(userProfile, user.email, ordersCount, sellerStore)

    } catch (err) {
      console.error('Error fetching account details:', err)
      showToast('Error loading account information', 'danger')
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`)
    } finally {
      if (accountLoading) accountLoading.style.display = 'none'
      if (accountContainer) accountContainer.style.display = 'block'
    }
  })

  // --- LOGGED-OUT RENDERING ---
  const renderLoggedOutState = () => {
    accountContainer.innerHTML = `
      <div class="logged-out-container">
        <div class="logged-out-logo">🛒</div>
        <h2 class="logged-out-title">Your ShopEasy account</h2>
        <p class="logged-out-desc">Sign in to track orders, message sellers, and save your favourite products</p>
        
        <div class="logged-out-actions">
          <a href="/login.html" class="btn-auth-primary">Sign In</a>
          <a href="/register.html" class="btn-auth-secondary">Create Account</a>
        </div>

        <div class="divider-text">What you can do</div>

        <div class="feature-list">
          <div class="feature-item">
            <span class="feature-icon">📦</span>
            <div class="feature-info">
              <span class="feature-title">Track your orders</span>
            </div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">💬</span>
            <div class="feature-info">
              <span class="feature-title">Chat with sellers</span>
            </div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">❤️</span>
            <div class="feature-info">
              <span class="feature-title">Save products to wishlist</span>
            </div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">🏪</span>
            <div class="feature-info">
              <span class="feature-title">Follow stores</span>
            </div>
          </div>
        </div>
      </div>
    `
    applyTranslations()
  }

  // --- LOGGED-IN RENDERING ---
  const renderLoggedInState = (profile, email, orderCounts, sellerStore) => {
    const avatar = profile.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(profile.name || 'ShopEasy')
    const city = profile.city || 'Lilongwe'
    const role = profile.role || 'buyer'

    // Format badge text for counts
    const countBadge = (count) => {
      if (!count || count <= 0) return ''
      return `<span class="orders-quick-badge">${count}</span>`
    }

    // Build the structural HTML for account
    let html = `
      <!-- Profile Header Block -->
      <div class="profile-card-modern">
        <div class="avatar-wrapper" id="avatar-click-zone">
          <img class="avatar-image" id="profile-avatar-img" src="${avatar}" alt="Avatar">
          <div class="avatar-edit-overlay">✏️</div>
        </div>
        <h2 class="profile-name">${profile.name || 'ShopEasy Member'}</h2>
        <div class="profile-email">${email}</div>
        <div class="profile-location">📍 ${city}, Malawi</div>
        <div class="profile-verified-badge">✅ Account Verified</div>
        <div class="profile-edit-link" id="edit-profile-btn">✏️ Edit Profile</div>
      </div>

      <!-- MY ORDERS quick access -->
      <div class="orders-quick-group">
        <h3 class="orders-quick-title">My Orders</h3>
        <div class="orders-quick-row">
          <div class="orders-quick-btn" id="order-tab-pending_payment">
            <div class="orders-quick-icon-circle">📋</div>
            <span class="orders-quick-label">To Pay</span>
            ${countBadge(orderCounts.pending_payment)}
          </div>
          <div class="orders-quick-btn" id="order-tab-processing">
            <div class="orders-quick-icon-circle">📦</div>
            <span class="orders-quick-label">Processing</span>
            ${countBadge(orderCounts.processing)}
          </div>
          <div class="orders-quick-btn" id="order-tab-ready">
            <div class="orders-quick-icon-circle">🚗</div>
            <span class="orders-quick-label">Ready</span>
            ${countBadge(orderCounts.ready)}
          </div>
          <div class="orders-quick-btn" id="order-tab-completed">
            <div class="orders-quick-icon-circle">✅</div>
            <span class="orders-quick-label">Completed</span>
            ${countBadge(orderCounts.completed)}
          </div>
          <div class="orders-quick-btn" id="order-tab-dispute_open">
            <div class="orders-quick-icon-circle">↩️</div>
            <span class="orders-quick-label">Returns</span>
            ${countBadge(orderCounts.dispute_open)}
          </div>
        </div>
      </div>

      <!-- MENU TILES (2x2 grid) -->
      <div class="menu-grid">
        <div class="menu-tile" id="menu-wishlist">
          <span class="menu-tile-icon">❤️</span>
          <span class="menu-tile-title">Wishlist</span>
        </div>
        <div class="menu-tile" id="menu-followed">
          <span class="menu-tile-icon">🏪</span>
          <span class="menu-tile-title">Followed Stores</span>
        </div>
        <div class="menu-tile" id="menu-messages">
          <span class="menu-tile-icon">💬</span>
          <span class="menu-tile-title">Messages</span>
        </div>
        <div class="menu-tile" id="menu-settings">
          <span class="menu-tile-icon">⚙️</span>
          <span class="menu-tile-title">Settings</span>
        </div>
      </div>
    `

    // Add role specific cards
    if (role === 'buyer') {
      html += `
        <!-- Sell on ShopEasy Card -->
        <div class="seller-promo-card">
          <span class="seller-promo-icon">🏪</span>
          <div class="seller-promo-info">
            <h4 class="seller-promo-title">Sell on ShopEasy</h4>
            <p class="seller-promo-desc">Start your own store and reach buyers across Malawi</p>
            <button class="btn-become-seller" id="btn-become-seller">Become a Seller</button>
          </div>
        </div>
      `
    } else if (role === 'seller') {
      const storeName = sellerStore?.storeName || profile.storeName || 'My Store'
      const storeLogo = sellerStore?.storeLogo || profile.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(storeName)
      const storeStatus = sellerStore?.status || 'Active' // Active or Pending
      const statusClass = storeStatus.toLowerCase() === 'pending' ? 'store-status-badge--pending' : 'store-status-badge--active'

      html += `
        <!-- My Store Card -->
        <div class="active-store-card">
          <div class="store-card-header">
            <img class="store-card-logo" src="${storeLogo}" alt="Store Logo">
            <div class="store-card-meta">
              <span class="store-card-name">${storeName}</span>
              <span class="store-status-badge ${statusClass}">${storeStatus}</span>
            </div>
          </div>
          <button class="btn-manage-store w-full" id="btn-manage-store">Manage My Store</button>
        </div>
      `
    }

    // Sign out button
    html += `
      <span class="signout-text-link" id="trigger-logout">Sign Out</span>
    `

    accountContainer.innerHTML = html

    // Bind event listeners for dynamic nodes
    setupLoggedInListeners()
    applyTranslations()
  }

  // --- LOGGED-IN EVENT BINDINGS ---
  const setupLoggedInListeners = () => {
    // 1. Avatar Click triggers hidden file picker
    const avatarZone = document.getElementById('avatar-click-zone')
    if (avatarZone && avatarFileInput) {
      avatarZone.addEventListener('click', () => {
        avatarFileInput.click()
      })
    }

    // 2. Edit profile redirects to settings profile section
    const editProfileBtn = document.getElementById('edit-profile-btn')
    if (editProfileBtn) {
      editProfileBtn.addEventListener('click', () => {
        redirect('/settings.html#profile')
      })
    }

    // 3. Quick Order Status redirs
    const bindOrderRedirect = (elementId, tabName) => {
      const el = document.getElementById(elementId)
      if (el) {
        el.addEventListener('click', () => {
          redirect(`/orders.html?tab=${tabName}`)
        })
      }
    }
    bindOrderRedirect('order-tab-pending_payment', 'pending_payment')
    bindOrderRedirect('order-tab-processing', 'processing')
    bindOrderRedirect('order-tab-ready', 'ready')
    bindOrderRedirect('order-tab-completed', 'completed')
    bindOrderRedirect('order-tab-dispute_open', 'dispute_open')

    // 4. Grid Tile redirs
    const bindGridRedirect = (elementId, href) => {
      const el = document.getElementById(elementId)
      if (el) {
        el.addEventListener('click', () => {
          redirect(href)
        })
      }
    }
    bindGridRedirect('menu-wishlist', '/wishlist.html')
    bindGridRedirect('menu-followed', '/followed-stores.html')
    bindGridRedirect('menu-messages', '/messages.html')
    bindGridRedirect('menu-settings', '/settings.html')

    // 5. Role card button redirs
    const becomeSellerBtn = document.getElementById('btn-become-seller')
    if (becomeSellerBtn) {
      becomeSellerBtn.addEventListener('click', () => {
        redirect('/seller/setup.html')
      })
    }

    const manageStoreBtn = document.getElementById('btn-manage-store')
    if (manageStoreBtn) {
      manageStoreBtn.addEventListener('click', () => {
        redirect('/seller/dashboard.html')
      })
    }

    // 6. Custom Sign out popup trigger
    const signoutTrigger = document.getElementById('trigger-logout')
    if (signoutTrigger) {
      signoutTrigger.addEventListener('click', () => {
        if (logoutModal) {
          logoutModal.classList.add('confirm-overlay--visible')
        }
      })
    }
  }

  // Handle avatar upload directly from Account page
  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0]
      if (!file) return

      // Validate image file
      if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file', 'danger')
        return
      }

      if (!currentUser) return

      showToast('Uploading profile image...', 'success')
      try {
        const fileRef = ref(storage, `users/${currentUser.uid}/avatar.jpg`)
        const snapshot = await uploadBytes(fileRef, file)
        const downloadUrl = await getDownloadURL(fileRef)

        // Update Firestore user profile
        await updateDoc(doc(db, 'users', currentUser.uid), {
          avatar: downloadUrl,
          updatedAt: serverTimestamp()
        })

        // Update Auth displayName and photoURL
        await updateProfile(currentUser, {
          photoURL: downloadUrl
        })

        // Update local UI element
        const avatarImg = document.getElementById('profile-avatar-img')
        if (avatarImg) {
          avatarImg.src = downloadUrl
        }

        showToast('Profile image updated successfully!', 'success')
      } catch (err) {
        console.error('Error uploading avatar:', err)
        showToast('Failed to upload image.', 'danger')
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`)
      }
    })
  }

  // Custom Sign Out Modal Confirm / Cancel handlers
  if (logoutCancelBtn) {
    logoutCancelBtn.addEventListener('click', () => {
      if (logoutModal) {
        logoutModal.classList.remove('confirm-overlay--visible')
      }
    })
  }

  if (logoutConfirmBtn) {
    logoutConfirmBtn.addEventListener('click', async () => {
      try {
        await signOut(auth)
        if (logoutModal) {
          logoutModal.classList.remove('confirm-overlay--visible')
        }
        showToast('Successfully signed out!', 'success')
        setTimeout(() => redirect('/login.html'), 1000)
      } catch (err) {
        showToast('Failed to sign out. Try again.', 'danger')
      }
    })
  }
})
