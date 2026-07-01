/**
 * ShopEasy Active Chat Page Controller
 */

import { auth, db, storage } from '../firebase-config.js';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp, 
  increment 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

import { formatMWK, getUrlParam, showToast, handleFirestoreError, OperationType, redirect } from '../utils.js';
import { initAuth } from '../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const convoId = getUrlParam('id');
  
  if (!convoId) {
    showToast('Invalid chat reference.', 'danger');
    setTimeout(() => redirect('/messages.html'), 1500);
    return;
  }

  // DOM Elements
  const backBtn = document.getElementById('chat-back-btn');
  const partnerAvatar = document.getElementById('chat-partner-avatar');
  const partnerNameEl = document.getElementById('chat-partner-name');
  const partnerStatusEl = document.getElementById('chat-partner-status');
  const messagesLog = document.getElementById('messages-log');
  
  // Input Bar Elements
  const chatForm = document.getElementById('chat-form');
  const messageInput = document.getElementById('message-text');
  const fileInput = document.getElementById('chat-file-input');
  const attachBtn = document.getElementById('chat-attach-btn');
  const sendBtn = document.getElementById('chat-send-btn');
  
  // Image Upload Elements
  const uploadProgressContainer = document.getElementById('upload-progress-container');
  const uploadProgressFill = document.getElementById('upload-progress-fill');
  const uploadPreviewContainer = document.getElementById('chat-upload-preview');
  const uploadPreviewImg = document.getElementById('chat-upload-preview-img');
  const uploadCancelBtn = document.getElementById('chat-upload-cancel');

  // Order Reference Banner
  const orderRefCard = document.getElementById('order-ref-card');
  const orderRefToggle = document.getElementById('order-ref-toggle');
  const orderRefDetailsPanel = document.getElementById('order-ref-details-panel');
  const orderRefChevron = document.getElementById('order-ref-chevron');
  const orderRefImage = document.getElementById('order-ref-image');
  const orderRefName = document.getElementById('order-ref-name');
  const orderRefPrice = document.getElementById('order-ref-price');
  const orderRefLink = document.getElementById('order-ref-link');

  // Lightbox Modal
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.getElementById('lightbox-close');

  // State Variables
  let selectedFile = null;
  let uploadTask = null;
  let currentLimit = 30;
  let firstLoad = true;
  let isUpdatingUnread = false;

  const unsubscribes = [];

  // Cleanup on unload
  const cleanup = () => {
    unsubscribes.forEach(unsub => {
      if (typeof unsub === 'function') {
        try { unsub(); } catch (e) {}
      }
    });
  };
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('unload', cleanup);

  // Back Button
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      redirect('/messages.html');
    });
  }

  // 1. Auth Guard & Data Loading
  const authState = await initAuth({ requireAuth: true });
  const currentUser = authState.user;
  const currentUserData = authState.userData;

  if (!currentUser) return; // Automatic login redirection

  try {
    // 2. Fetch Conversation metadata & Verify access
    const convoRef = doc(db, 'conversations', convoId);
    const convoSnap = await getDoc(convoRef);

    if (!convoSnap.exists()) {
      showToast('Conversation not found.', 'danger');
      redirect('/messages.html');
      return;
    }

    const convoData = convoSnap.data();

    // Verify user is either the buyer or the seller
    const isBuyer = convoData.buyerId === currentUser.uid;
    const isSeller = convoData.sellerId === currentUser.uid;

    if (!isBuyer && !isSeller) {
      showToast('Access denied.', 'danger');
      redirect('/messages.html');
      return;
    }

    // Determine target other party
    const partnerId = isBuyer ? convoData.sellerId : convoData.buyerId;
    const partnerName = isBuyer 
      ? (convoData.storeName || convoData.sellerName || 'Seller') 
      : (convoData.buyerName || 'Buyer');
    
    const partnerAvatarUrl = isBuyer
      ? (convoData.storeAvatar || convoData.sellerAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(partnerName)}`)
      : (convoData.buyerAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(partnerName)}`);

    // Render static partner details
    partnerNameEl.textContent = partnerName;
    partnerAvatar.src = partnerAvatarUrl;
    messageInput.placeholder = `Message ${partnerName}...`;

    // 3. Mark Conversation as Read & Reset counters
    markMessagesAsRead(convoId, currentUser.uid, isBuyer);

    // 4. Setup live status tracker for other party
    setupStatusTracker(partnerId);

    // 5. Populate product/order reference context
    if (convoData.productId) {
      setupProductContext(convoData.productId);
    }

    // 6. Start real-time messages synchronization listener
    setupRealtimeMessages(convoId, currentUser.uid);

    // 7. Initialize form action events
    setupFormInputHandlers(convoId, currentUser.uid, partnerName, isBuyer);

  } catch (error) {
    showToast('Failed to load active conversation.', 'danger');
    handleFirestoreError(error, OperationType.GET, `conversations/${convoId}`);
  }

  /**
   * Status seen tracker string helper
   */
  function getStatusText(lastSeenVal) {
    if (!lastSeenVal) return 'Offline';
    const date = lastSeenVal.toDate ? lastSeenVal.toDate() : new Date(lastSeenVal);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 3) {
      return 'Online';
    } else if (diffMin < 60) {
      return `Seen ${diffMin}m ago`;
    } else if (diffMin < 1440) {
      const hours = Math.floor(diffMin / 60);
      return `Seen ${hours}h ago`;
    } else {
      const days = Math.floor(diffMin / 1440);
      return `Seen ${days}d ago`;
    }
  }

  /**
   * Start real-time subscriber for other user's status
   */
  function setupStatusTracker(partnerId) {
    const userDocRef = doc(db, 'users', partnerId);
    const unsubStatus = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const text = getStatusText(data.lastSeen);
        const isOnline = text === 'Online';

        partnerStatusEl.className = `chat-header-status chat-header-status--${isOnline ? 'online' : 'offline'}`;
        partnerStatusEl.innerHTML = `
          <span class="status-dot status-dot--${isOnline ? 'online' : 'offline'}"></span> ${text}
        `;
      }
    }, (error) => {
      console.warn("Could not listen to partner seen status:", error);
    });
    unsubscribes.push(unsubStatus);
  }

  /**
   * Fetch product details for top context reference bar
   */
  async function setupProductContext(productId) {
    try {
      const prodSnap = await getDoc(doc(db, 'products', productId));
      if (prodSnap.exists()) {
        const prod = prodSnap.data();

        orderRefImage.src = prod.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff';
        orderRefName.textContent = prod.name || prod.title;
        orderRefPrice.textContent = formatMWK(prod.price);
        orderRefLink.href = `/product.html?id=${productId}`;
        orderRefCard.classList.remove('hidden');

        // Collapsible trigger
        orderRefToggle.addEventListener('click', () => {
          const isCollapsed = orderRefDetailsPanel.classList.toggle('hidden');
          orderRefChevron.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';
          orderRefChevron.style.transition = 'transform 0.2s ease';
        });
      }
    } catch (err) {
      console.warn("Could not retrieve product context data:", err);
    }
  }

  /**
   * Clear unread metrics and mark incoming messages as read
   */
  async function markMessagesAsRead(convId, uid, isBuyer) {
    if (isUpdatingUnread) return;
    isUpdatingUnread = true;

    try {
      const convoDocRef = doc(db, 'conversations', convId);
      
      // Update unread counters in the conversation main document
      const updateObj = {};
      if (isBuyer) {
        updateObj.unreadCountBuyer = 0;
        updateObj.unreadCount = 0; // Legacy cleanup
      } else {
        updateObj.unreadObj = 0;
        updateObj.unreadCountSeller = 0;
      }
      await updateDoc(convoDocRef, updateObj);

      // Fetch unread incoming messages and mark as read
      const messagesRef = collection(db, `conversations/${convId}/messages`);
      const unreadQuery = query(messagesRef, where('read', '==', false));
      const unreadSnap = await getDocs(unreadQuery);

      const batchPromises = [];
      unreadSnap.forEach(msgDoc => {
        const data = msgDoc.data();
        if (data.senderId !== uid) {
          batchPromises.push(updateDoc(doc(db, `conversations/${convId}/messages`, msgDoc.id), { read: true }));
        }
      });
      await Promise.all(batchPromises);

    } catch (err) {
      console.warn("Error marking messages as read:", err);
    } finally {
      isUpdatingUnread = false;
    }
  }

  /**
   * Load real-time message stream with scrolling history loaders
   */
  let unsubMessages = null;

  function setupRealtimeMessages(convId, uid) {
    if (unsubMessages) {
      unsubMessages();
      const index = unsubscribes.indexOf(unsubMessages);
      if (index > -1) unsubscribes.splice(index, 1);
    }

    const messagesPath = `conversations/${convId}/messages`;
    // We fetch chronologically in reverse with limit so we can query exactly the latest N messages
    const msgQuery = query(
      collection(db, messagesPath),
      orderBy('timestamp', 'desc'),
      limit(currentLimit)
    );

    unsubMessages = onSnapshot(msgQuery, (snapshot) => {
      const prevScrollHeight = messagesLog.scrollHeight;
      const prevScrollTop = messagesLog.scrollTop;
      const isScrollAtBottom = prevScrollHeight - prevScrollTop - messagesLog.clientHeight < 120;

      messagesLog.innerHTML = '';

      if (snapshot.empty) {
        messagesLog.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--grey-600); font-weight: 500; font-size: 0.8rem; display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <div style="font-size: 2.2rem;">🤝</div>
            <div>No messages yet. Send a friendly greeting to start your conversation!</div>
          </div>
        `;
        return;
      }

      // Reverse messages list chronologically
      const docsList = [];
      snapshot.forEach(d => {
        const data = d.data();
        data.id = d.id;
        docsList.push(data);
      });
      docsList.reverse();

      let lastDateStr = null;

      // Group date dividers & render message bubbles
      docsList.forEach(msg => {
        const rawTime = msg.timestamp || msg.createdAt;
        const date = rawTime?.toDate ? rawTime.toDate() : new Date(rawTime || Date.now());
        const dateStr = date.toDateString();

        if (dateStr !== lastDateStr) {
          const divider = document.createElement('div');
          divider.className = 'date-divider';
          divider.innerHTML = `<span class="date-divider__text">${getDateDividerText(date)}</span>`;
          messagesLog.appendChild(divider);
          lastDateStr = dateStr;
        }

        const isMine = msg.senderId === uid;
        messagesLog.appendChild(renderMessageBubble(msg, isMine));
      });

      // Maintain view scroll position or force snap bottom
      if (firstLoad) {
        messagesLog.scrollTop = messagesLog.scrollHeight;
        firstLoad = false;
      } else if (isScrollAtBottom) {
        messagesLog.scrollTop = messagesLog.scrollHeight;
      } else {
        // Keeps user exactly at their scroll position if new content loads above
        messagesLog.scrollTop = messagesLog.scrollTop + (messagesLog.scrollHeight - prevScrollHeight);
      }

      // Auto clear incoming badges if chat is active on screen
      if (docsList.length > 0) {
        const lastMsg = docsList[docsList.length - 1];
        if (lastMsg.senderId !== uid && !lastMsg.read) {
          markMessagesAsRead(convId, uid, uid === convoId.split('_')[0]);
        }
      }

    }, (error) => {
      messagesLog.innerHTML = `<p style="text-align: center; color: var(--danger); font-size: 0.82rem; padding: 20px;">Failed to sync messages.</p>`;
      handleFirestoreError(error, OperationType.LIST, messagesPath);
    });

    unsubscribes.push(unsubMessages);
  }

  /**
   * Scroll Listener for top paginated loader
   */
  messagesLog.addEventListener('scroll', () => {
    if (messagesLog.scrollTop === 0 && !firstLoad) {
      // User reached top - load earlier chunk
      currentLimit += 30;
      setupRealtimeMessages(convoId, currentUser.uid);
    }
  });

  /**
   * Date divider semantic formatter
   */
  function getDateDividerText(date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (itemDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (itemDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  }

  /**
   * Message Bubble Creator
   */
  function renderMessageBubble(msg, isMine) {
    const row = document.createElement('div');
    row.className = `msg-row ${isMine ? 'msg-row--mine' : 'msg-row--theirs'}`;

    const rawTime = msg.timestamp || msg.createdAt;
    const formattedTime = rawTime?.toDate 
      ? rawTime.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : 'Just now';

    const isImage = msg.type === 'image';

    let bubbleContentHtml = '';

    if (isImage) {
      bubbleContentHtml = `
        <div class="bubble bubble--image">
          <img src="${msg.content}" alt="Image attachment" class="chat-photo-attachment" referrerPolicy="no-referrer">
        </div>
      `;
    } else {
      // Plain text content
      bubbleContentHtml = `
        <div class="bubble">${msg.content || msg.text || ''}</div>
      `;
    }

    row.innerHTML = `
      ${bubbleContentHtml}
      <div class="msg-status-line">
        <span>${formattedTime}</span>
        ${isMine ? (msg.read ? `<span class="status-check status-check--read">✓✓</span>` : `<span class="status-check status-check--sent">✓</span>`) : ''}
      </div>
    `;

    // Photo light-box click trigger
    if (isImage) {
      const imgEl = row.querySelector('.chat-photo-attachment');
      if (imgEl) {
        imgEl.addEventListener('click', () => {
          lightboxImg.src = msg.content;
          lightboxModal.classList.add('lightbox-modal--visible');
        });
      }
    }

    return row;
  }

  // Lightbox close helpers
  if (lightboxClose && lightboxModal) {
    lightboxClose.addEventListener('click', () => {
      lightboxModal.classList.remove('lightbox-modal--visible');
    });
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) {
        lightboxModal.classList.remove('lightbox-modal--visible');
      }
    });
  }

  /**
   * Handle Bottom Bar Actions, Inputs, Photo Picker, Text Expansion, and Submissions
   */
  function setupFormInputHandlers(convId, uid, partnerName, isBuyer) {
    
    // Auto growing textarea
    messageInput.addEventListener('input', () => {
      messageInput.style.height = 'auto';
      const scrollH = messageInput.scrollHeight;
      // Max 100px (~ 4 lines), minimum 38px
      messageInput.style.height = `${Math.min(Math.max(scrollH, 38), 100)}px`;
      updateSendButtonState();
    });

    // Camera / Photo Trigger click
    attachBtn.addEventListener('click', () => {
      fileInput.click();
    });

    // File Selected change
    fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.type.startsWith('image/')) {
        showToast('Please select an image file.', 'warning');
        return;
      }

      selectedFile = file;

      // Render local preview
      const reader = new FileReader();
      reader.onload = (event) => {
        uploadPreviewImg.src = event.target.result;
        uploadPreviewContainer.classList.remove('hidden');
        updateSendButtonState();
      };
      reader.readAsDataURL(file);
    });

    // Cancel Selected Media Upload
    uploadCancelBtn.addEventListener('click', () => {
      // Cancel active upload task if running
      if (uploadTask) {
        try {
          uploadTask.cancel();
          showToast('Image upload cancelled.', 'warning');
        } catch (err) {}
        uploadTask = null;
      }
      
      selectedFile = null;
      fileInput.value = '';
      uploadPreviewContainer.classList.add('hidden');
      uploadProgressContainer.classList.add('hidden');
      uploadProgressFill.style.width = '0%';
      updateSendButtonState();
    });

    // State Checker
    function updateSendButtonState() {
      const hasText = messageInput.value.trim().length > 0;
      const hasMedia = selectedFile !== null;
      const active = hasText || hasMedia;

      if (active) {
        sendBtn.classList.remove('chat-submit-btn--inactive');
        sendBtn.classList.add('chat-submit-btn--active');
      } else {
        sendBtn.classList.remove('chat-submit-btn--active');
        sendBtn.classList.add('chat-submit-btn--inactive');
      }
    }

    // Submission Trigger on Click Send
    sendBtn.addEventListener('click', () => {
      submitMessage();
    });

    // Allow Enter key to submit text (Shift+Enter for new line)
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitMessage();
      }
    });

    /**
     * Submit Text/Image content payload
     */
    async function submitMessage() {
      const text = messageInput.value.trim();
      const hasMedia = selectedFile !== null;

      if (!text && !hasMedia) return;

      // Lock input UI partially during photo uploads
      messageInput.value = '';
      messageInput.style.height = '38px';
      updateSendButtonState();

      if (hasMedia) {
        // Proceed with storage upload first
        uploadMediaAndSend(convId, uid, text, isBuyer);
      } else {
        // Simple text message send
        sendTextMessage(convId, uid, text, isBuyer);
      }
    }

    /**
     * Resumable Media Uploader
     */
    function uploadMediaAndSend(convId, uid, optionalText, isBuyer) {
      const fileToUpload = selectedFile;
      selectedFile = null;
      fileInput.value = '';
      uploadPreviewContainer.classList.add('hidden');
      uploadProgressContainer.classList.remove('hidden');

      const timestamp = Date.now();
      const storageRef = ref(storage, `conversations/${convId}/${uid}_${timestamp}.jpg`);
      
      uploadTask = uploadBytesResumable(storageRef, fileToUpload);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          uploadProgressFill.style.width = `${progress}%`;
        }, 
        (error) => {
          console.error("Storage upload error: ", error);
          showToast('Image upload failed.', 'danger');
          uploadProgressContainer.classList.add('hidden');
          uploadProgressFill.style.width = '0%';
          updateSendButtonState();
        }, 
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            uploadProgressContainer.classList.add('hidden');
            uploadProgressFill.style.width = '0%';
            uploadTask = null;

            // 1. Send media image message
            const messagesRef = collection(db, `conversations/${convId}/messages`);
            await addDoc(messagesRef, {
              senderId: uid,
              senderName: currentUserData?.name || 'ShopEasy User',
              type: 'image',
              content: downloadUrl,
              text: '[Image attachment]', // Legacy backward fallback
              createdAt: serverTimestamp(),
              timestamp: serverTimestamp(),
              read: false
            });

            // 2. If user entered some optional text with the photo, send it as secondary text bubble
            if (optionalText) {
              await addDoc(messagesRef, {
                senderId: uid,
                senderName: currentUserData?.name || 'ShopEasy User',
                type: 'text',
                content: optionalText,
                text: optionalText, // Legacy backward fallback
                createdAt: serverTimestamp(),
                timestamp: serverTimestamp(),
                read: false
              });
            }

            // 3. Update parent Conversation document summary
            const convoDocRef = doc(db, 'conversations', convId);
            const summaryText = optionalText ? optionalText : 'Sent a photo attachment';
            
            await updateDoc(convoDocRef, {
              lastMessage: summaryText,
              lastMessageAt: serverTimestamp(),
              lastMessageTime: serverTimestamp(), // Legacy backward fallback
              lastSenderId: uid,
              updatedAt: serverTimestamp(),
              unreadCountBuyer: isBuyer ? 0 : increment(1),
              unreadCountSeller: isBuyer ? increment(1) : 0,
              unreadCount: increment(1) // Legacy backward fallback
            });

          } catch (err) {
            showToast('Failed to send image message.', 'danger');
            handleFirestoreError(err, OperationType.WRITE, `conversations/${convId}/messages`);
          } finally {
            updateSendButtonState();
          }
        }
      );
    }

    /**
     * Dispatch simple text message transaction
     */
    async function sendTextMessage(convId, uid, textVal, isBuyer) {
      try {
        const messagesRef = collection(db, `conversations/${convId}/messages`);
        
        // 1. Write message inside subcollection
        await addDoc(messagesRef, {
          senderId: uid,
          senderName: currentUserData?.name || 'ShopEasy User',
          type: 'text',
          content: textVal,
          text: textVal, // Legacy backward fallback
          createdAt: serverTimestamp(),
          timestamp: serverTimestamp(), // Legacy backward fallback
          read: false
        });

        // 2. Update conversation summary document
        const convoDocRef = doc(db, 'conversations', convId);
        await updateDoc(convoDocRef, {
          lastMessage: textVal,
          lastMessageAt: serverTimestamp(),
          lastMessageTime: serverTimestamp(), // Legacy backward fallback
          lastSenderId: uid,
          updatedAt: serverTimestamp(),
          unreadCountBuyer: isBuyer ? 0 : increment(1),
          unreadCountSeller: isBuyer ? increment(1) : 0,
          unreadCount: increment(1) // Legacy backward fallback
        });

      } catch (err) {
        showToast('Message delivery failed.', 'danger');
        handleFirestoreError(err, OperationType.WRITE, `conversations/${convId}/messages`);
      } finally {
        updateSendButtonState();
      }
    }
  }
});
