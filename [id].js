import { ObjectId } from 'mongodb';
import { getCollection } from '../../../lib/mongodb.js';
import { handleCors, sendSuccess, sendError } from '../../../lib/middleware.js';

export default async function handler(req, res) {
  // Handle CORS
  if (handleCors(req, res)) return;

  // Only allow GET
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', 405);
  }

  try {
    const roomId = req.query.id;
    const { date } = req.query;

    if (!roomId || !ObjectId.isValid(roomId)) {
      return sendError(res, 'Invalid room ID', 400);
    }

    const rooms = await getCollection('rooms');
    const bookings = await getCollection('bookings');
    const schedule = await getCollection('schedule');

    // Check if room exists
    const room = await rooms.findOne({ _id: new ObjectId(roomId) });
    if (!room) {
      return sendError(res, 'Room not found', 404);
    }

    // Get regular schedule for the room
    const regularSchedule = await schedule
      .find({ roomId })
      .sort({ dayOfWeek: 1, startTime: 1 })
      .toArray();

    // Get bookings for specific date if provided
    let dateBookings = [];
    if (date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return sendError(res, 'Invalid date format. Use YYYY-MM-DD', 400);
      }

      dateBookings = await bookings
        .find({
          roomId,
          date,
          status: { $ne: 'cancelled' },
        })
        .sort({ startTime: 1 })
        .toArray();
    }

    // Format schedule
    const formattedSchedule = regularSchedule.map((item) => ({
      id: item._id,
      dayOfWeek: item.dayOfWeek,
      dayName: getDayName(item.dayOfWeek),
      startTime: item.startTime,
      endTime: item.endTime,
      subject: item.subject,
      instructor: item.instructor,
      isRecurring: true,
    }));

    // Format bookings
    const formattedBookings = dateBookings.map((booking) => ({
      id: booking._id,
      startTime: booking.startTime,
      endTime: booking.endTime,
      purpose: booking.purpose,
      status: booking.status,
      isRecurring: false,
    }));

    // Calculate available time slots for the date
    let availableSlots = [];
    if (date) {
      availableSlots = calculateAvailableSlots(
        date,
        formattedSchedule,
        formattedBookings
      );
    }

    sendSuccess(res, {
      room: {
        id: room._id,
        name: room.name,
        type: room.type,
        capacity: room.capacity,
      },
      regularSchedule: formattedSchedule,
      bookings: formattedBookings,
      availableSlots,
    });
  } catch (error) {
    console.error('Get schedule error:', error);
    sendError(res, 'Failed to fetch schedule', 500);
  }
}

function getDayName(dayOfWeek) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || 'Unknown';
}

function calculateAvailableSlots(date, regularSchedule, bookings) {
  // Get day of week for the date
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay();

  // Operating hours (8:00 AM to 8:00 PM)
  const openTime = '08:00';
  const closeTime = '20:00';

  // Get all occupied time slots for this day
  const occupiedSlots = [];

  // Add regular schedule for this day of week
  regularSchedule
    .filter((item) => item.dayOfWeek === dayOfWeek)
    .forEach((item) => {
      occupiedSlots.push({
        startTime: item.startTime,
        endTime: item.endTime,
      });
    });

  // Add bookings
  bookings.forEach((booking) => {
    occupiedSlots.push({
      startTime: booking.startTime,
      endTime: booking.endTime,
    });
  });

  // Sort occupied slots by start time
  occupiedSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Calculate available slots
  const availableSlots = [];
  let currentTime = openTime;

  for (const slot of occupiedSlots) {
    if (currentTime < slot.startTime) {
      availableSlots.push({
        startTime: currentTime,
        endTime: slot.startTime,
      });
    }
    currentTime = slot.endTime > currentTime ? slot.endTime : currentTime;
  }

  // Add final slot if there's time before closing
  if (currentTime < closeTime) {
    availableSlots.push({
      startTime: currentTime,
      endTime: closeTime,
    });
  }

  return availableSlots;
}