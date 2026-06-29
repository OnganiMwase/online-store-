/**
 * ShopEasy Login Page Control Module
 */

import { loginWithEmail, loginWithGoogle } from '../auth.js'
import { showToast, showLoading, hideLoading, redirect } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form')
  const emailInput = document.getElementById('login-email')
  const passwordInput = document.getElementById('login-password')
  const submitBtn = document.getElementById('login-submit-btn')
  const googleBtn = document.getElementById('google-signin-btn')

  // Email and Password Login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const email = emailInput.value.trim()
      const password = passwordInput.value

      showLoading(submitBtn, 'Signing in...')
      try {
        await loginWithEmail(email, password)
        showToast('Successfully signed in!', 'success')
        
        // Redirect to homepage or user account
        setTimeout(() => redirect('/index.html'), 1000)
      } catch (error) {
        hideLoading(submitBtn)
        let errorMsg = 'Failed to sign in. Please check your credentials.'
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
          errorMsg = 'Incorrect email or password.'
        } else if (error.code === 'auth/invalid-email') {
          errorMsg = 'Invalid email address.'
        }
        showToast(errorMsg, 'danger')
      }
    })
  }

  // Google Single Sign-In
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      showLoading(googleBtn, 'Connecting Google...')
      try {
        await loginWithGoogle()
        showToast('Successfully signed in with Google!', 'success')
        setTimeout(() => redirect('/index.html'), 1000)
      } catch (error) {
        hideLoading(googleBtn)
        showToast('Google Sign-In failed. Please try again.', 'danger')
      }
    })
  }
})
