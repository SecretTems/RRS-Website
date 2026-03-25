import { verifyOTP } from '../../lib/email.js';
import {
  handleCors,
  sendSuccess,
  sendError,
  validateRequiredFields,
  sanitizeObject,
} from '../../lib/middleware.js';

export default async function handler(req, res) {
  // Handle CORS
  if (handleCors(req, res)) return;

  // Only allow POST
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', 405);
  }

  try {
    // Validate required fields
    const requiredFields = ['email', 'otp'];
    const fieldErrors = validateRequiredFields(req.body, requiredFields);
    
    if (fieldErrors) {
      return sendError(res, 'Validation failed', 400, fieldErrors);
    }

    // Sanitize input
    const sanitizedBody = sanitizeObject(req.body);
    const { email, otp } = sanitizedBody;

    // Verify OTP
    const verification = await verifyOTP(email, otp);

    if (!verification.valid) {
      return sendError(res, verification.message, 400);
    }

    sendSuccess(res, {
      message: 'Email verified successfully',
      verified: true,
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    sendError(res, 'Failed to verify OTP', 500);
  }
}