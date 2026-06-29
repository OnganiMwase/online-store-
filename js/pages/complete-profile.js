import { auth, db } from '../firebase-config.js'
import { doc, setDoc, serverTimestamp } from 
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { showToast, showLoading, hideLoading, redirect } 
  from '../utils.js'

// Retrieve Google User info from session
const googleUserStr = sessionStorage.getItem('googleUser')
if (!googleUserStr) {
  redirect('login.html')
}

const googleUser = JSON.parse(googleUserStr)

// Role selector logic
const roleBuyer = document.getElementById('roleBuyer')
const roleSeller = document.getElementById('roleSeller')
const roleInput = document.getElementById('role')

if (roleBuyer && roleSeller && roleInput) {
  roleBuyer.addEventListener('click', () => {
    roleBuyer.classList.add('role-option--selected')
    roleSeller.classList.remove('role-option--selected')
    roleInput.value = 'buyer'
  })

  roleSeller.addEventListener('click', () => {
    roleSeller.classList.add('role-option--selected')
    roleBuyer.classList.remove('role-option--selected')
    roleInput.value = 'seller'
  })
}

const form = document.getElementById('completeProfileForm')
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    clearErrors()

    const phone = document.getElementById('phone').value.trim()
    const city = document.getElementById('city').value
    const role = roleInput.value

    let valid = true

    if (phone && !isValidPhone(phone)) {
      showFieldError('phoneError', 'Phone must be in +265 format (e.g. +265888123456)')
      valid = false
    }

    if (!city) {
      showFieldError('cityError', 'Please select your city')
      valid = false
    }

    if (!valid) return

    const btn = document.getElementById('completeProfileBtn')
    showLoading(btn, 'Setting up account...')

    try {
      const userDocRef = doc(db, 'users', googleUser.uid)
      await setDoc(userDocRef, {
        uid: googleUser.uid,
        name: googleUser.name || 'ShopEasy User',
        email: googleUser.email,
        phone: phone ? phone.replace(/[\s-]/g, '') : '',
        role: role,
        city: city,
        avatar: googleUser.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(googleUser.name || 'U')}`,
        isProfileComplete: true,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      })

      sessionStorage.removeItem('googleUser')
      hideLoading(btn)
      showToast('Profile completed successfully!', 'success')

      setTimeout(() => {
        if (role === 'seller') {
          redirect('seller/setup.html')
        } else {
          redirect('index.html')
        }
      }, 1200)

    } catch (err) {
      hideLoading(btn)
      console.error(err)
      showToast('Could not complete your profile. Please try again.', 'danger')
    }
  })
}

function isValidPhone(phone) {
  const cleanPhone = phone.replace(/[\s-]/g, '')
  return /^\+265\d{7,10}$/.test(cleanPhone)
}

function showFieldError(elementId, message) {
  const el = document.getElementById(elementId)
  if (el) el.textContent = message
}

function clearErrors() {
  document.querySelectorAll('.form-error')
    .forEach(el => el.textContent = '')
}
