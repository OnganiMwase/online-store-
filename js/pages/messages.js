/**
 * ShopEasy Messages Inbox Page Controller
 */

import { auth, db } from '../firebase-config.js';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { injectHeaderAndNav } from '../ui.js';
import { redirect, handleFirestoreError, OperationType } from '../utils.js';
import { initAuth } from '../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inject bottom navigation bar (Highlight messages tab)
  injectHeaderAndNav('messages');

  const container = document.getElementById('conversations-container');
  const pinnedContainer = document.getElementById('pinned-notifications-container');

  const unsubscribes = [];

  // Cleanup listeners on page leave to prevent memory leaks and unexpected background triggers
  const cleanupListeners = () => {
    unsubscribes.forEach(unsub => {
      if (typeof unsub === 'function') {
        try { unsub(); } catch (e) { console.warn('Failed to unsubscribe', e); }
      }
    });
  };
  window.addEventListener('pagehide', cleanupListeners);
  window.addEventListener('unload', cleanupListeners);

  // 2. Auth Guard
  const authState = await initAuth({ requireAuth: true });
  const currentUser = authState.user;

  if (!currentUser) return; // Automatically redirected to /login.html by initAuth

  // 3. Pinned Order Notifications Thread
  setupPinnedOrderNotifications(currentUser.uid);

  // 4. Load Seller/Buyer Conversations (Real-time Dual Snapshot)
  setupRealtimeConversations(currentUser);

  /**
   * Listen to Order Update Notifications
   */
  function setupPinnedOrderNotifications(uid) {
    const notificationsPath = 'notifications';
    const notQuery = query(
      collection(db, notificationsPath),
      where('recipientId', '==', uid),
      where('type', '==', 'order_update'),
      where('read', '==', false)
    );

    const unsubNotif = onSnapshot(notQuery, (snapshot) => {
      const unreadCount = snapshot.size;

      pinnedContainer.innerHTML = `
        <div class="pinned-updates" id="pinned-order-updates-row">
          <div class="pinned-updates__icon">📦</div>
          <div class="pinned-updates__info">
            <div class="pinned-updates__title">Order Updates</div>
            <div class="pinned-updates__desc">Track your orders and get status updates</div>
          </div>
          ${unreadCount > 0 ? `<div class="pinned-updates__badge">${unreadCount}</div>` : ''}
        </div>
      `;

      document.getElementById('pinned-order-updates-row').addEventListener('click', () => {
        redirect('/orders.html');
      });

    }, (error) => {
      console.warn("Could not load real-time order notifications count:", error);
      handleFirestoreError(error, OperationType.LIST, notificationsPath);
    });

    unsubscribes.push(unsubNotif);
  }

  /**
   * Set up real-time bidirectional stream of conversations
   */
  function setupRealtimeConversations(user) {
    const conversationsPath = 'conversations';

    // We fetch two separate real-time queries (one where user is Buyer, one where user is Seller)
    // and merge them in-memory. This bypasses the need for compound Firestore OR index generation.
    const buyerQuery = query(
      collection(db, conversationsPath),
      where('buyerId', '==', user.uid)
    );

    const sellerQuery = query(
      collection(db, conversationsPath),
      where('sellerId', '==', user.uid)
    );

    const conversationMap = new Map();

    const renderMergedConversations = () => {
      // Sort conversations by lastMessageAt or lastMessageTime descending
      const sortedConvos = Array.from(conversationMap.values()).sort((a, b) => {
        const timeA = a.lastMessageAt || a.lastMessageTime || a.createdAt;
        const timeB = b.lastMessageAt || b.lastMessageTime || b.createdAt;
        
        const dateA = timeA?.toDate ? timeA.toDate() : new Date(timeA || 0);
        const dateB = timeB?.toDate ? timeB.toDate() : new Date(timeB || 0);
        return dateB - dateA;
      });

      if (sortedConvos.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--grey-600);">
            <div style="font-size: 3.5rem; line-height: 1;">💬</div>
            <h3 style="font-size: 1.15rem; font-weight: 850; color: var(--secondary); margin: 0;">No conversations yet</h3>
            <p style="font-size: 0.8rem; max-width: 260px; line-height: 1.4; color: var(--grey-600); margin: 0;">Message a seller from any product page</p>
          </div>
        `;
        return;
      }

      container.innerHTML = '';
      sortedConvos.forEach(convo => {
        container.appendChild(renderConvoRow(convo, user.uid));
      });
    };

    // Buyer side subscription
    const unsubBuyer = onSnapshot(buyerQuery, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        data.id = change.doc.id;
        if (change.type === 'removed') {
          conversationMap.delete(data.id);
        } else {
          conversationMap.set(data.id, data);
        }
      });
      renderMergedConversations();
    }, (error) => {
      container.innerHTML = `<p style="text-align: center; color: var(--danger); font-size: 0.85rem; padding: 20px;">Could not sync conversations.</p>`;
      handleFirestoreError(error, OperationType.LIST, conversationsPath);
    });

    // Seller side subscription
    const unsubSeller = onSnapshot(sellerQuery, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        data.id = change.doc.id;
        if (change.type === 'removed') {
          conversationMap.delete(data.id);
        } else {
          conversationMap.set(data.id, data);
        }
      });
      renderMergedConversations();
    }, (error) => {
      container.innerHTML = `<p style="text-align: center; color: var(--danger); font-size: 0.85rem; padding: 20px;">Could not sync conversations.</p>`;
      handleFirestoreError(error, OperationType.LIST, conversationsPath);
    });

    unsubscribes.push(unsubBuyer, unsubSeller);
  }

  /**
   * Helper to format conversation timestamp:
   * HH:MM if today, DD MMM if older
   */
  function formatTime(timestamp) {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    const now = new Date();
    const isToday = date.getDate() === now.getDate() &&
                    date.getMonth() === now.getMonth() &&
                    date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } else {
      return date.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short'
      });
    }
  }

  /**
   * Render single conversation row element
   */
  function renderConvoRow(convo, currentUid) {
    const item = document.createElement('div');

    const isBuyer = convo.buyerId === currentUid;
    
    // Unread count tracking
    const unreadCount = isBuyer 
      ? (convo.unreadCountBuyer !== undefined ? convo.unreadCountBuyer : (convo.unreadCount || 0))
      : (convo.unreadCountSeller !== undefined ? convo.unreadCountSeller : (convo.unreadCount || 0));

    const isUnread = unreadCount > 0;
    item.className = `convo-item ${isUnread ? 'convo-item--unread' : 'convo-item--read'}`;

    // Name formatting (If I'm buyer -> display store/seller name, else display buyer name)
    const displayName = isBuyer 
      ? (convo.storeName || convo.sellerName || 'Local Seller') 
      : (convo.buyerName || 'Malawi Buyer');

    // Avatar Selection (use fallback dicebear if no logo provided)
    const avatarUrl = isBuyer
      ? (convo.storeAvatar || convo.sellerAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`)
      : (convo.buyerAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`);

    const rawTime = convo.lastMessageAt || convo.lastMessageTime || convo.createdAt;
    const timeString = formatTime(rawTime);

    // Limit preview message size to 45 chars
    let messagePreview = convo.lastMessage || 'Sent a media attachment';
    if (messagePreview.length > 45) {
      messagePreview = messagePreview.slice(0, 42) + '...';
    }

    item.innerHTML = `
      <div class="convo-item__avatar-container">
        <img src="${avatarUrl}" alt="${displayName}" class="convo-item__avatar" referrerPolicy="no-referrer">
      </div>
      <div class="convo-item__info">
        <div class="convo-item__header">
          <span class="convo-item__name">${displayName}</span>
          <span class="convo-item__time">${timeString}</span>
        </div>
        <div class="convo-item__msg">${messagePreview}</div>
        ${convo.productName ? `<span class="convo-item__product" style="font-size: 0.68rem; padding: 2px 6px; background-color: var(--grey-200); border-radius: 4px; display: inline-block; margin-top: 4px; font-weight: 700; color: var(--grey-800);">🏷️ ${convo.productName}</span>` : ''}
      </div>
      ${isUnread ? `<div class="convo-item__badge">${unreadCount}</div>` : ''}
    `;

    item.addEventListener('click', () => {
      redirect(`/chat.html?id=${convo.id}`);
    });

    return item;
  }
});
