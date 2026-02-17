-- Migration 006: Add optional passcode to sessions
-- Allows instructors to protect sessions with a passcode that students must enter to join

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS passcode VARCHAR(20) DEFAULT NULL;
