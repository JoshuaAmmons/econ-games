import { Bid, Ask, Player } from '../types';

/**
 * Generate valuations for buyers
 * Creates a series from min to max by increment, shuffles, and returns n values
 */
export function generateValuations(
  min: number,
  max: number,
  increment: number,
  count: number
): number[] {
  const values: number[] = [];

  // Generate all possible values
  for (let v = min; v <= max; v += increment) {
    values.push(v);
  }

  // If we need more values than available, repeat the series
  while (values.length < count) {
    for (let v = min; v <= max && values.length < count; v += increment) {
      values.push(v);
    }
  }

  // Shuffle using Fisher-Yates algorithm
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }

  // Return first n values
  return values.slice(0, count);
}

/**
 * Generate production costs for sellers
 * Same logic as valuations
 */
export function generateProductionCosts(
  min: number,
  max: number,
  increment: number,
  count: number
): number[] {
  return generateValuations(min, max, increment, count);
}

/**
 * Assign roles to players
 * Distributes players evenly between buyers and sellers
 * If odd number, adds one more buyer
 */
export function assignRoles(playerCount: number): { role: 'buyer' | 'seller' }[] {
  const roles: { role: 'buyer' | 'seller' }[] = [];

  const buyerCount = Math.ceil(playerCount / 2);
  const sellerCount = playerCount - buyerCount;

  for (let i = 0; i < buyerCount; i++) {
    roles.push({ role: 'buyer' });
  }

  for (let i = 0; i < sellerCount; i++) {
    roles.push({ role: 'seller' });
  }

  // Shuffle roles
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  return roles;
}

/**
 * Validate bid
 * Bid price must be <= buyer's valuation
 */
export function validateBid(bidPrice: number, player: Player): {
  valid: boolean;
  error?: string;
} {
  if (player.role !== 'buyer') {
    return { valid: false, error: 'Only buyers can submit bids' };
  }

  if (!player.valuation) {
    return { valid: false, error: 'Player has no valuation' };
  }

  if (bidPrice <= 0) {
    return { valid: false, error: 'Bid must be positive' };
  }

  if (bidPrice > Number(player.valuation)) {
    return {
      valid: false,
      error: `Bid (${bidPrice}) cannot exceed your valuation (${Number(player.valuation)})`
    };
  }

  return { valid: true };
}

/**
 * Validate ask
 * Ask price must be >= seller's production cost
 */
export function validateAsk(askPrice: number, player: Player): {
  valid: boolean;
  error?: string;
} {
  if (player.role !== 'seller') {
    return { valid: false, error: 'Only sellers can submit asks' };
  }

  if (!player.production_cost) {
    return { valid: false, error: 'Player has no production cost' };
  }

  if (askPrice <= 0) {
    return { valid: false, error: 'Ask must be positive' };
  }

  if (askPrice < Number(player.production_cost)) {
    return {
      valid: false,
      error: `Ask (${askPrice}) cannot be below your cost (${Number(player.production_cost)})`
    };
  }

  return { valid: true };
}

/**
 * Match bids and asks using double auction rules
 * Returns array of potential trades
 * Trade price is the midpoint between bid and ask
 */
export function matchTrades(
  bids: (Bid & { player: Player })[],
  asks: (Ask & { player: Player })[]
): Array<{
  bid: Bid & { player: Player };
  ask: Ask & { player: Player };
  price: number;
  buyerProfit: number;
  sellerProfit: number;
}> {
  const trades: Array<{
    bid: Bid & { player: Player };
    ask: Ask & { player: Player };
    price: number;
    buyerProfit: number;
    sellerProfit: number;
  }> = [];

  // Sort bids descending (highest first)
  // Note: bid.price and ask.price are DECIMAL columns returned as strings by pg driver
  const sortedBids = [...bids].sort((a, b) => {
    const priceDiff = Number(b.price) - Number(a.price);
    if (priceDiff !== 0) return priceDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Sort asks ascending (lowest first)
  const sortedAsks = [...asks].sort((a, b) => {
    const priceDiff = Number(a.price) - Number(b.price);
    if (priceDiff !== 0) return priceDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  let bidIdx = 0;
  let askIdx = 0;

  // Match bids with asks
  while (bidIdx < sortedBids.length && askIdx < sortedAsks.length) {
    const bid = sortedBids[bidIdx];
    const ask = sortedAsks[askIdx];

    const bidPrice = Number(bid.price);
    const askPrice = Number(ask.price);

    // Can only trade if bid >= ask
    if (bidPrice >= askPrice) {
      // Trade price is midpoint
      const tradePrice = (bidPrice + askPrice) / 2;

      // Calculate profits
      const buyerProfit = Number(bid.player.valuation || 0) - tradePrice;
      const sellerProfit = tradePrice - Number(ask.player.production_cost || 0);

      trades.push({
        bid,
        ask,
        price: tradePrice,
        buyerProfit,
        sellerProfit
      });

      bidIdx++;
      askIdx++;
    } else {
      // No more matches possible
      break;
    }
  }

  return trades;
}

/**
 * Calculate market statistics
 */
export function calculateMarketStats(trades: any[]) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      averagePrice: 0,
      totalVolume: 0,
      efficiency: 0
    };
  }

  const totalTrades = trades.length;
  const averagePrice = trades.reduce((sum: number, t: any) => sum + Number(t.price), 0) / totalTrades;
  const totalVolume = trades.reduce((sum: number, t: any) => sum + Number(t.price), 0);

  // Efficiency = (total actual gains) / (total possible gains)
  // This requires more context about all players, so placeholder for now
  const efficiency = 0;

  return {
    totalTrades,
    averagePrice,
    totalVolume,
    efficiency
  };
}
