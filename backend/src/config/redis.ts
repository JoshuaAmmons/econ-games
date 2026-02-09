import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;

// Create Redis client with retry strategy
export const redisClient = createClient({
  url: REDIS_URL || undefined,
  socket: {
    reconnectStrategy: (retries: number) => {
      if (!REDIS_URL) {
        // No Redis URL configured — don't retry
        return false;
      }
      if (retries > 5) {
        console.warn('Redis: max retries reached, giving up');
        return false;
      }
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      return Math.min(retries * 1000, 16000);
    },
  },
});

let redisConnected = false;

// Only attempt connection if REDIS_URL is configured
if (REDIS_URL) {
  redisClient.connect().catch((err) => {
    console.error('Redis connection error:', err.message);
    console.warn('Continuing without Redis. Some features may not work.');
  });

  redisClient.on('connect', () => {
    redisConnected = true;
    console.log('Connected to Redis');
  });

  redisClient.on('error', (err) => {
    if (redisConnected) {
      // Only log if we were previously connected (i.e. lost connection)
      console.error('Redis error:', err.message);
    }
    redisConnected = false;
  });
} else {
  console.log('No REDIS_URL configured — Redis disabled');
}

// Helper functions (all gracefully handle missing Redis)
export const setCache = async (key: string, value: any, expirationSeconds?: number) => {
  if (!redisConnected) return;
  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (expirationSeconds) {
      await redisClient.setEx(key, expirationSeconds, stringValue);
    } else {
      await redisClient.set(key, stringValue);
    }
  } catch (error) {
    console.error('Redis setCache error:', error);
  }
};

export const getCache = async (key: string) => {
  if (!redisConnected) return null;
  try {
    const value = await redisClient.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (error) {
    console.error('Redis getCache error:', error);
    return null;
  }
};

export const deleteCache = async (key: string) => {
  if (!redisConnected) return;
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error('Redis deleteCache error:', error);
  }
};

export default redisClient;
