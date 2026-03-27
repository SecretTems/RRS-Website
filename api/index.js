const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const app = express();

/*
  MODELS
*/ 

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  profilePhoto: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.comparePassword = async function(candidate) {
  return bcrypt.compare(candidate, this.password);
};
const User = mongoose.models.User || mongoose.model('User', userSchema);

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  number: { type: String, required: true, unique: true, trim: true },
  capacity: { type: Number, default: 30 },
  description: { type: String, default: '' },
  imageUrl: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const Room = mongoose.models.Room || mongoose.model('Room', roomSchema);

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  status: { type: String, enum: ['pending','confirmed','cancelled','occupied'], default: 'confirmed' },
  purpose: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
bookingSchema.index({ room: 1, date: 1, status: 1 });
const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 150 },
  content: { type: String, required: true, maxlength: 2000 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  hearts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

/*
  DB CONNECTION
*/

let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  let uri = process.env.MONGODB_URI || '';
  if (uri.includes('/?')) uri = uri.replace('/?', '/rrs?');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, socketTimeoutMS: 45000 });
  isConnected = true;
}

app.use(async (req, res, next) => {
  try { await connectDB(); next(); }
  catch (err) { res.status(500).json({ success: false, message: 'DB connection failed: ' + err.message }); }
});

/*
  MIDDLEWARE
*/

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Auth middleware
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) token = req.headers.authorization.split(' ')[1];
    else if (req.cookies?.token) token = req.cookies.token;
    if (!token) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found.' });
    req.user = user;
    next();
  } catch (err) { res.status(401).json({ success: false, message: 'Invalid token.' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ success: false, message: 'Admins only.' });
};

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 7*24*60*60*1000 });
  res.status(statusCode).json({
    success: true, token,
    user: { id: user._id, username: user.username, email: user.email, role: user.role, profilePhoto: user.profilePhoto }
  });
};

/*
  HEALTH
*/

app.get('/api/health', (req, res) => {
  res.json({ success: true, timestamp: new Date(), db: isConnected ? 'connected' : 'disconnected',
    env: { hasMongoUri: !!process.env.MONGODB_URI, hasJwtSecret: !!process.env.JWT_SECRET, hasSeedSecret: !!process.env.SEED_SECRET, nodeEnv: process.env.NODE_ENV }
  });
});

/*
  SEED
*/

app.post('/api/seed', async (req, res) => {
  if (!process.env.SEED_SECRET || req.body.secret !== process.env.SEED_SECRET)
    return res.status(403).json({ success: false, message: 'Invalid seed secret.' });
  try {
    const results = { rooms: 0, announcements: '', admin: '' };
    for (let i = 1; i <= 9; i++) {
      await Room.findOneAndUpdate({ number: `30${i}` }, { $setOnInsert: { name: `Classroom 30${i}`, number: `30${i}`, capacity: 40, description: 'Lecture room on the 3rd floor' } }, { upsert: true });
      results.rooms++;
    }
    let admin = await User.findOne({ email: 'admin@phinma.edu' });
    if (!admin) {
      admin = await User.create({ username: 'admin', email: 'admin@phinma.edu', password: 'Admin1234', role: 'admin' });
      results.admin = 'Created admin@phinma.edu / Admin1234';
    } else { results.admin = 'Admin already exists'; }
    const annCount = await Announcement.countDocuments();
    if (annCount === 0) {
      await Announcement.insertMany([
        { title: 'New Reservation System', content: 'We made a reservation system', author: admin._id, createdAt: new Date('1999-12-30') },
        { title: 'Day 1 Patches', content: 'Minor Bug fixes', author: admin._id, createdAt: new Date('2000-06-04') },
        { title: 'New AI Integration', content: 'We have integrated an AI into the reservation system to further improve QOL', author: admin._id, createdAt: new Date('2023-04-02') },
        { title: 'Rushed wireframing causes jank', content: 'Turns out rushing a wireframe will make it feel and look off', author: admin._id, createdAt: new Date('2024-01-05') }
      ]);
      results.announcements = '4 created';
    } else { results.announcements = annCount + ' already exist'; }
    res.json({ success: true, message: 'Seeded!', results });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/*
  AUTH
*/

app.post('/api/auth/register', [
  body('username').trim().isLength({min:3,max:30}).matches(/^[a-zA-Z0-9_]+$/),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({min:8}).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('confirmPassword').custom((v,{req}) => { if(v!==req.body.password) throw new Error('Passwords do not match'); return true; })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const { username, email, password } = req.body;
    const existing = await User.findOne({ $or: [{email},{username}] });
    if (existing) return res.status(400).json({ success: false, message: `${existing.email===email?'Email':'Username'} already taken.` });
    const user = await User.create({ username, email, password });
    sendToken(user, 201, res);
  } catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

app.post('/api/auth/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    sendToken(user, 200, res);
  } catch (err) { res.status(500).json({ success: false, message: 'Server error: ' + err.message }); }
});

app.post('/api/auth/logout', (req, res) => {
  res.cookie('token', '', { maxAge: 0 });
  res.json({ success: true, message: 'Logged out.' });
});

app.get('/api/auth/me', protect, (req, res) => res.json({ success: true, user: req.user }));

app.delete('/api/auth/delete-account', protect, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.cookie('token', '', { maxAge: 0 });
    res.json({ success: true, message: 'Account deleted.' });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

/*
  ANNOUNCEMENTS
*/

app.get('/api/announcements', protect, async (req, res) => {
  try {
    const data = await Announcement.find().sort({ createdAt: -1 }).populate('author','username');
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

app.post('/api/announcements', protect, adminOnly, [
  body('title').trim().notEmpty().isLength({max:150}),
  body('content').trim().notEmpty().isLength({max:2000})
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const ann = await Announcement.create({ title: req.body.title, content: req.body.content, author: req.user._id });
    await ann.populate('author','username');
    res.status(201).json({ success: true, data: ann });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

app.patch('/api/announcements/:id/like', protect, async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ success: false, message: 'Not found.' });
    const idx = ann.likes.indexOf(req.user._id);
    if (idx === -1) ann.likes.push(req.user._id); else ann.likes.splice(idx,1);
    await ann.save();
    res.json({ success: true, likes: ann.likes.length });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

app.patch('/api/announcements/:id/heart', protect, async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ success: false, message: 'Not found.' });
    const idx = ann.hearts.indexOf(req.user._id);
    if (idx === -1) ann.hearts.push(req.user._id); else ann.hearts.splice(idx,1);
    await ann.save();
    res.json({ success: true, hearts: ann.hearts.length });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

app.delete('/api/announcements/:id', protect, adminOnly, async (req, res) => {
  try { await Announcement.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

/*
  ROOMS
*/

app.get('/api/rooms', protect, async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true });
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const date = new Date(dateStr);
    const dayStart = new Date(date); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(date); dayEnd.setHours(23,59,59,999);
    const bookings = await Booking.find({ date:{$gte:dayStart,$lte:dayEnd}, status:{$in:['confirmed','occupied']} });
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const data = rooms.map(room => {
      const rb = bookings.filter(b => b.room.toString() === room._id.toString());
      let status = 'available';
      if (rb.length) {
        const active = rb.find(b => b.startTime <= currentTime && b.endTime >= currentTime);
        if (active) status = 'occupied';
        else if (rb.find(b => b.startTime > currentTime)) status = 'booked';
      }
      return { ...room.toObject(), status };
    });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

app.get('/api/rooms/schedule', protect, async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true });
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const date = new Date(dateStr);
    const dayStart = new Date(date); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(date); dayEnd.setHours(23,59,59,999);
    const bookings = await Booking.find({ date:{$gte:dayStart,$lte:dayEnd}, status:{$in:['confirmed','occupied']} }).populate('user','username');
    res.json({ success: true, rooms, bookings });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

app.post('/api/rooms', protect, adminOnly, [
  body('name').trim().notEmpty(),
  body('number').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const room = await Room.create(req.body);
    res.status(201).json({ success: true, data: room });
  } catch (err) {
    if (err.code===11000) return res.status(400).json({ success: false, message: 'Room already exists.' });
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.delete('/api/rooms/:id', protect, adminOnly, async (req, res) => {
  try { await Room.findByIdAndUpdate(req.params.id, { isActive: false }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

/*
  BOOKINGS
*/

app.get('/api/bookings/my', protect, async (req, res) => {
  try {
    const data = await Booking.find({ user: req.user._id }).sort({ date:-1, startTime:1 }).populate('room','name number');
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

app.post('/api/bookings', protect, [
  body('roomId').notEmpty(),
  body('date').isISO8601(),
  body('startTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  body('endTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).custom((v,{req}) => { if(v<=req.body.startTime) throw new Error('End must be after start'); return true; })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const { roomId, date, startTime, endTime, purpose } = req.body;
    const room = await Room.findById(roomId);
    if (!room || !room.isActive) return res.status(404).json({ success: false, message: 'Room not found.' });
    const bookingDate = new Date(date);
    const dayStart = new Date(bookingDate); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(bookingDate); dayEnd.setHours(23,59,59,999);
    const conflict = await Booking.findOne({ room: roomId, date:{$gte:dayStart,$lte:dayEnd}, status:{$in:['confirmed','occupied']}, $or:[{ startTime:{$lt:endTime}, endTime:{$gt:startTime} }] });
    if (conflict) return res.status(409).json({ success: false, message: `Room already booked ${conflict.startTime}–${conflict.endTime}.` });
    const booking = await Booking.create({ user: req.user._id, room: roomId, date: new Date(date), startTime, endTime, purpose: purpose||'', status:'confirmed' });
    await booking.populate('room','name number');
    res.status(201).json({ success: true, data: booking });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

app.delete('/api/bookings/:id', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Not found.' });
    if (booking.user.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    booking.status = 'cancelled';
    await booking.save();
    res.json({ success: true, message: 'Cancelled.' });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

/*
  AI CHAT
*/

app.post('/api/ai/chat', protect, [body('message').trim().notEmpty().isLength({max:500})], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const msg = req.body.message.toLowerCase();
    let response;
    if (msg.includes('available') || msg.includes('free') || msg.includes('book')) {
      const today = new Date(); const dayStart = new Date(today); dayStart.setHours(0,0,0,0); const dayEnd = new Date(today); dayEnd.setHours(23,59,59,999);
      const rooms = await Room.find({ isActive: true });
      const bookings = await Booking.find({ date:{$gte:dayStart,$lte:dayEnd}, status:{$in:['confirmed','occupied']} });
      const bookedIds = [...new Set(bookings.map(b => b.room.toString()))];
      const available = rooms.filter(r => !bookedIds.includes(r._id.toString()));
      response = available.length ? `Available rooms today: ${available.map(r=>r.name).join(', ')}. Book them from the Rooms page!` : 'All rooms are booked today. Check the Schedule page for available time slots.';
    } else if (msg.includes('my booking') || msg.includes('reservation')) {
      const bookings = await Booking.find({ user: req.user._id, status:'confirmed' }).populate('room','name').sort({ date:1 });
      response = bookings.length ? `Your bookings:\n${bookings.map(b=>`${b.room.name} on ${new Date(b.date).toLocaleDateString()} from ${b.startTime}–${b.endTime}`).join('\n')}` : "You have no active bookings. Head to the Rooms page to make one!";
    } else if (msg.includes('cancel')) {
      response = "To cancel a booking, go to your Account page and click Cancel next to the booking.";
    } else if (msg.includes('schedule')) {
      response = "The Schedule page shows a color-coded grid. Green = available, Red = booked.";
    } else if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
      response = "Hello! I'm the RRS Assistant. Ask me about available rooms, your bookings, or how to use the system!";
    } else {
      response = "I can help with room availability, your bookings, or navigating the system. What do you need?";
    }
    await new Promise(r => setTimeout(r, 500));
    res.json({ success: true, response });
  } catch (err) { res.status(500).json({ success: false, message: 'AI error.' }); }
});

/*
  USERS
*/

app.patch('/api/users/profile', protect, [
  body('username').optional().trim().isLength({min:3,max:30}).matches(/^[a-zA-Z0-9_]+$/),
  body('profilePhoto').optional().isString()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const updates = {};
    if (req.body.username) updates.username = req.body.username;
    if (req.body.profilePhoto) updates.profilePhoto = req.body.profilePhoto;
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, user });
  } catch (err) {
    if (err.code===11000) return res.status(400).json({ success: false, message: 'Username already taken.' });
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/*
  404 + ERROR HANDLER
*/

app.use('/api/*', (req, res) => res.status(404).json({ success: false, message: 'Route not found.' }));
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
