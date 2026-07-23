// api/vendors/add-bank-account.js

const { getFirebaseAdmin } = require('../../lib/firebase-admin');
const { getAuthedUser } = require('../../lib/auth');

/**
 * POST /api/vendors/add-bank-account
 * Any authenticated user — no approval gate, since vendors can list and
 * sell products without admin sign-off. Resolves the account number to a
 * name (so the vendor can confirm it's correct before saving), then
 * registers a Paystack transfer recipient under the MARKETPLACE account
 * (separate from the courses/affiliates Paystack account) and stores the
 * recipientCode — required before /request-payout will work.
 *
 * Note: even if this vendor already has a bank account saved on their
 * affiliate profile, the recipientCode is NOT reusable across Paystack
 * accounts — a fresh recipient must be registered here regardless.
 *
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

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY_MARKETPLACE;
    if (!PAYSTACK_SECRET) {
      return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY_MARKETPLACE not configured' });
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

    // Step 2: register a transfer recipient on the marketplace Paystack account
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

    await db.collection('vendors').doc(user.uid).set({
      bankAccount,
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });

    return res.status(200).json({ success: true, bankAccount });

  } catch (err) {
    console.error('vendor add-bank-account error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};