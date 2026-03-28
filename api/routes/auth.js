const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  user.password = undefined;

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      profilePhoto: user.profilePhoto
    }
  });
};

// POST /api/auth/register
router.post(
  '/register',
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be 3–30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and a number'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { username, email, password } = req.body;

      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        const field = existingUser.email === email ? 'Email' : 'Username';
        return res.status(400).json({ success: false, message: `${field} is already taken.` });
      }

      const user = await User.create({ username, email, password });
      sendToken(user, 201, res);
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email }).select('+password');

      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      sendToken(user, 200, res);
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
  }
);

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.cookie('token', '', { maxAge: 0 });
  res.json({ success: true, message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// DELETE /api/auth/delete-account
router.delete('/delete-account', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    await Booking.deleteMany({ user: userId });
    await Announcement.updateMany({}, { $pull: { comments: { author: userId } } });
    await Announcement.deleteMany({ author: userId });
    await User.findByIdAndDelete(userId);
    res.cookie('token', '', { maxAge: 0 });
    res.json({ success: true, message: 'Account deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});



// POST /api/auth/reset-password
router.post(
  '/reset-password',
  [
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and a number'),
    body('token').notEmpty().withMessage('Token is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { email, password, token } = req.body;

      const user = await User.findOne({ 
        email, 
        resetToken: token,
        resetTokenExpiry: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
      }

      user.password = password;
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;
      await user.save();

      res.json({ success: true, message: 'Password reset successful. Please login.' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

module.exports = router;
