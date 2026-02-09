-- Migration 003: Create game_results table
-- Per-round results for non-DA games

CREATE TABLE game_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  result_data JSONB NOT NULL DEFAULT '{}',
  profit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_game_results_round ON game_results(round_id);
CREATE INDEX idx_game_results_player ON game_results(player_id);
CREATE INDEX idx_game_results_round_player ON game_results(round_id, player_id);
