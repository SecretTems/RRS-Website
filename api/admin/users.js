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
      return await getUsers(req, res);
    } else if (req.method === 'PUT') {
      return await updateUserRole(req, res);
    } else if (req.method === 'DELETE') {
      return await deleteUser(req, res);
    } else {
      return sendError(res, 'Method not allowed', 405);
    }
  } catch (error) {
    console.error('Admin users error:', error);
    sendError(res, 'Internal server error', 500);
  }
}

async function getUsers(req, res) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { search, role } = req.query;

    const users = await getCollection('users');
    const bookings = await getCollection('bookings');

    // Build query
    const query = {};

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      query.role = role;
    }

    // Get users with pagination
    const userList = await users
      .find(query, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Get total count
    const total = await users.countDocuments(query);

    // Add booking statistics for each user
    const usersWithStats = await Promise.all(
      userList.map(async (user) => {
        const totalBookings = await bookings.countDocuments({
          userId: user._id.toString(),
        });
        const pendingBookings = await bookings.countDocuments({
          userId: user._id.toString(),
          status: 'pending',
        });

        return {
          ...user,
          stats: {
            totalBookings,
            pendingBookings,
          },
        };
      })
    );

    sendSuccess(res, {
      users: usersWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    sendError(res, 'Failed to fetch users', 500);
  }
}

async function updateUserRole(req, res) {
  try {
    const { userId, role } = req.body;

    if (!userId || !ObjectId.isValid(userId)) {
      return sendError(res, 'Invalid user ID', 400);
    }

    if (!role || !['user', 'admin'].includes(role)) {
      return sendError(res, 'Invalid role', 400);
    }

    const users = await getCollection('users');

    // Check if user exists
    const user = await users.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    // Update user role
    const result = await users.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      {
        $set: {
          role,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after', projection: { password: 0 } }
    );

    if (!result) {
      return sendError(res, 'Failed to update user role', 500);
    }

    sendSuccess(res, {
      message: 'User role updated successfully',
      user: result,
    });
  } catch (error) {
    console.error('Update user role error:', error);
    sendError(res, 'Failed to update user role', 500);
  }
}

async function deleteUser(req, res) {
  try {
    const { userId } = req.query;

    if (!userId || !ObjectId.isValid(userId)) {
      return sendError(res, 'Invalid user ID', 400);
    }

    const users = await getCollection('users');
    const bookings = await getCollection('bookings');
    const announcements = await getCollection('announcements');

    // Check if user exists
    const user = await users.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    // Prevent deleting admin accounts
    if (user.role === 'admin') {
      return sendError(res, 'Cannot delete admin accounts', 403);
    }

    const userIdStr = user._id.toString();

    // Delete user's data
    await bookings.deleteMany({ userId: userIdStr });
    await announcements.deleteMany({ userId: userIdStr });
    await users.deleteOne({ _id: new ObjectId(userId) });

    sendSuccess(res, { message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    sendError(res, 'Failed to delete user', 500);
  }
}