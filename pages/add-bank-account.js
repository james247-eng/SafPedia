const { getFirebaseAdmin } = require('../lib/firebase-admin');
const { getAuthedUser } = require('../lib/auth');

/**
 * POST /api/affiliates/add-bank-account
 * Approved affiliate only. Resolves the account number to a name (so the affiliate
 * can confirm it's correct before saving), then registers a Paystack transfer recipient
 * and stores the recipientCode — required before /request-payout will work.
 * Body: { bankCode, accountNumber }
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    const user = await getAuthedUser(req, admin);
    const { bankCode, accountNumber } = req.body || {};

    if (!bankCode || !accountNumber) {
      return res.status(400).json({ error: 'Missing bankCode or accountNumber' });
    }

    const affRef = db.collection('affiliates').doc(user.uid);
    const affSnap = await affRef.get();

    if (!affSnap.exists || affSnap.data().status !== 'approved') {
      return res.status(403).json({ error: 'You do not have an approved affiliate account' });
    }

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY not configured' });
    }

    // Step 1: resolve account number -> account name (also validates the number is real)
    const resolveRes = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    const resolveJson = await resolveRes.json();

    if (!resolveJson.status) {
      return res.status(400).json({ error: resolveJson.message || 'Could not verify account number' });
    }

    const accountName = resolveJson.data.account_name;

    // Step 2: register a transfer recipient on Paystack (needed to send money to this account)
    const recipientRes = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'nuban',
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'NGN'
      })
    });
    const recipientJson = await recipientRes.json();

    if (!recipientJson.status) {
      return res.status(502).json({ error: recipientJson.message || 'Could not register bank account with Paystack' });
    }

    const bankAccount = {
      bankCode,
      accountNumber,
      accountName,
      recipientCode: recipientJson.data.recipient_code
    };

    await affRef.set({
      bankAccount,
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });

    return res.status(200).json({ success: true, bankAccount });

  } catch (err) {
    console.error('add-bank-account error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};