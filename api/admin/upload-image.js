import { requireAdmin } from '../../../lib/auth.js';
import { handleCors, sendSuccess, sendError } from '../../../lib/middleware.js';

export default async function handler(req, res) {
  // Handle CORS
  if (handleCors(req, res)) return;

  // Only allow POST
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', 405);
  }

  try {
    // Check admin access
    const adminAuth = await requireAdmin(req);
    if (!adminAuth.authorized) {
      return sendError(res, adminAuth.error, adminAuth.status);
    }

    const { image, filename } = req.body;

    if (!image) {
      return sendError(res, 'No image provided', 400);
    }

    // Validate base64 image
    if (!image.startsWith('data:image/')) {
      return sendError(res, 'Invalid image format', 400);
    }

    // In production, upload to cloud storage (Cloudinary, AWS S3, etc.)
    // For now, we'll return the base64 image URL
    
    // TODO: Implement actual cloud storage upload
    /*
    Example with Cloudinary:
    
    const cloudinary = require('cloudinary').v2;
    
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    
    const result = await cloudinary.uploader.upload(image, {
      folder: 'rrs/rooms',
      public_id: filename || `room_${Date.now()}`,
      resource_type: 'image',
    });
    
    const imageUrl = result.secure_url;
    */

    // For development, return the base64 image
    const imageUrl = image;

    sendSuccess(res, {
      message: 'Image uploaded successfully',
      imageUrl,
      // In production, also return:
      // publicId: result.public_id,
      // width: result.width,
      // height: result.height,
    });
  } catch (error) {
    console.error('Upload image error:', error);
    sendError(res, 'Failed to upload image', 500);
  }
}