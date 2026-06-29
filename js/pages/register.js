/**
 * ShopEasy Registration Page Control Module
 */

import { registerUser } from '../auth.js'
import { showToast, showLoading, hideLoading, redirect } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('register-form')
  const nameInput = document.getElementById('register-name')
  const emailInput = document.getElementById('register-email')
  const phoneInput = document.getElementById('register-phone')
  const citySelect = document.getElementById('register-city')
  const passwordInput = document.getElementById('register-password')
  const submitBtn = document.getElementById('register-submit-btn')

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      
      const name = nameInput.value.trim()
      const email = emailInput.value.trim()
      const phone = phoneInput.value.trim()
      const city = citySelect.value
      const password = passwordInput.value
      
      // Get selected role from radio buttons
      const roleRadio = document.querySelector('input[name="role"]:checked')
      const role = roleRadio ? roleRadio.value : 'buyer'

      showLoading(submitBtn, 'Creating account...')
      try {
        await registerUser(email, password, name, phone, city, role)
        showToast('Account successfully created!', 'success')
        
        // Redirect based on role
        setTimeout(() => {
          if (role === 'seller') {
            redirect('/seller/setup.html')
          } else {
            redirect('/index.html')
          }
        }, 1200)
      } catch (error) {
        hideLoading(submitBtn)
        let errorMsg = 'Failed to create account. Please try again.'
        if (error.code === 'auth/email-already-in-use') {
          errorMsg = 'This email is already registered.'
        } else if (error.code === 'auth/invalid-email') {
          errorMsg = 'Invalid email address.'
        } else if (error.code === 'auth/weak-password') {
          errorMsg = 'Password is too weak (min 6 characters).'
        }
        showToast(errorMsg, 'danger')
      }
    })
  }
})
