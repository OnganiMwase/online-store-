import { auth, db } from './firebase-config.js'
import { onAuthStateChanged, signOut } from 
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { doc, getDoc, updateDoc, serverTimestamp } from 
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { redirect } from './utils.js'

export let currentUser = null
export let currentUserData = null

export const initAuth = (options = {}) => {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user
        try {
          const snap = await getDoc(doc(db, 'users', user.uid))
          if (snap.exists()) {
            currentUserData = snap.data()
            
            // Auto-promote developer user to admin role
            if (user.email === 'whitestepper41@gmail.com' && currentUserData.role !== 'admin') {
              currentUserData.role = 'admin'
              await updateDoc(doc(db, 'users', user.uid), {
                role: 'admin'
              })
              console.log("Auto-promoted whitestepper41@gmail.com to admin role.")
            }

            // Update lastSeen
            await updateDoc(doc(db, 'users', user.uid), {
              lastSeen: serverTimestamp()
            })
          }
        } catch (err) {
          console.error("Error in initAuth: ", err)
        }
        
        if (options.requireRole && 
            currentUserData?.role !== options.requireRole) {
          redirect('/index.html')
        }
        
      } else {
        currentUser = null
        currentUserData = null
        if (options.requireAuth) {
          sessionStorage.setItem(
            'redirectAfterLogin', window.location.href
          )
          redirect('/login.html')
        }
      }
      resolve({ user: currentUser, userData: currentUserData })
    })
  })
}

export const logout = async () => {
  try {
    await signOut(auth)
    redirect('/login.html')
  } catch (err) {
    console.error("Logout failed: ", err)
  }
}

export const isLoggedIn = () => currentUser !== null

export const getUserRole = () => currentUserData?.role || null
