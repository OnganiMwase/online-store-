import { auth, db } from '../firebase-config.js'
import { 
  createUserWithEmailAndPassword,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { doc, setDoc, serverTimestamp } from 
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { showToast, showLoading, hideLoading, redirect } 
  from '../utils.js'

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

// Password toggle visibility
const togglePasswordBtn = document.getElementById('togglePassword')
if (togglePasswordBtn) {
  togglePasswordBtn.addEventListener('click', () => {
    const input = document.getElementById('password')
    input.type = input.type === 'password' ? 'text' : 'password'
  })
}

const toggleConfirmPasswordBtn = document.getElementById('toggleConfirmPassword')
if (toggleConfirmPasswordBtn) {
  toggleConfirmPasswordBtn.addEventListener('click', () => {
    const input = document.getElementById('confirmPassword')
    input.type = input.type === 'password' ? 'text' : 'password'
  })
}

// Form Submission & Validation
const registerForm = document.getElementById('registerForm')
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    clearErrors()

    const name = document.getElementById('name').value.trim()
    const email = document.getElementById('email').value.trim()
    const phone = document.getElementById('phone').value.trim()
    const city = document.getElementById('city').value
    const role = roleInput.value
    const password = document.getElementById('password').value
    const confirmPassword = document.getElementById('confirmPassword').value

    let valid = true

    if (!name || name.length < 2) {
      showFieldError('nameError', 'Full Name is required and must be at least 2 characters')
      valid = false
    }

    if (!email || !isValidEmail(email)) {
      showFieldError('emailError', 'Enter a valid email address')
      valid = false
    }

    if (phone && !isValidPhone(phone)) {
      showFieldError('phoneError', 'Phone number must be in +265 format (e.g. +265888123456)')
      valid = false
    }

    if (!city) {
      showFieldError('cityError', 'Please select your city')
      valid = false
    }

    const passwordErrorMsg = validatePasswordStrength(password)
    if (passwordErrorMsg) {
      showFieldError('passwordError', passwordErrorMsg)
      valid = false
    }

    if (password !== confirmPassword) {
      showFieldError('confirmPasswordError', 'Passwords do not match')
      valid = false
    }

    if (!role || (role !== 'buyer' && role !== 'seller')) {
      showFieldError('roleError', 'Invalid role selection')
      valid = false
    }

    if (!valid) return

    const btn = document.getElementById('registerBtn')
    showLoading(btn, 'Creating Account...')

    try {
      // 1. Create firebase auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      // 2. Update display name in Firebase Auth profile
      await updateProfile(user, { displayName: name })

      // 3. Save profile metadata in firestore
      const userDocRef = doc(db, 'users', user.uid)
      await setDoc(userDocRef, {
        uid: user.uid,
        name: name,
        email: email,
        phone: phone ? phone.replace(/[\s-]/g, '') : '',
        role: role,
        city: city,
        avatar: user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
        isProfileComplete: true,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      })

      hideLoading(btn)
      showToast('Account Created Successfully!', 'success')

      setTimeout(() => {
        if (role === 'seller') {
          redirect('seller/setup.html')
        } else {
          redirect('index.html')
        }
      }, 1200)

    } catch (err) {
      hideLoading(btn)
      handleRegisterError(err)
    }
  })
}

// Helper functions
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidPhone(phone) {
  const cleanPhone = phone.replace(/[\s-]/g, '')
  return /^\+265\d{7,10}$/.test(cleanPhone)
}

function validatePasswordStrength(password) {
  if (password.length < 8) return 'Password must be at least 8 characters long'
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number'
  return null
}

function showFieldError(elementId, message) {
  const el = document.getElementById(elementId)
  if (el) el.textContent = message
}

function clearErrors() {
  document.querySelectorAll('.form-error')
    .forEach(el => el.textContent = '')
}

function handleRegisterError(err) {
  const messages = {
    'auth/email-already-in-use': 'This email address is already registered',
    'auth/invalid-email': 'Invalid email address',
    'auth/weak-password': 'The password is too weak',
    'auth/operation-not-allowed': 'Registration is currently disabled'
  }
  const message = messages[err.code] || 'Registration failed. Please try again.'
  showToast(message, 'danger')
}
