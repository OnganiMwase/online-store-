/**
 * ShopEasy Messages Conversational Page Module
 */

import { auth, db } from '../firebase-config.js'
import { 
  collection, 
  getDocs, 
  query, 
  where,
  orderBy 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'

import { injectHeaderAndNav, renderEmptyState, renderErrorState } from '../ui.js'
import { redirect, handleFirestoreError, OperationType } from '../utils.js'

document.addEventListener('DOMContentLoaded', () => {
  // Inject Header and Nav
  injectHeaderAndNav('messages')

  const container = document.getElementById('conversations-container')

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirect('/login.html')
      return
    }

    try {
      // Fetch as Buyer and as Seller and merge
      const buyerQuery = query(collection(db, 'conversations'), where('buyerId', '==', user.uid))
      const sellerQuery = query(collection(db, 'conversations'), where('sellerId', '==', user.uid))

      const [buyerSnap, sellerSnap] = await Promise.all([
        getDocs(buyerQuery),
        getDocs(sellerQuery)
      ])

      const convosMap = new Map()
      
      const addConvo = (docSnap) => {
        const convo = docSnap.data()
        convo.id = docSnap.id
        convosMap.set(convo.id, convo)
      }

      buyerSnap.forEach(addConvo)
      sellerSnap.forEach(addConvo)

      const conversations = Array.from(convosMap.values())

      // Sort by lastMessageTime desc
      conversations.sort((a, b) => {
        const dateA = a.lastMessageTime?.toDate ? a.lastMessageTime.toDate() : new Date(a.lastMessageTime || 0)
        const dateB = b.lastMessageTime?.toDate ? b.lastMessageTime.toDate() : new Date(b.lastMessageTime || 0)
        return dateB - dateA
      })

      container.innerHTML = ''

      if (conversations.length === 0) {
        container.innerHTML = renderEmptyState(
          'messageSquare',
          'No Chats Yet',
          'Messages with sellers about product details and delivery agreements appear here.',
          'Browse Products',
          '/shop.html'
        )
        return
      }

      for (const convo of conversations) {
        // Resolve contact details
        const otherUserId = convo.buyerId === user.uid ? convo.sellerId : convo.buyerId
        let contactName = 'ShopEasy User'
        
        try {
          // Quick fetch name of the other user
          const otherUserSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', otherUserId)))
          if (!otherUserSnap.empty) {
            contactName = otherUserSnap.docs[0].data().name || 'ShopEasy User'
          }
        } catch (err) {
          console.warn('Failed to resolve name for contact', otherUserId)
        }

        container.appendChild(renderConvoItem(convo, contactName, user.uid))
      }

    } catch (error) {
      container.innerHTML = renderErrorState('Failed to load chats.')
      handleFirestoreError(error, OperationType.LIST, 'conversations')
    }
  })

  // Helper row renderer
  const renderConvoItem = (convo, name, uid) => {
    const item = document.createElement('div')
    
    const isUnread = convo.unreadCount > 0 && convo.lastSenderId !== uid
    item.className = `convo-item ${isUnread ? 'convo-item--unread' : ''}`

    const formattedTime = convo.lastMessageTime?.toDate 
      ? convo.lastMessageTime.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : 'Recently'

    const avatarSeed = encodeURIComponent(name)
    const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${avatarSeed}`

    item.innerHTML = `
      <img src="${avatarUrl}" alt="Avatar" class="convo-item__avatar">
      <div class="convo-item__info">
        <div class="convo-item__title">
          <span>${name}</span>
          <span class="convo-item__time">${formattedTime}</span>
        </div>
        <div class="convo-item__msg">${convo.lastMessage || 'Sent a message'}</div>
        ${convo.productName ? `<span class="convo-item__product">📦 ${convo.productName}</span>` : ''}
      </div>
      ${isUnread ? '<div class="convo-item__unread-dot"></div>' : ''}
    `

    item.addEventListener('click', () => {
      redirect(`/chat-room.html?id=${convo.id}&name=${encodeURIComponent(name)}`)
    })

    return item
  }
})
