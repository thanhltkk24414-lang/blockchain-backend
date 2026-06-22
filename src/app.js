// 📄 TOÀN BỘ FILE src/app.js (THAY MỚI HOÀN TOÀN)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const userRoutes = require('./routes/userRoutes');
const jobRoutes = require('./routes/jobRoutes');
const bidRoutes = require('./routes/bidRoutes');
const disputeRoutes = require('./routes/disputeRoutes');
const reviewRoutes = require('./routes/reviewRoutes');

const app = express();

// =============================================
// 📌 MIDDLEWARE
// =============================================

// Bảo mật
app.use(helmet());

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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes - UNCOMMENT CÁC DÒNG NÀY
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/reviews', reviewRoutes);

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