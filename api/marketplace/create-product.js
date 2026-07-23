// api/marketplace/create-product.js

const { getFirebaseAdmin } = require('../../lib/firebase-admin');
const { getAuthedUser } = require('../../lib/auth');
const { verifyAsset } = require('../../lib/cloudinary-storage');

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_IMAGES = 6;
const ALLOWED_TYPES = new Set(['physical', 'digital']);

/**
 * POST /api/marketplace/create-product
 * Any authenticated user — no admin approval required. Vendor's first name
 * is denormalized onto the product at creation time so product pages never
 * need to look up or expose the vendor's account beyond that.
 *
 * Body:
 *   {
 *     productId,          // client-generated draft ID, matches the ID used
 *                          // when requesting Cloudinary upload signatures
 *     title, description, category, price,
 *     type: 'physical' | 'digital',
 *     stock,               // required if type === 'physical', integer >= 0
 *     digitalAsset: { publicId, format },  // required if type === 'digital'
 *     images: [ { publicId } ]             // optional, up to MAX_IMAGES
 *   }
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    const user = await getAuthedUser(req, admin);

    const vendorSnap = await db.collection('vendors').doc(user.uid).get();
    if (vendorSnap.exists && vendorSnap.data().isSuspended) {
      return res.status(403).json({ error: 'This vendor account is suspended and cannot create new products' });
    }

    const {
      productId,
      title,
      description,
      category,
      price,
      type,
      stock,
      digitalAsset,
      images
    } = req.body || {};

    // ---- Basic field validation ----
    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid productId' });
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Missing title' });
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return res.status(400).json({ error: `title must be ${MAX_TITLE_LENGTH} characters or fewer` });
    }
    if (description && (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH)) {
      return res.status(400).json({ error: `description must be a string of ${MAX_DESCRIPTION_LENGTH} characters or fewer` });
    }
    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'Missing category' });
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: 'price must be a positive number' });
    }
    if (!type || !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ error: "type must be 'physical' or 'digital'" });
    }
    if (images !== undefined) {
      if (!Array.isArray(images) || images.length > MAX_IMAGES) {
        return res.status(400).json({ error: `images must be an array of up to ${MAX_IMAGES} items` });
      }
    }

    const expectedFolder = `vendor-products/${user.uid}/${productId}`;

    // ---- Type-specific validation ----
    let stockValue = null;
    let digitalAssetValue = null;

    if (type === 'physical') {
      if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ error: 'stock must be a non-negative integer for physical products' });
      }
      stockValue = stock;
    }

    if (type === 'digital') {
      if (!digitalAsset || typeof digitalAsset.publicId !== 'string' || typeof digitalAsset.format !== 'string') {
        return res.status(400).json({ error: 'digitalAsset { publicId, format } is required for digital products' });
      }
      if (!digitalAsset.publicId.startsWith(`${expectedFolder}/digital/`)) {
        return res.status(403).json({ error: 'digitalAsset does not belong to this product/account' });
      }

      const resource = await verifyAsset({
        publicId: digitalAsset.publicId,
        resourceType: 'raw',
        type: 'authenticated'
      });
      if (!resource) {
        return res.status(400).json({ error: 'Uploaded digital file not found — upload may have failed or is still in progress' });
      }

      digitalAssetValue = {
        publicId: digitalAsset.publicId,
        format: digitalAsset.format,
        bytes: resource.bytes || null
      };
    }

    // ---- Verify any product images actually made it to Cloudinary ----
    const verifiedImages = [];
    if (images && images.length) {
      for (const img of images) {
        if (!img || typeof img.publicId !== 'string') {
          return res.status(400).json({ error: 'Each image must include a publicId' });
        }
        if (!img.publicId.startsWith(`${expectedFolder}/media/`)) {
          return res.status(403).json({ error: 'One or more image assets do not belong to this product/account' });
        }
        const resource = await verifyAsset({
          publicId: img.publicId,
          resourceType: 'image',
          type: 'upload'
        });
        if (!resource) {
          return res.status(400).json({ error: `Image not found in storage: ${img.publicId}` });
        }
        verifiedImages.push({ publicId: img.publicId, url: resource.secure_url });
      }
    }

    // ---- Prevent overwriting an existing product via this endpoint ----
    const productRef = db.collection('vendorProducts').doc(productId);
    const existing = await productRef.get();
    if (existing.exists) {
      return res.status(409).json({ error: 'A product with this ID already exists — use update-product instead' });
    }

    // ---- Denormalize the vendor's first name for display purposes ----
    // Product pages should only ever show this, never the full user record.
    let vendorFirstName = 'Vendor';
    try {
      const userDoc = await db.collection('user').doc(user.uid).get();
      if (userDoc.exists) {
        const u = userDoc.data();
        vendorFirstName = u.firstName || (u.email ? u.email.split('@')[0] : 'Vendor');
      }
    } catch (err) {
      console.warn('Could not fetch vendor first name, using fallback:', err.message);
    }

    const productData = {
      vendorUid: user.uid,
      vendorFirstName,
      title: title.trim(),
      description: description ? description.trim() : '',
      category: category.trim(),
      price,
      type,
      stock: stockValue,
      digitalAsset: digitalAssetValue,
      images: verifiedImages,
      isActive: true,
      totalSales: 0,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    await productRef.set(productData);

    return res.status(200).json({ success: true, productId, product: productData });

  } catch (err) {
    console.error('create-product error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
};