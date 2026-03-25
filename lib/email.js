import { getCollection } from './mongodb.js';

// Generate 6-digit OTP
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Store OTP in database with expiration
export async function storeOTP(email, otp) {
  const otps = await getCollection('otps');
  
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiration

  await otps.deleteMany({ email }); // Remove old OTPs
  
  await otps.insertOne({
    email,
    otp,
    expiresAt,
    createdAt: new Date(),
    verified: false,
  });
}

// Verify OTP
export async function verifyOTP(email, otp) {
  const otps = await getCollection('otps');
  
  const otpRecord = await otps.findOne({
    email,
    otp,
    expiresAt: { $gt: new Date() },
    verified: false,
  });

  if (!otpRecord) {
    return { valid: false, message: 'Invalid or expired OTP' };
  }

  // Mark as verified
  await otps.updateOne(
    { _id: otpRecord._id },
    { $set: { verified: true } }
  );

  return { valid: true };
}

// Validate PHINMA email
export function validatePhinmaEmail(email) {
  const emailLower = email.toLowerCase();
  if (!emailLower.endsWith('@phinmaed.com')) {
    return {
      valid: false,
      message: 'Only @phinmaed.com email addresses are allowed',
    };
  }
  return { valid: true };
}

// Send OTP via email (mock implementation)
// In production, integrate with SendGrid, AWS SES, or similar service
export async function sendOTPEmail(email, otp) {
  // TODO: Integrate with actual email service
  console.log(`[EMAIL] Sending OTP to ${email}: ${otp}`);
  
  // For now, we'll just log it
  // In production, use a service like SendGrid:
  /*
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  
  const msg = {
    to: email,
    from: 'noreply@rrs.phinmaed.com',
    subject: 'Your RRS Verification Code',
    html: `
      <h2>Room Reservation System</h2>
      <p>Your verification code is:</p>
      <h1 style="color: #4A90E2; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
      <p>This code will expire in 10 minutes.</p>
      <p>If you didn't request this code, please ignore this email.</p>
    `,
  };
  
  await sgMail.send(msg);
  */
  
  return true;
}

// Resend OTP
export async function resendOTP(email) {
  const otps = await getCollection('otps');
  
  // Check if there's a recent OTP (within 1 minute)
  const recentOTP = await otps.findOne({
    email,
    createdAt: { $gt: new Date(Date.now() - 60000) },
  });

  if (recentOTP) {
    return {
      success: false,
      message: 'Please wait 1 minute before requesting a new OTP',
    };
  }

  const newOTP = generateOTP();
  await storeOTP(email, newOTP);
  await sendOTPEmail(email, newOTP);

  return {
    success: true,
    message: 'OTP sent successfully',
  };
}