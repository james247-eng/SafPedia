// api/vendors/request-payout.js

const { getFirebaseAdmin } = require('../../lib/firebase-admin');
const { getAuthedUser } = require('../../lib/auth');

/**
 * POST /api/vendors/request-payout
 * Any vendor with a bank account on file (no approval status required —
 * vendors are never "approved" in this system). Reserves the requested
 * amount (pendingPayout -> awaitingPayout) in a transaction first, then
 * fires a real Paystack Transfer on the MARKETPLACE account. If Paystack
 * rejects the transfer outright, the reservation is rolled back immediately.
 * Final settlement (success/failure) is confirmed asynchronously by the
 * transfer.success / transfer.failed / transfer.reversed webhook events in
 * /api/marketplace/webhook.js — this endpoint only reflects Paystack's
 * *initial* response.
 *
 * IMPORTANT: payout requests are written to vendors/{uid}/vendorPayoutRequests,
 * NOT payoutRequests — the webhook's collectionGroup query depends on this
 * exact name to avoid colliding with the affiliate program's payoutRequests
 * collection group.
 *
 * Header: Authorization: Bearer <firebase-id-token>
 * Body: { amount? }  // defaults to full pendingPayout balance if omitted
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let admin, db, vendorRef, payoutRef, requestAmount;

  try {
    admin = getFirebaseAdmin();
    db = admin.firestore();

    const user = await getAuthedUser(req, admin);
    const { amount } = req.body || {};

    vendorRef = db.collection('vendors').doc(user.uid);
    const vendorSnap = await vendorRef.get();

    if (!vendorSnap.exists) {
      return res.status(403).json({ error: 'You do not have a vendor account yet' });
    }

    const vendorData = vendorSnap.data();

    if (vendorData.isSuspended) {
      return res.status(403).json({ error: 'This vendor account is suspended and cannot request payouts' });
    }

    if (!vendorData.bankAccount || !vendorData.bankAccount.recipientCode) {
      return res.status(400).json({ error: 'Add a bank account before requesting a payout' });
    }

    const available = vendorData.pendingPayout || 0;
    requestAmount = typeof amount === 'number' && amount > 0 ? amount : available;

    if (requestAmount <= 0) {
      return res.status(400).json({ error: 'No payout balance available' });
    }
    if (requestAmount > available) {
      return res.status(400).json({ error: `Requested amount exceeds available balance of ₦${available}` });
    }

    // ---- Reserve the funds first ----
    payoutRef = vendorRef.collection('vendorPayoutRequests').doc();

    await db.runTransaction(async (tx) => {
      tx.set(payoutRef, {
        amount: requestAmount,
        status: 'processing',
        reference: payoutRef.id, // used by the webhook to match this record back
        vendorUid: user.uid,
        createdAt: admin.firestore.Timestamp.now()
      });
      tx.set(vendorRef, {
        pendingPayout: admin.firestore.FieldValue.increment(-requestAmount),
        awaitingPayout: admin.firestore.FieldValue.increment(requestAmount),
        updatedAt: admin.firestore.Timestamp.now()
      }, { merge: true });
    });

    // ---- Fire the actual Paystack transfer (marketplace account) ----
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY_MARKETPLACE;
    if (!PAYSTACK_SECRET) {
      await rollbackPayout(db, admin, vendorRef, payoutRef, requestAmount, 'PAYSTACK_SECRET_KEY_MARKETPLACE not configured');
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
          recipient: vendorData.bankAccount.recipientCode,
          reason: 'Vendor product sale payout',
          reference: payoutRef.id
        })
      });
      transferJson = await transferRes.json();
    } catch (networkErr) {
      await rollbackPayout(db, admin, vendorRef, payoutRef, requestAmount, networkErr.message);
      return res.status(502).json({ error: 'Could not reach Paystack transfer API: ' + networkErr.message });
    }

    if (!transferJson.status) {
      await rollbackPayout(db, admin, vendorRef, payoutRef, requestAmount, transferJson.message || 'Transfer rejected');
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
    console.error('vendor request-payout error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};

async function rollbackPayout(db, admin, vendorRef, payoutRef, amount, reason) {
  await db.runTransaction(async (tx) => {
    tx.set(payoutRef, {
      status: 'failed',
      failureReason: reason,
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });
    tx.set(vendorRef, {
      pendingPayout: admin.firestore.FieldValue.increment(amount),
      awaitingPayout: admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });
  });
}