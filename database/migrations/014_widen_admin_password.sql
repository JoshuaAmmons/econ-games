-- Admin passwords are stored as bcrypt hashes (60 characters), longer than the VARCHAR(50)
-- of migration 007, so creating a session with an admin password failed. Widen the column.
-- The backend also applies this at startup (server.ts, applyConstraintUpdates).
ALTER TABLE sessions ALTER COLUMN admin_password TYPE VARCHAR(255);
