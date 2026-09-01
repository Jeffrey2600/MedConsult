import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

export async function connectDB() {
  try {
    const conn = await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log(`[db] Connected to MongoDB: ${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    process.exit(1);
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
