import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const app = express();
app.use(express.json());

const PORT = 3000;

// Load firebase-applet-config
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
} catch (err) {
  console.error("Error loading firebase-applet-config.json:", err);
}

// Copy PWA Icons automatically if they don't exist
try {
  const assetsIconsDir = path.join(process.cwd(), "assets", "icons");
  if (!fs.existsSync(assetsIconsDir)) {
    fs.mkdirSync(assetsIconsDir, { recursive: true });
  }
  const icon512Path = path.join(assetsIconsDir, "icon-512.png");
  const icon192Path = path.join(assetsIconsDir, "icon-192.png");
  const icon96Path = path.join(assetsIconsDir, "icon-96.png");

  if (fs.existsSync(icon512Path)) {
    if (!fs.existsSync(icon192Path)) {
      fs.copyFileSync(icon512Path, icon192Path);
      console.log("Automatically copied icon-512.png to icon-192.png");
    }
    if (!fs.existsSync(icon96Path)) {
      fs.copyFileSync(icon512Path, icon96Path);
      console.log("Automatically copied icon-512.png to icon-96.png");
    }
  }

  // Copy sw.js, manifest.json, and assets/icons to dist if dist exists
  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    // Copy sw.js
    const swPath = path.join(process.cwd(), "sw.js");
    if (fs.existsSync(swPath)) {
      fs.copyFileSync(swPath, path.join(distPath, "sw.js"));
      console.log("Automatically copied sw.js to dist/sw.js");
    }
    // Copy manifest.json
    const manifestPath = path.join(process.cwd(), "manifest.json");
    if (fs.existsSync(manifestPath)) {
      fs.copyFileSync(manifestPath, path.join(distPath, "manifest.json"));
      console.log("Automatically copied manifest.json to dist/manifest.json");
    }
    // Copy assets/icons to dist/assets/icons
    const distIconsDir = path.join(distPath, "assets", "icons");
    if (!fs.existsSync(distIconsDir)) {
      fs.mkdirSync(distIconsDir, { recursive: true });
    }
    if (fs.existsSync(icon512Path)) {
      fs.copyFileSync(icon512Path, path.join(distIconsDir, "icon-512.png"));
    }
    if (fs.existsSync(icon192Path)) {
      fs.copyFileSync(icon192Path, path.join(distIconsDir, "icon-192.png"));
    }
    if (fs.existsSync(icon96Path)) {
      fs.copyFileSync(icon96Path, path.join(distIconsDir, "icon-96.png"));
    }
    console.log("Successfully synchronized PWA asset configurations into dist/");
  }
} catch (err) {
  console.error("Error copying PWA icons or static files:", err);
}

// Initialize Firebase Admin
const adminProjectId = firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
if (getApps().length === 0) {
  initializeApp({
    projectId: adminProjectId || undefined
  });
}

const db = (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)")
  ? getFirestore(firebaseConfig.firestoreDatabaseId)
  : getFirestore();

// 1. Paychangu Payment Initiation API
app.post("/api/initiatePaychangu", async (req, res) => {
  const { orderId, total, firstName, lastName, email } = req.body;
  
  if (!orderId || !total || total < 1) {
    return res.status(400).json({ error: "Invalid order data." });
  }

  const secretKey = process.env.PAYCHANGU_SECRET_KEY;
  if (!secretKey) {
    console.warn("PAYCHANGU_SECRET_KEY is missing. Using simulated checkout fallback.");
    const localHostUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    
    // Simulate webhook asynchronously after 2 seconds
    setTimeout(async () => {
      try {
        console.log(`[SIMULATOR] Triggering background payment confirmation for Order #${orderId}`);
        await confirmPayment(orderId);
      } catch (simErr) {
        console.error("[SIMULATOR] Error in background payment confirmation:", simErr);
      }
    }, 2000);

    const checkoutUrl = `${localHostUrl}/order-success.html?ref=${orderId}&simulated=true`;
    return res.json({ paymentUrl: checkoutUrl });
  }

  try {
    const callbackUrl = `${process.env.APP_URL || `https://${req.get("host")}`}/api/paychangu-webhook`;
    const returnUrl = `${process.env.APP_URL || `https://${req.get("host")}`}/order-success.html?ref=${orderId}`;

    console.log(`Initiating real Paychangu payment for Order #${orderId}. Amount: ${total}. Callback: ${callbackUrl}`);

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
          title: "ShopEasy Malawian Marketplace",
          description: `Order #${orderId}`
        }
      })
    });

    const result: any = await response.json();
    console.log("Paychangu initiation response:", result);

    if (!result.data?.checkout_url) {
      return res.status(500).json({ error: result.message || "Could not initiate payment via Paychangu." });
    }

    return res.json({ paymentUrl: result.data.checkout_url });
  } catch (error: any) {
    console.error("Paychangu initiation exception:", error);
    return res.status(500).json({ error: "Internal server error during payment initiation." });
  }
});

// Helper function to process successful payment webhook logic (shared between webhook & simulator)
async function confirmPayment(tx_ref: string) {
  const orderRef = db.collection("orders").doc(tx_ref);
  const order = await orderRef.get();
  
  if (!order.exists) {
    console.error(`Order with ref ${tx_ref} not found for payment confirmation`);
    return false;
  }
  
  const orderData = order.data();
  if (!orderData) return false;

  if (orderData.paymentStatus === "paid") {
    console.log(`Order ${tx_ref} is already marked as paid.`);
    return true;
  }

  const batch = db.batch();

  // Mark order as paid and processing
  batch.update(orderRef, {
    paymentStatus: "paid",
    status: "processing",
    paidAt: FieldValue.serverTimestamp()
  });

  // Decrement product stock per item in the order
  if (orderData.items && Array.isArray(orderData.items)) {
    for (const item of orderData.items) {
      if (item.productId) {
        const productRef = db.collection("products").doc(item.productId);
        batch.update(productRef, {
          stock: FieldValue.increment(-item.qty),
          sold: FieldValue.increment(item.qty)
        });
      }
    }
  }

  // Clear buyer's cart subcollection
  const cartItemsRef = db.collection("carts").doc(orderData.buyerId).collection("items");
  const cartItems = await cartItemsRef.get();
  cartItems.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`Successfully committed payment update and cleared cart for Order #${tx_ref}`);

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
        createdAt: FieldValue.serverTimestamp()
      });
      console.log(`Notification sent to seller ${firstItem.sellerId}`);
    }
  }
  return true;
}

// 2. Paychangu Webhook Endpoint
app.post("/api/paychangu-webhook", async (req, res) => {
  const { tx_ref, status } = req.body;
  console.log(`[WEBHOOK RECEIVED] Ref: ${tx_ref}, Status: ${status}`);

  if (status !== "successful") {
    return res.status(200).send("OK");
  }

  const secretKey = process.env.PAYCHANGU_SECRET_KEY;
  if (!secretKey) {
    console.error("PAYCHANGU_SECRET_KEY is missing on webhook invocation! Doing simulator-style confirm.");
    await confirmPayment(tx_ref);
    return res.status(200).send("OK");
  }

  try {
    // Independently verify payment status with Paychangu
    console.log(`Verifying payment status for tx_ref: ${tx_ref}`);
    const verifyResponse = await fetch(`https://api.paychangu.com/verify-payment/${tx_ref}`, {
      headers: {
        "Authorization": `Bearer ${secretKey}`
      }
    });
    
    const verifyResult: any = await verifyResponse.json();
    console.log("Paychangu verification result:", verifyResult);

    if (verifyResult.data?.status !== "successful") {
      console.warn(`Paychangu verification failed for tx_ref: ${tx_ref}`);
      return res.status(200).send("OK");
    }

    // Process order updates
    await confirmPayment(tx_ref);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("Error in Paychangu webhook verification:", err);
    return res.status(500).send("Webhook error");
  }
});

// 3. Dev manual trigger for testing payment success
app.get("/api/simulate-payment", async (req, res) => {
  const { ref } = req.query;
  if (!ref || typeof ref !== "string") {
    return res.status(400).send("Missing order ref");
  }
  const result = await confirmPayment(ref);
  if (result) {
    return res.send(`Successfully simulated payment success for Order #${ref}!`);
  } else {
    return res.status(400).send(`Order ${ref} not found or already paid.`);
  }
});

// Vite dev server middleware / Production build static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
