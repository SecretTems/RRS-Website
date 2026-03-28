const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Announcement = require('../models/Announcement');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/announcements - public
router.get('/', async (req, res) => {
  try {
    let announcements = await Announcement.find()
      .sort({ createdAt: -1 })
      .populate('author', 'username profilePhoto')
      .populate({
        path: 'comments.author',
        select: 'username profilePhoto'
      });
    announcements = announcements.map(ann => {
      const safeAnn = ann.toObject();
      safeAnn.author = safeAnn.author || { username: '[Deleted User]', profilePhoto: null };
      if (safeAnn.comments) {
        safeAnn.comments = safeAnn.comments.map(c => {
          c.author = c.author || { username: '[Deleted User]', profilePhoto: null };
          return c;
        });
      }
      return safeAnn;
    });
    res.json({ success: true, data: announcements });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/announcements/:id/comments - comments for specific ann
router.get('/:id/comments', protect, async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id).populate('comments.author', 'username profilePhoto');
    if (!ann) return res.status(404).json({ success: false, message: 'Announcement not found.' });
    const safeComments = ann.comments.map(c => {
      const safeC = c.toObject();
      safeC.author = safeC.author || { username: '[Deleted User]', profilePhoto: null };
      return safeC;
    });
    res.json({ success: true, data: safeComments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/announcements/:id/comments - add comment
router.post(
  '/:id/comments',
  protect,
  [
    body('text').trim().notEmpty().withMessage('Comment required').isLength({ max: 500 }).withMessage('Max 500 chars')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const ann = await Announcement.findById(req.params.id);
      if (!ann) return res.status(404).json({ success: false, message: 'Announcement not found.' });
      ann.comments.push({
        author: req.user._id,
        text: req.body.text
      });
      await ann.save();
      await ann.populate('comments.author', 'username profilePhoto');
      res.status(201).json({ success: true, data: ann.comments[ann.comments.length - 1] });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// DELETE /api/announcements/:id/comments/:cid - admin only
router.delete('/:id/comments/:cid', protect, adminOnly, async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ success: false, message: 'Announcement not found.' });
    ann.comments = ann.comments.filter(c => c._id.toString() !== req.params.cid);
    await ann.save();
    res.json({ success: true, message: 'Comment deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/announcements - admin only
router.post(
  '/',
  protect,
  adminOnly,
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 150 }),
    body('content').trim().notEmpty().withMessage('Content is required').isLength({ max: 2000 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const announcement = await Announcement.create({
        title: req.body.title,
        content: req.body.content,
        author: req.user._id
      });
      await announcement.populate('author', 'username');
      res.status(201).json({ success: true, data: announcement });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// PATCH /api/announcements/:id/like
router.patch('/:id/like', protect, async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ success: false, message: 'Not found.' });

    const idx = ann.likes.indexOf(req.user._id);
    if (idx === -1) ann.likes.push(req.user._id);
    else ann.likes.splice(idx, 1);
    await ann.save();

    res.json({ success: true, likes: ann.likes.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/announcements/:id/heart
router.patch('/:id/heart', protect, async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ success: false, message: 'Not found.' });

    const idx = ann.hearts.indexOf(req.user._id);
    if (idx === -1) ann.hearts.push(req.user._id);
    else ann.hearts.splice(idx, 1);
    await ann.save();

    res.json({ success: true, hearts: ann.hearts.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/announcements/:id - admin only: update announcement
router.put(
  '/:id',
  protect,
  adminOnly,
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 150 }),
    body('content').trim().notEmpty().withMessage('Content is required').isLength({ max: 2000 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const announcement = await Announcement.findById(req.params.id);
      if (!announcement) {
        return res.status(404).json({ success: false, message: 'Announcement not found.' });
      }
      announcement.title = req.body.title;
      announcement.content = req.body.content;
      await announcement.save();
      await announcement.populate('author', 'username');
      res.json({ success: true, data: announcement });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// DELETE /api/announcements/:id - admin only
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;

