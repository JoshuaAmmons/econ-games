-- Migration 004: Relax player constraints for non-DA games
-- Many game types don't use buyer/seller roles with valuations/costs
-- Allow role to be 'player', 'firm', 'proposer', 'responder', 'employer', 'worker', 'principal', 'agent', 'country', 'monopolist'
-- Allow valuation and production_cost to both be NULL

-- Drop the old strict constraint
ALTER TABLE players DROP CONSTRAINT IF EXISTS buyer_valuation_check;

-- Drop the old strict role constraint
ALTER TABLE players DROP CONSTRAINT IF EXISTS role_check;

-- Add more flexible role constraint
ALTER TABLE players ADD CONSTRAINT role_check CHECK (role IN (
  'buyer', 'seller',
  'player', 'firm',
  'proposer', 'responder',
  'employer', 'worker',
  'principal', 'agent',
  'country', 'monopolist'
));

-- Add game-specific data column for non-DA player attributes
ALTER TABLE players ADD COLUMN game_data JSONB DEFAULT '{}';
