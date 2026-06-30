/**
 * ShopEasy Sell Redirect control script
 */

import { auth, db } from '../firebase-config.js'
import { initAuth } from '../auth.js'
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { redirect } from '../utils.js'

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Ensure user is authenticated, will automatically direct to /login.html if not
    const authState = await initAuth({ requireAuth: true })
    const currentUser = authState.user

    if (!currentUser) {
      redirect('/login.html')
      return
    }

    // Check store document in Firestore
    const storeSnap = await getDoc(doc(db, 'stores', currentUser.uid))
    if (storeSnap.exists()) {
      const storeData = storeSnap.data()
      if (storeData.status === 'approved') {
        redirect('/seller/dashboard.html')
      } else {
        // Not yet approved, or pending/rejected - let setup page handle displaying status
        redirect('/seller/setup.html')
      }
    } else {
      // No store exists yet
      redirect('/seller/setup.html')
    }
  } catch (err) {
    console.error('Error verifying seller status:', err)
    // Fallback safely to setup/onboarding on error
    redirect('/seller/setup.html')
  }
})
