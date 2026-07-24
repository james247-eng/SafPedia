const { getFirebaseAdmin } = require('../lib/firebase-admin');
const { getAuthedUser } = require('../lib/auth');

/**
 * POST /api/affiliates/apply
 * Any authenticated student can call this to apply for the affiliate program.
 * Creates a 'pending' record — no referral code or commission rate until an admin approves it.
 * Header: Authorization: Bearer <firebase-id-token>
 * Body: { reason?, socialLink? }
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    const user = await getAuthedUser(req, admin);
    const { reason, socialLink } = req.body || {};

    const existing = await db.collection('affiliates').doc(user.uid).get();
    if (existing.exists) {
      return res.status(409).json({
        error: 'You already have an affiliate application on file',
        status: existing.data().status
      });
    }

    // Securely fallback if names aren't provided on the top-level user auth token object
    const fallbackName = user.displayName || user.email || 'Anonymous Student';
    const affiliateName = user.firstName 
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() 
      : fallbackName;

    const affiliateData = {
      uid: user.uid,
      email: user.email || '',
      name: affiliateName,
      code: null,
      status: 'pending',
      commissionRate: null,
      totalEarned: 0,
      pendingPayout: 0,
      awaitingPayout: 0,
      totalPaidOut: 0,
      totalSales: 0,
      createdBy: 'self-application',
      applicationReason: reason || '',
      applicationSocialLink: socialLink || '',
      appliedAt: admin.firestore.Timestamp.now(),
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    await db.collection('affiliates').doc(user.uid).set(affiliateData);

    return res.status(200).json({
      success: true,
      message: 'Application submitted. Awaiting admin approval.'
    });

  } catch (err) {
    console.error('apply error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};