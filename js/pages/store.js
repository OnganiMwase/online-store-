/**
 * ShopEasy Store Profile Page Control Module
 */

import { auth, db } from '../firebase-config.js';
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { injectHeaderAndNav, renderProductCard, renderSkeleton } from '../ui.js';
import { getUrlParam, redirect, showToast, formatMWK, handleFirestoreError, OperationType } from '../utils.js';
import { initAuth } from '../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Inject navigation
  injectHeaderAndNav('shop');

  const storeId = getUrlParam('id');
  const loadingEl = document.getElementById('store-profile-loading');
  const containerEl = document.getElementById('store-profile-container');

  const storeLogoEl = document.getElementById('store-logo');
  const storeNameEl = document.getElementById('store-name');
  const storeMetaEl = document.getElementById('store-meta');
  const storeFollowersEl = document.getElementById('store-followers');
  const storeMemberSinceEl = document.getElementById('store-member-since');
  const storeDescTextEl = document.getElementById('store-description-text');
  
  const followBtn = document.getElementById('store-follow-btn');
  const messageBtn = document.getElementById('store-message-btn');
  const productsGrid = document.getElementById('store-products-grid');
  const loadMoreBtn = document.getElementById('load-more-btn');

  if (!storeId) {
    loadingEl.innerHTML = `
      <div style="text-align: center; padding: 64px 16px; color: var(--danger);">
        <h3>Store Reference Missing</h3>
        <p style="font-size: 0.85rem; margin-top: 6px; color: var(--grey-600);">Please go back to shopping and select a valid store profile.</p>
        <a href="shop.html" class="btn btn--primary btn--sm" style="margin-top: 16px;">Go to Shop</a>
      </div>
    `;
    return;
  }

  // State variables
  let isFollowing = false;
  let followerCount = 0;
  let lastVisibleProduct = null;
  let authUser = null;
  let authUserData = null;
  let storeData = null;

  // Initialize Auth (do not force required, but capture if logged in)
  const authState = await initAuth({ requireAuth: false });
  authUser = authState.user;
  authUserData = authState.userData;

  // 1. Fetch Store Profile Details
  try {
    // Try fetching from stores first
    let storeSnap = await getDoc(doc(db, 'stores', storeId));
    let rawData = null;
    
    if (storeSnap.exists()) {
      rawData = storeSnap.data();
    } else {
      // Fallback to users/seller document
      const userSnap = await getDoc(doc(db, 'users', storeId));
      if (userSnap.exists() && userSnap.data().role === 'seller') {
        rawData = userSnap.data();
      }
    }

    if (!rawData) {
      loadingEl.innerHTML = `
        <div style="text-align: center; padding: 64px 16px; color: var(--secondary);">
          <h3>Seller Store Profile Not Found</h3>
          <p style="font-size: 0.85rem; margin-top: 6px; color: var(--grey-600);">The store you are looking for may have been deactivated or renamed.</p>
          <a href="shop.html" class="btn btn--primary btn--sm" style="margin-top: 16px;">Go to Shop</a>
        </div>
      `;
      return;
    }

    storeData = rawData;
    storeData.id = storeId;

    // Render store header
    renderStoreHeader(storeData);

    // Sync Follow Button State if logged in
    if (authUser) {
      await checkFollowStatus();
    }

    // 2. Fetch Store Products
    await loadStoreProducts(false);

    // Hide loading, show container
    loadingEl.style.display = 'none';
    containerEl.style.display = 'block';

  } catch (err) {
    loadingEl.innerHTML = `
      <div style="text-align: center; padding: 48px 16px; color: var(--danger);">
        <h3>Failed to load store profile</h3>
        <p style="font-size: 0.85rem; margin-top: 6px;">Check your internet connection and try again.</p>
      </div>
    `;
    console.error(err);
  }

  // Render Header Details
  function renderStoreHeader(data) {
    const name = data.name || data.storeName || 'ShopEasy Seller';
    const logoUrl = data.logo || data.storeLogo || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
    const city = data.city || data.sellerCity || 'Malawi';
    const rating = data.rating || 5.0;
    const ratingCount = data.ratingCount || 0;
    followerCount = data.followerCount || 0;

    // Parse member since
    const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : (data.savedAt?.toDate ? data.savedAt.toDate() : new Date());
    const memberYear = createdDate.getFullYear();

    // Set title and content
    document.title = `${name} - ShopEasy`;
    const titleHeader = document.getElementById('store-title-header');
    if (titleHeader) titleHeader.textContent = name;

    storeLogoEl.src = logoUrl;
    storeNameEl.textContent = name;

    storeMetaEl.innerHTML = `
      <span>${city}</span>
      <span>&bull;</span>
      <span>⭐ <span class="rating-star">${Number(rating).toFixed(1)}</span> (${ratingCount} reviews)</span>
    `;

    storeFollowersEl.textContent = `${followerCount} followers`;
    storeMemberSinceEl.textContent = `Member since ${memberYear}`;

    if (data.description || data.bio) {
      storeDescTextEl.textContent = data.description || data.bio;
    }
  }

  // Check initial follow status
  async function checkFollowStatus() {
    try {
      const followSnap = await getDoc(doc(db, `followedStores/${authUser.uid}/stores`, storeId));
      if (followSnap.exists()) {
        isFollowing = true;
        setFollowButtonActive(true);
      } else {
        isFollowing = false;
        setFollowButtonActive(false);
      }
    } catch (e) {
      console.warn("Could not retrieve follow status", e);
    }
  }

  function setFollowButtonActive(active) {
    if (active) {
      followBtn.textContent = '❤️ Following';
      followBtn.className = 'btn btn--outline btn--outline-following';
    } else {
      followBtn.textContent = 'Follow';
      followBtn.className = 'btn btn--primary';
    }
  }

  // Follow Button Action
  followBtn.addEventListener('click', async () => {
    if (!authUser) {
      showToast('Please sign in to follow stores', 'warning');
      setTimeout(() => redirect('/login.html'), 1500);
      return;
    }

    followBtn.disabled = true;

    try {
      const followRef = doc(db, `followedStores/${authUser.uid}/stores`, storeId);
      const storeRef = doc(db, 'stores', storeId);
      const userRef = doc(db, 'users', storeId);

      if (isFollowing) {
        // Unfollow action
        await deleteDoc(followRef);
        followerCount = Math.max(0, followerCount - 1);
        
        // Decrement counters
        try { await updateDoc(storeRef, { followerCount }); } catch(e){}
        try { await updateDoc(userRef, { followerCount }); } catch(e){}

        isFollowing = false;
        setFollowButtonActive(false);
        showToast(`Unfollowed ${storeNameEl.textContent}`, 'success');
      } else {
        // Follow action
        await setDoc(followRef, {
          storeId,
          storeName: storeNameEl.textContent,
          storeLogo: storeLogoEl.src || '',
          city: storeMetaEl.querySelector('span')?.textContent || 'Malawi',
          followedAt: serverTimestamp()
        });
        
        followerCount = followerCount + 1;

        // Increment counters
        try { await updateDoc(storeRef, { followerCount }); } catch(e){}
        try { await updateDoc(userRef, { followerCount }); } catch(e){}

        isFollowing = true;
        setFollowButtonActive(true);
        showToast(`Now following ${storeNameEl.textContent}!`, 'success');
      }

      storeFollowersEl.textContent = `${followerCount} followers`;

    } catch (err) {
      showToast('Action failed. Try again.', 'danger');
      console.error(err);
    } finally {
      followBtn.disabled = false;
    }
  });

  // Message Button Action
  messageBtn.addEventListener('click', async () => {
    if (!authUser) {
      showToast('Please sign in to contact the seller', 'warning');
      setTimeout(() => redirect('/login.html'), 1500);
      return;
    }

    if (authUser.uid === storeId) {
      showToast('You cannot message yourself.', 'warning');
      return;
    }

    messageBtn.disabled = true;
    messageBtn.textContent = 'Connecting...';

    try {
      const convId = [authUser.uid, storeId].sort().join('_');
      const convRef = doc(db, 'conversations', convId);
      const convSnap = await getDoc(convRef);

      if (convSnap.exists()) {
        redirect(`/chat.html?id=${convId}`);
      } else {
        // Create new deterministic conversation
        await setDoc(convRef, {
          id: convId,
          buyerId: authUser.uid,
          buyerName: authUserData?.name || authUser.displayName || 'Malawi Buyer',
          sellerId: storeId,
          sellerName: storeNameEl.textContent,
          lastMessage: `Hello! I'm interested in viewing your listings.`,
          lastMessageTime: serverTimestamp(),
          unreadCount: 1,
          updatedAt: serverTimestamp()
        });

        // Add initial message to subcollection
        await setDoc(doc(collection(db, `conversations/${convId}/messages`)), {
          senderId: authUser.uid,
          senderName: authUserData?.name || authUser.displayName || 'Buyer',
          text: `Hello! I'm interested in viewing your listings.`,
          timestamp: serverTimestamp()
        });

        redirect(`/chat.html?id=${convId}`);
      }
    } catch (err) {
      showToast('Could not initiate conversation.', 'danger');
      console.error(err);
      messageBtn.disabled = false;
      messageBtn.textContent = '💬 Message';
    }
  });

  // Load Store Products Action
  async function loadStoreProducts(loadMore = false) {
    if (!loadMore) {
      productsGrid.innerHTML = renderSkeleton(4);
    }

    try {
      let pQuery = query(
        collection(db, 'products'),
        where('storeId', '==', storeId),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc'),
        limit(12)
      );

      if (loadMore && lastVisibleProduct) {
        pQuery = query(
          collection(db, 'products'),
          where('storeId', '==', storeId),
          where('isActive', '==', true),
          orderBy('createdAt', 'desc'),
          startAfter(lastVisibleProduct),
          limit(12)
        );
      }

      let snapshot;
      try {
        snapshot = await getDocs(pQuery);
      } catch (queryErr) {
        console.warn("Index not found, falling back to client-side sorting/filtering for store products", queryErr);
        const fallbackQuery = query(
          collection(db, 'products'),
          where('storeId', '==', storeId),
          where('isActive', '==', true)
        );
        const allSnap = await getDocs(fallbackQuery);
        let sortedDocs = [...allSnap.docs];
        sortedDocs.sort((a, b) => {
          const dateA = a.data().createdAt?.toDate ? a.data().createdAt.toDate() : new Date(a.data().createdAt || 0);
          const dateB = b.data().createdAt?.toDate ? b.data().createdAt.toDate() : new Date(b.data().createdAt || 0);
          return dateB - dateA;
        });

        const offset = loadMore && lastVisibleProduct ? sortedDocs.findIndex(d => d.id === lastVisibleProduct.id) + 1 : 0;
        const paginatedDocs = sortedDocs.slice(offset, offset + 12);

        snapshot = {
          empty: paginatedDocs.length === 0,
          docs: paginatedDocs,
          size: paginatedDocs.length,
          forEach(callback) {
            paginatedDocs.forEach(callback);
          }
        };
      }
      
      if (!loadMore) {
        productsGrid.innerHTML = '';
      }

      if (snapshot.empty && !loadMore) {
        productsGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; color: var(--grey-500); font-weight: 600;">
            <p>This store has no listings yet</p>
          </div>
        `;
        loadMoreBtn.style.display = 'none';
        return;
      }

      snapshot.forEach(docSnap => {
        const prod = docSnap.data();
        prod.id = docSnap.id;
        
        // Render using existing standard function
        const cardHtml = renderProductCard(prod);
        
        // Append to grid
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml.trim();
        const cardNode = tempDiv.firstChild;
        productsGrid.appendChild(cardNode);
      });

      // Keep cursor
      lastVisibleProduct = snapshot.docs[snapshot.docs.length - 1];

      // Handle Load More Button Visibility
      if (snapshot.size === 12) {
        loadMoreBtn.style.display = 'block';
      } else {
        loadMoreBtn.style.display = 'none';
      }

    } catch (err) {
      console.error("Error loading store listings:", err);
      if (!loadMore) {
        productsGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; color: var(--danger); font-size: 0.85rem; font-weight: 600;">
            Failed to load products. Check your connection.
          </div>
        `;
      }
    }
  }

  // Load More Event
  loadMoreBtn.addEventListener('click', async () => {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading...';
    await loadStoreProducts(true);
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = 'Load More';
  });
});
