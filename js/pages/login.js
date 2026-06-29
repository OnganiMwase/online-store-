import { auth, db } from '../firebase-config.js'
import { 
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { doc, getDoc } from 
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { showToast, showLoading, hideLoading, redirect } 
  from '../utils.js'

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      if (userDoc.exists() && userDoc.data().isProfileComplete) {
        const redirectTo = sessionStorage.getItem('redirectAfterLogin') 
          || 'index.html'
        sessionStorage.removeItem('redirectAfterLogin')
        redirect(redirectTo)
      }
    } catch (err) {
      console.error("Error in login state change check: ", err)
    }
  }
})

// Email/Password login
document.getElementById('loginForm')
  .addEventListener('submit', async (e) => {
    e.preventDefault()
    clearErrors()
    
    const email = document.getElementById('email').value.trim()
    const password = document.getElementById('password').value
    
    let valid = true
    
    if (!email || !isValidEmail(email)) {
      showFieldError('emailError', 'Enter a valid email address')
      valid = false
    }
    if (!password) {
      showFieldError('passwordError', 'Enter your password')
      valid = false
    }
    if (!valid) return
    
    const btn = document.getElementById('loginBtn')
    showLoading(btn, 'Signing in...')
    
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      hideLoading(btn)
      handleAuthError(err)
    }
  })

// Google Sign-In
document.getElementById('googleBtn')
  .addEventListener('click', async () => {
    const provider = new GoogleAuthProvider()
    const btn = document.getElementById('googleBtn')
    showLoading(btn, 'Connecting...')
    
    try {
      const result = await signInWithPopup(auth, provider)
      const user = result.user
      
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      
      if (!userDoc.exists()) {
        // New Google user — needs to complete profile
        sessionStorage.setItem('googleUser', JSON.stringify({
          uid: user.uid,
          name: user.displayName,
          email: user.email,
          avatar: user.photoURL
        }))
        redirect('complete-profile.html')
        return
      }
      
      if (!userDoc.data().isProfileComplete) {
        redirect('complete-profile.html')
        return
      }
      
      const redirectTo = sessionStorage.getItem('redirectAfterLogin') 
        || 'index.html'
      sessionStorage.removeItem('redirectAfterLogin')
      redirect(redirectTo)
      
    } catch (err) {
      hideLoading(btn)
      if (err.code !== 'auth/popup-closed-by-user') {
        showToast('Google sign-in failed. Please try again.', 'danger')
      }
    }
  })

// Toggle password visibility
document.getElementById('togglePassword')
  .addEventListener('click', () => {
    const input = document.getElementById('password')
    input.type = input.type === 'password' ? 'text' : 'password'
  })

// Helper functions
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function showFieldError(elementId, message) {
  document.getElementById(elementId).textContent = message
}

function clearErrors() {
  document.querySelectorAll('.form-error')
    .forEach(el => el.textContent = '')
}

function handleAuthError(err) {
  const messages = {
    'auth/user-not-found': 
      'No account found with this email.',
    'auth/wrong-password': 
      'Incorrect password. Please try again.',
    'auth/too-many-requests': 
      'Too many failed attempts. Please try again later.',
    'auth/user-disabled': 
      'This account has been disabled. Contact support.',
    'auth/invalid-email': 
      'Invalid email address.',
    'auth/invalid-credential':
      'Incorrect email or password.'
  }
  const message = messages[err.code] 
    || 'Sign in failed. Please try again.'
  showToast(message, 'danger')
}
