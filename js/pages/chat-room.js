/**
 * ShopEasy Chat Room Control Module
 */

import { auth, db } from '../firebase-config.js'
import { 
  collection, 
  addDoc, 
  doc,
  updateDoc,
  query, 
  orderBy,
  onSnapshot,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { getUrlParam, showToast, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  const convoId = getUrlParam('id')
  const partnerName = getUrlParam('name') || 'Local User'
  
  const headerName = document.getElementById('chat-partner-name')
  const messagesLog = document.getElementById('messages-log')
  const chatForm = document.getElementById('chat-form')
  const messageInput = document.getElementById('message-text')

  if (headerName) {
    headerName.textContent = partnerName
  }

  if (!convoId) {
    messagesLog.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--danger);">Invalid conversation context.</div>`
    return
  }

  let unsubscribeMessages = null

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = '/login.html'
      return
    }

    // Mark conversation as read
    try {
      updateDoc(doc(db, 'conversations', convoId), {
        unreadCount: 0
      })
    } catch (err) {
      console.warn('Could not reset unread status')
    }

    // Listen to real-time chat messages
    const messagesPath = `conversations/${convoId}/messages`
    const msgQuery = query(collection(db, messagesPath), orderBy('timestamp', 'asc'))

    unsubscribeMessages = onSnapshot(msgQuery, (snapshot) => {
      messagesLog.innerHTML = ''
      
      if (snapshot.empty) {
        messagesLog.innerHTML = `<div style="text-align: center; padding: 32px 16px; color: var(--grey-400); font-size: 0.8rem;">No messages yet. Send a friendly greeting!</div>`
        return
      }

      snapshot.forEach(docSnap => {
        const msg = docSnap.data()
        const isSent = msg.senderId === user.uid
        messagesLog.appendChild(renderMessageBubble(msg, isSent))
      })

      // Scroll to bottom
      messagesLog.scrollTop = messagesLog.scrollHeight
    }, (error) => {
      showToast('Could not sync chat messages.', 'danger')
      handleFirestoreError(error, OperationType.LIST, messagesPath)
    })
  })

  // Render bubble row
  const renderMessageBubble = (msg, isSent) => {
    const bubble = document.createElement('div')
    bubble.className = `msg-bubble ${isSent ? 'msg-bubble--sent' : 'msg-bubble--received'}`
    
    const formattedTime = msg.timestamp?.toDate 
      ? msg.timestamp.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : 'Just now'

    bubble.innerHTML = `
      <div class="msg-text">${msg.text}</div>
      <div class="msg-time" style="font-size: 0.6rem; opacity: 0.7; text-align: right; margin-top: 4px;">${formattedTime}</div>
    `
    return bubble
  }

  // Handle message submission
  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const user = auth.currentUser
      if (!user) return

      const text = messageInput.value.trim()
      if (!text) return

      messageInput.value = ''

      try {
        const convoDocRef = doc(db, 'conversations', convoId)
        
        // Add message inside subcollection
        await addDoc(collection(db, `conversations/${convoId}/messages`), {
          senderId: user.uid,
          text,
          timestamp: serverTimestamp()
        })

        // Update conversation summary document
        await updateDoc(convoDocRef, {
          lastMessage: text,
          lastMessageTime: serverTimestamp(),
          lastSenderId: user.uid,
          unreadCount: 1,
          updatedAt: serverTimestamp()
        })

      } catch (error) {
        showToast('Message delivery failed.', 'danger')
        handleFirestoreError(error, OperationType.WRITE, `conversations/${convoId}/messages`)
      }
    })
  }

  // Unsubscribe on unload
  window.addEventListener('beforeunload', () => {
    if (unsubscribeMessages) unsubscribeMessages()
  })
})
