// api/vendors/update-order-status.js

const { getFirebaseAdmin } = require('../../lib/firebase-admin');
const { getAuthedUser } = require('../../lib/auth');

// Valid forward transitions — no skipping ahead, no moving backward.
const ALLOWED_TRANSITIONS = {
  pending_shipment: ['shipped'],
  shipped: ['delivered']
};

/**
 * POST /api/vendors/update-order-status
 * Vendor-only, and only for their own product's sale. Used for physical
 * product fulfillment tracking — digital sales never touch this endpoint,
 * since their fulfillmentStatus ('available') is set once by the webhook
 * and never needs a manual update.
 *
 * Body: { productId, reference, action, trackingNumber?, carrier? }
 *   - action: 'shipped' | 'delivered'
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    const user = await getAuthedUser(req, admin);

    const { productId, reference, action, trackingNumber, carrier } = req.body || {};

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'Missing productId' });
    }
    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({ error: 'Missing reference' });
    }
    if (!action || !['shipped', 'delivered'].includes(action)) {
      return res.status(400).json({ error: "action must be 'shipped' or 'delivered'" });
    }

    const saleRef = db.collection('vendorProducts').doc(productId).collection('sales').doc(reference);
    const saleSnap = await saleRef.get();

    if (!saleSnap.exists) {
      return res.status(404).json({ error: 'Sale record not found' });
    }

    const sale = saleSnap.data();

    if (sale.vendorUid !== user.uid) {
      return res.status(403).json({ error: 'This sale does not belong to your account' });
    }
    if (sale.productType !== 'physical') {
      return res.status(400).json({ error: 'Only physical product orders have a shipment status' });
    }

    const currentStatus = sale.fulfillmentStatus;
    const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];

    if (!allowedNext.includes(action)) {
      return res.status(409).json({
        error: `Cannot mark as '${action}' from current status '${currentStatus}'`,
        currentStatus
      });
    }

    const update = {
      fulfillmentStatus: action,
      updatedAt: admin.firestore.Timestamp.now()
    };

    if (action === 'shipped') {
      if (trackingNumber && typeof trackingNumber === 'string') {
        update.trackingNumber = trackingNumber.trim();
      }
      if (carrier && typeof carrier === 'string') {
        update.carrier = carrier.trim();
      }
      update.shippedAt = admin.firestore.Timestamp.now();
    }

    if (action === 'delivered') {
      update.deliveredAt = admin.firestore.Timestamp.now();
    }

    await saleRef.set(update, { merge: true });

    return res.status(200).json({ success: true, reference, fulfillmentStatus: action });

  } catch (err) {
    console.error('update-order-status error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};