/**
 * ShopEasy Dispute / Report Problem Control Module
 */

import { auth, db, storage } from '../firebase-config.js';
import { 
  doc, 
  getDoc, 
  setDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

import { injectHeaderAndNav, renderErrorState } from '../ui.js';
import { getUrlParam, redirect, formatMWK, handleFirestoreError, OperationType, showToast, showLoading, hideLoading } from '../utils.js';
import { initAuth } from '../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Inject navigation
  injectHeaderAndNav('account');

  const orderId = getUrlParam('orderId');
  const mainContainer = document.getElementById('dispute-form-container');
  const backBtn = document.getElementById('dispute-back-btn');

  // Handle Header Back Button Click
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (orderId) {
        redirect(`order-detail.html?id=${orderId}`);
      } else {
        redirect('orders.html');
      }
    });
  }

  if (!orderId) {
    mainContainer.innerHTML = renderErrorState('Invalid Order Reference for Reporting.');
    return;
  }

  // Initialize Auth
  const authState = await initAuth({ requireAuth: true });
  const authUser = authState.user;
  const authUserData = authState.userData;

  if (!authUser) {
    mainContainer.innerHTML = renderErrorState('Please sign in to submit a dispute.');
    return;
  }

  let order = null;

  // 1. Fetch Order Recap details
  try {
    const orderRef = doc(db, 'orders', orderId);
    const docSnap = await getDoc(orderRef);

    if (!docSnap.exists()) {
      mainContainer.innerHTML = renderErrorState('Order does not exist or has been removed.');
      return;
    }

    order = docSnap.data();
    order.id = docSnap.id;

    // Security check
    if (order.buyerId !== authUser.uid) {
      mainContainer.innerHTML = renderErrorState('Unauthorized access to report on this order.');
      return;
    }

    renderOrderRecapCard(order);

  } catch (err) {
    mainContainer.innerHTML = renderErrorState('Failed to retrieve order context.');
    handleFirestoreError(err, OperationType.GET, `orders/${orderId}`);
    return;
  }

  // Core setup variables
  const disputeForm = document.getElementById('dispute-form');
  const descTextarea = document.getElementById('dispute-desc');
  const descCounter = document.getElementById('dispute-desc-counter');
  const descError = document.getElementById('dispute-desc-error');
  const fileInput = document.getElementById('dispute-file-input');
  const photosGrid = document.getElementById('photos-grid');
  const uploadTrigger = document.getElementById('upload-trigger');
  const progressBar = document.getElementById('dispute-progress-bar');
  const progressFill = document.getElementById('dispute-progress-fill');
  const submitBtn = document.getElementById('dispute-submit-btn');

  let selectedFiles = [];

  // 2. Render Recap details card above form
  function renderOrderRecapCard(o) {
    const recap = document.createElement('div');
    recap.className = 'card';
    recap.style.padding = '14px';
    recap.style.marginBottom = '16px';
    recap.style.display = 'flex';
    recap.style.alignItems = 'center';
    recap.style.gap = '12px';
    recap.style.border = '1.5px solid var(--grey-200)';

    const item = o.items?.[0] || {};
    const formattedDate = o.createdAt?.toDate 
      ? o.createdAt.toDate().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Recently';

    recap.innerHTML = `
      <img src="${item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'}" style="width: 54px; height: 54px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid var(--grey-200);">
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <span style="font-size: 0.85rem; font-weight: 850; color: var(--secondary);">Order ID: #${o.id.substring(0, 8).toUpperCase()}</span>
        <span style="font-size: 0.75rem; color: var(--grey-600); font-weight: 600;">Store: ${o.storeName || item.storeName || "ShopEasy Seller"}</span>
        <span style="font-size: 0.75rem; color: var(--grey-600); font-weight: 600;">Placed: ${formattedDate} &bull; Total: <strong style="color: var(--primary); font-weight: 800;">${formatMWK(o.total || o.totalPrice || 0)}</strong></span>
      </div>
    `;

    mainContainer.insertBefore(recap, mainContainer.firstChild);
  }

  // 3. Live Character Counter for Textarea
  descTextarea.addEventListener('input', () => {
    const length = descTextarea.value.length;
    descCounter.textContent = `${length}/1000`;
    
    if (length < 30) {
      descError.textContent = `Need at least ${30 - length} more characters`;
      descCounter.style.color = 'var(--danger)';
    } else if (length > 1000) {
      descTextarea.value = descTextarea.value.slice(0, 1000);
      descCounter.textContent = `1000/1000`;
      descError.textContent = '';
      descCounter.style.color = 'var(--success)';
    } else {
      descError.textContent = '';
      descCounter.style.color = 'var(--success)';
    }
  });

  // 4. File Upload Previews Handler
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Limit to max 5
      if (selectedFiles.length >= 5) {
        showToast("Maximum of 5 photos is allowed.", "warning");
        break;
      }

      // Check file is image
      if (!file.type.startsWith('image/')) {
        showToast("Only image files are permitted.", "warning");
        continue;
      }

      selectedFiles.push(file);
    }

    renderPhotoPreviews();
    fileInput.value = ''; // clear for re-selection
  });

  // Render previews grid
  function renderPhotoPreviews() {
    // Keep upload trigger, remove previous preview elements
    const previousPreviews = photosGrid.querySelectorAll('.photo-preview-box');
    previousPreviews.forEach(el => el.remove());

    selectedFiles.forEach((file, index) => {
      const previewBox = document.createElement('div');
      previewBox.className = 'photo-preview-box';
      
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      
      const removeBtn = document.createElement('span');
      removeBtn.className = 'photo-preview-box__remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedFiles.splice(index, 1);
        renderPhotoPreviews();
      });

      previewBox.appendChild(img);
      previewBox.appendChild(removeBtn);
      
      // Insert preview before upload trigger
      photosGrid.insertBefore(previewBox, uploadTrigger);
    });

    // Hide upload trigger if limit is reached
    if (selectedFiles.length >= 5) {
      uploadTrigger.classList.add('hidden');
    } else {
      uploadTrigger.classList.remove('hidden');
    }
  }

  // 5. Submit Form Action with Resumable Upload progress
  disputeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedReasonNode = document.querySelector('input[name="dispute-reason"]:checked');
    if (!selectedReasonNode) {
      showToast("Please select a report reason.", "warning");
      return;
    }

    const reason = selectedReasonNode.value;
    const description = descTextarea.value.trim();
    const resolution = document.getElementById('dispute-resolution').value;

    if (description.length < 30) {
      showToast("Please expand your description (minimum 30 characters required).", "warning");
      descTextarea.focus();
      return;
    }

    // Disable Form fields to protect double submissions
    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading assets...";
    descTextarea.disabled = true;
    document.querySelectorAll('input[name="dispute-reason"]').forEach(radio => radio.disabled = true);
    document.getElementById('dispute-resolution').disabled = true;
    uploadTrigger.classList.add('hidden');

    const imageUrls = [];

    try {
      // Step A: Resumable uploads for photos if any
      if (selectedFiles.length > 0) {
        progressBar.style.display = 'block';

        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          const fileExtension = file.name.split('.').pop();
          const cleanFileName = `${Date.now()}_dispute_item_${i}.${fileExtension}`;
          const storagePath = `disputes/${order.id}/${cleanFileName}`;
          
          const storageRef = ref(storage, storagePath);
          const uploadTask = uploadBytesResumable(storageRef, file);

          await new Promise((resolve, reject) => {
            uploadTask.on('state_changed', 
              (snapshot) => {
                const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                progressFill.style.width = `${percent}%`;
                submitBtn.textContent = `Uploading Photo ${i + 1}/${selectedFiles.length} (${percent}%)`;
              }, 
              (error) => {
                console.error("Firebase Storage Upload Error: ", error);
                reject(error);
              }, 
              async () => {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                imageUrls.push(downloadUrl);
                resolve();
              }
            );
          });
        }
        
        progressFill.style.width = '100%';
      }

      // Step B: Write to Disputes Collection
      submitBtn.textContent = "Filing dispute...";
      const disputeRef = doc(db, 'disputes', order.id);
      
      await setDoc(disputeRef, {
        orderId: order.id,
        buyerId: authUser.uid,
        buyerName: order.buyerName || authUserData?.name || authUser.displayName || "Malawi Buyer",
        buyerPhone: order.buyerPhone || authUserData?.phone || "",
        sellerId: order.items?.[0]?.sellerId || "",
        storeId: order.items?.[0]?.sellerId || "",
        storeName: order.storeName || order.items?.[0]?.storeName || "ShopEasy Seller",
        reason,
        description,
        photos: imageUrls,
        resolution,
        status: 'open',
        createdAt: serverTimestamp()
      });

      // Step C: Update Order status to dispute_open
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'dispute_open',
        updatedAt: serverTimestamp()
      });

      // Step D: Write Notification for Admin
      await addDoc(collection(db, "notifications"), {
        recipientId: 'admin',
        title: 'New Dispute Opened ⚠️',
        body: `Order #${order.id.substring(0, 8).toUpperCase()} has a dispute filed. Reason: ${reason}.`,
        orderId: order.id,
        read: false,
        createdAt: serverTimestamp()
      });

      // Show Success Dialog Banner State
      mainContainer.innerHTML = `
        <div class="card" style="padding: 32px 16px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; border: 1.5px solid var(--grey-200);">
          <div style="font-size: 3rem;">✅</div>
          <h3 style="font-size: 1.2rem; font-weight: 850; color: var(--secondary);">Report Submitted Successfully</h3>
          <p style="font-size: 0.85rem; color: var(--grey-600); line-height: 1.5; max-width: 320px;">
            We have recorded your dispute for Order #${order.id.substring(0, 8).toUpperCase()}. Our Customer Support team will respond to you within 48 hours.
          </p>
          <button class="btn btn--primary" id="dispute-success-back-btn" style="margin-top: 10px; width: 100%; max-width: 200px; padding: 10px;">Back to Orders</button>
        </div>
      `;

      // Bind success page buttons
      const okBtn = document.getElementById('dispute-success-back-btn');
      if (okBtn) {
        okBtn.addEventListener('click', () => {
          redirect('orders.html');
        });
      }

      showToast("Report submitted successfully.", "success");
      
      // Auto redirect fallback
      setTimeout(() => {
        redirect('orders.html');
      }, 4000);

    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Report";
      descTextarea.disabled = false;
      document.querySelectorAll('input[name="dispute-reason"]').forEach(radio => radio.disabled = false);
      document.getElementById('dispute-resolution').disabled = false;
      progressBar.style.display = 'none';
      progressFill.style.width = '0%';
      uploadTrigger.classList.remove('hidden');

      showToast("Could not file report. Please retry.", "danger");
      handleFirestoreError(err, OperationType.WRITE, `disputes/${order.id}`);
    }
  });
});
