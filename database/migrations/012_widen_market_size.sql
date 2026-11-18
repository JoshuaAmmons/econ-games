-- Allow sessions of up to 300 players (a lecture-hall Trust Game); was 100.
-- The backend also applies this at startup (server.ts, applyConstraintUpdates).
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS market_size_check;
ALTER TABLE sessions ADD CONSTRAINT market_size_check CHECK (market_size >= 2 AND market_size <= 300);
