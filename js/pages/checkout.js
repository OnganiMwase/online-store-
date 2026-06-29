/**
 * ShopEasy Checkout Page Control Module
 */

import { auth, db } from '../firebase-config.js'
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { formatMWK, showToast, showLoading, hideLoading, redirect, generateId, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  const breakdownContainer = document.getElementById('order-items-breakdown')
  const subtotalValEl = document.getElementById('subtotal-val')
  const totalValEl = document.getElementById('total-val')
  const form = document.getElementById('checkout-form')
  const submitBtn = document.getElementById('pay-place-btn')

  // Mobile money UI triggers
  const paymentOptions = document.querySelectorAll('input[name="paymentMethod"]')
  const momoGroup = document.getElementById('mobile-money-phone-group')
  const momoPhoneInput = document.getElementById('momo-phone')

  let cartItems = []
  let orderTotal = 0
  let userProfile = null

  // Check login and fetch profile & cart data
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showToast('Please sign in to checkout', 'warning')
      redirect('/login.html')
      return
    }

    // Load User Profile to auto-fill delivery form
    try {
      const profileSnap = await getDoc(doc(db, 'users', user.uid))
      if (profileSnap.exists()) {
        userProfile = profileSnap.data()
        // Auto-fill form
        document.getElementById('delivery-name').value = userProfile.name || ''
        document.getElementById('delivery-phone').value = userProfile.phone || ''
        document.getElementById('delivery-city').value = userProfile.city || 'Lilongwe'
      }
    } catch (error) {
      console.warn('Failed to load user profile for autofill', error)
    }

    // Load Cart Items
    try {
      const cartSnapshot = await getDocs(collection(db, `carts/${user.uid}/items`))
      if (cartSnapshot.empty) {
        showToast('Your cart is empty!', 'warning')
        redirect('/cart.html')
        return
      }

      breakdownContainer.innerHTML = ''
      cartItems = []
      orderTotal = 0

      cartSnapshot.forEach(snapDoc => {
        const item = snapDoc.data()
        item.id = snapDoc.id
        cartItems.push(item)

        const itemTotal = Number(item.price || 0) * Number(item.quantity || 1)
        orderTotal += itemTotal

        // Render item row in summary
        breakdownContainer.innerHTML += `
          <div class="breakdown-row">
            <span class="breakdown-item-name">${item.name}</span>
            <span class="breakdown-item-qty">x${item.quantity}</span>
            <span class="breakdown-item-price">${formatMWK(itemTotal)}</span>
          </div>
        `
      })

      if (subtotalValEl) subtotalValEl.textContent = formatMWK(orderTotal)
      if (totalValEl) totalValEl.textContent = formatMWK(orderTotal)

    } catch (error) {
      showToast('Failed to load order summary', 'danger')
      handleFirestoreError(error, OperationType.LIST, `carts/${user.uid}/items`)
    }
  })

  // Toggle mobile money registered number field
  if (paymentOptions && momoGroup) {
    paymentOptions.forEach(opt => {
      opt.addEventListener('change', (e) => {
        const val = e.target.value
        if (val === 'airtel-money' || val === 'tnm-mpamba') {
          momoGroup.style.display = 'block'
          if (momoPhoneInput) momoPhoneInput.required = true
        } else {
          momoGroup.style.display = 'none'
          if (momoPhoneInput) momoPhoneInput.required = false
        }
      })
    })
  }

  // Handle Form Submission and Placement of Order
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const user = auth.currentUser
      if (!user || cartItems.length === 0) return

      const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value
      const deliveryName = document.getElementById('delivery-name').value.trim()
      const deliveryPhone = document.getElementById('delivery-phone').value.trim()
      const deliveryAddress = document.getElementById('delivery-address').value.trim()
      const deliveryCity = document.getElementById('delivery-city').value

      // If mobile money is selected, fetch mobile number
      const momoNumber = (paymentMethod === 'airtel-money' || paymentMethod === 'tnm-mpamba') 
        ? momoPhoneInput.value.trim() 
        : ''

      showLoading(submitBtn, 'Placing Order...')

      try {
        const orderId = generateId()
        const orderDocRef = doc(db, 'orders', orderId)

        // Construct standard order document
        const orderData = {
          orderId,
          buyerId: user.uid,
          buyerName: deliveryName,
          buyerPhone: deliveryPhone,
          deliveryDetails: {
            name: deliveryName,
            phone: deliveryPhone,
            address: deliveryAddress,
            city: deliveryCity
          },
          items: cartItems.map(item => ({
            productId: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            sellerId: item.sellerId
          })),
          totalPrice: orderTotal,
          paymentMethod,
          momoNumber,
          paymentStatus: paymentMethod === 'cod' ? 'pending_on_delivery' : 'processing_payment',
          status: 'pending', // 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled'
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }

        // Save Order Document
        await setDoc(orderDocRef, orderData)

        // Empty Cart Items in Firestore sequentially
        for (const item of cartItems) {
          await deleteDoc(doc(db, `carts/${user.uid}/items`, item.id))
        }

        hideLoading(submitBtn)
        showToast('Order Placed Successfully!', 'success')
        
        // Redirect to order-success page
        setTimeout(() => {
          redirect(`/order-success.html?id=${orderId}`)
        }, 1200)

      } catch (error) {
        hideLoading(submitBtn)
        showToast('Could not place order. Please try again.', 'danger')
        handleFirestoreError(error, OperationType.WRITE, `orders`)
      }
    })
  }
})
