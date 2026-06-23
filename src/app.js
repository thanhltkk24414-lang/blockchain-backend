// 📄 TOÀN BỘ FILE src/app.js (THAY MỚI HOÀN TOÀN)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const jobRoutes = require('./routes/jobRoutes');
const bidRoutes = require('./routes/bidRoutes');
const disputeRoutes = require('./routes/disputeRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const ipfsRoutes = require('./routes/ipfsRoutes');
const arbitratorRoutes = require('./routes/arbitratorRoutes');

const app = express();

// =============================================
// 📌 MIDDLEWARE
// =============================================

// Bảo mật — SIWE page uses external /js/siwe-sign.js (no inline scripts)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

// CORS - Cho phép frontend truy cập
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));

// Parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('dev'));

// =============================================
// 📌 ROUTES
// =============================================

// SIWE signing helper (MetaMask needs http://, not file://)
app.use(express.static(path.join(__dirname, '..', 'public')));
const siweSignPage = path.join(__dirname, '..', 'public', 'siwe-sign.html');
const siweSignRoutes = ['/siwe-sign', '/siwe-sign.html', '/siwe_sign', '/siwe_sign.html'];
app.get(siweSignRoutes, (req, res) => {
  res.sendFile(siweSignPage);
});

// Health check (works without MongoDB — use for smoke tests)
app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const mongoStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: mongoStates[mongoose.connection.readyState] || 'unknown',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/ipfs', ipfsRoutes);
app.use('/api/arbitrator', arbitratorRoutes);

// =============================================
// 📌 ERROR HANDLING
// =============================================

// 404 - Route not found
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Error handler
app.use(errorHandler);

module.exports = app;