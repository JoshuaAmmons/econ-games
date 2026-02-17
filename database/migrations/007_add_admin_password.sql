-- Migration 007: Add optional admin password to sessions
-- Allows instructors to protect session monitor/analytics/results with a separate password

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS admin_password VARCHAR(50) DEFAULT NULL;
