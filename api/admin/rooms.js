import { ObjectId } from 'mongodb';
import { getCollection } from '../../../lib/mongodb.js';
import { requireAdmin } from '../../../lib/auth.js';
import {
  handleCors,
  sendSuccess,
  sendError,
  validateRequiredFields,
  sanitizeObject,
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
      return await getRooms(req, res);
    } else if (req.method === 'POST') {
      return await createRoom(req, res);
    } else if (req.method === 'PUT') {
      return await updateRoom(req, res);
    } else if (req.method === 'DELETE') {
      return await deleteRoom(req, res);
    } else {
      return sendError(res, 'Method not allowed', 405);
    }
  } catch (error) {
    console.error('Admin rooms error:', error);
    sendError(res, 'Internal server error', 500);
  }
}

async function getRooms(req, res) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { search, type } = req.query;

    const rooms = await getCollection('rooms');

    // Build query
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (type) {
      query.type = type;
    }

    // Get rooms with pagination
    const roomList = await rooms
      .find(query)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Get total count
    const total = await rooms.countDocuments(query);

    sendSuccess(res, {
      rooms: roomList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get rooms error:', error);
    sendError(res, 'Failed to fetch rooms', 500);
  }
}

async function createRoom(req, res) {
  try {
    // Validate required fields
    const requiredFields = ['name', 'type', 'capacity'];
    const fieldErrors = validateRequiredFields(req.body, requiredFields);
    
    if (fieldErrors) {
      return sendError(res, 'Validation failed', 400, fieldErrors);
    }

    // Sanitize input
    const sanitizedBody = sanitizeObject(req.body);
    const {
      name,
      type,
      capacity,
      description,
      facilities,
      images,
      floor,
      building,
      isAvailable,
    } = sanitizedBody;

    // Validate capacity
    if (capacity < 1 || capacity > 500) {
      return sendError(res, 'Capacity must be between 1 and 500', 400);
    }

    const rooms = await getCollection('rooms');

    // Check if room name already exists
    const existingRoom = await rooms.findOne({ name });
    if (existingRoom) {
      return sendError(res, 'Room name already exists', 400);
    }

    // Create room
    const newRoom = {
      name,
      type,
      capacity: parseInt(capacity),
      description: description || '',
      facilities: facilities || [],
      images: images || [],
      floor: floor || null,
      building: building || '',
      isAvailable: isAvailable !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await rooms.insertOne(newRoom);

    sendSuccess(res, {
      message: 'Room created successfully',
      room: {
        id: result.insertedId,
        ...newRoom,
      },
    }, 201);
  } catch (error) {
    console.error('Create room error:', error);
    sendError(res, 'Failed to create room', 500);
  }
}

async function updateRoom(req, res) {
  try {
    const { roomId, ...updateData } = req.body;

    if (!roomId || !ObjectId.isValid(roomId)) {
      return sendError(res, 'Invalid room ID', 400);
    }

    const rooms = await getCollection('rooms');

    // Check if room exists
    const room = await rooms.findOne({ _id: new ObjectId(roomId) });
    if (!room) {
      return sendError(res, 'Room not found', 404);
    }

    // Sanitize update data
    const sanitizedData = sanitizeObject(updateData);

    // Build update object
    const updateFields = {
      ...sanitizedData,
      updatedAt: new Date(),
    };

    // Validate capacity if provided
    if (updateFields.capacity !== undefined) {
      updateFields.capacity = parseInt(updateFields.capacity);
      if (updateFields.capacity < 1 || updateFields.capacity > 500) {
        return sendError(res, 'Capacity must be between 1 and 500', 400);
      }
    }

    // Update room
    const result = await rooms.findOneAndUpdate(
      { _id: new ObjectId(roomId) },
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    if (!result) {
      return sendError(res, 'Failed to update room', 500);
    }

    sendSuccess(res, {
      message: 'Room updated successfully',
      room: result,
    });
  } catch (error) {
    console.error('Update room error:', error);
    sendError(res, 'Failed to update room', 500);
  }
}

async function deleteRoom(req, res) {
  try {
    const { roomId } = req.query;

    if (!roomId || !ObjectId.isValid(roomId)) {
      return sendError(res, 'Invalid room ID', 400);
    }

    const rooms = await getCollection('rooms');
    const bookings = await getCollection('bookings');

    // Check if room has any bookings
    const hasBookings = await bookings.findOne({ roomId });
    if (hasBookings) {
      return sendError(
        res,
        'Cannot delete room with existing bookings. Please cancel all bookings first.',
        400
      );
    }

    // Delete room
    const result = await rooms.deleteOne({ _id: new ObjectId(roomId) });

    if (result.deletedCount === 0) {
      return sendError(res, 'Room not found', 404);
    }

    sendSuccess(res, { message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Delete room error:', error);
    sendError(res, 'Failed to delete room', 500);
  }
}