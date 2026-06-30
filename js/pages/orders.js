/**
 * ShopEasy Orders List Page Control Module
 */

import { auth, db } from '../firebase-config.js';
import { 
  collection, 
  getDocs, 
  getDoc,
  doc,
  query, 
  where,
  orderBy,
  limit,
  startAfter,
  updateDoc,
  deleteDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { injectHeaderAndNav, renderEmptyState, renderErrorState } from '../ui.js';
import { formatMWK, redirect, handleFirestoreError, OperationType, showToast, showLoading, hideLoading } from '../utils.js';
import { initAuth } from '../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Inject Header and Nav
  injectHeaderAndNav('account');

  const container = document.getElementById('orders-list');
  const tabsContainer = document.getElementById('orders-tabs');
  const loadMoreContainer = document.getElementById('load-more-container');
  const loadMoreBtn = document.getElementById('load-more-btn');

  const PAGE_SIZE = 10;
  let activeTab = 'all';
  let lastVisibleDoc = null;
  let hasMore = false;
  let authUser = null;
  let authUserData = null;

  // Initialize Auth
  const authState = await initAuth({ requireAuth: true });
  authUser = authState.user;
  authUserData = authState.userData;

  if (!authUser) return;

  // Setup Tabs
  const tabs = tabsContainer.querySelectorAll('.orders-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('orders-tab--active'));
      tab.classList.add('orders-tab--active');
      activeTab = tab.dataset.status;
      lastVisibleDoc = null;
      container.innerHTML = `
        <div class="skeleton" style="width: 100%; height: 120px; border-radius: var(--radius); margin-bottom: 12px;"></div>
        <div class="skeleton" style="width: 100%; height: 120px; border-radius: var(--radius); margin-bottom: 12px;"></div>
      `;
      loadMoreContainer.classList.add('hidden');
      fetchOrders(false);
    });
  });

  // Fetch Orders Core Function
  const fetchOrders = async (isAppend = false) => {
    try {
      let q;
      if (activeTab === 'all') {
        if (lastVisibleDoc) {
          q = query(
            collection(db, 'orders'),
            where('buyerId', '==', authUser.uid),
            orderBy('createdAt', 'desc'),
            startAfter(lastVisibleDoc),
            limit(PAGE_SIZE)
          );
        } else {
          q = query(
            collection(db, 'orders'),
            where('buyerId', '==', authUser.uid),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE)
          );
        }
      } else {
        if (lastVisibleDoc) {
          q = query(
            collection(db, 'orders'),
            where('buyerId', '==', authUser.uid),
            where('status', '==', activeTab),
            orderBy('createdAt', 'desc'),
            startAfter(lastVisibleDoc),
            limit(PAGE_SIZE)
          );
        } else {
          q = query(
            collection(db, 'orders'),
            where('buyerId', '==', authUser.uid),
            where('status', '==', activeTab),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE)
          );
        }
      }

      const snapshot = await getDocs(q);
      
      if (!isAppend) {
        container.innerHTML = '';
      }

      if (snapshot.empty && !isAppend) {
        let emptyTitle = 'No Orders Yet';
        let emptyDesc = 'You have not placed any orders. Start shopping today!';
        
        if (activeTab === 'pending_payment') {
          emptyTitle = 'No Awaiting Payments';
          emptyDesc = 'You have no orders waiting for payment at this moment.';
        } else if (activeTab === 'processing') {
          emptyTitle = 'No Processing Orders';
          emptyDesc = 'You have no orders currently in processing.';
        } else if (activeTab === 'ready') {
          emptyTitle = 'No Ready Orders';
          emptyDesc = 'No orders are currently ready for pick-up or shipment.';
        } else if (activeTab === 'completed') {
          emptyTitle = 'No Completed Orders';
          emptyDesc = 'You haven\'t completed any orders yet.';
        } else if (activeTab === 'cancelled') {
          emptyTitle = 'No Cancelled Orders';
          emptyDesc = 'Your cancellation list is empty.';
        } else if (activeTab === 'dispute_open') {
          emptyTitle = 'No Returns or Disputes';
          emptyDesc = 'You have no active disputes or returned orders.';
        }

        container.innerHTML = `
          <div class="orders-empty">
            <div class="orders-empty__icon">📦</div>
            <div class="orders-empty__title">${emptyTitle}</div>
            <div class="orders-empty__desc">${emptyDesc}</div>
            <a href="shop.html" class="btn btn--primary" style="margin-top: 12px; font-size: 0.85rem; padding: 10px 20px;">Browse Shop</a>
          </div>
        `;
        loadMoreContainer.classList.add('hidden');
        return;
      }

      snapshot.forEach(docSnap => {
        const order = docSnap.data();
        order.id = docSnap.id;
        container.appendChild(renderOrderCard(order));
      });

      // Pagination tracking
      if (snapshot.docs.length > 0) {
        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMore = snapshot.docs.length === PAGE_SIZE;
        
        if (hasMore) {
          loadMoreContainer.classList.remove('hidden');
        } else {
          loadMoreContainer.classList.add('hidden');
        }
      } else {
        loadMoreContainer.classList.add('hidden');
      }

    } catch (err) {
      container.innerHTML = renderErrorState('Unable to load orders. Please try reloading.');
      handleFirestoreError(err, OperationType.LIST, 'orders');
    }
  };

  // Click Load More
  loadMoreBtn.addEventListener('click', () => {
    fetchOrders(true);
  });

  // Initial Fetch Call
  fetchOrders(false);

  // Render Order Card Card Body and Controls
  const renderOrderCard = (order) => {
    const card = document.createElement('div');
    card.className = 'order-item-card';

    const formattedDate = order.createdAt?.toDate 
      ? order.createdAt.toDate().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Recently';

    // Store name resolution
    const storeName = order.storeName || order.items?.[0]?.storeName || "ShopEasy Seller";

    // Item image rendering (Max 3 thumbnails)
    const items = order.items || [];
    const totalItemsQty = items.reduce((sum, item) => sum + (item.qty || item.quantity || 1), 0);
    const uniqueItemsCount = items.length;

    let imagesHtml = '';
    items.slice(0, 3).forEach(item => {
      const imgUrl = item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80';
      imagesHtml += `<img class="order-img-thumb" src="${imgUrl}" alt="Product thumbnail">`;
    });

    if (uniqueItemsCount > 3) {
      imagesHtml += `<div class="order-more-pill">+${uniqueItemsCount - 3} more</div>`;
    }

    // Status Badge Mapping
    let badgeClass = 'status-badge--pending';
    let badgeText = 'Awaiting Payment';
    const status = order.status || 'pending_payment';

    if (status === 'pending_payment') {
      badgeClass = 'status-badge--pending';
      badgeText = '🟡 Awaiting Payment';
    } else if (status === 'processing') {
      badgeClass = 'status-badge--processing';
      badgeText = '🔵 Processing';
    } else if (status === 'ready') {
      badgeClass = 'status-badge--ready';
      badgeText = '🟢 Ready for Delivery/Pickup';
    } else if (status === 'completed') {
      badgeClass = 'status-badge--completed';
      badgeText = '✅ Completed';
    } else if (status === 'cancelled') {
      badgeClass = 'status-badge--cancelled';
      badgeText = '❌ Cancelled';
    } else if (status === 'dispute_open') {
      badgeClass = 'status-badge--dispute';
      badgeText = '🔴 Dispute Open';
    }

    // Determine cancel criteria (< 2 hours old)
    const createdAtTime = order.createdAt?.toDate ? order.createdAt.toDate().getTime() : Date.now();
    const isLessThanTwoHours = (Date.now() - createdAtTime) < (2 * 60 * 60 * 1000);

    // Build Action Buttons
    let actionsHtml = '';
    if (status === 'pending_payment') {
      actionsHtml = `
        <button class="btn-sm btn-sm--primary pay-now-btn">Pay Now</button>
        <button class="btn-sm btn-sm--outline cancel-order-btn">Cancel</button>
      `;
    } else if (status === 'processing') {
      actionsHtml = `
        <button class="btn-sm btn-sm--outline contact-seller-btn">Contact Seller</button>
        ${isLessThanTwoHours ? `<button class="btn-sm btn-sm--outline cancel-order-btn" style="color: var(--danger); border-color: var(--danger);">Cancel Order</button>` : ''}
      `;
    } else if (status === 'ready') {
      actionsHtml = `
        <button class="btn-sm btn-sm--primary receive-order-btn">✓ I Received It</button>
        <button class="btn-sm btn-sm--outline contact-seller-btn">Contact Seller</button>
      `;
    } else if (status === 'completed') {
      const isReviewed = order.reviewSubmitted || false;
      actionsHtml = `
        ${!isReviewed ? `<button class="btn-sm btn-sm--primary write-review-btn">Write Review</button>` : '<span style="font-size: 0.75rem; color: var(--success); font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">✅ Reviewed</span>'}
        <button class="btn-sm btn-sm--outline buy-again-btn">Buy Again</button>
        <button class="btn-sm--link report-problem-link" style="margin-left: auto;">Report Problem</button>
      `;
    } else if (status === 'cancelled') {
      actionsHtml = `
        <button class="btn-sm btn-sm--outline buy-again-btn">Shop Again</button>
        <button class="btn-sm--link delete-order-link" style="margin-left: auto; color: var(--danger);">Delete</button>
      `;
    }

    card.innerHTML = `
      <div class="order-item-card__header">
        <span class="order-item-card__store">🏪 ${storeName}</span>
        <span class="order-item-card__date">${formattedDate}</span>
      </div>
      <div class="order-item-card__body-tap-area" style="display: flex; flex-direction: column; gap: 8px;">
        <div class="order-images-row">
          ${imagesHtml}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <div class="order-item-card__price-row">
            <span>${formatMWK(order.total || order.totalPrice || 0)}</span> &bull; ${totalItemsQty} item${totalItemsQty === 1 ? '' : 's'}
          </div>
          <span class="status-badge ${badgeClass}">${badgeText}</span>
        </div>
      </div>
      <div class="order-item-card__actions" style="margin-top: 10px; display: flex; align-items: center; flex-wrap: wrap;">
        ${actionsHtml}
      </div>
    `;

    // Click on Card Body redirects to order-detail.html
    const tapArea = card.querySelector('.order-images-row, .order-item-card__price-row, .order-item-card__body-tap-area');
    if (tapArea) {
      tapArea.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('a')) {
          redirect(`order-detail.html?id=${order.id}`);
        }
      });
    }

    // Attach button event listeners
    // 1. Pay Now
    const payBtn = card.querySelector('.pay-now-btn');
    if (payBtn) {
      payBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        showLoading(payBtn, 'Setting up...');
        try {
          const buyerName = order.buyerName || authUserData?.name || "Malawi Buyer";
          const nameParts = buyerName.split(' ');
          const firstName = nameParts[0] || "Malawi";
          const lastName = nameParts.slice(1).join(' ') || "Buyer";

          const response = await fetch("/api/initiatePaychangu", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: order.id,
              total: order.total || order.totalPrice,
              firstName,
              lastName,
              email: authUser.email || "buyer@shopeasy.mw"
            })
          });

          if (!response.ok) {
            throw new Error("Paychangu integration endpoint failed.");
          }

          const resData = await response.json();
          if (resData.paymentUrl) {
            showToast("Redirecting to Paychangu portal...", "success");
            setTimeout(() => {
              window.location.href = resData.paymentUrl;
            }, 800);
          } else {
            throw new Error("Missing payment URL");
          }
        } catch (err) {
          hideLoading(payBtn);
          showToast("Payment setup failed. Try again.", "danger");
          console.error(err);
        }
      });
    }

    // 2. Cancel Order
    const cancelBtn = card.querySelector('.cancel-order-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to cancel this order?")) {
          showLoading(cancelBtn, 'Cancelling...');
          try {
            await updateDoc(doc(db, 'orders', order.id), {
              status: 'cancelled',
              updatedAt: serverTimestamp()
            });
            showToast("Order cancelled successfully.", "success");
            setTimeout(() => location.reload(), 1000);
          } catch (err) {
            hideLoading(cancelBtn);
            showToast("Could not cancel order.", "danger");
            handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
          }
        }
      });
    }

    // 3. Contact Seller
    const contactBtn = card.querySelector('.contact-seller-btn');
    if (contactBtn) {
      contactBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sellerId = order.items?.[0]?.sellerId;
        if (!sellerId) {
          showToast("Seller information not found.", "warning");
          return;
        }
        if (sellerId === authUser.uid) {
          showToast("You are the seller of this order.", "warning");
          return;
        }

        showLoading(contactBtn, 'Loading chat...');
        try {
          const convId = [authUser.uid, sellerId].sort().join("_");
          const convRef = doc(db, "conversations", convId);
          const convSnap = await getDoc(convRef);

          if (convSnap.exists()) {
            redirect(`chat.html?id=${convId}&name=${encodeURIComponent(storeName)}`);
          } else {
            // Setup conversation document
            await setDoc(convRef, {
              id: convId,
              buyerId: authUser.uid,
              buyerName: authUserData?.name || authUser.displayName || "Buyer",
              sellerId: sellerId,
              sellerName: storeName,
              lastMessage: `Hello, I'm contacting you regarding Order #${order.id.substring(0, 8).toUpperCase()}`,
              lastMessageAt: serverTimestamp(),
              lastMessageTime: serverTimestamp(),
              unreadCountBuyer: 0,
              unreadCountSeller: 1,
              updatedAt: serverTimestamp()
            });

            await addDoc(collection(db, `conversations/${convId}/messages`), {
              senderId: authUser.uid,
              senderName: authUserData?.name || authUser.displayName || "Buyer",
              type: 'text',
              content: `Hello, I'm contacting you regarding Order #${order.id.substring(0, 8).toUpperCase()}`,
              text: `Hello, I'm contacting you regarding Order #${order.id.substring(0, 8).toUpperCase()}`,
              timestamp: serverTimestamp(),
              createdAt: serverTimestamp(),
              read: false
            });

            redirect(`chat.html?id=${convId}&name=${encodeURIComponent(storeName)}`);
          }
        } catch (err) {
          hideLoading(contactBtn);
          showToast("Could not setup conversation channel.", "danger");
          console.error(err);
        }
      });
    }

    // 4. Confirm Receipt
    const receiveBtn = card.querySelector('.receive-order-btn');
    if (receiveBtn) {
      receiveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm("Confirm you received this order? This will mark the order as completed.")) {
          showLoading(receiveBtn, 'Confirming...');
          try {
            await updateDoc(doc(db, 'orders', order.id), {
              status: 'completed',
              completedAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });

            // Notify seller
            await addDoc(collection(db, "notifications"), {
              recipientId: order.items?.[0]?.sellerId,
              title: "Order Completed! 🎉",
              body: `Buyer confirmed receipt of Order #${order.id.substring(0, 8).toUpperCase()}`,
              orderId: order.id,
              read: false,
              createdAt: serverTimestamp()
            });

            showToast("Receipt confirmed. Thank you!", "success");
            setTimeout(() => location.reload(), 1000);
          } catch (err) {
            hideLoading(receiveBtn);
            showToast("Failed to confirm receipt.", "danger");
            handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
          }
        }
      });
    }

    // 5. Buy Again / Shop Again
    const buyAgainBtn = card.querySelector('.buy-again-btn');
    if (buyAgainBtn) {
      buyAgainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const firstProduct = order.items?.[0];
        if (firstProduct?.id || firstProduct?.productId) {
          redirect(`product.html?id=${firstProduct.productId || firstProduct.id}`);
        } else {
          redirect('shop.html');
        }
      });
    }

    // 6. Delete Cancelled Order
    const deleteBtn = card.querySelector('.delete-order-link');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this order from your history? This action is irreversible.")) {
          try {
            await deleteDoc(doc(db, 'orders', order.id));
            showToast("Order removed successfully.", "success");
            card.remove();
            
            // Check if lists is now empty
            if (container.children.length === 0) {
              fetchOrders(false);
            }
          } catch (err) {
            showToast("Could not remove order.", "danger");
            handleFirestoreError(err, OperationType.DELETE, `orders/${order.id}`);
          }
        }
      });
    }

    // 7. Report Problem (Dispute) Link
    const reportLink = card.querySelector('.report-problem-link');
    if (reportLink) {
      reportLink.addEventListener('click', (e) => {
        e.stopPropagation();
        redirect(`dispute.html?orderId=${order.id}`);
      });
    }

    // 8. Write Review Modal Launcher
    const reviewBtn = card.querySelector('.write-review-btn');
    if (reviewBtn) {
      reviewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openReviewFormModal(order);
      });
    }

    return card;
  };

  // POLISHED REVIEW MODAL CREATION & ANIMATION
  const openReviewFormModal = (order) => {
    // Remove existing review modal if any
    const existingModal = document.getElementById('review-form-modal');
    if (existingModal) existingModal.remove();

    const items = order.items || [];
    if (items.length === 0) {
      showToast("No products found in this order to review.", "warning");
      return;
    }

    // Construct modal HTML
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'review-form-modal';
    
    // Default select first item
    let selectedProductId = items[0].productId || items[0].id;

    modal.innerHTML = `
      <div class="modal__container" style="max-width: 420px; border-radius: 16px;">
        <div class="modal__header">
          <h3 class="modal__title">Write a Review</h3>
          <span class="modal__close" id="modal-close-review">&times;</span>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <p style="font-size: 0.8rem; color: var(--grey-600); line-height: 1.45;">
            Share your feedback on the products purchased. Select an item to write a review for:
          </p>

          <!-- Select Product Dropdown -->
          <div class="form-group">
            <label style="font-size: 0.75rem; font-weight: 800; color: var(--secondary); margin-bottom: 4px; display: block;">Select Product</label>
            <select class="form-select" id="review-product-select" style="width: 100%; padding: 10px; border-radius: 8px; border: 1.5px solid var(--grey-400); font-size: 0.85rem; font-weight: 600;">
              ${items.map(item => `
                <option value="${item.productId || item.id}">${item.name}</option>
              `).join('')}
            </select>
          </div>

          <!-- Product Preview Thumbnail -->
          <div id="review-product-preview" style="display: flex; align-items: center; gap: 10px; background: var(--grey-100); padding: 10px; border-radius: 8px; border: 1px solid var(--grey-200);">
            <img id="preview-item-img" src="${items[0].image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">
            <span id="preview-item-name" style="font-size: 0.8rem; font-weight: 700; color: var(--secondary); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${items[0].name}</span>
          </div>

          <!-- Interactive Rating Stars -->
          <div style="text-align: center;">
            <div style="font-size: 0.8rem; font-weight: 800; color: var(--secondary);">Rate your experience</div>
            <div class="star-rating" id="review-star-rating">
              <svg class="active" data-value="1" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <svg class="active" data-value="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <svg class="active" data-value="3" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <svg class="active" data-value="4" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <svg class="active" data-value="5" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
          </div>

          <!-- Review Textarea -->
          <div class="form-group">
            <label style="font-size: 0.75rem; font-weight: 800; color: var(--secondary); margin-bottom: 4px; display: block;">Review Comment</label>
            <textarea id="review-comment" class="form-input" placeholder="How was the product? Speak about the delivery speed, quality, and matching description..." style="width: 100%; height: 90px; border-radius: 8px; border: 1.5px solid var(--grey-400); padding: 10px; font-size: 0.8rem; resize: none;"></textarea>
            <div id="review-counter" style="text-align: right; font-size: 0.65rem; color: var(--grey-600); font-weight: 700; margin-top: 4px;">0/500 characters</div>
          </div>

          <!-- Submit Button -->
          <button class="btn btn--primary btn--full" id="submit-review-btn" style="padding: 12px; font-weight: 800;">Submit Review</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Fade and slide in
    setTimeout(() => {
      modal.classList.add('modal--visible');
    }, 10);

    // Close Actions
    const closeBtn = modal.querySelector('#modal-close-review');
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('modal--visible');
      setTimeout(() => modal.remove(), 200);
    });

    // Handle Dropdown Change to update thumbnail preview
    const select = modal.querySelector('#review-product-select');
    select.addEventListener('change', (e) => {
      selectedProductId = e.target.value;
      const matched = items.find(it => (it.productId || it.id) === selectedProductId);
      if (matched) {
        modal.querySelector('#preview-item-img').src = matched.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80';
        modal.querySelector('#preview-item-name').textContent = matched.name;
      }
    });

    // Star rating selection
    let activeRating = 5;
    const starRow = modal.querySelector('#review-star-rating');
    const stars = starRow.querySelectorAll('svg');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        const value = parseInt(star.dataset.value);
        activeRating = value;
        stars.forEach(s => {
          if (parseInt(s.dataset.value) <= value) {
            s.classList.add('active');
          } else {
            s.classList.remove('active');
          }
        });
      });
    });

    // Character counter for comment
    const textarea = modal.querySelector('#review-comment');
    const counter = modal.querySelector('#review-counter');
    textarea.addEventListener('input', () => {
      const chars = textarea.value.length;
      counter.textContent = `${chars}/500 characters`;
      if (chars > 500) {
        textarea.value = textarea.value.slice(0, 500);
        counter.textContent = `500/500 characters`;
      }
    });

    // Submit Review Doc Action
    const submitBtn = modal.querySelector('#submit-review-btn');
    submitBtn.addEventListener('click', async () => {
      const textVal = textarea.value.trim();
      if (!textVal) {
        showToast("Please provide a feedback comment.", "warning");
        return;
      }

      showLoading(submitBtn, 'Submitting...');
      try {
        // Save review document
        await addDoc(collection(db, 'reviews'), {
          productId: selectedProductId,
          buyerId: authUser.uid,
          buyerName: authUserData?.name || authUser.displayName || 'Malawi Buyer',
          rating: activeRating,
          text: textVal,
          photos: [],
          helpfulCount: 0,
          createdAt: serverTimestamp()
        });

        // Update the order reference so it doesn't prompt for review again
        await updateDoc(doc(db, 'orders', order.id), {
          reviewSubmitted: true,
          updatedAt: serverTimestamp()
        });

        showToast("Review submitted! Thank you.", "success");
        modal.classList.remove('modal--visible');
        setTimeout(() => {
          modal.remove();
          location.reload();
        }, 1200);

      } catch (err) {
        hideLoading(submitBtn);
        showToast("Could not submit review.", "danger");
        handleFirestoreError(err, OperationType.WRITE, `reviews/${selectedProductId}`);
      }
    });
  };
});
