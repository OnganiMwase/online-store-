/**
 * ShopEasy Followed Stores Page Control Module
 */

import { auth, db } from '../firebase-config.js';
import { 
  collection, 
  getDocs, 
  doc, 
  deleteDoc, 
  setDoc, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  updateDoc, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { injectHeaderAndNav, renderSkeleton } from '../ui.js';
import { redirect, showToast, formatMWK, handleFirestoreError, OperationType } from '../utils.js';
import { initAuth } from '../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Inject navigation
  injectHeaderAndNav('account');

  const container = document.getElementById('followed-stores-container');
  const followedTitle = document.getElementById('followed-stores-title');
  const discoverSection = document.getElementById('discover-stores-section');
  const discoverList = document.getElementById('discover-stores-list');

  let authUser = null;

  // 1. Initialize Auth
  container.innerHTML = renderSkeleton(3);
  const authState = await initAuth({ requireAuth: true });
  authUser = authState.user;

  if (!authUser) {
    return; // Automatically redirected to login by initAuth
  }

  // Load page content
  await loadFollowedStores();

  async function loadFollowedStores() {
    try {
      const qSnap = await getDocs(collection(db, `followedStores/${authUser.uid}/stores`));
      container.innerHTML = '';

      if (qSnap.empty) {
        followedTitle.textContent = '🏪 Followed Stores (0)';
        renderEmptyStateUI();
        return;
      }

      followedTitle.textContent = `🏪 Followed Stores (${qSnap.size})`;
      discoverSection.style.display = 'none'; // Only show discover section on empty state

      for (const snapDoc of qSnap.docs) {
        const store = snapDoc.data();
        store.id = snapDoc.id; // Usually storeId is the doc id
        
        // Fetch real-time rating and logo from the source store document if possible
        try {
          const storeDoc = await getDoc(doc(db, 'stores', store.id));
          if (storeDoc.exists()) {
            const freshData = storeDoc.data();
            store.rating = freshData.rating || store.rating || 5.0;
            store.city = freshData.city || store.city || 'Malawi';
            store.storeLogo = freshData.logo || store.storeLogo || '';
            store.storeName = freshData.name || store.storeName || 'Local Seller';
          }
        } catch (e) {
          console.warn(`Could not sync real-time store data for ${store.id}`, e);
        }

        const card = await renderFollowedStoreCard(store);
        container.appendChild(card);
      }

    } catch (error) {
      container.innerHTML = `
        <div class="error-state" style="text-align: center; padding: 32px 16px; color: var(--danger); background-color: var(--primary-light); border-radius: var(--radius); margin: 16px 0;">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="margin: 0 auto 12px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p style="font-size: 0.9rem; font-weight: 500;">Failed to load followed stores. Check connection.</p>
        </div>
      `;
      handleFirestoreError(error, OperationType.LIST, `followedStores/${authUser.uid}/stores`);
    }
  }

  // Render horizontal store card
  async function renderFollowedStoreCard(store) {
    const card = document.createElement('div');
    card.className = 'followed-store-card';

    const storeId = store.storeId || store.id;
    const storeName = store.storeName || 'ShopEasy Seller';
    const logoUrl = store.storeLogo || store.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(storeName)}`;
    const rating = store.rating || 5.0;
    const city = store.city || 'Malawi';

    // Step A: Fetch "X new this week" badge (added in last 7 days)
    let newProductsBadgeHtml = '';
    let latestProductsHtml = '';

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Fetch products
      const pQuery = query(
        collection(db, 'products'),
        where('storeId', '==', storeId),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc'),
        limit(4)
      );
      const pSnap = await getDocs(pQuery);

      let newCountThisWeek = 0;
      const products = [];

      pSnap.forEach(pDoc => {
        const prod = pDoc.data();
        prod.id = pDoc.id;
        products.push(prod);

        if (prod.createdAt?.toDate) {
          if (prod.createdAt.toDate() >= sevenDaysAgo) {
            newCountThisWeek++;
          }
        }
      });

      if (newCountThisWeek > 0) {
        newProductsBadgeHtml = `<span class="store-badge">${newCountThisWeek} new this week</span>`;
      }

      if (products.length > 0) {
        latestProductsHtml = `
          <div class="latest-products-scroll">
            ${products.map(p => `
              <div class="mini-product-card" data-id="${p.id}">
                <img src="${p.images?.[0] || p.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&q=80'}" alt="${p.title}" referrerPolicy="no-referrer">
                <span class="mini-title">${p.title || p.name}</span>
                <span class="mini-price">${formatMWK(p.price)}</span>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        latestProductsHtml = `<p style="font-size: 0.75rem; color: var(--grey-500); font-weight: 600; font-style: italic;">No listings uploaded recently.</p>`;
      }

    } catch (err) {
      console.warn("Could not load products row for store:", storeId, err);
      latestProductsHtml = `<p style="font-size: 0.75rem; color: var(--grey-500); font-style: italic;">Products temporarily unavailable.</p>`;
    }

    card.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--grey-100); padding-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 12px; cursor: pointer;" class="goto-store-btn">
          <img src="${logoUrl}" alt="${storeName}" class="store-logo-img">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <h3 style="font-size: 0.92rem; font-weight: 850; color: var(--secondary);">${storeName}</h3>
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--grey-600); font-weight: 700;">
              <span>⭐ <span class="rating-star">${Number(rating).toFixed(1)}</span></span>
              <span>&bull;</span>
              <span>${city}</span>
            </div>
          </div>
        </div>
        <button class="btn btn--outline btn--sm unfollow-store-btn" style="border-color: var(--grey-300); color: var(--grey-600); padding: 4px 10px; font-size: 0.72rem;">
          Unfollow
        </button>
      </div>

      ${newProductsBadgeHtml}

      <div style="margin: 4px 0;">
        ${latestProductsHtml}
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: -4px;">
        <a href="store.html?id=${storeId}" style="font-size: 0.75rem; font-weight: 800; color: var(--primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">
          View store &rarr;
        </a>
      </div>
    `;

    // Bind navigations to mini product clicks
    card.querySelectorAll('.mini-product-card').forEach(pCard => {
      pCard.addEventListener('click', () => {
        redirect(`/product.html?id=${pCard.dataset.id}`);
      });
    });

    // Bind goto store info clicks
    card.querySelector('.goto-store-btn').addEventListener('click', () => {
      redirect(`/store.html?id=${storeId}`);
    });

    // Bind Unfollow Click Action
    const unfollowBtn = card.querySelector('.unfollow-store-btn');
    unfollowBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Are you sure you want to unfollow ${storeName}?`)) return;

      unfollowBtn.disabled = true;
      unfollowBtn.textContent = '...';

      try {
        await unfollowStore(storeId, storeName);
        card.style.opacity = '0.5';
        card.style.transform = 'scale(0.95)';
        setTimeout(() => {
          card.remove();
          loadFollowedStores(); // reload to keep header and empty state synchronized
        }, 300);
      } catch (err) {
        unfollowBtn.disabled = false;
        unfollowBtn.textContent = 'Unfollow';
      }
    });

    return card;
  }

  // Follow Action
  async function followStore(storeId, storeName, logo, city, buttonEl) {
    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.textContent = '...';
    }

    try {
      const followRef = doc(db, `followedStores/${authUser.uid}/stores`, storeId);
      await setDoc(followRef, {
        storeId,
        storeName,
        storeLogo: logo || '',
        city: city || 'Malawi',
        followedAt: serverTimestamp()
      });

      // Update store followerCount in stores collection
      try {
        const storeRef = doc(db, 'stores', storeId);
        const storeSnap = await getDoc(storeRef);
        let currCount = 0;
        if (storeSnap.exists()) {
          currCount = storeSnap.data().followerCount || 0;
        }
        await updateDoc(storeRef, {
          followerCount: currCount + 1
        });
      } catch (e) {
        console.warn(`Could not update followerCount on stores/${storeId}:`, e);
      }

      // Also update seller profile user document for complete consistency
      try {
        const userRef = doc(db, 'users', storeId);
        const userSnap = await getDoc(userRef);
        let currCount = 0;
        if (userSnap.exists()) {
          currCount = userSnap.data().followerCount || 0;
        }
        await updateDoc(userRef, {
          followerCount: currCount + 1
        });
      } catch (e) {
        console.warn(`Could not update followerCount on users/${storeId}:`, e);
      }

      showToast(`Following ${storeName}`, 'success');
      loadFollowedStores(); // reload to refresh layout
    } catch (err) {
      showToast('Could not follow store.', 'danger');
      console.error(err);
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.textContent = 'Follow';
      }
    }
  }

  // Unfollow Action
  async function unfollowStore(storeId, storeName) {
    try {
      const followRef = doc(db, `followedStores/${authUser.uid}/stores`, storeId);
      await deleteDoc(followRef);

      // Decrement stores collection followerCount
      try {
        const storeRef = doc(db, 'stores', storeId);
        const storeSnap = await getDoc(storeRef);
        let currCount = 1;
        if (storeSnap.exists()) {
          currCount = storeSnap.data().followerCount || 1;
        }
        await updateDoc(storeRef, {
          followerCount: Math.max(0, currCount - 1)
        });
      } catch (e) {
        console.warn(`Could not update followerCount on stores/${storeId}:`, e);
      }

      // Decrement users collection followerCount for backward compatibility
      try {
        const userRef = doc(db, 'users', storeId);
        const userSnap = await getDoc(userRef);
        let currCount = 1;
        if (userSnap.exists()) {
          currCount = userSnap.data().followerCount || 1;
        }
        await updateDoc(userRef, {
          followerCount: Math.max(0, currCount - 1)
        });
      } catch (e) {
        console.warn(`Could not update followerCount on users/${storeId}:`, e);
      }

      showToast(`Unfollowed ${storeName}`, 'success');
    } catch (err) {
      showToast('Could not unfollow store.', 'danger');
      console.error(err);
      throw err;
    }
  }

  // Render Empty State and Discover section
  async function renderEmptyStateUI() {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 16px; display: flex; flex-direction: column; align-items: center; gap: 14px; color: var(--grey-600);">
        <div style="font-size: 4rem; color: var(--grey-400); line-height: 1;">🏪</div>
        <h3 style="font-size: 1.2rem; font-weight: 850; color: var(--secondary); margin: 0;">No followed stores</h3>
        <p style="font-size: 0.85rem; max-width: 280px; line-height: 1.4; color: var(--grey-600); margin: 0;">Follow stores to see their latest products here</p>
      </div>
    `;

    // Fetch popular approved stores
    discoverSection.style.display = 'block';
    discoverList.innerHTML = `
      <div class="skeleton" style="width: 140px; height: 130px; border-radius: 8px;"></div>
      <div class="skeleton" style="width: 140px; height: 130px; border-radius: 8px;"></div>
    `;

    try {
      const discQuery = query(
        collection(db, 'stores'),
        where('status', '==', 'approved'),
        orderBy('followerCount', 'desc'),
        limit(6)
      );
      const discSnap = await getDocs(discQuery);
      discoverList.innerHTML = '';

      if (discSnap.empty) {
        discoverSection.style.display = 'none';
        return;
      }

      for (const dDoc of discSnap.docs) {
        const store = dDoc.data();
        store.id = dDoc.id;

        // Check if user is already following this store in discovery list
        const followSnap = await getDoc(doc(db, `followedStores/${authUser.uid}/stores`, store.id));
        if (followSnap.exists()) {
          // If already following, skip from discover recommendations
          continue;
        }

        const logoUrl = store.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(store.name || 'S')}`;
        
        const card = document.createElement('div');
        card.className = 'discover-store-card';
        card.innerHTML = `
          <a href="store.html?id=${store.id}" style="display: flex; flex-direction: column; align-items: center; gap: 6px; text-decoration: none;">
            <img src="${logoUrl}" alt="${store.name}" class="store-logo-img">
            <span style="font-size: 0.8rem; font-weight: 850; color: var(--secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 136px;">${store.name}</span>
            <span style="font-size: 0.7rem; color: var(--grey-600); font-weight: 600;">${store.city || 'Malawi'}</span>
          </a>
          <button class="btn btn--primary btn--sm follow-btn" style="width: 100%; margin-top: 4px; padding: 4px 0; font-size: 0.7rem; font-weight: 800; text-transform: uppercase;">
            Follow
          </button>
        `;

        const followBtn = card.querySelector('.follow-btn');
        followBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await followStore(store.id, store.name, store.logo, store.city, followBtn);
        });

        discoverList.appendChild(card);
      }

      // If discovery list is empty after filtering already-followed stores, hide the section
      if (discoverList.children.length === 0) {
        discoverSection.style.display = 'none';
      }

    } catch (err) {
      console.warn("Could not load discover stores section:", err);
      discoverSection.style.display = 'none';
    }
  }
});
