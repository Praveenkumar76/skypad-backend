import {mongoose} from "mongoose";

async function connectToDatabase() {
  const MONGODB_URI = process.env.MONGODB_URI || '';
  console.log(' MONGODB_URI:', MONGODB_URI);
  console.log('[Passport] Checking OAuth credentials...');
console.log('- CLIENT_ID present:', process.env.GOOGLE_CLIENT_ID);
console.log('- CLIENT_SECRET present:', process.env.GOOGLE_CLIENT_SECRET);
  if (!MONGODB_URI) {
    // eslint-disable-next-line no-console
    console.warn('MONGODB_URI not set. Skipping DB connection.');
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

export { connectToDatabase };
export { mongoose };


