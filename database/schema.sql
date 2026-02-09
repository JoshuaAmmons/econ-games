-- Economics Game Platform Database Schema
-- PostgreSQL 15+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- SESSIONS TABLE
-- Stores information about each game session
-- ============================================================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(6) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',

    -- Configuration
    market_size INTEGER NOT NULL,
    num_rounds INTEGER NOT NULL,
    time_per_round INTEGER NOT NULL, -- seconds

    -- Buyer valuations
    valuation_min INTEGER NOT NULL,
    valuation_max INTEGER NOT NULL,
    valuation_increments INTEGER NOT NULL,

    -- Seller costs
    cost_min INTEGER NOT NULL,
    cost_max INTEGER NOT NULL,
    cost_increments INTEGER NOT NULL,

    -- Features
    bot_enabled BOOLEAN DEFAULT false,

    -- State
    current_round INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,

    -- Constraints
    CONSTRAINT status_check CHECK (status IN ('waiting', 'active', 'completed', 'cancelled')),
    CONSTRAINT market_size_check CHECK (market_size >= 2 AND market_size <= 100),
    CONSTRAINT num_rounds_check CHECK (num_rounds >= 1 AND num_rounds <= 50),
    CONSTRAINT time_per_round_check CHECK (time_per_round >= 30 AND time_per_round <= 600),
    CONSTRAINT valuation_range_check CHECK (valuation_min < valuation_max),
    CONSTRAINT cost_range_check CHECK (cost_min < cost_max)
);

-- ============================================================================
-- PLAYERS TABLE
-- Stores information about each participant
-- ============================================================================
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

    -- Identity
    name VARCHAR(100),
    role VARCHAR(10) NOT NULL,

    -- Game values (one will be NULL based on role)
    valuation INTEGER, -- For buyers
    production_cost INTEGER, -- For sellers

    -- Profits
    total_profit DECIMAL(10, 2) DEFAULT 0.00,

    -- State
    is_bot BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT role_check CHECK (role IN ('buyer', 'seller')),
    CONSTRAINT buyer_valuation_check CHECK (
        (role = 'buyer' AND valuation IS NOT NULL AND production_cost IS NULL) OR
        (role = 'seller' AND production_cost IS NOT NULL AND valuation IS NULL)
    )
);

-- ============================================================================
-- ROUNDS TABLE
-- Stores information about each trading round
-- ============================================================================
CREATE TABLE rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',

    -- Timestamps
    started_at TIMESTAMP,
    ended_at TIMESTAMP,

    -- Constraints
    CONSTRAINT rounds_status_check CHECK (status IN ('waiting', 'active', 'completed')),
    CONSTRAINT round_number_check CHECK (round_number >= 1),
    UNIQUE(session_id, round_number)
);

-- ============================================================================
-- BIDS TABLE
-- Stores all bids submitted by buyers
-- ============================================================================
CREATE TABLE bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

    price DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT true, -- False when traded or round ends

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT bids_price_positive CHECK (price > 0)
);

-- ============================================================================
-- ASKS TABLE
-- Stores all asks submitted by sellers
-- ============================================================================
CREATE TABLE asks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

    price DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT true, -- False when traded or round ends

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT asks_price_positive CHECK (price > 0)
);

-- ============================================================================
-- TRADES TABLE
-- Stores all completed trades
-- ============================================================================
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    bid_id UUID REFERENCES bids(id) ON DELETE SET NULL,
    ask_id UUID REFERENCES asks(id) ON DELETE SET NULL,

    price DECIMAL(10, 2) NOT NULL,
    buyer_profit DECIMAL(10, 2) NOT NULL,
    seller_profit DECIMAL(10, 2) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT trades_price_positive CHECK (price > 0),
    CONSTRAINT different_players CHECK (buyer_id != seller_id)
);

-- ============================================================================
-- INDEXES
-- For query performance
-- ============================================================================

-- Session lookups
CREATE INDEX idx_sessions_code ON sessions(code);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);

-- Player lookups
CREATE INDEX idx_players_session ON players(session_id);
CREATE INDEX idx_players_role ON players(role);
CREATE INDEX idx_players_is_active ON players(is_active);

-- Round lookups
CREATE INDEX idx_rounds_session ON rounds(session_id);
CREATE INDEX idx_rounds_status ON rounds(status);

-- Bid lookups
CREATE INDEX idx_bids_round ON bids(round_id);
CREATE INDEX idx_bids_player ON bids(player_id);
CREATE INDEX idx_bids_is_active ON bids(is_active);
CREATE INDEX idx_bids_created_at ON bids(created_at);

-- Ask lookups
CREATE INDEX idx_asks_round ON asks(round_id);
CREATE INDEX idx_asks_player ON asks(player_id);
CREATE INDEX idx_asks_is_active ON asks(is_active);
CREATE INDEX idx_asks_created_at ON asks(created_at);

-- Trade lookups
CREATE INDEX idx_trades_round ON trades(round_id);
CREATE INDEX idx_trades_buyer ON trades(buyer_id);
CREATE INDEX idx_trades_seller ON trades(seller_id);
CREATE INDEX idx_trades_created_at ON trades(created_at);

-- ============================================================================
-- VIEWS
-- Useful queries as views
-- ============================================================================

-- Active sessions
CREATE VIEW active_sessions AS
SELECT * FROM sessions
WHERE status IN ('waiting', 'active')
ORDER BY created_at DESC;

-- Session summary
CREATE VIEW session_summary AS
SELECT
    s.id,
    s.code,
    s.status,
    s.current_round,
    s.num_rounds,
    COUNT(DISTINCT p.id) as player_count,
    COUNT(DISTINCT CASE WHEN p.is_active THEN p.id END) as active_player_count,
    COUNT(DISTINCT CASE WHEN p.is_bot THEN p.id END) as bot_count,
    s.created_at,
    s.started_at
FROM sessions s
LEFT JOIN players p ON s.id = p.session_id
GROUP BY s.id;

-- ============================================================================
-- FUNCTIONS
-- Useful stored procedures
-- ============================================================================

-- Function to generate unique session code
CREATE OR REPLACE FUNCTION generate_session_code()
RETURNS VARCHAR(6) AS $$
DECLARE
    new_code VARCHAR(6);
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate 6 random uppercase letters/numbers
        new_code := UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6));

        -- Check if code already exists
        SELECT EXISTS(SELECT 1 FROM sessions WHERE code = new_code) INTO code_exists;

        -- Exit loop if code is unique
        EXIT WHEN NOT code_exists;
    END LOOP;

    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Function to update player last_active_at
CREATE OR REPLACE FUNCTION update_player_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE players SET last_active_at = CURRENT_TIMESTAMP WHERE id = NEW.player_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update last_active_at
CREATE TRIGGER update_last_active_on_bid
AFTER INSERT ON bids
FOR EACH ROW
EXECUTE FUNCTION update_player_last_active();

CREATE TRIGGER update_last_active_on_ask
AFTER INSERT ON asks
FOR EACH ROW
EXECUTE FUNCTION update_player_last_active();
