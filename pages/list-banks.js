const { getFirebaseAdmin } = require('../lib/firebase-admin');
const { getAuthedUser } = require('../lib/auth');

/**
 * GET /api/affiliates/list-banks
 * Any authenticated user. Returns { name, code } for every Nigerian bank Paystack supports,
 * for populating a bank-select dropdown before calling /add-bank-account.
 */
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    await getAuthedUser(req, admin); // must be logged in; any role is fine here

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY not configured' });
    }

    const banksRes = await fetch('https://api.paystack.co/bank?country=nigeria', {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
    });
    const banksJson = await banksRes.json();

    if (!banksJson.status) {
      return res.status(502).json({ error: 'Could not fetch bank list from Paystack' });
    }

    const banks = banksJson.data.map((b) => ({ name: b.name, code: b.code }));
    return res.status(200).json({ success: true, banks });

  } catch (err) {
    console.error('list-banks error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};