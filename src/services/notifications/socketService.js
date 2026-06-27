const { Server } = require('socket.io');
const User = require('../../models/User');
const { verifyToken } = require('../../middleware/auth');
const logger = require('../../utils/logger');
const { getAllowedOriginCallback, getAllowedOriginPatterns } = require('../../utils/corsOrigins');

/**
 * Socket.io server for client UI notifications (Contributor 2 — Task 4).
 * Clients authenticate with JWT from SIWE login.
 */
class SocketService {
  constructor() {
    this.io = null;
  }

  getAllowedOrigins() {
    return getAllowedOriginPatterns();
  }

  initialize(httpServer) {
    if (this.io) return this.io;

    this.io = new Server(httpServer, {
      cors: {
        origin: getAllowedOriginCallback(),
        credentials: true,
      },
      path: '/socket.io',
    });

    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = verifyToken(token);
        const walletAddress = decoded.walletAddress.toLowerCase();
        const user = await User.findOne({ walletAddress });

        if (!user) {
          return next(new Error('User not found'));
        }
        if (!user.isActive) {
          return next(new Error('Account is inactive'));
        }

        socket.walletAddress = walletAddress;
        socket.userId = user._id.toString();
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      socket.join(this.walletRoom(socket.walletAddress));
      logger.info(`Socket connected: ${socket.walletAddress}`);

      socket.emit('connected', {
        walletAddress: socket.walletAddress,
        timestamp: new Date().toISOString(),
      });

      socket.on('subscribe:job', (jobId) => {
        const id = Number(jobId);
        if (!Number.isFinite(id) || id < 0) return;
        socket.join(this.jobRoom(id));
      });

      socket.on('unsubscribe:job', (jobId) => {
        const id = Number(jobId);
        if (!Number.isFinite(id) || id < 0) return;
        socket.leave(this.jobRoom(id));
      });

      socket.on('disconnect', (reason) => {
        logger.info(`Socket disconnected: ${socket.walletAddress} (${reason})`);
      });
    });

    logger.info('Socket.io notifications initialized');
    return this.io;
  }

  walletRoom(address) {
    return `wallet:${String(address).toLowerCase()}`;
  }

  jobRoom(onchainJobId) {
    return `job:${onchainJobId}`;
  }

  isReady() {
    return Boolean(this.io);
  }

  /**
   * Emit to job subscribers and relevant wallet rooms (client + freelancer).
   */
  emitToJobParticipants(eventName, payload) {
    if (!this.io) return;

    const { onchainJobId, clientAddress, freelancerAddress } = payload;
    const rooms = new Set();

    if (onchainJobId != null) {
      rooms.add(this.jobRoom(onchainJobId));
    }
    if (clientAddress) {
      rooms.add(this.walletRoom(clientAddress));
    }
    if (freelancerAddress) {
      rooms.add(this.walletRoom(freelancerAddress));
    }

    for (const room of rooms) {
      this.io.to(room).emit(eventName, payload);
    }
  }
}

module.exports = new SocketService();
