/**
 * ShopEasy Utility Helper Functions
 */

import { auth } from './firebase-config.js'

export const formatMWK = (amount) => {
  if (!amount && amount !== 0) return 'MWK 0'
  return 'MWK ' + Number(amount).toLocaleString('en-US')
}

export const formatDate = (timestamp) => {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-MW', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

export const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleTimeString('en-MW', {
    hour: '2-digit', minute: '2-digit'
  })
}

export const truncate = (str, length = 50) => {
  if (!str) return ''
  return str.length > length ? str.slice(0, length) + '...' : str
}

export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

export const getUrlParam = (param) => {
  return new URLSearchParams(window.location.search).get(param)
}

export const getRelativePath = (path) => {
  // Clean up any accidental leading slashes just in case
  const cleanPath = path.replace(/^\/+/, '');

  // Determine where we are right now
  const currentPath = window.location.pathname;
  const isInSeller = currentPath.includes('seller/');
  const isInAdmin = currentPath.includes('admin/');

  // Scenario 1: Target path points to something inside the seller folder
  if (cleanPath.startsWith('seller/')) {
    if (isInSeller) {
      return cleanPath.replace(/^seller\//, ''); // Already inside, drop the folder prefix
    } else if (isInAdmin) {
      return '../' + cleanPath; // Inside admin, step out first, then enter seller
    } else {
      return cleanPath; // At root, go straight down
    }
  } 
  
  // Scenario 2: Target path points to something inside the admin folder
  else if (cleanPath.startsWith('admin/')) {
    if (isInAdmin) {
      return cleanPath.replace(/^admin\//, ''); // Already inside, drop the prefix
    } else if (isInSeller) {
      return '../' + cleanPath; // Inside seller, step out first, then enter admin
    } else {
      return cleanPath; // At root, go straight down
    }
  } 
  
  // Scenario 3: Target path is a root-level file (e.g., "index.html", "cart.html")
  else {
    if (isInSeller || isInAdmin) {
      return '../' + cleanPath; // If deep, step up to hit root files
    } else {
      return cleanPath; // Already at root level
    }
  }
}

export const redirect = (path) => {
  window.location.href = getRelativePath(path)
}

export const showToast = (message, type = 'success') => {
  const existing = document.querySelector('.toast')
  if (existing) existing.remove()
  
  const toast = document.createElement('div')
  toast.className = `toast toast--${type}`
  toast.textContent = message
  document.body.appendChild(toast)
  
  // Animate in
  setTimeout(() => toast.classList.add('toast--visible'), 10)
  
  // Auto dismiss
  setTimeout(() => {
    toast.classList.remove('toast--visible')
    setTimeout(() => toast.remove(), 300)
  }, 3500)
}

export const showLoading = (buttonEl, loadingText = 'Loading...') => {
  if (!buttonEl) return
  buttonEl.disabled = true
  buttonEl.dataset.originalText = buttonEl.textContent
  buttonEl.textContent = loadingText
  buttonEl.classList.add('btn--loading')
}

export const hideLoading = (buttonEl) => {
  if (!buttonEl) return
  buttonEl.disabled = false
  if (buttonEl.dataset.originalText) {
    buttonEl.textContent = buttonEl.dataset.originalText
  }
  buttonEl.classList.remove('btn--loading')
}

// --- Hardened Firestore Error Handling as required by Security Skill ---
export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
}

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Hardened Error Log: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
