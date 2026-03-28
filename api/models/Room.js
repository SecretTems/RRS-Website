const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Room name is required'],
    unique: true,
    trim: true
  },
  number: {
    type: String,
    required: [true, 'Room number is required'],
    unique: true,
    trim: true
  },
  capacity: {
    type: Number,
    default: 30
  },
  description: {
    type: String,
    default: ''
  },
  imageUrl: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Room', roomSchema);
