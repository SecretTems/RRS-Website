const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// PATCH /api/users/profile - update username or profilePhoto (base64)
router.patch(
  '/profile',
  protect,
  [
    body('username')
      .optional()
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be 3–30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('profilePhoto')
      .optional()
      .isString()
      .withMessage('Profile photo must be a base64 string')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const updates = {};
      if (req.body.username) updates.username = req.body.username;
      if (req.body.profilePhoto) updates.profilePhoto = req.body.profilePhoto;

      const user = await User.findByIdAndUpdate(req.user._id, updates, {
        new: true,
        runValidators: true
      });

      res.json({ success: true, user });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ success: false, message: 'Username already taken.' });
      }
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

module.exports = router;
