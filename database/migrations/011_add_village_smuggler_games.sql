-- Migration 011: Add Three-Village Trade and Wool Export Punishment game types

-- Widen role column to accommodate longer role names (port_merchant, foreign_contact, harbor_watch)
ALTER TABLE players ALTER COLUMN role TYPE VARCHAR(30);

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS game_type_check;
ALTER TABLE sessions ADD CONSTRAINT game_type_check CHECK (game_type IN (
  'double_auction', 'double_auction_tax', 'double_auction_price_controls',
  'bertrand', 'cournot', 'public_goods', 'negative_externality',
  'ultimatum', 'gift_exchange', 'principal_agent', 'comparative_advantage',
  'monopoly', 'market_for_lemons', 'discovery_process', 'prisoner_dilemma',
  'beauty_contest', 'trust_game', 'auction', 'bargaining',
  'common_pool_resource', 'stag_hunt', 'dictator', 'matching_pennies',
  'ellsberg', 'newsvendor', 'dutch_auction', 'english_auction',
  'discriminative_auction', 'posted_offer', 'lindahl', 'pg_auction',
  'sealed_bid_offer', 'sponsored_search', 'double_dutch_auction',
  'asset_bubble', 'contestable_market',
  'wool_export_punishment', 'three_village_trade'
));

ALTER TABLE players DROP CONSTRAINT IF EXISTS role_check;
ALTER TABLE players ADD CONSTRAINT role_check CHECK (role IN (
  'buyer', 'seller', 'player', 'firm', 'proposer', 'responder',
  'employer', 'worker', 'principal', 'agent', 'country', 'monopolist',
  'producer', 'bidder', 'sender', 'receiver', 'chooser', 'manager',
  'voter', 'advertiser', 'trader', 'incumbent', 'entrant',
  'smuggler', 'port_merchant', 'foreign_contact', 'harbor_watch', 'villager'
));
