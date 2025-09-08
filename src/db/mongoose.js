const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || '';

async function connectToDatabase() {
  if (!MONGODB_URI) {
    // eslint-disable-next-line no-console
    console.warn('[MongoDB] MONGODB_URI not set. Skipping DB connection.');
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });
    // eslint-disable-next-line no-console
    console.log('[MongoDB] Connected');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[MongoDB] Connection failed, but continuing without database:', err.message);
    console.warn('[MongoDB] Some features may not work properly without database connection.');
    return;
  }
}

module.exports = { connectToDatabase };


