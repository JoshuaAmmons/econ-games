import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// Create Redis client
export const redisClient = createClient({
  url: process.env.REDIS_URL,
});

// Connect to Redis
redisClient.connect().catch((err) => {
  console.error('Redis connection error:', err);
  // Don't exit - Redis is optional for development
  console.warn('Continuing without Redis. Some features may not work.');
});

// Event handlers
redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

// Helper functions
export const setCache = async (key: string, value: any, expirationSeconds?: number) => {
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
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error('Redis deleteCache error:', error);
  }
};

export default redisClient;
