/*
POST /api/seed
One-time database seeder — callable via HTTP.
Protected by SEED_SECRET env variable.
Safe to call multiple times (uses upsert).

Usage after deploying:
curl -X POST https://your-app.vercel.app/api/seed \
-H "Content-Type: application/json" \
-d '{"secret":"YOUR_SEED_SECRET"}'

Or just open a fetch() in the browser console:
fetch('/api/seed', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({secret:'YOUR_SEED_SECRET'})}).then(r=>r.json()).then(console.log)
*/

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Room = require('./models/Room');
const Announcement = require('./models/Announcement');

router.post('/', async (req, res) => {
  const { secret } = req.body;

  // Must match SEED_SECRET env var
  if (!process.env.SEED_SECRET || secret !== process.env.SEED_SECRET) {
    return res.status(403).json({ success: false, message: 'Invalid seed secret.' });
  }

  try {
    const results = { rooms: 0, announcements: 0, admin: '' };

    // ── Rooms (upsert by number) ──
    const roomData = [];
    for (let i = 1; i <= 9; i++) {
      roomData.push({ name: `Classroom 30${i}`, number: `30${i}`, capacity: 40, description: 'Lecture room on the 3rd floor' });
    }

    for (const r of roomData) {
      await Room.findOneAndUpdate(
        { number: r.number },
        { $setOnInsert: r },
        { upsert: true, new: true }
      );
      results.rooms++;
    }

    // ── Admin user (upsert) ──
    const adminEmail = 'admin@phinma.edu';
    const existing = await User.findOne({ email: adminEmail });
    if (!existing) {
      await User.create({
        username: 'admin',
        email: adminEmail,
        password: 'Admin1234',
        role: 'admin'
      });
      results.admin = 'Created admin@phinma.edu / Admin1234';
    } else {
      results.admin = 'Admin already exists';
    }

    const admin = await User.findOne({ email: adminEmail });

    // ── Sample Announcements (only if none exist) ──
    const annCount = await Announcement.countDocuments();
    if (annCount === 0) {
      await Announcement.insertMany([
        { title: 'New Reservation System', content: 'We made a reservation system', author: admin._id, createdAt: new Date('1999-12-30') },
        { title: 'Day 1 Patches', content: 'Minor Bug fixes', author: admin._id, createdAt: new Date('2000-06-04') },
        { title: 'New AI Integration', content: 'We have integrated an AI into the reservation system to further improve QOL', author: admin._id, createdAt: new Date('2023-04-02') },
        { title: 'Rushed wireframing causes jank', content: 'Turns out rushing a wireframe will make it feel and look off', author: admin._id, createdAt: new Date('2024-01-05') }
      ]);
      results.announcements = 4;
    } else {
      results.announcements = annCount + ' already exist, skipped';
    }

    res.json({ success: true, message: 'Database seeded successfully!', results });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
