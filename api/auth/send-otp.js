import {
  generateOTP,
  storeOTP,
  sendOTPEmail,
  validatePhinmaEmail,
} from '../../lib/email.js';
import { getUserByEmail } from '../../lib/auth.js';
import {
  handleCors,
  sendSuccess,
  sendError,
  validateRequiredFields,
  sanitizeObject,
  checkRateLimit,
} from '../../lib/middleware.js';

export default async function handler(req, res) {
  // Handle CORS
  if (handleCors(req, res)) return;

  // Only allow POST
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', 405);
  }

  try {
    // Rate limiting
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const rateLimit = checkRateLimit(`send-otp:${clientIp}`, 3, 300000); // 3 per 5 minutes
    
    if (!rateLimit.allowed) {
      return sendError(res, 'Too many OTP requests. Please try again later.', 429);
    }

    // Validate required fields
    const requiredFields = ['email'];
    const fieldErrors = validateRequiredFields(req.body, requiredFields);
    
    if (fieldErrors) {
      return sendError(res, 'Validation failed', 400, fieldErrors);
    }

    // Sanitize input
    const sanitizedBody = sanitizeObject(req.body);
    const { email } = sanitizedBody;

    // Validate PHINMA email
    const emailValidation = validatePhinmaEmail(email);
    if (!emailValidation.valid) {
      return sendError(res, emailValidation.message, 400);
    }

    // Check if email is already registered (for signup flow)
    const existingUser = await getUserByEmail(email);
    if (existingUser && req.body.checkExisting !== false) {
      return sendError(res, 'Email already registered', 400);
    }

    // Generate and send OTP
    const otp = generateOTP();
    await storeOTP(email, otp);
    await sendOTPEmail(email, otp);

    sendSuccess(res, {
      message: 'OTP sent successfully to your email',
      // In development, include OTP for testing
      ...(process.env.NODE_ENV === 'development' && { otp }),
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    sendError(res, 'Failed to send OTP', 500);
  }
}