const crypto = require('crypto');
const { getFirebaseAdmin } = require('../lib/firebase-admin');
const { requireAdmin } = require('../lib/auth');

function generateReferralCode(seed) {
  const base = (seed || 'AFF').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6) || 'AFF';
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${base}${suffix}`;
}

/**
 * POST /api/affiliates/create-account
 * Admin only. Grants affiliate status to an existing user immediately (no approval step).
 * Body: { uid, commissionRate }  // commissionRate as a decimal, e.g. 0.2 for 20%
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    await requireAdmin(req, admin);

    const { uid, commissionRate } = req.body || {};

    if (!uid) {
      return res.status(400).json({ error: 'Missing uid of the user to make an affiliate' });
    }
    if (typeof commissionRate !== 'number' || commissionRate <= 0 || commissionRate > 1) {
      return res.status(400).json({ error: 'commissionRate must be a decimal between 0 and 1 (e.g. 0.2 for 20%)' });
    }

    const userDoc = await db.collection('user').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userData = userDoc.data();

    const existing = await db.collection('affiliates').doc(uid).get();
    if (existing.exists) {
      return res.status(409).json({
        error: 'This user already has an affiliate account',
        status: existing.data().status
      });
    }

    // Ensure the referral code is unique
    let code;
    let attempts = 0;
    do {
      code = generateReferralCode(userData.firstName || userData.email);
      const clash = await db.collection('affiliates').where('code', '==', code).limit(1).get();
      if (clash.empty) break;
      attempts++;
    } while (attempts < 5);

    const affiliateData = {
      uid,
      email: userData.email || '',
      name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
      code,
      status: 'approved',
      commissionRate,
      totalEarned: 0,
      pendingPayout: 0,
      awaitingPayout: 0,
      totalPaidOut: 0,
      totalSales: 0,
      createdBy: 'admin',
      approvedAt: admin.firestore.Timestamp.now(),
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    await db.collection('affiliates').doc(uid).set(affiliateData);

    // So the frontend can show the affiliate dashboard link without an extra query
    await db.collection('user').doc(uid).set(
      { isAffiliate: true, updatedAt: admin.firestore.Timestamp.now() },
      { merge: true }
    );

    return res.status(200).json({ success: true, affiliate: affiliateData });

  } catch (err) {
    console.error('create-account error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};