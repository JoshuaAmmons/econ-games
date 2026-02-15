-- Migration 005: Add discovery_process game type and producer role
-- Support for the Exchange & Specialization (Discovery Process) game

-- Update game_type constraint to include discovery_process
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS game_type_check;
ALTER TABLE sessions ADD CONSTRAINT game_type_check CHECK (game_type IN (
  'double_auction',
  'double_auction_tax',
  'double_auction_price_controls',
  'bertrand',
  'cournot',
  'public_goods',
  'negative_externality',
  'ultimatum',
  'gift_exchange',
  'principal_agent',
  'comparative_advantage',
  'monopoly',
  'market_for_lemons',
  'discovery_process'
));

-- Update role constraint to include producer
ALTER TABLE players DROP CONSTRAINT IF EXISTS role_check;
ALTER TABLE players ADD CONSTRAINT role_check CHECK (role IN (
  'buyer', 'seller',
  'player', 'firm',
  'proposer', 'responder',
  'employer', 'worker',
  'principal', 'agent',
  'country', 'monopolist',
  'producer'
));
