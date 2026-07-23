// api/marketplace/get-upload-signature.js

const { getFirebaseAdmin } = require('../../lib/firebase-admin');
const { getAuthedUser } = require('../../lib/auth');
const { generateUploadSignature } = require('../../lib/cloudinary-storage');

/**
 * POST /api/marketplace/get-upload-signature
 * Any authenticated user (vendor or prospective vendor — no approval gate).
 * Returns everything the caller's browser needs to upload a file directly
 * to Cloudinary via a signed upload. The server never touches the file bytes.
 *
 * Body: { productId, kind }
 *   - productId: client-generated draft ID (e.g. Firestore doc().id called
 *     locally before the product document is written) — reused later when
 *     calling /api/marketplace/create-product so files and doc share an ID.
 *   - kind: 'media' (product photos, public) | 'digital' (the downloadable
 *     file itself, kept private behind Cloudinary's 'authenticated' type)
 *
 * The client then POSTs a multipart form to:
 *   https://api.cloudinary.com/v1_1/{cloudName}/{resourceType}/upload
 * including: file, api_key, timestamp, signature, folder, type
 * (must match exactly what this endpoint returned — Cloudinary rejects any
 * signed param that doesn't match the signature).
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const user = await getAuthedUser(req, admin);

    const { productId, kind } = req.body || {};

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid productId' });
    }
    if (!kind || !['media', 'digital'].includes(kind)) {
      return res.status(400).json({ error: "kind must be 'media' or 'digital'" });
    }

    const uploadParams = generateUploadSignature({
      vendorUid: user.uid,
      productId,
      kind
    });

    return res.status(200).json({
      success: true,
      ...uploadParams
    });

  } catch (err) {
    console.error('get-upload-signature error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};