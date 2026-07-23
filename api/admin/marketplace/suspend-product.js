// api/admin/marketplace/suspend-product.js

const { getFirebaseAdmin } = require('../../../lib/firebase-admin');
const { requireAdmin } = require('../../../lib/auth');

/**
 * POST /api/admin/marketplace/suspend-product
 * Admin only. Reactive moderation tool — since vendor products publish
 * without pre-approval, this is how a problematic listing gets pulled.
 * Reuses the existing isActive flag (already checked by create-transaction.js
 * and the public product-details page) rather than introducing a second flag.
 *
 * Body: { productId, suspend: boolean, reason? }
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    await requireAdmin(req, admin);

    const { productId, suspend, reason } = req.body || {};

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'Missing productId' });
    }
    if (typeof suspend !== 'boolean') {
      return res.status(400).json({ error: 'suspend must be true or false' });
    }

    const productRef = db.collection('vendorProducts').doc(productId);
    const productSnap = await productRef.get();

    if (!productSnap.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const update = {
      isActive: !suspend,
      updatedAt: admin.firestore.Timestamp.now()
    };

    if (suspend) {
      update.suspendedReason = reason || '';
      update.suspendedAt = admin.firestore.Timestamp.now();
    } else {
      update.suspendedReason = admin.firestore.FieldValue.delete();
      update.suspendedAt = admin.firestore.FieldValue.delete();
    }

    await productRef.set(update, { merge: true });

    return res.status(200).json({ success: true, productId, isActive: !suspend });

  } catch (err) {
    console.error('suspend-product error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};