const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

// Initialize Admin SDK once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Cloud Function to initiate payment with Paychangu
 */
exports.initiatePaychangu = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  
  const { orderId, total, firstName, lastName, email } = request.data;
  
  if (!orderId || !total || total < 1) {
    throw new HttpsError("invalid-argument", "Invalid order data.");
  }

  const secretKey = process.env.PAYCHANGU_SECRET_KEY;
  if (!secretKey) {
    throw new HttpsError("failed-precondition", "Payment gateway secret key is not configured on the server.");
  }
  
  try {
    const callbackUrl = `https://us-central1-${admin.instanceId().app.options.projectId}.cloudfunctions.net/paychanguWebhook`;
    const returnUrl = `https://${admin.instanceId().app.options.projectId}.web.app/order-success.html?ref=${orderId}`;

    const response = await fetch("https://api.paychangu.com/payment", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        amount: total,
        currency: "MWK",
        email: email || "buyer@shopeasy.mw",
        first_name: firstName || "ShopEasy",
        last_name: lastName || "Buyer",
        callback_url: callbackUrl,
        return_url: returnUrl,
        tx_ref: orderId,
        customization: {
          title: "ShopEasy",
          description: `Order #${orderId}`
        }
      })
    });
    
    const result = await response.json();
    
    if (!result.data?.checkout_url) {
      throw new HttpsError("internal", result.message || "Could not initiate payment. Please try again.");
    }
    
    return { paymentUrl: result.data.checkout_url };
  } catch (error) {
    console.error("Error initiating payment with Paychangu:", error);
    throw new HttpsError("internal", error.message || "An error occurred while connecting to Paychangu.");
  }
});

/**
 * Cloud Function to process Paychangu Webhooks safely
 */
exports.paychanguWebhook = onRequest(async (req, res) => {
  const { tx_ref, status } = req.body;
  console.log(`Webhook received: Order: ${tx_ref}, Status: ${status}`);
  
  if (status !== "successful") {
    res.status(200).send("OK");
    return;
  }
  
  const secretKey = process.env.PAYCHANGU_SECRET_KEY;
  if (!secretKey) {
    console.error("PAYCHANGU_SECRET_KEY environment variable is not defined!");
    res.status(500).send("Configuration error");
    return;
  }
  
  try {
    // Independently verify payment
    const verify = await fetch(
      `https://api.paychangu.com/verify-payment/${tx_ref}`,
      {
        headers: {
          "Authorization": `Bearer ${secretKey}`
        }
      }
    );
    const verifyResult = await verify.json();
    
    if (verifyResult.data?.status !== "successful") {
      console.warn(`Paychangu independent verification failed for transaction reference: ${tx_ref}`);
      res.status(200).send("OK");
      return;
    }
    
    const db = admin.firestore();
    const orderRef = db.collection("orders").doc(tx_ref);
    const orderSnap = await orderRef.get();
    
    if (!orderSnap.exists) {
      console.error(`Order #${tx_ref} not found in Firestore.`);
      res.status(200).send("OK");
      return;
    }

    const orderData = orderSnap.data();
    if (orderData.paymentStatus === "paid") {
      console.log(`Order #${tx_ref} has already been marked as paid.`);
      res.status(200).send("OK");
      return;
    }
    
    const batch = db.batch();
    
    // Mark order paid
    batch.update(orderRef, {
      paymentStatus: "paid",
      status: "processing",
      paidAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Decrement stock per item
    if (orderData.items && Array.isArray(orderData.items)) {
      for (const item of orderData.items) {
        if (item.productId) {
          const productRef = db.collection("products").doc(item.productId);
          batch.update(productRef, {
            stock: admin.firestore.FieldValue.increment(-item.qty),
            sold: admin.firestore.FieldValue.increment(item.qty)
          });
        }
      }
    }
    
    // Clear buyer's cart subcollection
    const cartItems = await db.collection("carts")
      .doc(orderData.buyerId)
      .collection("items").get();
    cartItems.docs.forEach(d => batch.delete(d.ref));
    
    await batch.commit();
    console.log(`Database batch committed for paid order #${tx_ref}`);
    
    // Notify seller
    if (orderData.items && orderData.items.length > 0) {
      const firstItem = orderData.items[0];
      if (firstItem.sellerId) {
        await db.collection("notifications").add({
          userId: firstItem.sellerId,
          type: "new_order",
          title: "New order received! 📦",
          body: `Order #${tx_ref} — MWK ${Number(orderData.total || 0).toLocaleString()}`,
          orderId: tx_ref,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Notification dispatched to seller: ${firstItem.sellerId}`);
      }
    }
    
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error processing Paychangu webhook:", error);
    res.status(500).send("Internal server error");
  }
});
