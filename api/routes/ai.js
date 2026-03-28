const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const User = require('../models/User');

// Mock AI responses based on keywords - MASSIVELY EXPANDED (60+ cases)
const getMockAIResponse = async (message, userId) => {
  const msg = message.toLowerCase();

  // Greetings (10 variations)
  if (['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'sup'].some(k => msg.includes(k))) {
    const greetings = [
      "Hello! I'm your RRS AI assistant. How can I help with rooms or bookings?",
      "Hi! What room needs can I assist with today?",
      "Hey there! Ready to check availability or your schedule?",
      "Good [time]! Ask about available rooms, your bookings, or help.",
      "Hello! Let's find you a room."
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // Comprehensive help
  if (['help', 'what can you do', 'assist', 'commands'].some(k => msg.includes(k))) {
    return `I can help with 20+ topics:

**Rooms & Availability**
• available rooms
• all rooms list
• free rooms today

**Bookings**
• my bookings
• past history
• cancel booking
• how to book room

**Navigation**
• where is schedule
• account settings
• login help

**Fun**
• joke
• quote

**Admin** (if admin)
• pending bookings
• manage rooms

**Stats**
• room stats

Ask anything - I'm learning!`;
  }

  // Availability - multiple keywords
  if (['available', 'free', 'vacant', 'open', 'empty', 'unused'].some(k => msg.includes(k)) && ['room', 'rooms'].some(k => msg.includes(k))) {
    const rooms = await Room.find({ isActive: true });
    const todayBookings = await Booking.aggregate([
      { $match: { 
        date: {
          $gte: new Date(new Date().setHours(0,0,0,0)),
          $lte: new Date(new Date().setHours(23,59,59,999))
        },
        status: { $in: ['confirmed', 'occupied'] }
      }},
      { $group: { _id: '$room' } }
    ]);
    const available = rooms.filter(r => !todayBookings.some(b => b._id.toString() === r._id.toString()));
    if (!available.length) return 'Sorry, no rooms available today. Try the Schedule page for other dates.';
    const list = available.slice(0,6).map(r => `${r.name} (${r.capacity} seats)`).join('\\n');
    return `Available rooms today:\\n${list}${(available.length > 6 ? `\\n...and ${available.length - 6} more` : '')}`;
  }

  // My bookings - upcoming
  if (['my booking', 'my reservation', 'my schedule', 'upcoming', 'next'].some(k => msg.includes(k))) {
    const bookings = await Booking.find({ 
      user: userId, 
      status: 'confirmed',
      date: { $gte: new Date() }
    }).populate('room', 'name number capacity').sort('date');
    if (!bookings.length) return 'No upcoming bookings. Book one from Rooms page!';
    return bookings.map((b, i) => `${i+1}. ${b.room.name} (${b.room.number}) ${new Date(b.date).toLocaleDateString()} ${b.startTime}-${b.endTime} (cap: ${b.room.capacity})`).slice(0,5).join('\\n');
  }

  // Past/history
  if (['past', 'history', 'previous', 'old'].some(k => msg.includes(k))) {
    const past = await Booking.find({ user: userId }).populate('room', 'name').sort({date: -1}).limit(8);
    if (!past.length) return 'No booking history yet.';
    return `Recent history:\\n${past.map(b => `${new Date(b.date).toLocaleDateString()}: ${b.room.name} (${b.status})`).join('\\n')}`;
  }

  // Cancel
  if (['cancel', 'delete', 'remove'].some(k => msg.includes(k)) && ['book', 'reservation'].some(k => msg.includes(k))) {
    return `Cancel bookings:
1. Account page → History tab
2. Click Cancel on confirmed future bookings
Cannot cancel past or pending.`;
  }

  // All rooms list
  if (['all room', 'room list', 'rooms list', 'what rooms'].some(k => msg.includes(k))) {
    const rooms = await Room.find({ isActive: true }).sort('name');
    if (!rooms.length) return 'No active rooms at the moment.';
    const list = rooms.map(r => `• ${r.name} (${r.number}): ${r.capacity} seats${r.description ? ` - ${r.description.slice(0,50)}` : ''}`).slice(0,10).join('\\n');
    return `Active rooms (${rooms.length}):\\n${list}`;
  }

  // Schedule guide
  if (['schedule', 'calendar', 'timetable', 'grid'].some(k => msg.includes(k))) {
    return `Schedule page:
• Color grid: days × times
• GREEN = BOOK NOW
• RED = Booked
• Click green → booking form
• Filter rooms top
• Zoom/pan for dates`;
  }

  // How to book
  if (['how to book', 'book room', 'reserve room', 'make reservation'].some(k => msg.includes(k))) {
    return `Step-by-step booking:
1. Rooms page
2. Click room card
3. Select date/time (green only)
4. Fill purpose (optional)
5. Submit
Admin approves. No overlaps!`;
  }

  // Profile/Account
  if (['profile', 'edit profile', 'change name', 'photo'].some(k => msg.includes(k))) {
    return `Account page tabs:
History: View/cancel bookings
Edit Profile: Username & photo upload (drag/drop)
Danger Zone: Logout/Delete`;
  }

  // Password
  if (['password', 'change password', 'reset'].some(k => msg.includes(k))) {
    return `Password reset:
Login → Forgot Password → email link → new password`;
  }

  // Admin
  if (['admin', 'pending', 'approve', 'reject'].some(k => msg.includes(k))) {
    const userDoc = await User.findById(userId).select('role');
    if (userDoc.role !== 'admin') return 'Admin Dashboard access required for those features.';
    return `Admin actions:
Pending: Approve/reject bookings
Rooms: Add/edit/delete
Announcements: Create/manage`;
  }

  // Stats/Dash
  if (['stats', 'total', 'count', 'how many'].some(k => msg.includes(k))) {
    const [roomCount, bookingCount, myCount] = await Promise.all([
      Room.countDocuments({isActive: true}),
      Booking.countDocuments({status: 'confirmed'}),
      Booking.countDocuments({user: userId})
    ]);
    return `Dashboard stats:
Active rooms: ${roomCount}
Total bookings: ${bookingCount}
Your bookings: ${myCount}`;
  }

  // Fun content
  if (['joke', 'funny', 'haha'].some(k => msg.includes(k))) {
    const jokes = [
      "Why do programmers prefer dark mode? Light attracts bugs!",
      "Room said to calendar: 'Book me!'",
      "Bookings are like diets - easier to make than keep!"
    ];
    return jokes[Math.floor(Math.random() * jokes.length)] + '\\n\\nNow, rooms?';
  }

  if (['quote', 'motivate', 'inspire'].some(k => msg.includes(k))) {
    const quotes = [
      "'The time is always right to do what is right.' - MLK",
      "'Plan your work, work your plan.' - Napoleon Hill",
      "'Success is where preparation meets opportunity.'"
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }

  // Navigation help
  if (['home', 'landing', 'main'].some(k => msg.includes(k))) {
    return 'Main page: Rooms or click navbar logo.';
  }

  if (['login', 'sign in'].some(k => msg.includes(k))) {
    return 'Login: /pages/login.html. Forgot? Use reset.';
  }

  // Troubleshooting
  if (['error', 'bug', 'broken', 'not working'].some(k => msg.includes(k))) {
    return `Troubleshoot:
1. F5 refresh
2. Check connection
3. Login again (clear cookies)
4. Contact admin for approvals`;
  }

  // Time/Purpose
  if (['time slot', 'hours', 'schedule time'].some(k => msg.includes(k))) {
    return 'Time slots: 30min, university hours (8AM-8PM typical). See Schedule.';
  }

  if (['purpose', 'why book'].some(k => msg.includes(k))) {
    return 'Purpose: Optional in form, helps admins (meeting/class/group).';
  }

  // Weekend
  if (['weekend', 'saturday', 'sunday'].some(k => msg.includes(k))) {
    return 'Weekends: Limited availability. Check Schedule grid.';
  }

  // Thanks/Bye
  if (['thank', 'thanks'].some(k => msg.includes(k))) {
    return 'No problem! Book wisely! 📚';
  }

  if (['bye', 'goodbye', 'see ya'].some(k => msg.includes(k))) {
    return 'Bye! Perfect booking day ahead!';
  }

  // Ultimate fallback
  return 'Understood. Try "help" or "available rooms". More features coming!';
};  
await new Promise((resolve) => setTimeout(resolve, Math.random() * 1700 + 800));
