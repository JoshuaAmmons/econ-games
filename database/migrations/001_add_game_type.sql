-- Migration 001: Add game_type and game_config to sessions
-- Allows sessions to be different game types with flexible configuration

ALTER TABLE sessions
  ADD COLUMN game_type VARCHAR(50) NOT NULL DEFAULT 'double_auction',
  ADD COLUMN game_config JSONB DEFAULT '{}';

-- Add constraint for valid game types
ALTER TABLE sessions
  ADD CONSTRAINT game_type_check CHECK (game_type IN (
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
    'market_for_lemons'
  ));

-- Index for game type lookups
CREATE INDEX idx_sessions_game_type ON sessions(game_type);
