/**
 * ShopEasy Shopping Cart Page Control Module
 */

import { auth, db } from "../firebase-config.js";
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDoc,
  updateDoc, 
  deleteDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { injectHeaderAndNav, renderEmptyState, renderErrorState } from "../ui.js";
import { formatMWK, showToast, redirect, handleFirestoreError, OperationType } from "../utils.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Inject navigation
  injectHeaderAndNav("cart");

  const container = document.getElementById("cart-items-container");
  const loader = document.getElementById("cart-loader");
  const emptyState = document.getElementById("cart-empty-state");
  const clearAllBtn = document.getElementById("clear-all-btn");
  const summarySticky = document.getElementById("cart-summary-sticky");
  
  const selectAllCheckbox = document.getElementById("select-all-checkbox");
  const stickyTotalPriceEl = document.getElementById("sticky-total-price");
  const stickyCheckoutBtn = document.getElementById("sticky-checkout-btn");
  const cartHeaderTitle = document.getElementById("cart-header-title");

  let unsubscribeCart = null;
  let cartItemsList = [];
  const sellerNameCache = new Map(); // Local cache to avoid redundant profile reads

  // 2. Listen to Authentication State
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (unsubscribeCart) unsubscribeCart();
      
      loader.style.display = "none";
      emptyState.style.display = "none";
      clearAllBtn.style.display = "none";
      summarySticky.style.display = "none";
      container.style.display = "block";
      
      container.innerHTML = `
        <div style="width: 100%; padding: 24px 0;">
          ${renderEmptyState(
            "user",
            "Please Sign In",
            "You must be signed in to access your shopping cart and complete purchases.",
            "Sign In",
            "login.html"
          )}
        </div>
      `;
      return;
    }

    // 3. Listen to reactive Cart Changes in Firestore
    const cartPath = `carts/${user.uid}/items`;
    
    unsubscribeCart = onSnapshot(collection(db, cartPath), async (snapshot) => {
      loader.style.display = "none";
      
      if (snapshot.empty) {
        cartItemsList = [];
        container.style.display = "none";
        clearAllBtn.style.display = "none";
        summarySticky.style.display = "none";
        emptyState.style.display = "block";
        if (cartHeaderTitle) cartHeaderTitle.innerHTML = "<span>🛒 Cart (0)</span>";
        return;
      }

      emptyState.style.display = "none";
      clearAllBtn.style.display = "block";
      container.style.display = "flex";
      summarySticky.style.display = "flex";

      // Keep tracking items locally
      const items = [];
      snapshot.forEach(snapDoc => {
        const data = snapDoc.data();
        data.id = snapDoc.id;
        items.push(data);
      });
      cartItemsList = items;

      if (cartHeaderTitle) {
        cartHeaderTitle.innerHTML = `<span>🛒 Cart (${cartItemsList.length})</span>`;
      }

      // Pre-fetch and cache store names for all unique sellers
      const uniqueSellers = [...new Set(items.map(i => i.sellerId).filter(Boolean))];
      await Promise.all(uniqueSellers.map(async (sellerId) => {
        if (!sellerNameCache.has(sellerId)) {
          try {
            const sellerSnap = await getDoc(doc(db, "users", sellerId));
            if (sellerSnap.exists()) {
              const sellerData = sellerSnap.data();
              sellerNameCache.set(sellerId, sellerData.storeName || `Seller (${sellerId.substr(0, 5)})`);
            } else {
              sellerNameCache.set(sellerId, "Local Seller");
            }
          } catch (err) {
            console.error("Error loading seller name:", err);
            sellerNameCache.set(sellerId, "Local Seller");
          }
        }
      }));

      // Render items grouped by seller store
      renderGroupedCart(user.uid);
      
    }, (error) => {
      loader.style.display = "none";
      container.style.display = "block";
      container.innerHTML = renderErrorState("Failed to sync shopping cart items.");
      handleFirestoreError(error, OperationType.LIST, cartPath);
    });
  });

  // 4. Render Grouped Cart Items
  const renderGroupedCart = (uid) => {
    container.innerHTML = "";

    // Group items by sellerId
    const groups = {};
    cartItemsList.forEach(item => {
      const sId = item.sellerId || "unknown_seller";
      if (!groups[sId]) groups[sId] = [];
      groups[sId].push(item);
    });

    // Render each group
    Object.keys(groups).forEach(sellerId => {
      const itemsInGroup = groups[sellerId];
      const storeName = sellerNameCache.get(sellerId) || "Local Seller";

      const groupEl = document.createElement("div");
      groupEl.className = "store-group";

      // Store group header
      groupEl.innerHTML = `
        <div class="store-header">
          <span style="font-size: 1rem;">🏪</span>
          <span class="store-header__title">${storeName}</span>
        </div>
      `;

      // Render rows inside group
      itemsInGroup.forEach(item => {
        const row = document.createElement("div");
        row.className = "cart-row";
        row.id = `row-${item.id}`;

        // Checked state logic: Default checked unless already unchecked in state
        const isChecked = item.selected !== false;

        row.innerHTML = `
          <input type="checkbox" class="custom-checkbox item-checkout-checkbox" data-id="${item.id}" ${isChecked ? "checked" : ""}>
          <img src="${item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80'}" alt="${item.name}" class="cart-row__img">
          <div class="cart-row__info">
            <h4 class="cart-row__name">${item.name || "Product Listing"}</h4>
            ${item.variant ? `<span class="cart-row__variant">Variant: ${item.variant}</span>` : ""}
            <div class="cart-row__price">${formatMWK(item.price)}</div>
            <div class="cart-row__controls-row">
              <div class="cart-row__controls">
                <button class="cart-qty-btn btn-minus" data-id="${item.id}">&minus;</button>
                <span class="cart-qty-val" id="qty-${item.id}">${item.quantity || 1}</span>
                <button class="cart-qty-btn btn-plus" data-id="${item.id}">&plus;</button>
              </div>
            </div>
          </div>
          <button class="cart-row__delete btn-delete" data-id="${item.id}" aria-label="Remove item">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        `;

        // Quantity Minus Logic
        row.querySelector(".btn-minus").addEventListener("click", async () => {
          const currentQty = item.quantity || 1;
          if (currentQty <= 1) {
            // Trigger exit animation then delete
            animateAndRemoveRow(item.id, uid);
          } else {
            try {
              await updateDoc(doc(db, `carts/${uid}/items`, item.id), {
                quantity: currentQty - 1
              });
            } catch (err) {
              showToast("Could not decrement quantity.", "danger");
            }
          }
        });

        // Quantity Plus Logic
        row.querySelector(".btn-plus").addEventListener("click", async () => {
          const currentQty = item.quantity || 1;
          try {
            await updateDoc(doc(db, `carts/${uid}/items`, item.id), {
              quantity: currentQty + 1
            });
          } catch (err) {
            showToast("Could not increment quantity.", "danger");
          }
        });

        // Delete Row Logic
        row.querySelector(".btn-delete").addEventListener("click", () => {
          animateAndRemoveRow(item.id, uid);
        });

        // Checkbox Interaction
        row.querySelector(".item-checkout-checkbox").addEventListener("change", (e) => {
          // Store checkbox selected value locally on the item structure
          item.selected = e.target.checked;
          recalculateSelectedTotals();
        });

        groupEl.appendChild(row);
      });

      container.appendChild(groupEl);
    });

    recalculateSelectedTotals();
  };

  // 5. Animate & Remove Row Helper
  const animateAndRemoveRow = (itemId, uid) => {
    const rowEl = document.getElementById(`row-${itemId}`);
    if (rowEl) {
      rowEl.classList.add("cart-row-removed");
      setTimeout(async () => {
        try {
          await deleteDoc(doc(db, `carts/${uid}/items`, itemId));
          showToast("Item removed from cart.", "success");
        } catch (error) {
          showToast("Could not remove item.", "danger");
        }
      }, 250); // matches CSS fadeOut transition time
    }
  };

  // 6. Recalculate Totals based on Checked Items
  const recalculateSelectedTotals = () => {
    let totalValue = 0;
    let selectedCount = 0;
    let totalAvailableChecked = 0;

    const checkboxes = document.querySelectorAll(".item-checkout-checkbox");
    checkboxes.forEach(cb => {
      const itemId = cb.dataset.id;
      const item = cartItemsList.find(i => i.id === itemId);
      if (item) {
        if (cb.checked) {
          totalValue += Number(item.price || 0) * Number(item.quantity || 1);
          selectedCount++;
          totalAvailableChecked++;
        }
      }
    });

    // Update sticky panel elements
    if (stickyTotalPriceEl) {
      stickyTotalPriceEl.textContent = formatMWK(totalValue);
    }
    if (stickyCheckoutBtn) {
      stickyCheckoutBtn.disabled = selectedCount === 0;
      stickyCheckoutBtn.innerHTML = `<span>Checkout (${selectedCount} selected)</span>`;
    }

    // Update select-all checkbox state
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = checkboxes.length > 0 && totalAvailableChecked === checkboxes.length;
    }
  };

  // 7. Select All Event Listener
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", (e) => {
      const checkedState = e.target.checked;
      const checkboxes = document.querySelectorAll(".item-checkout-checkbox");
      checkboxes.forEach(cb => {
        cb.checked = checkedState;
        const item = cartItemsList.find(i => i.id === cb.dataset.id);
        if (item) item.selected = checkedState;
      });
      recalculateSelectedTotals();
    });
  }

  // 8. Clear All Action
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user || cartItemsList.length === 0) return;

      const confirmClear = confirm("Are you sure you want to empty your entire cart?");
      if (!confirmClear) return;

      try {
        const batch = writeBatch(db);
        cartItemsList.forEach(item => {
          const docRef = doc(db, `carts/${user.uid}/items`, item.id);
          batch.delete(docRef);
        });
        await batch.commit();
        showToast("Cart cleared completely.", "success");
      } catch (err) {
        showToast("Failed to empty cart. Please try again.", "danger");
      }
    });
  }

  // 9. Process Sticky Checkout Button Click
  if (stickyCheckoutBtn) {
    stickyCheckoutBtn.addEventListener("click", () => {
      const checkedItems = [];
      const checkboxes = document.querySelectorAll(".item-checkout-checkbox");
      
      checkboxes.forEach(cb => {
        if (cb.checked) {
          const item = cartItemsList.find(i => i.id === cb.dataset.id);
          if (item) {
            checkedItems.push(item);
          }
        }
      });

      if (checkedItems.length === 0) {
        showToast("Please select at least one item to checkout.", "warning");
        return;
      }

      // Save selected items to sessionStorage
      sessionStorage.setItem("selectedCartItems", JSON.stringify(checkedItems));
      redirect("checkout.html");
    });
  }
});
