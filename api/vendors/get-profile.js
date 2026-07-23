// api/vendors/get-profile.js

const { getFirebaseAdmin } = require('../../lib/firebase-admin');
const { getAuthedUser } = require('../../lib/auth');

const PRODUCTS_LIMIT = 100;

/**
 * GET /api/vendors/get-profile
 * Any authenticated user. Returns the caller's own vendor balance/bank info
 * plus their product list, for rendering the seller dashboard. Returns
 * sensible defaults (zeroed balances, empty product list) for a user who
 * hasn't listed anything yet — there's no separate "become a vendor" step,
 * so a vendor doc may not exist until their first product or bank account save.
 */
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    const user = await getAuthedUser(req, admin);

    const vendorSnap = await db.collection('vendors').doc(user.uid).get();

    const vendor = vendorSnap.exists
      ? vendorSnap.data()
      : {
          bankAccount: null,
          totalEarned: 0,
          pendingPayout: 0,
          awaitingPayout: 0,
          totalPaidOut: 0,
          totalSales: 0
        };

    const productsSnap = await db.collection('vendorProducts')
      .where('vendorUid', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .limit(PRODUCTS_LIMIT)
      .get();

    const products = [];
    productsSnap.forEach((doc) => {
      const p = doc.data();
      products.push({
        id: doc.id,
        title: p.title,
        type: p.type,
        price: p.price,
        category: p.category,
        stock: p.stock,
        isActive: p.isActive,
        totalSales: p.totalSales || 0,
        images: p.images || [],
        createdAt: p.createdAt
      });
    });

    return res.status(200).json({
      success: true,
      vendor: {
        bankAccount: vendor.bankAccount || null,
        totalEarned: vendor.totalEarned || 0,
        pendingPayout: vendor.pendingPayout || 0,
        awaitingPayout: vendor.awaitingPayout || 0,
        totalPaidOut: vendor.totalPaidOut || 0,
        totalSales: vendor.totalSales || 0
      },
      products
    });

  } catch (err) {
    console.error('vendor get-profile error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};