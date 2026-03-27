const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const Booking = require('../models/Booking');
const Room = require('../models/Room');

// Mock AI responses based on keywords
const getMockAIResponse = async (message, userId) => {
  const msg = message.toLowerCase();

  if (msg.includes('available') || msg.includes('free') || msg.includes('book')) {
    const today = new Date();
    const dayStart = new Date(today.setHours(0, 0, 0, 0));
    const dayEnd = new Date(today.setHours(23, 59, 59, 999));
    const rooms = await Room.find({ isActive: true });
    const bookings = await Booking.find({
      date: { $gte: dayStart, $lte: dayEnd },
      status: { $in: ['confirmed', 'occupied'] }
    });
    const bookedIds = [...new Set(bookings.map((b) => b.room.toString()))];
    const available = rooms.filter((r) => !bookedIds.includes(r._id.toString()));
    if (available.length > 0) {
      return `Currently available rooms today: ${available.map((r) => r.name).join(', ')}. You can book them from the Rooms page!`;
    }
    return 'All rooms appear to be booked for today. Check the Schedule page for other available time slots.';
  }

  if (msg.includes('my booking') || msg.includes('reservation')) {
    const bookings = await Booking.find({ user: userId, status: 'confirmed' })
      .populate('room', 'name')
      .sort({ date: 1 });
    if (bookings.length === 0) return "You don't have any active bookings. Head to the Rooms page to make one!";
    const list = bookings.map((b) => `${b.room.name} on ${new Date(b.date).toLocaleDateString()} from ${b.startTime}–${b.endTime}`).join('\n');
    return `Your upcoming bookings:\n${list}`;
  }

  if (msg.includes('cancel')) {
    return "To cancel a booking, go to your Account page and check your booking history. You can cancel from there.";
  }

  if (msg.includes('room') || msg.includes('book')) {
    return "You can book rooms in the rooms page.";
  }

  if (msg.includes('schedule') || msg.includes('timetable')) {
    return "The Schedule page shows a color-coded grid of all room availability. Green = available to book, Red = booked.";
  }

  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    return "Hello! I'm the RRS Assistant. I can help you find available rooms, check your bookings, or answer questions about the reservation system. What would you like to know?";
  }

  if (msg.includes('help')) {
    return "Here's what I can help with:\n• Check available rooms for today\n• View your current bookings\n• Explain how the schedule works\n• Guide you through booking a room\n\nJust ask me anything!";
  }

  return "I'm here to help with room reservations! Try asking me about available rooms, your bookings, or how to navigate the system.";
};

// POST /api/ai/chat
router.post(
  '/chat',
  protect,
  [body('message').trim().notEmpty().withMessage('Message cannot be empty').isLength({ max: 500 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const response = await getMockAIResponse(req.body.message, req.user._id);
      // Simulate typing delay
      await new Promise((resolve) => setTimeout(resolve, 600));
      res.json({ success: true, response });
    } catch (err) {
      res.status(500).json({ success: false, message: 'AI service unavailable.' });
    }
  }
);

module.exports = router;
