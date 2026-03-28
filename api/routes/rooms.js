const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const { protect, adminOnly } = require('../middleware/auth');

// Helper functions to fix date logic bugs
function getDateRange(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  return { dayStart, dayEnd };
}

function getCurrentTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}


// GET /api/rooms - get all rooms with their current status for a date
router.get('/', protect, async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true });
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const { dayStart, dayEnd } = getDateRange(dateStr);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentTimeStr = getCurrentTimeStr();
    
    const bookings = await Booking.find({
      date: { $gte: dayStart, $lte: dayEnd },
      status: 'confirmed',
      $or: [
        { date: { $gt: today } },
        { date: today, endTime: { $gt: currentTimeStr } }
      ]
    });

    const roomsWithStatus = rooms.map((room) => {
      const roomBookings = bookings.filter((b) => b.room.toString() === room._id.toString());
      const status = roomBookings.length > 0 ? 'booked' : 'available';
      return { ...room.toObject(), status };
    });

    res.json({ success: true, data: roomsWithStatus });
  } catch (err) {
    console.error('Rooms GET error:', err); // Log for Vercel
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});


// GET /api/rooms/schedule - get schedule grid data for a date
router.get('/schedule', protect, async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true });
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const { dayStart, dayEnd } = getDateRange(dateStr);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentTimeStr = getCurrentTimeStr();
    
    const bookings = await Booking.find({
      date: { $gte: dayStart, $lte: dayEnd },
      status: 'confirmed',
      $or: [
        { date: { $gt: today } },
        { date: today, endTime: { $gt: currentTimeStr } }
      ]
    }).populate('user', 'username');

    res.json({ success: true, rooms, bookings });
  } catch (err) {
    console.error('Rooms schedule error:', err); // Log for Vercel
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});


// POST /api/rooms - admin only: create a room
router.post(
  '/',
  protect,
  adminOnly,
  [
    body('name').trim().notEmpty().withMessage('Room name is required'),
    body('number').trim().notEmpty().withMessage('Room number is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const room = await Room.create(req.body);
      res.status(201).json({ success: true, data: room });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ success: false, message: 'Room name or number already exists.' });
      }
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// PUT /api/rooms/:id - admin only: update room
router.put(
  '/:id',
  protect,
  adminOnly,
  [
    body('name').optional().trim().notEmpty().withMessage('Room name is required'),
    body('number').optional().trim().notEmpty().withMessage('Room number is required'),
    body('capacity').optional().isInt({ min: 1 }),
    body('description').optional(),
    body('imageUrl').optional()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const room = await Room.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true, runValidators: true }
      );

      if (!room) {
        return res.status(404).json({ success: false, message: 'Room not found.' });
      }

      res.json({ success: true, data: room });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ success: false, message: 'Room name or number already exists.' });
      }
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// DELETE /api/rooms/:id - admin only
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Room.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Room deactivated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
