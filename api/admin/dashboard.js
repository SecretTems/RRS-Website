import { getCollection } from '../../../lib/mongodb.js';
import { requireAdmin } from '../../../lib/auth.js';
import { handleCors, sendSuccess, sendError } from '../../../lib/middleware.js';

export default async function handler(req, res) {
  // Handle CORS
  if (handleCors(req, res)) return;

  // Only allow GET
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', 405);
  }

  try {
    // Check admin access
    const adminAuth = await requireAdmin(req);
    if (!adminAuth.authorized) {
      return sendError(res, adminAuth.error, adminAuth.status);
    }

    const users = await getCollection('users');
    const rooms = await getCollection('rooms');
    const bookings = await getCollection('bookings');
    const announcements = await getCollection('announcements');

    // Get statistics
    const totalUsers = await users.countDocuments({ role: 'user' });
    const totalRooms = await rooms.countDocuments();
    const totalBookings = await bookings.countDocuments();
    const pendingBookings = await bookings.countDocuments({ status: 'pending' });
    const confirmedBookings = await bookings.countDocuments({ status: 'confirmed' });
    const totalAnnouncements = await announcements.countDocuments();

    // Get recent bookings
    const recentBookings = await bookings
      .find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    // Populate booking details
    const populatedBookings = await Promise.all(
      recentBookings.map(async (booking) => {
        const room = await rooms.findOne({ _id: booking.roomId });
        const user = await users.findOne(
          { _id: booking.userId },
          { projection: { username: 1, email: 1 } }
        );

        return {
          id: booking._id,
          roomId: booking.roomId,
          roomName: room?.name || 'Unknown',
          userId: booking.userId,
          username: user?.username || 'Unknown',
          userEmail: user?.email,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          purpose: booking.purpose,
          status: booking.status,
          createdAt: booking.createdAt,
        };
      })
    );

    // Get room utilization
    const roomUtilization = await bookings
      .aggregate([
        { $match: { status: 'confirmed' } },
        {
          $group: {
            _id: '$roomId',
            totalBookings: { $sum: 1 },
          },
        },
        { $sort: { totalBookings: -1 } },
        { $limit: 5 },
      ])
      .toArray();

    sendSuccess(res, {
      stats: {
        totalUsers,
        totalRooms,
        totalBookings,
        pendingBookings,
        confirmedBookings,
        totalAnnouncements,
      },
      recentBookings: populatedBookings,
      topRooms: roomUtilization,
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    sendError(res, 'Failed to fetch dashboard data', 500);
  }
}