import { ObjectId } from 'mongodb';
import { getCollection } from '../../../lib/mongodb.js';
import { requireAdmin } from '../../../lib/auth.js';
import {
  handleCors,
  sendSuccess,
  sendError,
  getPaginationParams,
} from '../../../lib/middleware.js';

export default async function handler(req, res) {
  // Handle CORS
  if (handleCors(req, res)) return;

  try {
    // Check admin access
    const adminAuth = await requireAdmin(req);
    if (!adminAuth.authorized) {
      return sendError(res, adminAuth.error, adminAuth.status);
    }

    if (req.method === 'GET') {
      return await getAllBookings(req, res);
    } else if (req.method === 'PUT') {
      return await updateBookingStatus(req, res, adminAuth.user);
    } else {
      return sendError(res, 'Method not allowed', 405);
    }
  } catch (error) {
    console.error('Admin bookings error:', error);
    sendError(res, 'Internal server error', 500);
  }
}

async function getAllBookings(req, res) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { status, roomId, userId, date } = req.query;

    const bookings = await getCollection('bookings');
    const rooms = await getCollection('rooms');
    const users = await getCollection('users');

    // Build query
    const query = {};

    if (status) {
      query.status = status;
    }

    if (roomId && ObjectId.isValid(roomId)) {
      query.roomId = roomId;
    }

    if (userId && ObjectId.isValid(userId)) {
      query.userId = userId;
    }

    if (date) {
      query.date = date;
    }

    // Get bookings with pagination
    const bookingList = await bookings
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Get total count
    const total = await bookings.countDocuments(query);

    // Populate booking details
    const populatedBookings = await Promise.all(
      bookingList.map(async (booking) => {
        const room = await rooms.findOne({ _id: new ObjectId(booking.roomId) });
        const user = await users.findOne(
          { _id: new ObjectId(booking.userId) },
          { projection: { username: 1, email: 1, fullName: 1 } }
        );

        return {
          id: booking._id,
          roomId: booking.roomId,
          roomName: room?.name || 'Unknown',
          roomType: room?.type,
          userId: booking.userId,
          username: user?.username || 'Unknown',
          userEmail: user?.email,
          userFullName: user?.fullName,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          purpose: booking.purpose,
          status: booking.status,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
        };
      })
    );

    sendSuccess(res, {
      bookings: populatedBookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get all bookings error:', error);
    sendError(res, 'Failed to fetch bookings', 500);
  }
}

async function updateBookingStatus(req, res, admin) {
  try {
    const { bookingId, status, rejectionReason } = req.body;

    if (!bookingId || !ObjectId.isValid(bookingId)) {
      return sendError(res, 'Invalid booking ID', 400);
    }

    if (!status || !['pending', 'confirmed', 'rejected', 'cancelled'].includes(status)) {
      return sendError(res, 'Invalid status', 400);
    }

    const bookings = await getCollection('bookings');

    // Check if booking exists
    const booking = await bookings.findOne({ _id: new ObjectId(bookingId) });
    if (!booking) {
      return sendError(res, 'Booking not found', 404);
    }

    // If confirming, check for conflicts
    if (status === 'confirmed') {
      const conflictingBooking = await bookings.findOne({
        _id: { $ne: new ObjectId(bookingId) },
        roomId: booking.roomId,
        date: booking.date,
        status: 'confirmed',
        $or: [
          {
            startTime: { $lte: booking.startTime },
            endTime: { $gt: booking.startTime },
          },
          {
            startTime: { $lt: booking.endTime },
            endTime: { $gte: booking.endTime },
          },
          {
            startTime: { $gte: booking.startTime },
            endTime: { $lte: booking.endTime },
          },
        ],
      });

      if (conflictingBooking) {
        return sendError(
          res,
          `Cannot confirm: Room has conflicting booking from ${conflictingBooking.startTime} to ${conflictingBooking.endTime}`,
          409
        );
      }
    }

    // Update booking status
    const updateFields = {
      status,
      updatedAt: new Date(),
      approvedBy: admin._id.toString(),
      approvedAt: new Date(),
    };

    if (status === 'rejected' && rejectionReason) {
      updateFields.rejectionReason = rejectionReason;
    }

    const result = await bookings.findOneAndUpdate(
      { _id: new ObjectId(bookingId) },
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    if (!result) {
      return sendError(res, 'Failed to update booking', 500);
    }

    sendSuccess(res, {
      message: `Booking ${status} successfully`,
      booking: {
        id: result._id,
        status: result.status,
        updatedAt: result.updatedAt,
        approvedBy: result.approvedBy,
      },
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    sendError(res, 'Failed to update booking status', 500);
  }
}