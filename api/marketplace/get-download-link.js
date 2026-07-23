// api/marketplace/get-download-link.js

const { getFirebaseAdmin } = require('../../lib/firebase-admin');
const { getAuthedUser } = require('../../lib/auth');
const { generateSignedDownloadUrl } = require('../../lib/cloudinary-storage');

/**
 * POST /api/marketplace/get-download-link
 * Any authenticated user who actually bought this digital product. Called
 * on-demand from the buyer's purchase history — never store the returned
 * URL anywhere, it expires quickly by design.
 *
 * Body: { productId, reference }
 *   - reference: the Paystack transaction reference, which is also the
 *     sale document ID under vendorProducts/{productId}/sales/{reference}
 *     (see webhook.js's handleChargeSuccess, which writes this doc).
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    const user = await getAuthedUser(req, admin);

    const { productId, reference } = req.body || {};
    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'Missing productId' });
    }
    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({ error: 'Missing reference' });
    }

    const saleRef = db.collection('vendorProducts').doc(productId).collection('sales').doc(reference);
    const saleSnap = await saleRef.get();

    if (!saleSnap.exists) {
      return res.status(404).json({ error: 'Purchase record not found' });
    }

    const sale = saleSnap.data();

    if (sale.buyerUid !== user.uid) {
      return res.status(403).json({ error: 'This purchase does not belong to this account' });
    }
    if (sale.productType !== 'digital') {
      return res.status(400).json({ error: 'This product is not a digital download' });
    }
    if (sale.fulfillmentStatus !== 'available') {
      return res.status(400).json({ error: `Download unavailable — order status: ${sale.fulfillmentStatus || 'unknown'}` });
    }

    const productSnap = await db.collection('vendorProducts').doc(productId).get();
    if (!productSnap.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = productSnap.data();

    if (!product.digitalAsset || !product.digitalAsset.publicId || !product.digitalAsset.format) {
      return res.status(500).json({ error: 'This product has no digital file on record' });
    }

    const downloadUrl = generateSignedDownloadUrl({
      publicId: product.digitalAsset.publicId,
      format: product.digitalAsset.format,
      expiresInSeconds: 900 // 15 minutes
    });

    return res.status(200).json({
      success: true,
      downloadUrl,
      expiresInSeconds: 900
    });

  } catch (err) {
    console.error('get-download-link error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};