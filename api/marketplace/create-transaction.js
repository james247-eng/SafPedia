// api/marketplace/create-transaction.js

const { getFirebaseAdmin } = require('../../lib/firebase-admin');

/**
 * POST /api/marketplace/create-transaction
 * One product (and therefore one vendor) per checkout — no multi-vendor cart.
 * Runs on a SEPARATE Paystack business account from courses/affiliates, so
 * marketplace revenue never touches the course-sales settlement account.
 *
 * Header: Authorization: Bearer <firebase-id-token>
 * Body: { productId, quantity?, shippingAddress? }
 *   - quantity defaults to 1
 *   - shippingAddress required if the product is physical: { fullName, phone, address, city, state }
 *
 * NOTE ON STOCK: stock is not reserved at this step, only checked. It is
 * decremented atomically inside the webhook's charge.success handler, right
 * before crediting the vendor, to avoid a purchase succeeding against a
 * product that sold out while checkout was in progress. A brief oversell
 * window between two simultaneous checkouts of the last unit is possible —
 * the webhook handler below refunds/flags that case rather than silently
 * allowing it.
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    // ---- Auth ----
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const idToken = authHeader.replace('Bearer ', '');
    if (!idToken) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const buyerUid = decoded.uid;

    // ---- Input ----
    const { productId, quantity, shippingAddress } = req.body || {};
    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'Missing productId' });
    }

    const qty = typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0 ? quantity : 1;

    // ---- Product lookup ----
    const productRef = db.collection('vendorProducts').doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productSnap.data();

    if (!product.isActive) {
      return res.status(400).json({ error: 'This product is no longer available' });
    }
    if (typeof product.price !== 'number') {
      return res.status(400).json({ error: 'Product price must be a number in Firestore' });
    }
    if (product.vendorUid === buyerUid) {
      return res.status(400).json({ error: 'You cannot purchase your own product' });
    }

    if (product.type === 'physical') {
      if (product.stock === null || product.stock < qty) {
        return res.status(400).json({ error: 'Not enough stock available' });
      }
      if (!shippingAddress || typeof shippingAddress !== 'object') {
        return res.status(400).json({ error: 'shippingAddress is required for physical products' });
      }
      const required = ['fullName', 'phone', 'address', 'city', 'state'];
      const missing = required.filter((f) => !shippingAddress[f] || typeof shippingAddress[f] !== 'string');
      if (missing.length) {
        return res.status(400).json({ error: `shippingAddress missing: ${missing.join(', ')}` });
      }
    }

    // ---- Platform commission rate ----
    let commissionRate = 0.15; // sensible default, overridden by settings doc if present
    try {
      const settingsSnap = await db.collection('settings').doc('marketplace').get();
      if (settingsSnap.exists && typeof settingsSnap.data().platformCommissionRate === 'number') {
        commissionRate = settingsSnap.data().platformCommissionRate;
      }
    } catch (err) {
      console.warn('Could not load marketplace settings, using default commission rate:', err.message);
    }

    // ---- Paystack init (marketplace account — separate key from courses) ----
    const amountNaira = product.price * qty;
    const amountKobo = Math.round(amountNaira * 100);

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY_MARKETPLACE;
    if (!PAYSTACK_SECRET) {
      return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY_MARKETPLACE not configured' });
    }

    const origin = req.headers.origin || process.env.SITE_URL || 'https://techwizardsacademy.com';
    const callbackUrl = `${origin}/marketplace-payment-success.html`;

    const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: decoded.email,
        amount: amountKobo,
        callback_url: callbackUrl,
        metadata: {
          orderType: 'marketplace',
          buyerUid,
          productId,
          vendorUid: product.vendorUid,
          productTitle: product.title || 'Product',
          productType: product.type,
          quantity: qty,
          commissionRate,
          shippingAddress: product.type === 'physical' ? shippingAddress : null
        }
      })
    });

    const initJson = await initRes.json();

    if (!initJson.status) {
      console.error('Paystack init failed:', initJson);
      return res.status(502).json({ error: 'Paystack initialization failed', details: initJson });
    }

    console.log('Marketplace payment initialized:', {
      reference: initJson.data.reference,
      buyerUid,
      productId,
      vendorUid: product.vendorUid
    });

    return res.status(200).json({
      authorization_url: initJson.data.authorization_url,
      reference: initJson.data.reference
    });

  } catch (err) {
    console.error('Marketplace transaction creation error:', err);
    return res.status(500).json({ error: err.message });
  }
};