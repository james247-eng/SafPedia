// api/admin/marketplace/suspend-vendor.js

const { getFirebaseAdmin } = require('../../../lib/firebase-admin');
const { requireAdmin } = require('../../../lib/auth');

const BATCH_LIMIT = 400; // stay comfortably under Firestore's 500-write batch cap

/**
 * POST /api/admin/marketplace/suspend-vendor
 * Admin only. Suspending a vendor:
 *   - sets vendors/{uid}.isSuspended = true
 *   - deactivates (isActive: false) every currently-active product they own,
 *     so suspension takes effect immediately across their whole catalog
 *   - blocks future product creation and payout requests (enforced in
 *     create-product.js and request-payout.js, which check isSuspended)
 *
 * Reactivating a vendor only clears isSuspended — it deliberately does NOT
 * auto-reactivate their products, so each listing gets a manual review
 * before going back live.
 *
 * Body: { vendorUid, suspend: boolean, reason? }
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    await requireAdmin(req, admin);

    const { vendorUid, suspend, reason } = req.body || {};

    if (!vendorUid || typeof vendorUid !== 'string') {
      return res.status(400).json({ error: 'Missing vendorUid' });
    }
    if (typeof suspend !== 'boolean') {
      return res.status(400).json({ error: 'suspend must be true or false' });
    }

    const vendorRef = db.collection('vendors').doc(vendorUid);

    const vendorUpdate = {
      isSuspended: suspend,
      updatedAt: admin.firestore.Timestamp.now()
    };
    if (suspend) {
      vendorUpdate.suspendedReason = reason || '';
      vendorUpdate.suspendedAt = admin.firestore.Timestamp.now();
    } else {
      vendorUpdate.suspendedReason = admin.firestore.FieldValue.delete();
      vendorUpdate.suspendedAt = admin.firestore.FieldValue.delete();
    }

    await vendorRef.set(vendorUpdate, { merge: true });

    let deactivatedCount = 0;

    if (suspend) {
      const activeProductsSnap = await db.collection('vendorProducts')
        .where('vendorUid', '==', vendorUid)
        .where('isActive', '==', true)
        .get();

      const docs = activeProductsSnap.docs;
      for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        const chunk = docs.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        chunk.forEach((doc) => {
          batch.set(doc.ref, {
            isActive: false,
            suspendedReason: 'Vendor account suspended',
            suspendedAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now()
          }, { merge: true });
        });
        await batch.commit();
        deactivatedCount += chunk.length;
      }
    }

    return res.status(200).json({
      success: true,
      vendorUid,
      isSuspended: suspend,
      deactivatedProductCount: deactivatedCount
    });

  } catch (err) {
    console.error('suspend-vendor error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};