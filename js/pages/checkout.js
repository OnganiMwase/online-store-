/**
 * ShopEasy Checkout Page Control Module
 */

import { auth, db, functions } from "../firebase-config.js";
import { 
  collection, 
  doc, 
  getDoc,
  setDoc,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

import { formatMWK, showToast, showLoading, hideLoading, redirect, generateId, handleFirestoreError, OperationType } from "../utils.js";

document.addEventListener("DOMContentLoaded", () => {
  const stepPanel1 = document.getElementById("checkout-step-1");
  const stepPanel2 = document.getElementById("checkout-step-2");
  
  const stepDeliveryIndicator = document.getElementById("step-delivery-indicator");
  const stepPaymentIndicator = document.getElementById("step-payment-indicator");
  const stepLineDivider = document.getElementById("step-line-divider");

  const homeFields = document.getElementById("home-delivery-fields");
  const pickupFields = document.getElementById("pickup-fields");

  const deliveryForm = document.getElementById("delivery-details-form");
  const saveAddressCheckbox = document.getElementById("save-address-checkbox");

  const checkoutItemsContainer = document.getElementById("checkout-items-summary-container");
  const subtotalEl = document.getElementById("summary-subtotal-val");
  const totalEl = document.getElementById("summary-total-val");
  
  const backBtn = document.getElementById("checkout-back-btn");
  const editDeliveryBtn = document.getElementById("edit-delivery-btn");
  const payBtn = document.getElementById("pay-btn");
  const checkoutPageTitle = document.getElementById("checkout-page-title");

  // Recap elements
  const recapIcon = document.getElementById("recap-icon");
  const recapTitle = document.getElementById("recap-title");
  const recapBodyText = document.getElementById("recap-body-text");

  let currentStep = 1;
  let selectedItems = [];
  let orderTotal = 0;
  let activeDeliveryType = "home"; // 'home' or 'pickup'

  // 1. Initial State Check - Read items from sessionStorage
  try {
    const stored = sessionStorage.getItem("selectedCartItems");
    if (stored) {
      selectedItems = JSON.parse(stored);
    }
  } catch (err) {
    console.error("Error reading selectedCartItems:", err);
  }

  if (!selectedItems || selectedItems.length === 0) {
    showToast("No items selected for checkout.", "warning");
    redirect("/cart.html");
    return;
  }

  // Calculate order subtotal & total
  orderTotal = selectedItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);

  // 2. Auth State and Pre-fill Address
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showToast("Please sign in to complete your checkout.", "warning");
      redirect("/login.html");
      return;
    }

    // Try loading saved address
    try {
      const addrSnap = await getDoc(doc(db, `users/${user.uid}/addresses`, "default"));
      if (addrSnap.exists()) {
        const addr = addrSnap.data();
        prefillFormFields(addr);
      } else {
        // Fallback to basic user profile data
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        if (profileSnap.exists()) {
          const prof = profileSnap.data();
          prefillFormFields({
            name: prof.name || "",
            phone: prof.phone || "",
            city: prof.city || ""
          });
        }
      }
    } catch (err) {
      console.warn("Could not load saved address details:", err);
    }
  });

  // Helper to pre-fill the inputs
  const prefillFormFields = (addr) => {
    // Fill home fields
    if (document.getElementById("home-fullname")) document.getElementById("home-fullname").value = addr.name || "";
    if (document.getElementById("home-phone")) document.getElementById("home-phone").value = addr.phone || "";
    if (document.getElementById("home-city")) document.getElementById("home-city").value = addr.city || "";
    if (document.getElementById("home-area")) document.getElementById("home-area").value = addr.area || "";
    if (document.getElementById("home-landmark") && addr.landmark) document.getElementById("home-landmark").value = addr.landmark || "";

    // Fill pickup fields
    if (document.getElementById("pickup-fullname")) document.getElementById("pickup-fullname").value = addr.name || "";
    if (document.getElementById("pickup-phone")) document.getElementById("pickup-phone").value = addr.phone || "";
  };

  // 3. Listen to Delivery Type radio options
  const deliveryTypeRadios = document.querySelectorAll('input[name="deliveryType"]');
  deliveryTypeRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
      activeDeliveryType = e.target.value;
      if (activeDeliveryType === "home") {
        homeFields.style.display = "flex";
        pickupFields.style.display = "none";
      } else {
        homeFields.style.display = "none";
        pickupFields.style.display = "flex";
      }
    });
  });

  // 4. Step 1 Validation and Navigation
  if (deliveryForm) {
    deliveryForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      // Clear previous inline errors
      document.querySelectorAll(".inline-error").forEach(el => {
        el.textContent = "";
        el.style.display = "none";
      });
      document.querySelectorAll(".form-input, .form-select").forEach(el => {
        el.classList.remove("form-input--error", "form-select--error");
      });

      let isValid = true;
      let finalDetails = {};

      const phoneRegex = /^\+265\d{9}$/;

      if (activeDeliveryType === "home") {
        const nameVal = document.getElementById("home-fullname").value.trim();
        const phoneVal = document.getElementById("home-phone").value.trim().replace(/\s+/g, ""); // strip whitespace
        const cityVal = document.getElementById("home-city").value;
        const areaVal = document.getElementById("home-area").value.trim();
        const landmarkVal = document.getElementById("home-landmark").value.trim();
        const noteVal = document.getElementById("home-note").value.trim();

        if (!nameVal) {
          showInputError("home-fullname", "err-home-fullname", "Full name is required.");
          isValid = false;
        }

        if (!phoneVal) {
          showInputError("home-phone", "err-home-phone", "Phone number is required.");
          isValid = false;
        } else if (!phoneRegex.test(phoneVal)) {
          showInputError("home-phone", "err-home-phone", "Phone must match +265 followed by 9 digits.");
          isValid = false;
        }

        if (!cityVal) {
          showInputError("home-city", "err-home-city", "Please select a city.");
          isValid = false;
        }

        if (!areaVal) {
          showInputError("home-area", "err-home-area", "Area or neighbourhood is required.");
          isValid = false;
        }

        if (isValid) {
          finalDetails = {
            name: nameVal,
            phone: phoneVal,
            city: cityVal,
            area: areaVal,
            landmark: landmarkVal,
            note: noteVal,
            type: "home"
          };
        }

      } else {
        // Pickup validation
        const nameVal = document.getElementById("pickup-fullname").value.trim();
        const phoneVal = document.getElementById("pickup-phone").value.trim().replace(/\s+/g, "");
        const noteVal = document.getElementById("pickup-note").value.trim();

        if (!nameVal) {
          showInputError("pickup-fullname", "err-pickup-fullname", "Full name is required.");
          isValid = false;
        }

        if (!phoneVal) {
          showInputError("pickup-phone", "err-pickup-phone", "Phone number is required.");
          isValid = false;
        } else if (!phoneRegex.test(phoneVal)) {
          showInputError("pickup-phone", "err-pickup-phone", "Phone must match +265 followed by 9 digits.");
          isValid = false;
        }

        if (isValid) {
          finalDetails = {
            name: nameVal,
            phone: phoneVal,
            note: noteVal,
            type: "pickup"
          };
        }
      }

      if (!isValid) {
        showToast("Please correct the highlighted fields before proceeding.", "danger");
        return;
      }

      // Save Address to default in Firestore if checkbox is checked
      const user = auth.currentUser;
      if (user && saveAddressCheckbox && saveAddressCheckbox.checked) {
        try {
          await setDoc(doc(db, `users/${user.uid}/addresses`, "default"), {
            name: finalDetails.name,
            phone: finalDetails.phone,
            city: finalDetails.city || "",
            area: finalDetails.area || "",
            landmark: finalDetails.landmark || "",
            updatedAt: serverTimestamp()
          });
          console.log("Default address saved in Firestore!");
        } catch (err) {
          console.error("Failed to save default address in Firestore", err);
        }
      }

      // Store in sessionStorage
      sessionStorage.setItem("deliveryInfo", JSON.stringify(finalDetails));
      goToStep(2);
    });
  }

  // Show error helper
  const showInputError = (inputId, errorId, msg) => {
    const input = document.getElementById(inputId);
    const errSpan = document.getElementById(errorId);
    if (input) input.classList.add(inputId.includes("city") ? "form-select--error" : "form-input--error");
    if (errSpan) {
      errSpan.textContent = msg;
      errSpan.style.display = "block";
    }
  };

  // 5. Navigation steps handler
  const goToStep = (step) => {
    currentStep = step;
    if (step === 1) {
      stepPanel1.style.display = "block";
      stepPanel2.style.display = "none";
      
      stepDeliveryIndicator.className = "step-indicator step-indicator--active";
      stepPaymentIndicator.className = "step-indicator";
      stepLineDivider.classList.remove("step-line--active");
      
      if (checkoutPageTitle) checkoutPageTitle.textContent = "Checkout - Delivery";
    } else {
      stepPanel1.style.display = "none";
      stepPanel2.style.display = "block";
      
      stepDeliveryIndicator.className = "step-indicator step-indicator--completed";
      stepPaymentIndicator.className = "step-indicator step-indicator--active";
      stepLineDivider.classList.add("step-line--active");
      
      if (checkoutPageTitle) checkoutPageTitle.textContent = "Checkout - Review & Pay";
      
      populateStep2Data();
    }
  };

  // 6. Populate Step 2 Recap and Order summary
  const populateStep2Data = () => {
    const deliveryData = JSON.parse(sessionStorage.getItem("deliveryInfo") || "{}");
    
    // Delivery Recap card fill
    if (deliveryData.type === "home") {
      if (recapIcon) recapIcon.textContent = "🏠";
      if (recapTitle) recapTitle.textContent = "Home Delivery Details";
      if (recapBodyText) {
        recapBodyText.innerHTML = `
          <strong>Recipient:</strong> ${deliveryData.name}<br>
          <strong>Phone:</strong> ${deliveryData.phone}<br>
          <strong>Address:</strong> ${deliveryData.area}, ${deliveryData.city}
          ${deliveryData.landmark ? `<br><strong>Landmark:</strong> ${deliveryData.landmark}` : ""}
          ${deliveryData.note ? `<br><strong>Note to seller:</strong> ${deliveryData.note}` : ""}
        `;
      }
    } else {
      if (recapIcon) recapIcon.textContent = "🚶";
      if (recapTitle) recapTitle.textContent = "Seller Self-Pickup Details";
      if (recapBodyText) {
        recapBodyText.innerHTML = `
          <strong>Buyer Name:</strong> ${deliveryData.name}<br>
          <strong>Contact Phone:</strong> ${deliveryData.phone}
          ${deliveryData.note ? `<br><strong>Note to seller:</strong> ${deliveryData.note}` : ""}
        `;
      }
    }

    // Render Order Items summary rows
    if (checkoutItemsContainer) {
      checkoutItemsContainer.innerHTML = "";
      selectedItems.forEach(item => {
        const itemRow = document.createElement("div");
        itemRow.className = "checkout-item-row";
        
        const itemTotal = Number(item.price || 0) * Number(item.quantity || 1);
        
        itemRow.innerHTML = `
          <img src="${item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=60&q=80'}" class="checkout-item-img">
          <div class="checkout-item-details">
            <h4 class="checkout-item-name">${item.name}</h4>
            <div class="checkout-item-price-qty">
              MWK ${Number(item.price || 0).toLocaleString()} &times; ${item.quantity || 1}
            </div>
          </div>
          <div class="checkout-item-total">
            ${formatMWK(itemTotal)}
          </div>
        `;
        
        checkoutItemsContainer.appendChild(itemRow);
      });
    }

    // Update prices
    if (subtotalEl) subtotalEl.textContent = formatMWK(orderTotal);
    if (totalEl) totalEl.textContent = formatMWK(orderTotal);
  };

  // Wire back and edit buttons
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (currentStep === 2) {
        goToStep(1);
      } else {
        redirect("/cart.html");
      }
    });
  }

  if (editDeliveryBtn) {
    editDeliveryBtn.addEventListener("click", () => {
      goToStep(1);
    });
  }

  // 7. On Pay Button Click - REAL Paychangu Checkout Redirection
  if (payBtn) {
    payBtn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user || selectedItems.length === 0) return;

      const deliveryInfo = JSON.parse(sessionStorage.getItem("deliveryInfo") || "{}");

      showLoading(payBtn, "💳 Connecting to Paychangu...");

      try {
        const orderId = "order_" + generateId();
        const orderDocRef = doc(db, "orders", orderId);

        // Name split helper for Paychangu
        const nameParts = (deliveryInfo.name || "ShopEasy Buyer").split(" ");
        const firstName = nameParts[0] || "ShopEasy";
        const lastName = nameParts.slice(1).join(" ") || "Buyer";

        // Construct standard order document BEFORE redirect
        const orderData = {
          orderId,
          buyerId: user.uid,
          buyerName: deliveryInfo.name || "Buyer",
          buyerPhone: deliveryInfo.phone || "",
          items: selectedItems.map(item => ({
            productId: item.productId || item.id, // Support different object references
            name: item.name,
            price: Number(item.price || 0),
            qty: Number(item.quantity || 1),
            image: item.image || "",
            sellerId: item.sellerId
          })),
          deliveryType: deliveryInfo.type || "home",
          deliveryInfo: {
            name: deliveryInfo.name || "",
            phone: deliveryInfo.phone || "",
            city: deliveryInfo.city || "Lilongwe",
            area: deliveryInfo.area || "",
            landmark: deliveryInfo.landmark || "",
            note: deliveryInfo.note || ""
          },
          status: "pending_payment",
          paymentStatus: "pending",
          paychanguTxRef: orderId,
          subtotal: orderTotal,
          total: orderTotal,
          createdAt: serverTimestamp()
        };

        // Create the Order document in Firestore
        console.log("Registering order doc before payment gateway redirect:", orderId);
        await setDoc(orderDocRef, orderData);

        // Initiate Paychangu transaction
        let paymentUrl = "";
        
        try {
          // Attempt using Cloud Function as required by production specs
          console.log("Calling Cloud Function initiatePaychangu...");
          const initiatePaychanguFn = httpsCallable(functions, "initiatePaychangu");
          const fnResult = await initiatePaychanguFn({
            orderId,
            total: orderTotal,
            firstName,
            lastName,
            email: user.email || "buyer@shopeasy.mw"
          });
          
          paymentUrl = fnResult.data?.paymentUrl;
        } catch (fnErr) {
          console.warn("Cloud function call failed or not deployed, falling back to local Express proxy:", fnErr);
          
          // Fallback to Express backend on the dev server
          const res = await fetch("/api/initiatePaychangu", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId,
              total: orderTotal,
              firstName,
              lastName,
              email: user.email || "buyer@shopeasy.mw"
            })
          });

          if (!res.ok) {
            throw new Error("Local proxy initiation returned non-200 state.");
          }

          const resData = await res.json();
          paymentUrl = resData.paymentUrl;
        }

        if (!paymentUrl) {
          throw new Error("Could not fetch checkout URL from payment gateway.");
        }

        hideLoading(payBtn);
        showToast("Redirecting to Paychangu portal...", "success");

        // Save active checkout details so we don't clear cart unless webhook confirms
        // Clear selected cart items in sessionStorage to prevent checkout replay
        sessionStorage.removeItem("selectedCartItems");

        // Redirect to Paychangu payment link
        setTimeout(() => {
          window.location.href = paymentUrl;
        }, 800);

      } catch (error) {
        hideLoading(payBtn);
        showToast("Could not initiate payment. Try again.", "danger");
        console.error("Payment setup exception:", error);
      }
    });
  }
});
