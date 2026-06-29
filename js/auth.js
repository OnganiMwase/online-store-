/**
 * ShopEasy Authentication Module
 */

import { auth, db } from './firebase-config.js'
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { handleFirestoreError, OperationType } from './utils.js'

/**
 * Register a new user in Auth & Firestore
 */
export const registerUser = async (email, password, name, phone, city, role = 'buyer') => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const user = userCredential.user
    
    // Create user document in Firestore
    const userDocRef = doc(db, 'users', user.uid)
    const userData = {
      uid: user.uid,
      name,
      email,
      phone,
      role, // 'buyer' | 'seller' | 'admin'
      city,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
      isProfileComplete: true,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    }
    
    try {
      await setDoc(userDocRef, userData)
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.WRITE, `users/${user.uid}`)
    }
    
    return user
  } catch (error) {
    throw error
  }
}

/**
 * Sign in with Email and Password
 */
export const loginWithEmail = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    const user = userCredential.user
    
    // Update lastSeen timestamp
    await updateLastSeen(user.uid)
    
    return user
  } catch (error) {
    throw error
  }
}

/**
 * Sign in with Google Popup
 */
export const loginWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(auth, provider)
    const user = result.user
    
    // Check if user already exists in Firestore
    const userDocRef = doc(db, 'users', user.uid)
    let userDoc
    try {
      userDoc = await getDoc(userDocRef)
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.GET, `users/${user.uid}`)
    }
    
    if (!userDoc.exists()) {
      // First-time signup with Google
      const userData = {
        uid: user.uid,
        name: user.displayName || 'ShopEasy User',
        email: user.email,
        phone: user.phoneNumber || '',
        role: 'buyer',
        city: 'Lilongwe', // Default
        avatar: user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName || 'U')}`,
        isProfileComplete: false, // Let them update phone and city in account setup
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      }
      try {
        await setDoc(userDocRef, userData)
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.WRITE, `users/${user.uid}`)
      }
    } else {
      await updateLastSeen(user.uid)
    }
    
    return user
  } catch (error) {
    throw error
  }
}

/**
 * Sign Out
 */
export const logoutUser = async () => {
  try {
    await signOut(auth)
    return true
  } catch (error) {
    throw error
  }
}

/**
 * Update Last Seen timestamp
 */
const updateLastSeen = async (uid) => {
  const userDocRef = doc(db, 'users', uid)
  try {
    await updateDoc(userDocRef, {
      lastSeen: serverTimestamp()
    })
  } catch (error) {
    // Fail silently on background activity timestamp updates
    console.error('Failed to update user activity timestamp', error)
  }
}

/**
 * Get current user document data
 */
export const getCurrentUserData = async () => {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe()
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid))
          if (userDoc.exists()) {
            resolve(userDoc.data())
          } else {
            resolve(null)
          }
        } catch (error) {
          reject(error)
        }
      } else {
        resolve(null)
      }
    })
  })
}

/**
 * Simple route protection helper
 * Redirects to login page if user is not authenticated
 * If specifiedRole is provided, checks if user has that role or admin role.
 */
export const requireAuth = (specifiedRole = null, redirectUrl = '/login.html') => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = redirectUrl
      return
    }
    
    if (specifiedRole) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (!userDoc.exists()) {
          window.location.href = redirectUrl
          return
        }
        const data = userDoc.data()
        if (data.role !== specifiedRole && data.role !== 'admin') {
          // Access denied, send to relevant dashboard or home
          window.location.href = data.role === 'seller' ? '/seller/dashboard.html' : '/index.html'
        }
      } catch (error) {
        window.location.href = redirectUrl
      }
    }
  })
}
