-- Students may join some games after the instructor presses Start (late joiners).
-- late_joined_at is set for them (and for a bot created as a late joiner's partner);
-- it stays NULL for everyone who joined before Start.
-- The backend also applies this at startup (server.ts).
ALTER TABLE players ADD COLUMN IF NOT EXISTS late_joined_at TIMESTAMP DEFAULT NULL;
