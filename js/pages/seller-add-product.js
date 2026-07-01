/**
 * ShopEasy Seller Add / Edit Product Page Control Module (Production-Grade)
 */

import { auth, db, storage } from '../firebase-config.js'
import { initAuth } from '../auth.js'
import { 
  doc, 
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  increment,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'

import { getUrlParam, generateId, showToast, showLoading, hideLoading, redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', async () => {
  const productId = getUrlParam('id')
  const isEditMode = !!productId

  // Form Elements
  const form = document.getElementById('add-product-form')
  const pageTitle = document.getElementById('form-page-title')
  const btnSaveDraft = document.getElementById('btn-save-draft')
  const btnPublish = document.getElementById('btn-publish')

  // Photos
  const photosGrid = document.getElementById('photos-grid-container')
  const filePicker = document.getElementById('photo-file-picker')

  // Basic Info
  const inputName = document.getElementById('prod-name')
  const charCounterTitle = document.getElementById('char-counter-title')
  const inputDesc = document.getElementById('prod-desc')
  const charCounterDesc = document.getElementById('char-counter-desc')
  const selectCategory = document.getElementById('prod-category')
  const inputTags = document.getElementById('prod-tags')

  // Pricing
  const inputPrice = document.getElementById('prod-price')
  const inputStock = document.getElementById('prod-stock')
  const outOfStockPreview = document.getElementById('out-of-stock-preview')

  // Variants Toggle
  const toggleVariants = document.getElementById('toggle-variants')
  const variantsSection = document.getElementById('variants-section')
  const btnAddColour = document.getElementById('btn-add-colour')
  const btnAddSize = document.getElementById('btn-add-size')
  const colourContainer = document.getElementById('colour-variants-container')
  const sizeContainer = document.getElementById('size-variants-container')

  // Bulk Pricing Toggle
  const toggleBulk = document.getElementById('toggle-bulk')
  const bulkSection = document.getElementById('bulk-section')
  const btnAddBulkTier = document.getElementById('btn-add-bulk-tier')
  const bulkTiersContainer = document.getElementById('bulk-tiers-container')
  const bulkPricingPreviewText = document.getElementById('bulk-pricing-preview-text')

  // Delivery & Pickup Toggles
  const toggleHomeDelivery = document.getElementById('toggle-home-delivery')
  const homeDeliveryPanel = document.getElementById('home-delivery-panel')
  const inputDeliveryFee = document.getElementById('delivery-fee-input')
  const checkboxFreeDelivery = document.getElementById('delivery-free-checkbox')

  const togglePickup = document.getElementById('toggle-pickup')
  const pickupPanel = document.getElementById('pickup-panel')
  const inputPickupArea = document.getElementById('pickup-area-input')

  // Module state
  let currentUser = null
  let storeProfile = null
  let categoriesData = []
  let uploadedUrls = []
  let activeProductId = productId || generateId()
  let isUploading = false

  // Fallback category map if Firestore category fetch is delayed or empty
  const fallbackCategories = [
    { slug: 'electronics', name: 'Electronics' },
    { slug: 'fashion', name: 'Fashion' },
    { slug: 'agriculture', name: 'Agri & Food' },
    { slug: 'home', name: 'Home & Living' },
    { slug: 'vehicles', name: 'Vehicles' },
    { slug: 'services', name: 'Services' }
  ]

  // Initialize and authorize
  const authState = await initAuth({ requireAuth: true, requireRole: 'seller' })
  currentUser = authState.user

  try {
    const storeSnap = await getDoc(doc(db, 'stores', currentUser.uid))
    if (!storeSnap.exists() || storeSnap.data().status !== 'approved') {
      showToast('Store approval pending.', 'warning')
      redirect('/seller/setup.html')
      return
    }
    storeProfile = storeSnap.data()

    // 1. Fetch categories dynamically
    await loadCategories()

    // 2. Load product info if in EDIT mode
    if (isEditMode) {
      if (pageTitle) pageTitle.textContent = 'Edit Product'
      if (btnPublish) btnPublish.textContent = 'Save Changes'
      await loadExistingProduct()
    } else {
      renderPhotosGrid()
    }

    // Initialize event listeners
    initEventListeners()

  } catch (error) {
    console.error('Initialization error:', error)
    showToast('Failed to start listing manager.', 'danger')
  }

  // Fetch categories dynamically from Firestore
  async function loadCategories() {
    try {
      const snap = await getDocs(collection(db, 'categories'))
      categoriesData = []
      snap.forEach(docSnap => {
        categoriesData.push({ slug: docSnap.id, ...docSnap.data() })
      })

      if (categoriesData.length === 0) {
        categoriesData = fallbackCategories
      }

      // Populate Category dropdown
      selectCategory.innerHTML = '<option value="" disabled selected>Choose a category</option>'
      categoriesData.forEach(cat => {
        const opt = document.createElement('option')
        opt.value = cat.slug
        opt.textContent = cat.name
        selectCategory.appendChild(opt)
      })

    } catch (err) {
      console.warn('Could not fetch Firestore categories. Loading fallbacks.', err)
      categoriesData = fallbackCategories
      selectCategory.innerHTML = '<option value="" disabled selected>Choose a category</option>'
      categoriesData.forEach(cat => {
        const opt = document.createElement('option')
        opt.value = cat.slug
        opt.textContent = cat.name
        selectCategory.appendChild(opt)
      })
    }
  }

  // Load existing product details for editing
  async function loadExistingProduct() {
    try {
      const docSnap = await getDoc(doc(db, 'products', productId))
      if (!docSnap.exists()) {
        showToast('Product not found.', 'danger')
        redirect('/seller/products.html')
        return
      }

      const prod = docSnap.data()
      if (prod.sellerId !== currentUser.uid) {
        showToast('Unauthorized operation.', 'danger')
        redirect('/seller/products.html')
        return
      }

      // Basic info
      inputName.value = prod.name || ''
      charCounterTitle.textContent = `${inputName.value.length}/100`

      inputDesc.value = prod.description || ''
      charCounterDesc.textContent = `${inputDesc.value.length}/2000`

      selectCategory.value = prod.category || ''
      
      // Condition radio
      const condRadios = document.getElementsByName('prod-condition')
      condRadios.forEach(radio => {
        if (radio.value === prod.condition) {
          radio.checked = true
        }
      })

      inputTags.value = prod.tags ? prod.tags.join(', ') : ''

      // Pricing & stock
      inputPrice.value = prod.price || ''
      inputStock.value = prod.stock !== undefined ? prod.stock : ''
      triggerStockBadgeUpdate()

      // Images
      uploadedUrls = prod.images || (prod.image ? [prod.image] : [])
      renderPhotosGrid()

      // Variants
      if (prod.variants && (prod.variants.colours?.length > 0 || prod.variants.sizes?.length > 0)) {
        toggleVariants.checked = true
        variantsSection.classList.add('active')
        
        if (prod.variants.colours) {
          colourContainer.innerHTML = ''
          prod.variants.colours.forEach(col => addColourRow(col.name, col.stock, col.price))
        }
        if (prod.variants.sizes) {
          sizeContainer.innerHTML = ''
          prod.variants.sizes.forEach(sz => addSizeRow(sz.size, sz.stock))
        }
      }

      // Bulk Pricing
      if (prod.isBulk && prod.bulkPricing?.length > 0) {
        toggleBulk.checked = true
        bulkSection.classList.add('active')
        bulkTiersContainer.innerHTML = ''
        prod.bulkPricing.forEach(tier => addBulkRow(tier.quantity, tier.price))
        updateBulkPricingPreview()
      }

      // Delivery & Pickup
      if (prod.freeDelivery !== undefined || prod.deliveryFee !== undefined) {
        toggleHomeDelivery.checked = true
        homeDeliveryPanel.classList.add('active')
        if (prod.freeDelivery) {
          checkboxFreeDelivery.checked = true
          inputDeliveryFee.disabled = true
        } else {
          inputDeliveryFee.value = prod.deliveryFee || ''
        }

        // Cities
        if (prod.deliveryCity) {
          const cityCheckboxes = document.getElementsByName('delivery-city')
          cityCheckboxes.forEach(cb => {
            if (prod.deliveryCity.includes(cb.value)) {
              cb.checked = true
            }
          })
        }
      }

      if (prod.pickupAvailable) {
        togglePickup.checked = true
        pickupPanel.classList.add('active')
        inputPickupArea.value = prod.pickupArea || ''
      }

    } catch (err) {
      console.error(err)
      showToast('Error retrieving product data.', 'danger')
      handleFirestoreError(err, OperationType.GET, `products/${productId}`)
    }
  }

  // Photos Grid Rendering (up to 9 slots)
  function renderPhotosGrid() {
    photosGrid.innerHTML = ''
    
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div')
      slot.className = 'photo-slot'
      slot.dataset.index = i

      if (i < uploadedUrls.length) {
        slot.classList.add('has-image')
        slot.draggable = true
        
        const imgUrl = uploadedUrls[i]
        slot.innerHTML = `
          <img src="${imgUrl}" alt="Product image ${i+1}">
          <button type="button" class="slot-remove" data-index="${i}">&times;</button>
        `

        if (i === 0) {
          const cover = document.createElement('div')
          cover.className = 'cover-label'
          cover.textContent = 'Cover Photo'
          slot.appendChild(cover)
        }

        // Remove photo handler
        slot.querySelector('.slot-remove').addEventListener('click', (e) => {
          e.stopPropagation()
          const index = parseInt(e.target.dataset.index)
          uploadedUrls.splice(index, 1)
          renderPhotosGrid()
        })

        // Drag and drop events for reordering
        slot.addEventListener('dragstart', handleDragStart)
        slot.addEventListener('dragover', handleDragOver)
        slot.addEventListener('drop', handleDrop)

      } else {
        // Empty slot
        slot.innerHTML = `
          <div class="upload-icon">＋</div>
          <div class="upload-lbl">Upload</div>
        `
        slot.onclick = () => {
          filePicker.click()
        }
      }

      photosGrid.appendChild(slot)
    }
  }

  // HTML5 Drag and Drop Handlers for Photos Grid
  let dragSourceIndex = null

  function handleDragStart(e) {
    dragSourceIndex = parseInt(this.dataset.index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', dragSourceIndex)
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e) {
    e.preventDefault()
    const targetIndex = parseInt(this.dataset.index)
    
    if (dragSourceIndex !== null && dragSourceIndex !== targetIndex && targetIndex < uploadedUrls.length) {
      // Reorder uploadedUrls array
      const temp = uploadedUrls[dragSourceIndex]
      uploadedUrls.splice(dragSourceIndex, 1)
      uploadedUrls.splice(targetIndex, 0, temp)
      renderPhotosGrid()
    }
  }

  // Compression & validation helper
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const MAX_SIZE = 2 * 1024 * 1024; // 2MB
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

          const MAX_DIM = 1024; // Keep file size ultra small (usually ~100-150kb)
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
            }, 'image/jpeg', 0.75); // Compress with 0.75 quality for super fast page loads
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

  // Handle Photo Picker Upload
  async function handleFilesSelected(files) {
    if (files.length === 0) return
    if (uploadedUrls.length + files.length > 9) {
      showToast('Maximum of 9 photos allowed.', 'warning')
      return
    }

    isUploading = true
    showToast('Compressing and validating images...', 'info')

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        
        let compressedBlob;
        try {
          compressedBlob = await compressImage(file);
        } catch (validationError) {
          showToast(validationError.message, 'danger');
          continue;
        }

        const timestamp = Date.now()
        const fileIndex = uploadedUrls.length + 1
        const filename = `products/${activeProductId}/${timestamp}_${fileIndex}.jpg`
        const fileRef = ref(storage, filename)

        // Upload and get download URL
        const snapshot = await uploadBytes(fileRef, compressedBlob, {
          contentType: 'image/jpeg'
        })
        const downloadUrl = await getDownloadURL(snapshot.ref)

        uploadedUrls.push(downloadUrl)
      }

      showToast('Images processed and uploaded successfully!', 'success')
      renderPhotosGrid()
    } catch (err) {
      console.error('File upload failed:', err)
      showToast('Failed to upload images.', 'danger')
    } finally {
      isUploading = false
      filePicker.value = '' // reset
    }
  }

  // Add Dynamic Row: Colours
  function addColourRow(name = '', stock = '', price = '') {
    if (colourContainer.children.length >= 8) {
      showToast('Max 8 colors allowed.', 'warning')
      return
    }

    const row = document.createElement('div')
    row.className = 'form-row-compact'
    row.innerHTML = `
      <input type="text" class="color-name-input" placeholder="Colour (e.g. Red)" value="${name}" required>
      <input type="number" class="color-stock-input" placeholder="Stock" min="0" value="${stock}" required style="max-width: 80px;">
      <input type="number" class="color-price-input" placeholder="Price (optional)" min="1" value="${price}" style="max-width: 120px;">
      <button type="button" class="remove-row-btn">&times;</button>
    `

    row.querySelector('.remove-row-btn').onclick = () => row.remove()
    colourContainer.appendChild(row)
  }

  // Add Dynamic Row: Sizes
  function addSizeRow(size = '', stock = '') {
    if (sizeContainer.children.length >= 10) {
      showToast('Max 10 sizes allowed.', 'warning')
      return
    }

    const row = document.createElement('div')
    row.className = 'form-row-compact'
    row.innerHTML = `
      <input type="text" class="size-name-input" placeholder="Size (e.g. XL, 38)" value="${size}" required>
      <input type="number" class="size-stock-input" placeholder="Stock" min="0" value="${stock}" required style="max-width: 100px;">
      <button type="button" class="remove-row-btn">&times;</button>
    `

    row.querySelector('.remove-row-btn').onclick = () => row.remove()
    sizeContainer.appendChild(row)
  }

  // Add Dynamic Row: Bulk pricing tiers
  function addBulkRow(qty = '', price = '') {
    if (bulkTiersContainer.children.length >= 3) {
      showToast('Max 3 bulk tiers allowed.', 'warning')
      return
    }

    const row = document.createElement('div')
    row.className = 'form-row-compact'
    row.innerHTML = `
      <span style="font-size: 0.75rem; font-weight: 700; color: var(--grey-600);">Buy</span>
      <input type="number" class="bulk-qty-input" placeholder="Qty (e.g. 10)" min="2" value="${qty}" required style="max-width: 80px;">
      <span style="font-size: 0.75rem; font-weight: 700; color: var(--grey-600);">+ for MWK</span>
      <input type="number" class="bulk-price-input" placeholder="Price each" min="1" value="${price}" required>
      <button type="button" class="remove-row-btn">&times;</button>
    `

    // Trigger update preview text on row input changes
    row.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', updateBulkPricingPreview)
    })

    row.querySelector('.remove-row-btn').onclick = () => {
      row.remove()
      updateBulkPricingPreview()
    }

    bulkTiersContainer.appendChild(row)
    updateBulkPricingPreview()
  }

  // Live Bulk Pricing Preview text update
  function updateBulkPricingPreview() {
    const rows = bulkTiersContainer.querySelectorAll('.form-row-compact')
    if (rows.length === 0) {
      bulkPricingPreviewText.textContent = 'No tiers configured. Normal retail price applies.'
      return
    }

    const textArr = []
    rows.forEach(row => {
      const qty = row.querySelector('.bulk-qty-input').value
      const price = row.querySelector('.bulk-price-input').value
      if (qty && price) {
        textArr.push(`Buy ${qty}+ items for MWK ${Number(price).toLocaleString()} each`)
      }
    })

    bulkPricingPreviewText.textContent = textArr.join(', ') || 'Provide quantity & prices to trigger live discount preview.'
  }

  // Trigger live updates for "Out of stock" badge preview
  function triggerStockBadgeUpdate() {
    const stockVal = parseInt(inputStock.value)
    if (stockVal === 0) {
      outOfStockPreview.style.display = 'inline-flex'
    } else {
      outOfStockPreview.style.display = 'none'
    }
  }

  // Initialize form-level event handlers
  function initEventListeners() {
    // Char counter: Title
    inputName.addEventListener('input', () => {
      charCounterTitle.textContent = `${inputName.value.length}/100`
    })

    // Char counter: Desc
    inputDesc.addEventListener('input', () => {
      charCounterDesc.textContent = `${inputDesc.value.length}/2000`
    })

    // File picker selection
    filePicker.addEventListener('change', (e) => {
      handleFilesSelected(e.target.files)
    })

    // Out of Stock live trigger
    inputStock.addEventListener('input', triggerStockBadgeUpdate)

    // Dynamic panels togglers
    toggleVariants.addEventListener('change', () => {
      if (toggleVariants.checked) {
        variantsSection.classList.add('active')
        // Pre-fill a row if empty
        if (colourContainer.children.length === 0) addColourRow()
        if (sizeContainer.children.length === 0) addSizeRow()
      } else {
        variantsSection.classList.remove('active')
      }
    })

    btnAddColour.addEventListener('click', () => addColourRow())
    btnAddSize.addEventListener('click', () => addSizeRow())

    toggleBulk.addEventListener('change', () => {
      if (toggleBulk.checked) {
        bulkSection.classList.add('active')
        if (bulkTiersContainer.children.length === 0) addBulkRow()
      } else {
        bulkSection.classList.remove('active')
      }
    })

    btnAddBulkTier.addEventListener('click', () => addBulkRow())

    toggleHomeDelivery.addEventListener('change', () => {
      if (toggleHomeDelivery.checked) {
        homeDeliveryPanel.classList.add('active')
      } else {
        homeDeliveryPanel.classList.remove('active')
      }
    })

    checkboxFreeDelivery.addEventListener('change', () => {
      if (checkboxFreeDelivery.checked) {
        inputDeliveryFee.disabled = true
        inputDeliveryFee.value = ''
      } else {
        inputDeliveryFee.disabled = false
      }
    })

    togglePickup.addEventListener('change', () => {
      if (togglePickup.checked) {
        pickupPanel.classList.add('active')
      } else {
        pickupPanel.classList.remove('active')
      }
    })

    // Submit Actions: Save Draft and Publish
    btnSaveDraft.addEventListener('click', () => handleFormSubmission(false))
    btnPublish.addEventListener('click', () => handleFormSubmission(true))
  }

  // Validate form fields inline
  function validateForm(isPublishMode) {
    let isValid = true

    // Reset error visuals
    const errors = document.querySelectorAll('.error-msg')
    errors.forEach(err => err.style.display = 'none')

    // 1. Photos
    if (uploadedUrls.length === 0) {
      const errPhotos = document.getElementById('error-photos')
      errPhotos.textContent = 'At least 1 product photo is required.'
      errPhotos.style.display = 'block'
      isValid = false
    }

    // 2. Title
    const titleVal = inputName.value.trim()
    if (!titleVal) {
      const errTitle = document.getElementById('error-title')
      errTitle.textContent = 'Product title is required.'
      errTitle.style.display = 'block'
      isValid = false
    }

    // 3. Description
    const descVal = inputDesc.value.trim()
    if (isPublishMode && descVal.length < 50) {
      const errDesc = document.getElementById('error-desc')
      errDesc.textContent = 'Description must be at least 50 characters long.'
      errDesc.style.display = 'block'
      isValid = false
    }

    // 4. Category
    if (!selectCategory.value) {
      const errCat = document.getElementById('error-category')
      errCat.textContent = 'Please choose a category.'
      errCat.style.display = 'block'
      isValid = false
    }

    // 5. Price
    const priceVal = Number(inputPrice.value)
    if (!priceVal || priceVal < 1) {
      const errPrice = document.getElementById('error-price')
      errPrice.textContent = 'Valid price is required (Minimum MWK 1).'
      errPrice.style.display = 'block'
      isValid = false
    }

    // 6. Stock
    const stockVal = inputStock.value.trim()
    if (stockVal === '' || Number(stockVal) < 0) {
      const errStock = document.getElementById('error-stock')
      errStock.textContent = 'Stock inventory quantity is required.'
      errStock.style.display = 'block'
      isValid = false
    }

    // 7. Delivery Cities Checklist
    if (toggleHomeDelivery.checked && !checkboxFreeDelivery.checked) {
      const feeVal = Number(inputDeliveryFee.value)
      if (isNaN(feeVal) || feeVal < 0) {
        showToast('Please specify a delivery fee or select Free Delivery.', 'danger')
        isValid = false
      }
    }

    if (toggleHomeDelivery.checked) {
      const cityCheckboxes = document.getElementsByName('delivery-city')
      const selectedCities = Array.from(cityCheckboxes).filter(cb => cb.checked).map(cb => cb.value)
      if (selectedCities.length === 0) {
        const errCities = document.getElementById('error-cities')
        errCities.textContent = 'Please choose at least one Malawian city for delivery.'
        errCities.style.display = 'block'
        isValid = false
      }
    }

    // 8. Pickup Specific Area
    if (togglePickup.checked) {
      const areaVal = inputPickupArea.value.trim()
      if (!areaVal) {
        const errPickup = document.getElementById('error-pickup')
        errPickup.textContent = 'Please specify a pickup collection address.'
        errPickup.style.display = 'block'
        isValid = false
      }
    }

    return isValid
  }

  // Handle Create / Update Firestore Operations
  async function handleFormSubmission(isPublishMode) {
    if (isUploading) {
      showToast('Please wait for files to finish uploading.', 'warning')
      return
    }

    // Validate
    if (!validateForm(isPublishMode)) {
      showToast('Please fill out all required parameters correctly.', 'danger')
      // Scroll to top to see error warnings
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const submitBtn = isPublishMode ? btnPublish : btnSaveDraft
    showLoading(submitBtn, isPublishMode ? 'Publishing...' : 'Saving draft...')

    try {
      const categorySlug = selectCategory.value
      const selectedCat = categoriesData.find(c => c.slug === categorySlug)
      const categoryName = selectedCat ? selectedCat.name : 'General'

      // Collect Tags
      const tagsStr = inputTags.value.trim()
      const tagsArray = tagsStr 
        ? tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 10)
        : []

      // Condition radio
      const condRadios = document.getElementsByName('prod-condition')
      let conditionValue = 'New'
      condRadios.forEach(radio => {
        if (radio.checked) conditionValue = radio.value
      })

      // Collect Variants (colours / sizes)
      let variantsObj = null
      if (toggleVariants.checked) {
        variantsObj = { colours: [], sizes: [] }
        
        const colRows = colourContainer.querySelectorAll('.form-row-compact')
        colRows.forEach(row => {
          const cName = row.querySelector('.color-name-input').value.trim()
          const cStock = parseInt(row.querySelector('.color-stock-input').value)
          const cPrice = row.querySelector('.color-price-input').value ? parseInt(row.querySelector('.color-price-input').value) : null
          if (cName) {
            variantsObj.colours.push({ name: cName, stock: cStock, price: cPrice })
          }
        })

        const szRows = sizeContainer.querySelectorAll('.form-row-compact')
        szRows.forEach(row => {
          const sName = row.querySelector('.size-name-input').value.trim()
          const sStock = parseInt(row.querySelector('.size-stock-input').value)
          if (sName) {
            variantsObj.sizes.push({ size: sName, stock: sStock })
          }
        })
      }

      // Collect Bulk Pricing Discount Tiers
      let isBulk = false
      let bulkPricingArray = []
      if (toggleBulk.checked) {
        isBulk = true
        const bulkRows = bulkTiersContainer.querySelectorAll('.form-row-compact')
        bulkRows.forEach(row => {
          const bQty = parseInt(row.querySelector('.bulk-qty-input').value)
          const bPrice = parseInt(row.querySelector('.bulk-price-input').value)
          if (bQty && bPrice) {
            bulkPricingArray.push({ quantity: bQty, price: bPrice })
          }
        })
      }

      // Collect Delivery & Pickup Info
      let freeDelivery = false
      let deliveryFee = null
      let deliveryCities = []
      if (toggleHomeDelivery.checked) {
        freeDelivery = checkboxFreeDelivery.checked
        deliveryFee = freeDelivery ? 0 : parseInt(inputDeliveryFee.value)
        const cityCheckboxes = document.getElementsByName('delivery-city')
        deliveryCities = Array.from(cityCheckboxes).filter(cb => cb.checked).map(cb => cb.value)
      }

      let pickupAvailable = false
      let pickupArea = ''
      if (togglePickup.checked) {
        pickupAvailable = true
        pickupArea = inputPickupArea.value.trim()
      }

      // Build Search Keywords Array
      const titleWords = inputName.value.toLowerCase().split(/[\s,.-]+/).filter(Boolean)
      const keywordList = [...titleWords, ...tagsArray]
        .map(w => w.trim())
        .filter(w => w.length > 1)
        .filter(Boolean)
      const uniqueKeywords = [...new Set(keywordList)]

      // Document reference
      const productDocRef = doc(db, 'products', activeProductId)

      // Payload building
      const payload = {
        sellerId: currentUser.uid,
        sellerName: storeProfile.name || 'Local Seller',
        storeId: currentUser.uid,
        storeName: storeProfile.name || 'Local Store',
        name: inputName.value.trim(),
        title: inputName.value.trim(), // for reverse-compat
        description: inputDesc.value.trim(),
        category: categorySlug,
        categoryName: categoryName,
        condition: conditionValue,
        tags: tagsArray,
        price: parseInt(inputPrice.value),
        stock: parseInt(inputStock.value),
        image: uploadedUrls[0], // primary
        images: uploadedUrls, // all photos list
        variants: variantsObj,
        isBulk: isBulk,
        bulkPricing: bulkPricingArray,
        freeDelivery: freeDelivery,
        deliveryFee: deliveryFee,
        deliveryCity: deliveryCities,
        pickupAvailable: pickupAvailable,
        pickupArea: pickupArea,
        city: storeProfile.city || 'Malawi',
        searchKeywords: uniqueKeywords,
        isActive: isPublishMode, // active if published, inactive/draft if saved draft
        isDeleted: false,
        updatedAt: serverTimestamp()
      }

      if (!isEditMode) {
        payload.createdAt = serverTimestamp()
        payload.sold = 0
        payload.rating = 5.0
        payload.reviewCount = 0

        // Increment category count
        try {
          await updateDoc(doc(db, 'categories', categorySlug), {
            productCount: increment(1)
          })
        } catch (catErr) {
          console.warn('Could not increment category counts. Doing fallback setDoc.', catErr)
          await setDoc(doc(db, 'categories', categorySlug), {
            productCount: increment(1)
          }, { merge: true })
        }
      }

      // Commit to Firestore
      await setDoc(productDocRef, payload, { merge: true })

      hideLoading(submitBtn)
      showToast(isPublishMode ? 'Listing published successfully!' : 'Listing saved as draft!', 'success')

      setTimeout(() => {
        redirect('/seller/products.html')
      }, 1200)

    } catch (error) {
      console.error(error)
      hideLoading(submitBtn)
      showToast('Could not save product listing details.', 'danger')
      handleFirestoreError(error, OperationType.WRITE, `products/${activeProductId}`)
    }
  }
})
