-- Migration 008: Add Vernon Smith Batch 1 game types
-- Adds: ellsberg, newsvendor, dutch_auction, english_auction, discriminative_auction
-- Also catches up game_type and role constraints to include ALL currently used types

-- Update game_type constraint to include ALL 28 game types
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
  'discovery_process',
  'prisoner_dilemma',
  'beauty_contest',
  'trust_game',
  'auction',
  'bargaining',
  'common_pool_resource',
  'stag_hunt',
  'dictator',
  'matching_pennies',
  'ellsberg',
  'newsvendor',
  'dutch_auction',
  'english_auction',
  'discriminative_auction'
));

-- Update role constraint to include ALL roles
ALTER TABLE players DROP CONSTRAINT IF EXISTS role_check;
ALTER TABLE players ADD CONSTRAINT role_check CHECK (role IN (
  'buyer', 'seller',
  'player', 'firm',
  'proposer', 'responder',
  'employer', 'worker',
  'principal', 'agent',
  'country', 'monopolist',
  'producer',
  'bidder',
  'sender', 'receiver',
  'chooser',
  'manager'
));
