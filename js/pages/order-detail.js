/**
 * ShopEasy Order Detail Page Control Module
 */

import { auth, db } from '../firebase-config.js';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  setDoc,
  addDoc,
  collection,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { injectHeaderAndNav, renderErrorState } from '../ui.js';
import { getUrlParam, formatMWK, redirect, handleFirestoreError, OperationType, showToast, showLoading, hideLoading } from '../utils.js';
import { initAuth } from '../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Inject navigation
  injectHeaderAndNav('account');

  const orderId = getUrlParam('id');
  const container = document.getElementById('order-details-content');

  if (!orderId) {
    container.innerHTML = renderErrorState('Invalid Order Reference.');
    return;
  }

  // Initialize Auth
  const authState = await initAuth({ requireAuth: true });
  const authUser = authState.user;
  const authUserData = authState.userData;

  if (!authUser) {
    container.innerHTML = renderErrorState('Please sign in to view order details.');
    return;
  }

  try {
    const orderRef = doc(db, 'orders', orderId);
    const docSnap = await getDoc(orderRef);
    
    if (!docSnap.exists()) {
      container.innerHTML = renderErrorState('Order does not exist or has been removed.');
      return;
    }

    const order = docSnap.data();
    order.id = docSnap.id;

    // Security Guard: Ensure buyer is owner
    if (order.buyerId !== authUser.uid) {
      container.innerHTML = renderErrorState('Unauthorized access to this order.');
      return;
    }

    renderOrderDetails(order);
  } catch (error) {
    container.innerHTML = renderErrorState('Failed to load order details.');
    handleFirestoreError(error, OperationType.GET, `orders/${orderId}`);
  }

  // Render Order Details Screen
  function renderOrderDetails(order) {
    const formattedDate = order.createdAt?.toDate 
      ? order.createdAt.toDate().toLocaleString('en-MW', { 
          day: 'numeric', month: 'short', year: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        })
      : 'Recently';

    const status = order.status || 'pending_payment';
    const storeName = order.storeName || order.items?.[0]?.storeName || "ShopEasy Seller";

    // Subtotal and Fee computations
    const items = order.items || [];
    const subtotal = items.reduce((sum, item) => sum + (item.price * (item.quantity || item.qty || 1)), 0);
    
    // Check delivery fee configuration
    let deliveryFee = 1500;
    if (order.deliveryFee !== undefined) {
      deliveryFee = order.deliveryFee;
    } else if (order.freeDelivery === true) {
      deliveryFee = 0;
    }
    const grandTotal = order.total || order.totalPrice || (subtotal + deliveryFee);

    // Build timeline details based on current state
    const timelineHtml = buildTimelineHtml(order);

    // Build delivery details
    const deliveryHtml = buildDeliveryHtml(order);

    // Actions configurations
    const actionsHtml = buildActionsHtml(order);

    container.innerHTML = `
      <!-- Order ID Banner Card -->
      <div class="card" style="padding: 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; font-weight: 800; color: var(--grey-600); text-transform: uppercase; letter-spacing: 0.5px;">Order Identifier</span>
          <span class="status-badge ${getBadgeClass(status)}">${getBadgeText(status)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
          <h3 id="order-id-display" style="font-size: 1.25rem; font-weight: 850; color: var(--secondary); letter-spacing: -0.5px;">#${order.id.substring(0, 8).toUpperCase()}</h3>
          <button id="copy-id-btn" style="background: none; border: none; color: var(--grey-600); cursor: pointer; display: flex; align-items: center;" title="Copy full ID">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
        <div style="font-size: 0.75rem; color: var(--grey-600); font-weight: 500;">📅 Ordered on ${formattedDate}</div>
      </div>

      <!-- Status Visual Timeline -->
      <section class="section" style="margin-bottom: 16px; background: var(--white); border-radius: var(--radius); border: 1.5px solid var(--grey-200); padding: 16px;">
        <h3 style="font-size: 0.85rem; font-weight: 800; color: var(--secondary); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--grey-100); padding-bottom: 8px; margin-bottom: 12px;">Status Track</h3>
        ${timelineHtml}
      </section>

      <!-- Items List -->
      <section class="section" style="margin-bottom: 16px;">
        <h3 class="checkout-section-title" style="margin-bottom: 8px;">Items In Order</h3>
        <div class="card" style="padding: 12px; display: flex; flex-direction: column; gap: 12px;">
          ${items.map(item => {
            const itemQty = item.quantity || item.qty || 1;
            return `
              <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--grey-100); padding-bottom: 10px; margin-bottom: 2px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <img src="${item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'}" alt="${item.name}" style="width: 48px; height: 48px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--grey-200);">
                  <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</span>
                    <span style="font-size: 0.75rem; color: var(--grey-600); font-weight: 600;">MWK ${Number(item.price).toLocaleString()} &times; ${itemQty}</span>
                  </div>
                </div>
                <span style="font-size: 0.85rem; font-weight: 800; color: var(--secondary);">${formatMWK(item.price * itemQty)}</span>
              </div>
            `;
          }).join('')}
          
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--grey-600); font-weight: 600; margin-top: 4px;">
            <span>Subtotal</span>
            <span>${formatMWK(subtotal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--grey-600); font-weight: 600;">
            <span>Delivery Fee</span>
            <span>${deliveryFee === 0 ? 'FREE' : formatMWK(deliveryFee)}</span>
          </div>
          <div style="border-top: 1px dashed var(--grey-200); margin: 6px 0;"></div>
          <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 0.95rem; color: var(--secondary);">
            <span>Grand Total</span>
            <span style="color: var(--primary); font-size: 1.05rem;">${formatMWK(grandTotal)}</span>
          </div>
        </div>
      </section>

      <!-- Delivery / Pick-up Point details -->
      <section class="section" style="margin-bottom: 24px;">
        <h3 class="checkout-section-title" style="margin-bottom: 8px;">Delivery Details</h3>
        ${deliveryHtml}
      </section>

      <!-- Actions Dock -->
      <div class="card" style="padding: 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; border: 1.5px solid var(--grey-200);">
        <h3 style="font-size: 0.8rem; font-weight: 800; color: var(--secondary); text-transform: uppercase;">Available Actions</h3>
        <div id="action-buttons-dock" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          ${actionsHtml}
        </div>
      </div>
    `;

    // Hook Clipboard copy button
    const copyBtn = document.getElementById('copy-id-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(order.id).then(() => {
          showToast("Full Order ID copied to clipboard!", "success");
        }).catch(err => {
          console.error("Clipboard write failed: ", err);
        });
      });
    }

    // Bind all action events
    bindActionButtons(order);
  }

  // Visual timelines generator
  function buildTimelineHtml(order) {
    const status = order.status || 'pending_payment';
    
    // Default four steps
    const steps = [
      { key: 'pending_payment', label: 'Order Placed', desc: 'Awaiting your payment to initiate processing.' },
      { key: 'processing', label: 'Processing', desc: 'The seller is verifying and packing your items.' },
      { key: 'ready', label: 'Ready for Dispatch', desc: 'Your package is ready for delivery or pick-up.' },
      { key: 'completed', label: 'Completed', desc: 'Order received and completed.' }
    ];

    if (status === 'cancelled') {
      return `
        <div class="timeline">
          <div class="timeline-step timeline-step--active">
            <div class="timeline-bullet" style="background-color: var(--danger); border-color: var(--danger);"></div>
            <div class="timeline-info">
              <div class="timeline-label" style="color: var(--danger);">🔴 Cancelled</div>
              <div class="timeline-time" style="font-size: 0.8rem; font-weight: 600; color: var(--grey-800);">Your order has been cancelled and closed.</div>
            </div>
          </div>
        </div>
      `;
    }

    if (status === 'dispute_open') {
      return `
        <div class="timeline">
          <div class="timeline-step timeline-step--active">
            <div class="timeline-bullet" style="background-color: var(--danger); border-color: var(--danger);"></div>
            <div class="timeline-info">
              <div class="timeline-label" style="color: var(--danger);">⚠️ Dispute Opened</div>
              <div class="timeline-time" style="font-size: 0.8rem; font-weight: 600; color: var(--grey-800);">A return or item problem was reported. ShopEasy team is reviewing.</div>
            </div>
          </div>
        </div>
      `;
    }

    let activeStepIndex = 0;
    if (status === 'processing') activeStepIndex = 1;
    if (status === 'ready') activeStepIndex = 2;
    if (status === 'completed') activeStepIndex = 3;

    return `
      <div class="timeline">
        ${steps.map((step, idx) => {
          let bulletClass = '';
          let stepClass = '';
          
          if (idx < activeStepIndex) {
            bulletClass = 'timeline-bullet--completed';
          } else if (idx === activeStepIndex) {
            bulletClass = 'timeline-bullet--current';
            stepClass = 'timeline-step--active';
          }

          return `
            <div class="timeline-step ${stepClass}">
              <div class="timeline-bullet ${bulletClass}"></div>
              <div class="timeline-info">
                <div class="timeline-label">${step.label}</div>
                <div class="timeline-time">${step.desc}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Delivery specifications compiler
  function buildDeliveryHtml(order) {
    const delivery = order.deliveryDetails || {};
    const deliveryType = order.deliveryType || 'home';

    if (deliveryType === 'home') {
      return `
        <div class="card" style="padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 0.8rem; color: var(--grey-800);">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--grey-100); padding-bottom: 4px;">
            <span style="font-weight: 800; color: var(--secondary);">🏡 Home Delivery</span>
          </div>
          <div>
            <span style="font-weight: 700; color: var(--secondary);">Recipient:</span> 
            ${delivery.name || order.buyerName || 'Local Buyer'}
          </div>
          <div>
            <span style="font-weight: 700; color: var(--secondary);">Phone:</span> 
            ${delivery.phone || order.buyerPhone || ''}
          </div>
          <div>
            <span style="font-weight: 700; color: var(--secondary);">Address:</span> 
            Area/Location: ${delivery.area || ''}, landmark: ${delivery.landmark || 'None'}
          </div>
          <div>
            <span style="font-weight: 700; color: var(--secondary);">City:</span> 
            ${delivery.city || order.city || 'Malawi'}
          </div>
          ${delivery.note ? `
            <div style="background-color: var(--grey-100); padding: 8px; border-radius: 6px; border-left: 3px solid var(--grey-400); font-style: italic; margin-top: 4px;">
              "${delivery.note}"
            </div>
          ` : ''}
        </div>
      `;
    } else {
      return `
        <div class="card" style="padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 0.8rem; color: var(--grey-800);">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--grey-100); padding-bottom: 4px;">
            <span style="font-weight: 800; color: var(--secondary);">📦 Pick-up Station</span>
          </div>
          <div>
            <span style="font-weight: 700; color: var(--secondary);">Station Point:</span> 
            ${delivery.pickupPoint || 'Central Station Hub'}
          </div>
          <div>
            <span style="font-weight: 700; color: var(--secondary);">Recipient Name:</span> 
            ${delivery.name || order.buyerName || 'Local Buyer'}
          </div>
          <div>
            <span style="font-weight: 700; color: var(--secondary);">Recipient Phone:</span> 
            ${delivery.phone || order.buyerPhone || ''}
          </div>
          <div>
            <span style="font-weight: 700; color: var(--secondary);">City Location:</span> 
            ${delivery.city || order.city || 'Malawi'}
          </div>
        </div>
      `;
    }
  }

  // Buttons string generator
  function buildActionsHtml(order) {
    const status = order.status || 'pending_payment';
    const createdAtTime = order.createdAt?.toDate ? order.createdAt.toDate().getTime() : Date.now();
    const isLessThanTwoHours = (Date.now() - createdAtTime) < (2 * 60 * 60 * 1000);

    if (status === 'pending_payment') {
      return `
        <button class="btn btn--primary pay-now-btn" style="flex: 1; min-width: 120px; font-size: 0.85rem; padding: 12px;">Pay Now</button>
        <button class="btn btn--outline cancel-order-btn" style="flex: 1; min-width: 120px; font-size: 0.85rem; padding: 12px;">Cancel Order</button>
      `;
    } else if (status === 'processing') {
      return `
        <button class="btn btn--outline contact-seller-btn" style="flex: 1; min-width: 120px; font-size: 0.85rem; padding: 12px;">Contact Seller</button>
        ${isLessThanTwoHours ? `<button class="btn btn--outline cancel-order-btn" style="flex: 1; min-width: 120px; font-size: 0.85rem; padding: 12px; color: var(--danger); border-color: var(--danger);">Cancel Order</button>` : ''}
      `;
    } else if (status === 'ready') {
      return `
        <button class="btn btn--primary receive-order-btn" style="flex: 1; min-width: 120px; font-size: 0.85rem; padding: 12px;">✓ I Received It</button>
        <button class="btn btn--outline contact-seller-btn" style="flex: 1; min-width: 120px; font-size: 0.85rem; padding: 12px;">Contact Seller</button>
      `;
    } else if (status === 'completed') {
      const isReviewed = order.reviewSubmitted || false;
      return `
        ${!isReviewed ? `<button class="btn btn--primary write-review-btn" style="flex: 1; min-width: 120px; font-size: 0.85rem; padding: 12px;">Write Review</button>` : '<span style="font-size: 0.8rem; color: var(--success); font-weight: 800; padding: 8px;">✅ Reviewed</span>'}
        <button class="btn btn--outline buy-again-btn" style="flex: 1; min-width: 120px; font-size: 0.85rem; padding: 12px;">Buy Again</button>
        <button class="btn-sm--link report-problem-link" style="width: 100%; text-align: center; margin-top: 8px;">Report Problem</button>
      `;
    } else if (status === 'cancelled') {
      return `
        <button class="btn btn--outline buy-again-btn" style="flex: 1; min-width: 120px; font-size: 0.85rem; padding: 12px;">Shop Again</button>
        <button class="btn-sm--link delete-order-link" style="width: 100%; text-align: center; margin-top: 8px; color: var(--danger);">Delete Order</button>
      `;
    } else if (status === 'dispute_open') {
      return `
        <button class="btn btn--outline contact-seller-btn" style="flex: 1; min-width: 120px; font-size: 0.85rem; padding: 12px;">Contact Seller</button>
        <div style="width: 100%; text-align: center; font-size: 0.75rem; color: var(--danger); font-weight: 700; margin-top: 6px;">Your dispute is being reviewed. We will reach out to you.</div>
      `;
    }
    return '';
  }

  // Active buttons binder
  function bindActionButtons(order) {
    const dock = document.getElementById('action-buttons-dock');
    if (!dock) return;

    // 1. Pay Now
    const payBtn = dock.querySelector('.pay-now-btn');
    if (payBtn) {
      payBtn.addEventListener('click', async () => {
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
            throw new Error("Paychangu initiation returned non-200 state.");
          }

          const resData = await response.json();
          if (resData.paymentUrl) {
            showToast("Redirecting to Paychangu portal...", "success");
            setTimeout(() => {
              window.location.href = resData.paymentUrl;
            }, 800);
          } else {
            throw new Error("Could not fetch checkout URL.");
          }
        } catch (err) {
          hideLoading(payBtn);
          showToast("Payment setup failed. Try again.", "danger");
          console.error(err);
        }
      });
    }

    // 2. Cancel Order
    const cancelBtn = dock.querySelector('.cancel-order-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
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
    const contactBtn = dock.querySelector('.contact-seller-btn');
    if (contactBtn) {
      contactBtn.addEventListener('click', async () => {
        const sellerId = order.items?.[0]?.sellerId;
        const storeName = order.storeName || order.items?.[0]?.storeName || "ShopEasy Seller";
        if (!sellerId) {
          showToast("Seller information not found.", "warning");
          return;
        }

        showLoading(contactBtn, 'Loading chat...');
        try {
          const convId = [authUser.uid, sellerId].sort().join("_");
          const convRef = doc(db, "conversations", convId);
          const convSnap = await getDoc(convRef);

          if (convSnap.exists()) {
            redirect(`/chat.html?id=${convId}&name=${encodeURIComponent(storeName)}`);
          } else {
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

            redirect(`/chat.html?id=${convId}&name=${encodeURIComponent(storeName)}`);
          }
        } catch (err) {
          hideLoading(contactBtn);
          showToast("Could not setup conversation channel.", "danger");
          console.error(err);
        }
      });
    }

    // 4. Confirm Receipt
    const receiveBtn = dock.querySelector('.receive-order-btn');
    if (receiveBtn) {
      receiveBtn.addEventListener('click', async () => {
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

    // 5. Buy Again
    const buyAgainBtn = dock.querySelector('.buy-again-btn');
    if (buyAgainBtn) {
      buyAgainBtn.addEventListener('click', () => {
        const firstProduct = order.items?.[0];
        if (firstProduct?.id || firstProduct?.productId) {
          redirect(`/product.html?id=${firstProduct.productId || firstProduct.id}`);
        } else {
          redirect('/shop.html');
        }
      });
    }

    // 6. Delete Order
    const deleteBtn = dock.querySelector('.delete-order-link');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm("Are you sure you want to delete this order from your history? This action is irreversible.")) {
          try {
            await deleteDoc(doc(db, 'orders', order.id));
            showToast("Order removed successfully.", "success");
            setTimeout(() => redirect('/orders.html'), 1000);
          } catch (err) {
            showToast("Could not remove order.", "danger");
            handleFirestoreError(err, OperationType.DELETE, `orders/${order.id}`);
          }
        }
      });
    }

    // 7. Report Problem (Dispute) Link
    const reportLink = dock.querySelector('.report-problem-link');
    if (reportLink) {
      reportLink.addEventListener('click', () => {
        redirect(`/dispute.html?orderId=${order.id}`);
      });
    }

    // 8. Write Review Modal Launcher
    const reviewBtn = dock.querySelector('.write-review-btn');
    if (reviewBtn) {
      reviewBtn.addEventListener('click', () => {
        openReviewFormModal(order);
      });
    }
  }

  // REUSABLE REVIEW FORM MODAL POPUP
  const openReviewFormModal = (order) => {
    const existingModal = document.getElementById('review-form-modal');
    if (existingModal) existingModal.remove();

    const items = order.items || [];
    if (items.length === 0) {
      showToast("No products found in this order to review.", "warning");
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'review-form-modal';
    
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

          <div class="form-group">
            <label style="font-size: 0.75rem; font-weight: 800; color: var(--secondary); margin-bottom: 4px; display: block;">Select Product</label>
            <select class="form-select" id="review-product-select" style="width: 100%; padding: 10px; border-radius: 8px; border: 1.5px solid var(--grey-400); font-size: 0.85rem; font-weight: 600;">
              ${items.map(item => `
                <option value="${item.productId || item.id}">${item.name}</option>
              `).join('')}
            </select>
          </div>

          <div id="review-product-preview" style="display: flex; align-items: center; gap: 10px; background: var(--grey-100); padding: 10px; border-radius: 8px; border: 1px solid var(--grey-200);">
            <img id="preview-item-img" src="${items[0].image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">
            <span id="preview-item-name" style="font-size: 0.8rem; font-weight: 700; color: var(--secondary); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${items[0].name}</span>
          </div>

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

          <div class="form-group">
            <label style="font-size: 0.75rem; font-weight: 800; color: var(--secondary); margin-bottom: 4px; display: block;">Review Comment</label>
            <textarea id="review-comment" class="form-input" placeholder="How was the product? Speak about the delivery speed, quality, and matching description..." style="width: 100%; height: 90px; border-radius: 8px; border: 1.5px solid var(--grey-400); padding: 10px; font-size: 0.8rem; resize: none;"></textarea>
            <div id="review-counter" style="text-align: right; font-size: 0.65rem; color: var(--grey-600); font-weight: 700; margin-top: 4px;">0/500 characters</div>
          </div>

          <button class="btn btn--primary btn--full" id="submit-review-btn" style="padding: 12px; font-weight: 800;">Submit Review</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    setTimeout(() => {
      modal.classList.add('modal--visible');
    }, 10);

    const closeBtn = modal.querySelector('#modal-close-review');
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('modal--visible');
      setTimeout(() => modal.remove(), 200);
    });

    const select = modal.querySelector('#review-product-select');
    select.addEventListener('change', (e) => {
      selectedProductId = e.target.value;
      const matched = items.find(it => (it.productId || it.id) === selectedProductId);
      if (matched) {
        modal.querySelector('#preview-item-img').src = matched.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80';
        modal.querySelector('#preview-item-name').textContent = matched.name;
      }
    });

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

    const submitBtn = modal.querySelector('#submit-review-btn');
    submitBtn.addEventListener('click', async () => {
      const textVal = textarea.value.trim();
      if (!textVal) {
        showToast("Please provide a feedback comment.", "warning");
        return;
      }

      showLoading(submitBtn, 'Submitting...');
      try {
        await addDoc(collection(db, 'reviews'), {
          productId: selectedProductId,
          buyerId: auth.currentUser.uid,
          buyerName: authUserData?.name || auth.currentUser.displayName || 'Malawi Buyer',
          rating: activeRating,
          text: textVal,
          photos: [],
          helpfulCount: 0,
          createdAt: serverTimestamp()
        });

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

  // Helper mappings
  function getBadgeClass(status) {
    if (status === 'pending_payment') return 'status-badge--pending';
    if (status === 'processing') return 'status-badge--processing';
    if (status === 'ready') return 'status-badge--ready';
    if (status === 'completed') return 'status-badge--completed';
    if (status === 'cancelled') return 'status-badge--cancelled';
    if (status === 'dispute_open') return 'status-badge--dispute';
    return 'status-badge--pending';
  }

  function getBadgeText(status) {
    if (status === 'pending_payment') return '🟡 Awaiting Payment';
    if (status === 'processing') return '🔵 Processing';
    if (status === 'ready') return '🟢 Ready';
    if (status === 'completed') return '✅ Completed';
    if (status === 'cancelled') return '❌ Cancelled';
    if (status === 'dispute_open') return '🔴 Dispute Open';
    return status.toUpperCase();
  }
});
