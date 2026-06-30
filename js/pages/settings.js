/**
 * ShopEasy Settings Page Control Module
 */

import { auth, db, storage } from '../firebase-config.js'
import { initAuth } from '../auth.js'
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { sendPasswordResetEmail, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'

import { injectHeaderAndNav } from '../ui.js'
import { showToast, redirect, handleFirestoreError, OperationType } from '../utils.js'
import { t, applyTranslations } from '../i18n.js'

document.addEventListener('DOMContentLoaded', async () => {
  // Inject default navigation tab
  injectHeaderAndNav('account')

  // Authentication Guard: require logged-in user
  const authState = await initAuth({ requireAuth: true })
  const currentUser = authState.user
  let userProfile = authState.userData || {}

  // UI Container elements
  const settingsLoading = document.getElementById('settings-loading')
  const settingsSections = document.getElementById('settings-sections')

  // Back Button
  const backBtn = document.getElementById('settings-back-btn')
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      redirect('/account.html')
    })
  }

  // Hide loading once authenticated
  if (settingsLoading) settingsLoading.style.display = 'none'
  if (settingsSections) settingsSections.style.display = 'block'

  // 1. --- SECTION: PROFILE DETAILS ---
  const toggleProfileRow = document.getElementById('toggle-profile-row')
  const formProfileContainer = document.getElementById('form-profile-container')
  const editProfileForm = document.getElementById('edit-profile-form')
  
  const settingsAvatarClick = document.getElementById('settings-avatar-click')
  const settingsAvatarFile = document.getElementById('settings-avatar-file')
  const settingsAvatarPreview = document.getElementById('settings-avatar-preview')

  const rowAvatar = document.getElementById('row-profile-avatar')
  const rowName = document.getElementById('row-profile-name')
  const rowEmail = document.getElementById('row-profile-email')

  // Initial form values setup
  let selectedAvatarFile = null
  if (currentUser) {
    setupProfileFields()
  }

  function setupProfileFields() {
    const avatarUrl = userProfile.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(userProfile.name || 'S')
    if (settingsAvatarPreview) settingsAvatarPreview.src = avatarUrl
    if (rowAvatar) rowAvatar.src = avatarUrl
    if (rowName) rowName.textContent = userProfile.name || 'ShopEasy Member'
    if (rowEmail) rowEmail.textContent = currentUser.email

    document.getElementById('settings-fullname').value = userProfile.name || ''
    document.getElementById('settings-phone').value = userProfile.phone || ''
    document.getElementById('settings-city').value = userProfile.city || 'Lilongwe'
  }

  // Toggle Edit Profile section visibility
  if (toggleProfileRow && formProfileContainer) {
    toggleProfileRow.addEventListener('click', () => {
      const isVisible = formProfileContainer.classList.contains('settings-expandable-form--visible')
      if (isVisible) {
        formProfileContainer.classList.remove('settings-expandable-form--visible')
      } else {
        formProfileContainer.classList.add('settings-expandable-form--visible')
        // Automatically scroll to view
        formProfileContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    })
  }

  // Check URL fragment to see if we should auto-open profile section
  if (window.location.hash === '#profile' && formProfileContainer) {
    formProfileContainer.classList.add('settings-expandable-form--visible')
  }

  // Avatar Click event to trigger file picker
  if (settingsAvatarClick && settingsAvatarFile) {
    settingsAvatarClick.addEventListener('click', () => {
      settingsAvatarFile.click()
    })
  }

  // Local file preview after picker selection
  if (settingsAvatarFile && settingsAvatarPreview) {
    settingsAvatarFile.addEventListener('change', (e) => {
      const file = e.target.files[0]
      if (file) {
        if (!file.type.startsWith('image/')) {
          showToast('Please select a valid image file.', 'danger')
          return
        }
        selectedAvatarFile = file
        const reader = new FileReader()
        reader.onload = (event) => {
          settingsAvatarPreview.src = event.target.result
        }
        reader.readAsDataURL(file)
      }
    })
  }

  // Save changes event handler
  if (editProfileForm) {
    editProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      
      const fullNameInput = document.getElementById('settings-fullname')
      const phoneInput = document.getElementById('settings-phone')
      const citySelect = document.getElementById('settings-city')

      const errName = document.getElementById('error-fullname')
      const errPhone = document.getElementById('error-phone')

      // Form validation
      let isValid = true
      
      if (!fullNameInput.value.trim()) {
        fullNameInput.classList.add('form-input--error')
        if (errName) errName.classList.add('field-error-msg--active')
        isValid = false
      } else {
        fullNameInput.classList.remove('form-input--error')
        if (errName) errName.classList.remove('field-error-msg--active')
      }

      // Check phone contains valid characters if provided
      const phoneVal = phoneInput.value.trim()
      if (phoneVal && !/^\+?[0-9\s\-()]{6,16}$/.test(phoneVal)) {
        phoneInput.classList.add('form-input--error')
        if (errPhone) errPhone.classList.add('field-error-msg--active')
        isValid = false
      } else {
        phoneInput.classList.remove('form-input--error')
        if (errPhone) errPhone.classList.remove('field-error-msg--active')
      }

      if (!isValid) return

      const btnSave = document.getElementById('btn-save-profile')
      const originalText = btnSave.textContent
      btnSave.textContent = 'Saving...'
      btnSave.disabled = true

      try {
        let avatarDownloadUrl = userProfile.avatar || ''

        // Upload new avatar if file was selected
        if (selectedAvatarFile) {
          const fileRef = ref(storage, `users/${currentUser.uid}/avatar.jpg`)
          await uploadBytes(fileRef, selectedAvatarFile)
          avatarDownloadUrl = await getDownloadURL(fileRef)
        }

        // Update Auth User profile details
        await updateProfile(currentUser, {
          displayName: fullNameInput.value.trim(),
          photoURL: avatarDownloadUrl || null
        })

        // Update Firestore User Profile doc
        const profileUpdates = {
          name: fullNameInput.value.trim(),
          phone: phoneVal,
          city: citySelect.value,
          avatar: avatarDownloadUrl,
          updatedAt: serverTimestamp()
        }

        await updateDoc(doc(db, 'users', currentUser.uid), profileUpdates)

        // Refresh cached profile object and UI headers
        userProfile = { ...userProfile, ...profileUpdates }
        setupProfileFields()

        showToast('Profile updated successfully!', 'success')
        formProfileContainer.classList.remove('settings-expandable-form--visible')
        selectedAvatarFile = null
      } catch (err) {
        console.error('Error saving profile settings:', err)
        showToast('Failed to update profile details.', 'danger')
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`)
      } finally {
        btnSave.textContent = originalText
        btnSave.disabled = false
      }
    })
  }


  // 2. --- SECTION: DELIVERY ADDRESSES ---
  const toggleAddressesRow = document.getElementById('toggle-addresses-row')
  const formAddressesContainer = document.getElementById('form-addresses-container')
  const btnAddAddressTrigger = document.getElementById('btn-add-address-trigger')
  const addressEditorBlock = document.getElementById('address-editor-block')
  const addressFormTitle = document.getElementById('address-form-title')
  const addressActionForm = document.getElementById('address-action-form')
  const btnCancelAddress = document.getElementById('btn-cancel-address')
  const savedAddressesList = document.getElementById('saved-addresses-list')

  let addresses = []

  // Load Saved Addresses Subcollection
  async function loadAddresses() {
    if (!currentUser) return
    try {
      if (savedAddressesList) {
        savedAddressesList.innerHTML = `
          <div style="padding: 12px 0; text-align: center; color: var(--grey-600); font-size: 0.8rem; font-weight: 600;">
            Loading saved addresses...
          </div>
        `
      }

      const qSnap = await getDocs(collection(db, `users/${currentUser.uid}/addresses`))
      addresses = []
      qSnap.forEach(docSnap => {
        addresses.push({
          id: docSnap.id,
          ...docSnap.data()
        })
      })

      // Sort default address to the very top
      addresses.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))

      renderAddressList()
    } catch (err) {
      console.error('Error loading addresses:', err)
      if (savedAddressesList) {
        savedAddressesList.innerHTML = `<div style="color: var(--danger); font-size: 0.8rem; font-weight: 700; padding: 12px 0;">Error loading addresses.</div>`
      }
      handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}/addresses`)
    }
  }

  function renderAddressList() {
    if (!savedAddressesList) return

    if (addresses.length === 0) {
      savedAddressesList.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: var(--grey-600); font-size: 0.82rem; font-weight: 600; line-height: 1.4;">
          No saved addresses yet.<br>Add an address to speed up checkout.
        </div>
      `
      return
    }

    let html = ''
    addresses.forEach(addr => {
      const isDefaultClass = addr.isDefault ? 'address-card--default' : ''
      html += `
        <div class="address-card ${isDefaultClass}" id="addr-card-${addr.id}">
          <div class="address-header">
            <span class="address-name">${escapeHTML(addr.fullName)}</span>
            ${addr.isDefault ? `<span class="default-badge">DEFAULT</span>` : ''}
          </div>
          <div class="address-phone">${escapeHTML(addr.phone)}</div>
          <div class="address-body">
            ${escapeHTML(addr.area)}, ${escapeHTML(addr.city)}
            ${addr.landmark ? `<br><span style="color: var(--grey-600); font-size: 0.76rem;">📍 Landmark: ${escapeHTML(addr.landmark)}</span>` : ''}
          </div>
          <div class="address-actions">
            <span class="address-action-btn address-action-btn--edit" onclick="window.editAddress('${addr.id}')">✏️ Edit</span>
            <span class="address-action-btn address-action-btn--delete" onclick="window.deleteAddress('${addr.id}')">🗑️ Delete</span>
            ${!addr.isDefault ? `<span class="address-action-btn address-action-btn--default" onclick="window.setDefaultAddress('${addr.id}')">Set as Default</span>` : ''}
          </div>
        </div>
      `
    })

    savedAddressesList.innerHTML = html
  }

  // Expand delivery addresses tab panel
  if (toggleAddressesRow && formAddressesContainer) {
    toggleAddressesRow.addEventListener('click', (e) => {
      // If clicked Add New button inside, don't close the entire accordion
      if (e.target.id === 'btn-add-address-trigger') {
        e.stopPropagation()
        return
      }

      const isVisible = formAddressesContainer.classList.contains('settings-expandable-form--visible')
      if (isVisible) {
        formAddressesContainer.classList.remove('settings-expandable-form--visible')
      } else {
        formAddressesContainer.classList.add('settings-expandable-form--visible')
        loadAddresses()
        formAddressesContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    })
  }

  // Expand address form to Add New
  if (btnAddAddressTrigger && addressEditorBlock) {
    btnAddAddressTrigger.addEventListener('click', (e) => {
      e.stopPropagation()
      
      // Ensure accordion is open
      if (formAddressesContainer) {
        formAddressesContainer.classList.add('settings-expandable-form--visible')
      }

      // Reset address form
      addressActionForm.reset()
      document.getElementById('address-edit-id').value = ''
      document.getElementById('address-default-check').checked = false
      if (addressFormTitle) addressFormTitle.textContent = 'Add New Address'

      addressEditorBlock.style.display = 'block'
      addressEditorBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  // Cancel form
  if (btnCancelAddress && addressEditorBlock) {
    btnCancelAddress.addEventListener('click', () => {
      addressEditorBlock.style.display = 'none'
      addressActionForm.reset()
    })
  }

  // Save/Submit Address Form (Add/Update)
  if (addressActionForm) {
    addressActionForm.addEventListener('submit', async (e) => {
      e.preventDefault()

      const editId = document.getElementById('address-edit-id').value
      const fullName = document.getElementById('address-fullname').value.trim()
      const phone = document.getElementById('address-phone').value.trim()
      const city = document.getElementById('address-city').value
      const area = document.getElementById('address-area').value.trim()
      const landmark = document.getElementById('address-landmark').value.trim()
      const isDefault = document.getElementById('address-default-check').checked

      // Valudate fields
      let isValid = true
      const errName = document.getElementById('error-addr-name')
      const errPhone = document.getElementById('error-addr-phone')
      const errCity = document.getElementById('error-addr-city')
      const errArea = document.getElementById('error-addr-area')

      const checkFieldEmpty = (val, inputEl, errEl) => {
        if (!val) {
          inputEl.classList.add('form-input--error')
          errEl.classList.add('field-error-msg--active')
          isValid = false
        } else {
          inputEl.classList.remove('form-input--error')
          errEl.classList.remove('field-error-msg--active')
        }
      }

      checkFieldEmpty(fullName, document.getElementById('address-fullname'), errName)
      checkFieldEmpty(area, document.getElementById('address-area'), errArea)

      // Validate +265 phone format
      if (!phone || !/^\+265[0-9\s\-()]{7,13}$/.test(phone)) {
        document.getElementById('address-phone').classList.add('form-input--error')
        errPhone.classList.add('field-error-msg--active')
        isValid = false
      } else {
        document.getElementById('address-phone').classList.remove('form-input--error')
        errPhone.classList.remove('field-error-msg--active')
      }

      if (!isValid) return

      const btnSave = document.getElementById('btn-save-address')
      const originalText = btnSave.textContent
      btnSave.textContent = 'Saving...'
      btnSave.disabled = true

      try {
        const addressData = {
          fullName,
          phone,
          city,
          area,
          landmark,
          isDefault,
          updatedAt: serverTimestamp()
        }

        const addressSubRef = collection(db, `users/${currentUser.uid}/addresses`)
        let docRef

        if (editId) {
          docRef = doc(db, `users/${currentUser.uid}/addresses`, editId)
          await updateDoc(docRef, addressData)
        } else {
          docRef = doc(addressSubRef)
          await setDoc(docRef, addressData)
        }

        // If newly saved address is default, clear isDefault=false on all others
        if (isDefault) {
          const qSnap = await getDocs(addressSubRef)
          const promises = []
          qSnap.forEach(snap => {
            if (snap.id !== docRef.id && snap.data().isDefault) {
              promises.push(updateDoc(doc(db, `users/${currentUser.uid}/addresses`, snap.id), { isDefault: false }))
            }
          })
          await Promise.all(promises)
        }

        showToast(editId ? 'Address updated successfully!' : 'Address added successfully!', 'success')
        
        // Hide form and reload addresses
        addressEditorBlock.style.display = 'none'
        addressActionForm.reset()
        await loadAddresses()
      } catch (err) {
        console.error('Error saving address details:', err)
        showToast('Failed to save address info.', 'danger')
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/addresses`)
      } finally {
        btnSave.textContent = originalText
        btnSave.disabled = false
      }
    })
  }

  // Globally bind Address Edit action
  window.editAddress = (id) => {
    const addr = addresses.find(a => a.id === id)
    if (!addr) return

    document.getElementById('address-edit-id').value = addr.id
    document.getElementById('address-fullname').value = addr.fullName || ''
    document.getElementById('address-phone').value = addr.phone || ''
    document.getElementById('address-city').value = addr.city || 'Lilongwe'
    document.getElementById('address-area').value = addr.area || ''
    document.getElementById('address-landmark').value = addr.landmark || ''
    document.getElementById('address-default-check').checked = addr.isDefault || false

    if (addressFormTitle) addressFormTitle.textContent = 'Edit Address'
    if (addressEditorBlock) {
      addressEditorBlock.style.display = 'block'
      addressEditorBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  // Globally bind Address Delete action
  window.deleteAddress = async (id) => {
    const addr = addresses.find(a => a.id === id)
    if (!addr) return

    if (confirm(`Are you sure you want to delete address of ${addr.fullName}?`)) {
      try {
        await deleteDoc(doc(db, `users/${currentUser.uid}/addresses`, id))
        showToast('Address deleted successfully.', 'success')
        await loadAddresses()
      } catch (err) {
        console.error('Error deleting address:', err)
        showToast('Failed to delete address.', 'danger')
        handleFirestoreError(err, OperationType.DELETE, `users/${currentUser.uid}/addresses/${id}`)
      }
    }
  }

  // Globally bind Default Address selection trigger
  window.setDefaultAddress = async (id) => {
    try {
      const addressSubRef = collection(db, `users/${currentUser.uid}/addresses`)
      
      // Enforce other addresses default = false
      const qSnap = await getDocs(addressSubRef)
      const promises = []
      qSnap.forEach(snap => {
        const isTarget = snap.id === id
        if (snap.data().isDefault !== isTarget) {
          promises.push(updateDoc(doc(db, `users/${currentUser.uid}/addresses`, snap.id), { isDefault: isTarget }))
        }
      })
      await Promise.all(promises)
      showToast('Default address updated!', 'success')
      await loadAddresses()
    } catch (err) {
      console.error('Error setting default address:', err)
      showToast('Failed to update default address.', 'danger')
    }
  }


  // 3. --- SECTION: PREFERENCES (LANGUAGE PICKER) ---
  const triggerLanguageRow = document.getElementById('trigger-language-row')
  const languagePickerOverlay = document.getElementById('language-picker-overlay')
  const btnCloseLanguagePicker = document.getElementById('btn-close-language-picker')
  const langOptEn = document.getElementById('lang-opt-en')
  const langOptNy = document.getElementById('lang-opt-ny')

  function updateLanguageRowValue(lang) {
    const displayEl = document.getElementById('current-language-display')
    if (displayEl) {
      displayEl.innerHTML = `${lang === 'ny' ? 'Chichewa (Malaŵi)' : 'English'} &rsaquo;`
    }

    // Toggle ticked radio selection visually
    if (lang === 'ny') {
      langOptNy?.classList.add('radio-option--selected')
      langOptEn?.classList.remove('radio-option--selected')
    } else {
      langOptEn?.classList.add('radio-option--selected')
      langOptNy?.classList.remove('radio-option--selected')
    }
  }

  // Initialize Language Selection state
  const seLanguage = localStorage.getItem('se_language') || 'en'
  updateLanguageRowValue(seLanguage)
  applyTranslations()

  // Toggle Radio sheet overlay
  if (triggerLanguageRow && languagePickerOverlay) {
    triggerLanguageRow.addEventListener('click', () => {
      languagePickerOverlay.classList.add('radio-sheet-overlay--visible')
    })
  }

  if (btnCloseLanguagePicker && languagePickerOverlay) {
    btnCloseLanguagePicker.addEventListener('click', () => {
      languagePickerOverlay.classList.remove('radio-sheet-overlay--visible')
    })
  }

  // Handle English selection change
  if (langOptEn) {
    langOptEn.addEventListener('click', async () => {
      await updateLanguageSetting('en')
    })
  }

  // Handle Chichewa selection change
  if (langOptNy) {
    langOptNy.addEventListener('click', async () => {
      await updateLanguageSetting('ny')
    })
  }

  async function updateLanguageSetting(lang) {
    localStorage.setItem('se_language', lang)
    updateLanguageRowValue(lang)
    applyTranslations()

    // Save choice on Firestore User document
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          language: lang,
          updatedAt: serverTimestamp()
        })
      } catch (err) {
        console.warn('Could not save language choice in Firestore profile')
      }
    }

    showToast(lang === 'ny' ? 'Zinenero zasinthidwa kupita ku Chichewa!' : 'Language updated to English!', 'success')
    languagePickerOverlay.classList.remove('radio-sheet-overlay--visible')
  }


  // 4. --- SECTION: PASSWORD RESET ---
  const btnResetPassword = document.getElementById('btn-reset-password')
  if (btnResetPassword) {
    btnResetPassword.addEventListener('click', async () => {
      if (!currentUser || !currentUser.email) return

      try {
        await sendPasswordResetEmail(auth, currentUser.email)
        showToast(`Reset link successfully sent to ${currentUser.email}`, 'success')
      } catch (err) {
        console.error('Password reset email sending failure:', err)
        showToast('Could not send password reset link. Try again.', 'danger')
      }
    })
  }


  // 5. --- SECTION: DELETE ACCOUNT ---
  const btnDeleteAccountTrigger = document.getElementById('btn-delete-account-trigger')
  const deleteAccountOverlay = document.getElementById('delete-account-overlay')
  const deleteCancelBtn = document.getElementById('delete-cancel-btn')
  const deleteConfirmBtn = document.getElementById('delete-confirm-btn')
  const deleteConfirmInput = document.getElementById('delete-confirm-input')
  const errorDeleteConfirm = document.getElementById('error-delete-confirm')

  if (btnDeleteAccountTrigger && deleteAccountOverlay) {
    btnDeleteAccountTrigger.addEventListener('click', () => {
      if (deleteConfirmInput) deleteConfirmInput.value = ''
      if (errorDeleteConfirm) errorDeleteConfirm.classList.remove('field-error-msg--active')
      if (deleteConfirmInput) deleteConfirmInput.classList.remove('form-input--error')
      deleteAccountOverlay.classList.add('confirm-overlay--visible')
    })
  }

  if (deleteCancelBtn && deleteAccountOverlay) {
    deleteCancelBtn.addEventListener('click', () => {
      deleteAccountOverlay.classList.remove('confirm-overlay--visible')
    })
  }

  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', async () => {
      const confirmWord = deleteConfirmInput.value.trim().toUpperCase()

      if (confirmWord !== 'DELETE') {
        if (deleteConfirmInput) deleteConfirmInput.classList.add('form-input--error')
        if (errorDeleteConfirm) errorDeleteConfirm.classList.add('field-error-msg--active')
        return
      }

      if (deleteConfirmInput) deleteConfirmInput.classList.remove('form-input--error')
      if (errorDeleteConfirm) errorDeleteConfirm.classList.remove('field-error-msg--active')

      const originalText = deleteConfirmBtn.textContent
      deleteConfirmBtn.textContent = 'Deleting...'
      deleteConfirmBtn.disabled = true

      try {
        showToast('Deleting your account & store profile...', 'warning')

        // 1. Delete addresses subcollection items first
        try {
          const addressSubRef = collection(db, `users/${currentUser.uid}/addresses`)
          const qSnap = await getDocs(addressSubRef)
          const promises = []
          qSnap.forEach(snap => {
            promises.push(deleteDoc(doc(db, `users/${currentUser.uid}/addresses`, snap.id)))
          })
          await Promise.all(promises)
        } catch (err) {
          console.warn('Could not clear addresses subcollection:', err)
        }

        // 2. Delete main User document from Firestore
        try {
          await deleteDoc(doc(db, 'users', currentUser.uid))
        } catch (err) {
          console.warn('Could not delete user profile doc:', err)
        }

        // 3. Delete store profile if they are a seller
        if (userProfile.role === 'seller') {
          try {
            await deleteDoc(doc(db, 'stores', currentUser.uid))
          } catch (err) {
            console.warn('Could not delete associated stores profile doc:', err)
          }
        }

        // 4. Finally delete the Auth profile itself
        await currentUser.delete()

        showToast('Your account was permanently deleted.', 'success')
        deleteAccountOverlay.classList.remove('confirm-overlay--visible')
        
        setTimeout(() => {
          redirect('/login.html')
        }, 1200)

      } catch (err) {
        console.error('Error during account deletion sequence:', err)
        // Usually firebase auth requires recent-login for user deletion. We can tell them:
        if (err.code === 'auth/requires-recent-login') {
          showToast('For security, please log out and sign in again to delete your account.', 'danger')
        } else {
          showToast('Failed to delete user profile. Contact support.', 'danger')
        }
      } finally {
        deleteConfirmBtn.textContent = originalText
        deleteConfirmBtn.disabled = false
      }
    })
  }

  // Simple HTML Escaper to avoid XSS
  function escapeHTML(str) {
    if (!str) return ''
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
})
