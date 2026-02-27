-- Migration 009: Add Vernon Smith Batch 2 game types
-- Adds: posted_offer, lindahl, pg_auction, sealed_bid_offer, sponsored_search
-- New roles: voter, advertiser

-- Update game_type constraint to include all 33 game types
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
  'discriminative_auction',
  'posted_offer',
  'lindahl',
  'pg_auction',
  'sealed_bid_offer',
  'sponsored_search'
));

-- Update role constraint to include new roles
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
  'manager',
  'voter',
  'advertiser'
));
