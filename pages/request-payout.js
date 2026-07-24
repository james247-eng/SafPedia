const { getFirebaseAdmin } = require('../lib/firebase-admin');
const { getAuthedUser } = require('../lib/auth');

/**
 * POST /api/affiliates/request-payout
 * Approved affiliate only, requires a bank account already added via /add-bank-account.
 * Reserves the requested amount (pendingPayout -> awaitingPayout) in a transaction first,
 * then fires a real Paystack Transfer. If Paystack rejects the transfer outright, the
 * reservation is rolled back immediately. Final settlement (success/failure) is confirmed
 * asynchronously by the transfer.success / transfer.failed / transfer.reversed webhook events
 * in /api/paystack/webhook.js — this endpoint only reflects Paystack's *initial* response.
 *
 * Header: Authorization: Bearer <firebase-id-token>
 * Body: { amount? }  // defaults to full pendingPayout balance if omitted
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let admin, db, affRef, payoutRef, requestAmount;

  try {
    admin = getFirebaseAdmin();
    db = admin.firestore();

    const user = await getAuthedUser(req, admin);
    const { amount } = req.body || {};

    affRef = db.collection('affiliates').doc(user.uid);
    const affSnap = await affRef.get();

    if (!affSnap.exists || affSnap.data().status !== 'approved') {
      return res.status(403).json({ error: 'You do not have an approved affiliate account' });
    }

    const affData = affSnap.data();

    if (!affData.bankAccount || !affData.bankAccount.recipientCode) {
      return res.status(400).json({ error: 'Add a bank account before requesting a payout' });
    }

    const available = affData.pendingPayout || 0;
    requestAmount = typeof amount === 'number' && amount > 0 ? amount : available;

    if (requestAmount <= 0) {
      return res.status(400).json({ error: 'No payout balance available' });
    }
    if (requestAmount > available) {
      return res.status(400).json({ error: `Requested amount exceeds available balance of ₦${available}` });
    }

    // ---- Reserve the funds first ----
    payoutRef = affRef.collection('payoutRequests').doc();

    await db.runTransaction(async (tx) => {
      tx.set(payoutRef, {
        amount: requestAmount,
        status: 'processing',
        reference: payoutRef.id, // used by the webhook to match this record back
        affiliateUid: user.uid,
        createdAt: admin.firestore.Timestamp.now()
      });
      tx.set(affRef, {
        pendingPayout: admin.firestore.FieldValue.increment(-requestAmount),
        awaitingPayout: admin.firestore.FieldValue.increment(requestAmount),
        updatedAt: admin.firestore.Timestamp.now()
      }, { merge: true });
    });

    // ---- Fire the actual Paystack transfer ----
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      await rollbackPayout(db, admin, affRef, payoutRef, requestAmount, 'PAYSTACK_SECRET_KEY not configured');
      return res.status(500).json({ error: 'Payout provider not configured' });
    }

    let transferJson;
    try {
      const transferRes = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source: 'balance',
          amount: Math.round(requestAmount * 100), // naira -> kobo
          recipient: affData.bankAccount.recipientCode,
          reason: 'Affiliate commission payout',
          reference: payoutRef.id
        })
      });
      transferJson = await transferRes.json();
    } catch (networkErr) {
      await rollbackPayout(db, admin, affRef, payoutRef, requestAmount, networkErr.message);
      return res.status(502).json({ error: 'Could not reach Paystack transfer API: ' + networkErr.message });
    }

    if (!transferJson.status) {
      await rollbackPayout(db, admin, affRef, payoutRef, requestAmount, transferJson.message || 'Transfer rejected');
      return res.status(502).json({ error: transferJson.message || 'Paystack transfer failed', details: transferJson });
    }

    // Transfer accepted by Paystack — final state confirmed later via webhook
    await payoutRef.set({
      transferCode: transferJson.data.transfer_code,
      paystackStatus: transferJson.data.status, // typically 'pending' or 'success'
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });

    return res.status(200).json({
      success: true,
      payoutId: payoutRef.id,
      amount: requestAmount,
      status: transferJson.data.status
    });

  } catch (err) {
    console.error('request-payout error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};

async function rollbackPayout(db, admin, affRef, payoutRef, amount, reason) {
  await db.runTransaction(async (tx) => {
    tx.set(payoutRef, {
      status: 'failed',
      failureReason: reason,
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });
    tx.set(affRef, {
      pendingPayout: admin.firestore.FieldValue.increment(amount),
      awaitingPayout: admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });
  });
}