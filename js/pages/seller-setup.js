/**
 * ShopEasy Seller Setup Control Module (Production-Grade)
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
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'

import { showToast, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', async () => {
  const loadingSpinner = document.getElementById('setup-loading-spinner')
  const screenPending = document.getElementById('screen-pending')
  const screenRejected = document.getElementById('screen-rejected')
  const screenForm = document.getElementById('screen-form')

  const backToAccountBtn = document.getElementById('btn-back-to-account')
  if (backToAccountBtn) {
    backToAccountBtn.addEventListener('click', () => {
      redirect('/account.html')
    })
  }

  // Ensure user is authenticated
  let authState = await initAuth({ requireAuth: true })
  let currentUser = authState.user
  let userProfile = authState.userData || {}

  // Automatically promote a buyer to a seller role in Firestore
  if (userProfile.role === 'buyer') {
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { role: 'seller' })
      userProfile.role = 'seller'
    } catch (err) {
      console.warn('Could not promote buyer user to seller role in users collection:', err)
    }
  }

  // Load and Check Store Document
  let storeData = null
  try {
    const storeSnap = await getDoc(doc(db, 'stores', currentUser.uid))
    if (storeSnap.exists()) {
      storeData = storeSnap.data()
      
      if (storeData.status === 'approved') {
        redirect('/seller/dashboard.html')
        return
      } else if (storeData.status === 'pending_approval') {
        renderPendingScreen(storeData)
        return
      } else if (storeData.status === 'rejected') {
        renderRejectedScreen(storeData)
        return
      }
    }
  } catch (err) {
    console.error('Error checking store registration status:', err)
    showToast('Failed to check store status. Try again.', 'danger')
  }

  // If no store exists, display onboarding form
  loadingSpinner.style.display = 'none'
  screenForm.style.display = 'block'

  // Initialize wizard variables
  let currentStep = 1
  let logoURL = ''
  let idFrontURL = ''
  let idBackURL = ''
  let selectedPayoutMethod = 'airtel'

  // Fetch Firestore categories
  const storeCategorySelect = document.getElementById('store-category')
  try {
    const catsSnap = await getDocs(query(collection(db, 'categories')))
    if (!catsSnap.empty) {
      storeCategorySelect.innerHTML = '<option value="" disabled selected>Select category...</option>'
      catsSnap.forEach(catDoc => {
        const cat = catDoc.data()
        const slug = cat.slug || catDoc.id
        storeCategorySelect.innerHTML += `<option value="${slug}">${cat.name}</option>`
      })
    } else {
      useFallbackCategories()
    }
  } catch (err) {
    console.warn('Error querying categories, using fallbacks:', err)
    useFallbackCategories()
  }

  function useFallbackCategories() {
    const fallbacks = [
      { name: 'Electronics & Phones', slug: 'electronics' },
      { name: 'Fashion & Clothes', slug: 'fashion' },
      { name: 'Home & Living', slug: 'home-living' },
      { name: 'Groceries & Food', slug: 'groceries' },
      { name: 'Health & Beauty', slug: 'beauty' },
      { name: 'Services & Work', slug: 'services' }
    ]
    storeCategorySelect.innerHTML = '<option value="" disabled selected>Select category...</option>'
    fallbacks.forEach(cat => {
      storeCategorySelect.innerHTML += `<option value="${cat.slug}">${cat.name}</option>`
    })
  }

  // Textarea counter
  const descTextarea = document.getElementById('store-description')
  const descCounter = document.getElementById('store-description-counter')
  if (descTextarea && descCounter) {
    descTextarea.addEventListener('input', () => {
      const len = descTextarea.value.length
      descCounter.textContent = `${len} / 50 characters`
      if (len >= 50) {
        descCounter.style.color = 'var(--success)'
      } else {
        descCounter.style.color = 'var(--grey-600)'
      }
    })
  }

  // SAME AS PHONE WhatsApp sync
  const whatsappSameCheck = document.getElementById('whatsapp-same-check')
  const storePhoneInput = document.getElementById('store-phone')
  const storeWhatsappInput = document.getElementById('store-whatsapp')
  if (whatsappSameCheck && storePhoneInput && storeWhatsappInput) {
    whatsappSameCheck.addEventListener('change', () => {
      if (whatsappSameCheck.checked) {
        storeWhatsappInput.value = storePhoneInput.value
        storeWhatsappInput.disabled = true
      } else {
        storeWhatsappInput.disabled = false
      }
    })
    storePhoneInput.addEventListener('input', () => {
      if (whatsappSameCheck.checked) {
        storeWhatsappInput.value = storePhoneInput.value
      }
    })
  }

  // Payout Method Radio Choice Handler
  const payoutRadioCards = document.querySelectorAll('.payout-methods .payout-radio-card')
  const payoutNumberInput = document.getElementById('payout-number')
  const payoutNumberLabel = document.getElementById('payout-number-label')

  payoutRadioCards.forEach(card => {
    card.addEventListener('click', () => {
      payoutRadioCards.forEach(c => {
        c.classList.remove('payout-radio-card--selected')
        c.querySelector('.radio-option-dot').style.display = 'none'
        c.querySelector('.radio-option-circle').style.borderColor = 'var(--grey-400)'
      })

      card.classList.add('payout-radio-card--selected')
      card.querySelector('.radio-option-dot').style.display = 'block'
      card.querySelector('.radio-option-circle').style.borderColor = 'var(--primary)'

      selectedPayoutMethod = card.dataset.method
      if (selectedPayoutMethod === 'airtel') {
        payoutNumberLabel.textContent = 'Airtel Money Account Number*'
        payoutNumberInput.placeholder = '+265 999 123 456'
      } else {
        payoutNumberLabel.textContent = 'TNM Mpamba Account Number*'
        payoutNumberInput.placeholder = '+265 888 123 456'
      }
    })
  })

  // File Upload Handlers (Immediate Storage Uploads)
  setupImmediateUpload('logo-upload-box', 'logo-file-input', 'logo-preview', `stores/temp/${currentUser.uid}/logo.jpg`, (url) => {
    logoURL = url
    document.getElementById('error-store-logo').classList.remove('field-error-msg--active')
  })

  setupImmediateUpload('id-front-upload-box', 'id-front-file-input', 'id-front-preview', `stores/${currentUser.uid}/id_front.jpg`, (url) => {
    idFrontURL = url
    document.getElementById('error-id-front').classList.remove('field-error-msg--active')
  })

  setupImmediateUpload('id-back-upload-box', 'id-back-file-input', 'id-back-preview', `stores/${currentUser.uid}/id_back.jpg`, (url) => {
    idBackURL = url
    document.getElementById('error-id-back').classList.remove('field-error-msg--active')
  })

  // Compression & validation helper
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const MAX_SIZE = 2 * 1024 * 1024; // 2MB limit
      if (file.size > MAX_SIZE) {
        reject(new Error(`File "${file.name}" exceeds the 2MB size limit. Please choose a smaller file.`));
        return;
      }
      if (!file.type.startsWith('image/')) {
        reject(new Error(`File "${file.name}" is not a valid image format.`));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          const MAX_DIM = 1024; // Keep file size under ~100kb
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                resolve(file); // fallback
              }
            }, 'image/jpeg', 0.75);
          } else {
            resolve(file);
          }
        };
        img.onerror = () => reject(new Error('Failed to load image for compression.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
  };

  function setupImmediateUpload(boxId, inputId, previewId, storagePath, callback) {
    const box = document.getElementById(boxId)
    const input = document.getElementById(inputId)
    const preview = document.getElementById(previewId)

    if (box && input) {
      box.addEventListener('click', () => input.click())

      input.addEventListener('change', async (e) => {
        const file = e.target.files[0]
        if (!file) return

        let compressedBlob;
        try {
          compressedBlob = await compressImage(file)
        } catch (validationErr) {
          showToast(validationErr.message, 'danger')
          return
        }

        const originalText = box.querySelector('.upload-placeholder-lbl').textContent
        box.querySelector('.upload-placeholder-lbl').textContent = 'Uploading...'
        box.style.opacity = '0.7'

        try {
          const fileRef = ref(storage, storagePath)
          await uploadBytes(fileRef, compressedBlob, {
            contentType: 'image/jpeg'
          })
          const downloadUrl = await getDownloadURL(fileRef)

          // Show preview
          preview.src = downloadUrl
          preview.style.display = 'block'
          
          // Hide placeholder elements
          box.querySelector('.upload-placeholder-icon').style.display = 'none'
          box.querySelector('.upload-placeholder-lbl').style.display = 'none'
          box.querySelector('.upload-placeholder-sub').style.display = 'none'

          box.querySelector('.upload-placeholder-lbl').textContent = originalText
          box.style.opacity = '1'

          callback(downloadUrl)
          showToast('Image uploaded successfully!', 'success')
        } catch (err) {
          console.error('Storage Upload Error:', err)
          showToast('Failed to upload image.', 'danger')
          box.querySelector('.upload-placeholder-lbl').textContent = originalText
          box.style.opacity = '1'
        }
      })
    }
  }

  // Multi-step Wizard Navigation Buttons
  document.getElementById('btn-next-step-1').addEventListener('click', async () => {
    if (await validateStep1()) {
      transitionStep(2)
    }
  })

  document.getElementById('btn-back-step-1').addEventListener('click', () => {
    transitionStep(1)
  })

  document.getElementById('btn-next-step-2').addEventListener('click', () => {
    if (validateStep2()) {
      transitionStep(3)
    }
  })

  document.getElementById('btn-back-step-2').addEventListener('click', () => {
    transitionStep(2)
  })

  document.getElementById('btn-next-step-3').addEventListener('click', () => {
    if (validateStep3()) {
      populateStep4Summary()
      transitionStep(4)
    }
  })

  document.getElementById('btn-back-step-3').addEventListener('click', () => {
    transitionStep(3)
  })

  // STEP Validations
  async function validateStep1() {
    let isValid = true
    const nameInput = document.getElementById('store-name')
    const descText = document.getElementById('store-description')
    const categorySel = document.getElementById('store-category')
    const citySel = document.getElementById('store-city')

    const errName = document.getElementById('error-store-name')
    const errDesc = document.getElementById('error-store-description')
    const errCat = document.getElementById('error-store-category')
    const errCity = document.getElementById('error-store-city')
    const errLogo = document.getElementById('error-store-logo')

    // 1. Store Name
    const nameVal = nameInput.value.trim()
    if (!nameVal) {
      nameInput.classList.add('form-input--error')
      errName.textContent = 'Store name is required.'
      errName.classList.add('field-error-msg--active')
      isValid = false
    } else {
      // Check Uniqueness Query
      try {
        const qSnap = await getDocs(query(collection(db, 'stores'), where('name', '==', nameVal)))
        // Ensure that if it exists, it's not our own
        let existsOther = false
        qSnap.forEach(docSnap => {
          if (docSnap.id !== currentUser.uid) {
            existsOther = true
          }
        })
        if (existsOther) {
          nameInput.classList.add('form-input--error')
          errName.textContent = 'This store name is already taken. Please choose another.'
          errName.classList.add('field-error-msg--active')
          isValid = false
        } else {
          nameInput.classList.remove('form-input--error')
          errName.classList.remove('field-error-msg--active')
        }
      } catch (err) {
        console.warn('Could not verify store name uniqueness:', err)
      }
    }

    // 2. Store Description (min 50 chars)
    if (descText.value.length < 50) {
      descText.classList.add('form-input--error')
      errDesc.classList.add('field-error-msg--active')
      isValid = false
    } else {
      descText.classList.remove('form-input--error')
      errDesc.classList.remove('field-error-msg--active')
    }

    // 3. Category
    if (!categorySel.value) {
      categorySel.classList.add('form-input--error')
      errCat.classList.add('field-error-msg--active')
      isValid = false
    } else {
      categorySel.classList.remove('form-input--error')
      errCat.classList.remove('field-error-msg--active')
    }

    // 4. Logo uploaded
    if (!logoURL) {
      errLogo.classList.add('field-error-msg--active')
      isValid = false
    } else {
      errLogo.classList.remove('field-error-msg--active')
    }

    // 5. City
    if (!citySel.value) {
      citySel.classList.add('form-input--error')
      errCity.classList.add('field-error-msg--active')
      isValid = false
    } else {
      citySel.classList.remove('form-input--error')
      errCity.classList.remove('field-error-msg--active')
    }

    return isValid
  }

  function validateStep2() {
    let isValid = true
    const phoneInput = document.getElementById('store-phone')
    const whatsappInput = document.getElementById('store-whatsapp')
    const payoutInput = document.getElementById('payout-number')

    const errPhone = document.getElementById('error-store-phone')
    const errWhatsapp = document.getElementById('error-store-whatsapp')
    const errPayout = document.getElementById('error-payout-number')

    const phoneRegex = /^\+265[0-9\s\-()]{7,12}$/

    // Phone
    const phoneVal = phoneInput.value.trim()
    if (!phoneVal || !phoneRegex.test(phoneVal)) {
      phoneInput.classList.add('form-input--error')
      errPhone.classList.add('field-error-msg--active')
      isValid = false
    } else {
      phoneInput.classList.remove('form-input--error')
      errPhone.classList.remove('field-error-msg--active')
    }

    // WhatsApp
    const whatsappVal = whatsappInput.value.trim()
    if (!whatsappSameCheck.checked) {
      if (!whatsappVal || !phoneRegex.test(whatsappVal)) {
        whatsappInput.classList.add('form-input--error')
        errWhatsapp.classList.add('field-error-msg--active')
        isValid = false
      } else {
        whatsappInput.classList.remove('form-input--error')
        errWhatsapp.classList.remove('field-error-msg--active')
      }
    } else {
      whatsappInput.classList.remove('form-input--error')
      errWhatsapp.classList.remove('field-error-msg--active')
    }

    // Payout number
    const payoutVal = payoutInput.value.trim()
    if (!payoutVal || !phoneRegex.test(payoutVal)) {
      payoutInput.classList.add('form-input--error')
      errPayout.classList.add('field-error-msg--active')
      isValid = false
    } else {
      payoutInput.classList.remove('form-input--error')
      errPayout.classList.remove('field-error-msg--active')
    }

    return isValid
  }

  function validateStep3() {
    let isValid = true
    const errFront = document.getElementById('error-id-front')
    const errBack = document.getElementById('error-id-back')

    if (!idFrontURL) {
      errFront.classList.add('field-error-msg--active')
      isValid = false
    } else {
      errFront.classList.remove('field-error-msg--active')
    }

    if (!idBackURL) {
      errBack.classList.add('field-error-msg--active')
      isValid = false
    } else {
      errBack.classList.remove('field-error-msg--active')
    }

    return isValid
  }

  function populateStep4Summary() {
    document.getElementById('review-store-name').textContent = document.getElementById('store-name').value.trim()
    
    const catSelect = document.getElementById('store-category')
    document.getElementById('review-category').textContent = catSelect.options[catSelect.selectedIndex].text
    document.getElementById('review-city').textContent = document.getElementById('store-city').value
    
    const payoutName = selectedPayoutMethod === 'airtel' ? 'Airtel Money' : 'TNM Mpamba'
    document.getElementById('review-payout').textContent = `${payoutName} (${document.getElementById('payout-number').value.trim()})`
    document.getElementById('review-contacts').textContent = `Phone: ${document.getElementById('store-phone').value.trim()}`
  }

  function transitionStep(step) {
    currentStep = step
    
    // Hide all step panels
    document.querySelectorAll('.wizard-step-panel').forEach(panel => {
      panel.classList.remove('wizard-step-panel--active')
    })

    // Show selected step panel
    const currentPanel = document.querySelector(`.wizard-step-panel[data-step="${step}"]`)
    if (currentPanel) currentPanel.classList.add('wizard-step-panel--active')

    // Update wizard steps highlights
    document.querySelectorAll('.wizard-step-node').forEach(node => {
      const nodeStep = parseInt(node.dataset.step)
      node.classList.remove('wizard-step-node--active', 'wizard-step-node--completed')
      
      if (nodeStep < step) {
        node.classList.add('wizard-step-node--completed')
      } else if (nodeStep === step) {
        node.classList.add('wizard-step-node--active')
      }
    })

    // Progress line fill width
    const fillEl = document.getElementById('wizard-progress-fill')
    const percentage = ((step - 1) / 3) * 100
    if (fillEl) fillEl.style.width = `${percentage}%`

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Multi-Form Application submission
  const onboardingMultiForm = document.getElementById('onboarding-multi-form')
  if (onboardingMultiForm) {
    onboardingMultiForm.addEventListener('submit', async (e) => {
      e.preventDefault()

      const termsCheck = document.getElementById('terms-checkbox')
      const errTerms = document.getElementById('error-terms')

      if (!termsCheck.checked) {
        errTerms.classList.add('field-error-msg--active')
        return
      }
      errTerms.classList.remove('field-error-msg--active')

      const submitBtn = document.getElementById('btn-submit-app')
      const originalText = submitBtn.textContent
      submitBtn.textContent = 'Submitting...'
      submitBtn.disabled = true

      try {
        const name = document.getElementById('store-name').value.trim()
        const description = document.getElementById('store-description').value.trim()
        const category = document.getElementById('store-category').value
        const city = document.getElementById('store-city').value
        const phone = document.getElementById('store-phone').value.trim()
        const whatsapp = whatsappSameCheck.checked ? phone : document.getElementById('store-whatsapp').value.trim()
        const payoutNumber = document.getElementById('payout-number').value.trim()

        const docPayload = {
          sellerId: currentUser.uid,
          name,
          description,
          category,
          logo: logoURL,
          city,
          phone,
          whatsapp,
          payoutMethod: selectedPayoutMethod,
          payoutNumber,
          idFront: idFrontURL,
          idBack: idBackURL,
          status: 'pending_approval',
          rating: 0,
          ratingCount: 0,
          followerCount: 0,
          totalSales: 0,
          responseRate: 100,
          createdAt: serverTimestamp()
        }

        // Write store registration document to the real Firestore stores collection
        await setDoc(doc(db, 'stores', currentUser.uid), docPayload)

        // Write Admin alert notification to real database
        try {
          await addDoc(collection(db, 'notifications'), {
            type: 'new_store',
            storeId: currentUser.uid,
            title: 'New Store Application 🏪',
            body: `Seller "${name}" in ${city} has submitted their store onboarding application.`,
            createdAt: serverTimestamp(),
            read: false
          })
        } catch (err) {
          console.warn('Could not write admin notifications alert:', err)
        }

        showToast('Application submitted successfully!', 'success')
        
        // Render pending approval screen immediately
        renderPendingScreen(docPayload)
      } catch (err) {
        console.error('Error submitting store application:', err)
        showToast('Application submission failed. Try again.', 'danger')
        handleFirestoreError(err, OperationType.WRITE, `stores/${currentUser.uid}`)
      } finally {
        submitBtn.textContent = originalText
        submitBtn.disabled = false
      }
    })
  }

  // Show pending view helper
  function renderPendingScreen(data) {
    loadingSpinner.style.display = 'none'
    screenForm.style.display = 'none'
    screenRejected.style.display = 'none'
    
    document.getElementById('pending-store-name').textContent = data.name || 'My Store'
    
    let subDateStr = 'Just Now'
    if (data.createdAt) {
      const dateObj = data.createdAt.toDate ? data.createdAt.toDate() : new Date()
      subDateStr = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    }
    document.getElementById('pending-submitted-date').textContent = subDateStr
    
    document.getElementById('setup-header-title').textContent = 'Review Pending'
    screenPending.style.display = 'block'
  }

  // Show rejected view helper
  function renderRejectedScreen(data) {
    loadingSpinner.style.display = 'none'
    screenForm.style.display = 'none'
    screenPending.style.display = 'none'
    
    const reasonText = data.rejectionReason || "Please double check your uploaded National ID documents for legibility."
    document.getElementById('rejection-reason-text').textContent = reasonText
    
    document.getElementById('setup-header-title').textContent = 'Vetting Rejected'
    screenRejected.style.display = 'block'
  }

  // Wire reapply action (deletes old store document and reloads page)
  const btnReapply = document.getElementById('btn-reapply')
  if (btnReapply) {
    btnReapply.addEventListener('click', async () => {
      if (confirm('Reapplying will delete your previous application details and let you submit a new application. Proceed?')) {
        const originalText = btnReapply.textContent
        btnReapply.textContent = 'Resetting Application...'
        btnReapply.disabled = true
        
        try {
          await deleteDoc(doc(db, 'stores', currentUser.uid))
          showToast('Application form reset. Please apply again.', 'success')
          setTimeout(() => {
            window.location.reload()
          }, 1000)
        } catch (err) {
          console.error('Failed to reset store application:', err)
          showToast('Error resetting application. Please try again.', 'danger')
          btnReapply.textContent = originalText
          btnReapply.disabled = false
        }
      }
    })
  }
})
