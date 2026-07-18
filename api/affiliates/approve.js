const crypto = require('crypto');
const { getFirebaseAdmin } = require('../../lib/firebase-admin');
const { requireAdmin } = require('../../lib/auth');

function generateReferralCode(seed) {
  const base = (seed || 'AFF').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6) || 'AFF';
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${base}${suffix}`;
}

/**
 * POST /api/affiliates/approve
 * Admin only. Approves (or rejects) a pending self-application from /apply.
 * Body: { affiliateUid, commissionRate, action? }
 *   - action: 'approve' (default) | 'reject'
 *   - commissionRate required only when approving, as a decimal e.g. 0.2 for 20%
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    await requireAdmin(req, admin);

    const { affiliateUid, commissionRate, action } = req.body || {};

    if (!affiliateUid) {
      return res.status(400).json({ error: 'Missing affiliateUid' });
    }

    const affRef = db.collection('affiliates').doc(affiliateUid);
    const affSnap = await affRef.get();

    if (!affSnap.exists) {
      return res.status(404).json({ error: 'Affiliate application not found' });
    }

    const affData = affSnap.data();
    if (affData.status !== 'pending') {
      return res.status(409).json({ error: `Application already ${affData.status}` });
    }

    if (action === 'reject') {
      await affRef.set({
        status: 'rejected',
        updatedAt: admin.firestore.Timestamp.now()
      }, { merge: true });

      return res.status(200).json({ success: true, status: 'rejected' });
    }

    // Default path: approve
    if (typeof commissionRate !== 'number' || commissionRate <= 0 || commissionRate > 1) {
      return res.status(400).json({ error: 'commissionRate must be a decimal between 0 and 1 (e.g. 0.2 for 20%)' });
    }

    let code;
    let attempts = 0;
    do {
      code = generateReferralCode(affData.name);
      const clash = await db.collection('affiliates').where('code', '==', code).limit(1).get();
      if (clash.empty) break;
      attempts++;
    } while (attempts < 5);

    await affRef.set({
      status: 'approved',
      code,
      commissionRate,
      approvedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });

    await db.collection('user').doc(affiliateUid).set(
      { isAffiliate: true, updatedAt: admin.firestore.Timestamp.now() },
      { merge: true }
    );

    return res.status(200).json({ success: true, status: 'approved', code, commissionRate });

  } catch (err) {
    console.error('approve error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};