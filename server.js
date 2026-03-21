// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');

const ocrRoutes = require('./routes/ocr.routes');

const app = express();
const PORT = process.env.PORT || 3000;

/* Middleware */
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

/* Static assets */
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* Routes */
app.use('/api/ocr', ocrRoutes);

/* Health check */
app.get('/health', (req, res) => res.json({ status: 'ok' }));

/* 404 handler */
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

/* Error handler */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

/* Start */
app.listen(PORT, () => {
  console.log(`🚀 VidSnap running on http://localhost:${PORT}`);
});

