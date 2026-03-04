import React, { useRef, useEffect, useCallback, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface TickPlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  food: number;
  health: number;
  stunned: boolean;
  inTug: boolean;
}

export interface TickPrey {
  id: string;
  type: 'large' | 'small';
  x: number;
  y: number;
}

export interface TickPot {
  id: string;
  x: number;
  y: number;
  ownerId: string;
  food: number;
}

export interface WorldInfo {
  width: number;
  height: number;
  leftZoneEnd: number;
  middleZoneEnd: number;
}

export interface YouInfo {
  id: string;
  x: number;
  y: number;
  food: number;
  health: number;
  stunned: boolean;
  stunCooldown: number;
  inTug: boolean;
  tugTarget: string | null;
  lockedZone: 'left' | 'right' | null;
}

export interface GameTick {
  tick: number;
  phase: 'hunting' | 'trading' | 'interim';
  timeLeft: number;
  you: YouInfo;
  players: TickPlayer[];
  prey: TickPrey[];
  pots: TickPot[];
  world: WorldInfo;
}

export interface ContextMenuAction {
  type: 'capture_prey' | 'stun' | 'transfer' | 'take' | 'hit' | 'place_pot' | 'deposit_pot' | 'withdraw_pot';
  targetId?: string;
  preyId?: string;
  potId?: string;
  label: string;
}

interface GameCanvasProps {
  tick: GameTick | null;
  onMoveTo: (x: number, y: number) => void;
  onContextAction: (actions: ContextMenuAction[], worldX: number, worldY: number) => void;
}

// ============================================================================
// Constants
// ============================================================================

const PLAYER_RADIUS = 16;
const PREY_LARGE_RADIUS = 14;
const PREY_SMALL_RADIUS = 8;
const POT_RADIUS = 20;
const MINIMAP_W = 180;
const MINIMAP_H = 20;

// Colors
const ZONE_COLORS = {
  left: 'rgba(220, 60, 60, 0.08)',   // red tint – large prey
  middle: 'rgba(60, 180, 60, 0.08)', // green tint – trading
  right: 'rgba(60, 100, 220, 0.08)', // blue tint – small prey
};

const PLAYER_COLOR = '#2563eb';      // blue-600
const PLAYER_SELF_COLOR = '#f59e0b'; // amber-500
const PLAYER_STUNNED_COLOR = '#9ca3af'; // gray-400
const PLAYER_TUG_COLOR = '#dc2626';  // red-600
const PREY_LARGE_COLOR = '#b45309';  // amber-700
const PREY_SMALL_COLOR = '#65a30d';  // lime-600
const POT_COLOR = '#92400e';         // amber-800

// ============================================================================
// Interpolation state
// ============================================================================

interface InterpolatedEntity {
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
}

// ============================================================================
// Component
// ============================================================================

export default function GameCanvas({ tick, onMoveTo, onContextAction }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 500 });

  // Interpolation: store prev + curr snapshots
  const prevSnap = useRef<GameTick | null>(null);
  const currSnap = useRef<GameTick | null>(null);
  const lastTickNum = useRef<number>(-1);
  const snapTime = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // Track camera offset
  const cameraRef = useRef({ x: 0, y: 0 });

  // Update snapshots when new tick arrives
  useEffect(() => {
    if (!tick) return;
    if (tick.tick !== lastTickNum.current) {
      prevSnap.current = currSnap.current;
      currSnap.current = tick;
      lastTickNum.current = tick.tick;
      snapTime.current = performance.now();
    }
  }, [tick]);

  // Resize handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Click handlers
  const worldFromScreen = useCallback((screenX: number, screenY: number) => {
    const cam = cameraRef.current;
    return { x: screenX + cam.x, y: screenY + cam.y };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = worldFromScreen(sx, sy);
    onMoveTo(world.x, world.y);
  }, [onMoveTo, worldFromScreen]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!tick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = worldFromScreen(sx, sy);

    const actions: ContextMenuAction[] = [];

    // Check if clicking near a prey
    if (tick.phase === 'hunting') {
      for (const p of tick.prey) {
        const dx = p.x - world.x;
        const dy = p.y - world.y;
        if (Math.sqrt(dx * dx + dy * dy) < 50) {
          actions.push({ type: 'capture_prey', preyId: p.id, label: `Capture ${p.type} prey` });
        }
      }
    }

    // Check if clicking near another player
    if (tick.phase === 'trading') {
      for (const p of tick.players) {
        if (p.id === tick.you.id) continue;
        const dx = p.x - world.x;
        const dy = p.y - world.y;
        if (Math.sqrt(dx * dx + dy * dy) < 50) {
          if (!p.stunned && !p.inTug) {
            actions.push({ type: 'stun', targetId: p.id, label: `Stun ${p.name}` });
          }
          if (p.stunned) {
            actions.push({ type: 'transfer', targetId: p.id, label: `Give food to ${p.name}` });
            actions.push({ type: 'take', targetId: p.id, label: `Take food from ${p.name}` });
          }
          actions.push({ type: 'hit', targetId: p.id, label: `Hit ${p.name}` });
        }
      }

      // Check if clicking near a pot
      for (const pot of tick.pots) {
        const dx = pot.x - world.x;
        const dy = pot.y - world.y;
        if (Math.sqrt(dx * dx + dy * dy) < 50) {
          actions.push({ type: 'deposit_pot', potId: pot.id, label: `Deposit into pot (${pot.food} food)` });
          actions.push({ type: 'withdraw_pot', potId: pot.id, label: `Withdraw from pot (${pot.food} food)` });
        }
      }

      // Always offer "place pot" during trading
      if (actions.length === 0) {
        actions.push({ type: 'place_pot', label: 'Place a communal pot here' });
      }
    }

    if (actions.length > 0) {
      onContextAction(actions, world.x, world.y);
    }
  }, [tick, onContextAction, worldFromScreen]);

  // Touch support
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const sx = touch.clientX - rect.left;
      const sy = touch.clientY - rect.top;
      const world = worldFromScreen(sx, sy);
      onMoveTo(world.x, world.y);
    }
  }, [onMoveTo, worldFromScreen]);

  // ---- Render loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;
      const snap = currSnap.current;
      if (!snap) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const { w, h } = canvasSize;
      canvas.width = w;
      canvas.height = h;

      // Interpolation factor (0..1 between prev and curr snapshots)
      const elapsed = performance.now() - snapTime.current;
      const alpha = Math.min(1, elapsed / 100); // 100ms between ticks

      const prev = prevSnap.current;
      const you = snap.you;
      const world = snap.world;

      // Camera: center on player
      const camX = you.x - w / 2;
      const camY = you.y - h / 2;
      cameraRef.current = { x: camX, y: camY };

      ctx.clearRect(0, 0, w, h);

      // ---- Draw zone backgrounds ----
      const toScreen = (wx: number, wy: number) => ({
        x: wx - camX,
        y: wy - camY,
      });

      // Left zone
      const lx = toScreen(0, 0);
      const lw = world.leftZoneEnd;
      ctx.fillStyle = ZONE_COLORS.left;
      ctx.fillRect(lx.x, lx.y, lw, world.height);

      // Middle zone
      const mx = toScreen(world.leftZoneEnd, 0);
      ctx.fillStyle = ZONE_COLORS.middle;
      ctx.fillRect(mx.x, mx.y, world.middleZoneEnd - world.leftZoneEnd, world.height);

      // Right zone
      const rx = toScreen(world.middleZoneEnd, 0);
      ctx.fillStyle = ZONE_COLORS.right;
      ctx.fillRect(rx.x, rx.y, world.width - world.middleZoneEnd, world.height);

      // Zone boundary lines
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      const b1 = toScreen(world.leftZoneEnd, 0);
      ctx.beginPath();
      ctx.moveTo(b1.x, b1.y);
      ctx.lineTo(b1.x, b1.y + world.height);
      ctx.stroke();
      const b2 = toScreen(world.middleZoneEnd, 0);
      ctx.beginPath();
      ctx.moveTo(b2.x, b2.y);
      ctx.lineTo(b2.x, b2.y + world.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // ---- Draw pots ----
      for (const pot of snap.pots) {
        const sp = toScreen(pot.x, pot.y);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, POT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = POT_COLOR;
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Food count
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(pot.food), sp.x, sp.y + 4);
      }

      // ---- Draw prey ----
      for (const prey of snap.prey) {
        let px = prey.x;
        let py = prey.y;
        // Interpolate if prev has same prey
        if (prev) {
          const pp = prev.prey.find(p => p.id === prey.id);
          if (pp) {
            px = pp.x + (prey.x - pp.x) * alpha;
            py = pp.y + (prey.y - pp.y) * alpha;
          }
        }
        const sp = toScreen(px, py);
        const r = prey.type === 'large' ? PREY_LARGE_RADIUS : PREY_SMALL_RADIUS;
        const color = prey.type === 'large' ? PREY_LARGE_COLOR : PREY_SMALL_COLOR;

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${prey.type === 'large' ? 10 : 8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(prey.type === 'large' ? 'L' : 's', sp.x, sp.y + 3);
      }

      // ---- Draw other players ----
      for (const p of snap.players) {
        if (p.id === you.id) continue;
        let px = p.x;
        let py = p.y;
        if (prev) {
          const pp = prev.players.find(pp => pp.id === p.id);
          if (pp) {
            px = pp.x + (p.x - pp.x) * alpha;
            py = pp.y + (p.y - pp.y) * alpha;
          }
        }
        const sp = toScreen(px, py);

        let color = PLAYER_COLOR;
        if (p.stunned) color = PLAYER_STUNNED_COLOR;
        if (p.inTug) color = PLAYER_TUG_COLOR;

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#1e3a5f';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Name + food
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, sp.x, sp.y - PLAYER_RADIUS - 6);
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`${p.food} food`, sp.x, sp.y - PLAYER_RADIUS + 4);

        // Health bar
        const barW = 30;
        const barH = 4;
        const barX = sp.x - barW / 2;
        const barY = sp.y + PLAYER_RADIUS + 4;
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(barX, barY, barW, barH);
        const healthPct = Math.max(0, Math.min(1, p.health / 100));
        ctx.fillStyle = healthPct > 0.5 ? '#22c55e' : healthPct > 0.25 ? '#eab308' : '#ef4444';
        ctx.fillRect(barX, barY, barW * healthPct, barH);
      }

      // ---- Draw current player ----
      {
        let px = you.x;
        let py = you.y;
        if (prev) {
          const pp = prev.you;
          if (pp) {
            px = pp.x + (you.x - pp.x) * alpha;
            py = pp.y + (you.y - pp.y) * alpha;
          }
        }
        const sp = toScreen(px, py);

        let color = PLAYER_SELF_COLOR;
        if (you.stunned) color = PLAYER_STUNNED_COLOR;
        if (you.inTug) color = PLAYER_TUG_COLOR;

        // Glow ring
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, PLAYER_RADIUS + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Name
        ctx.fillStyle = '#92400e';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('You', sp.x, sp.y - PLAYER_RADIUS - 6);

        // Health bar
        const barW = 30;
        const barH = 4;
        const barX = sp.x - barW / 2;
        const barY = sp.y + PLAYER_RADIUS + 4;
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(barX, barY, barW, barH);
        const healthPct = Math.max(0, Math.min(1, you.health / 100));
        ctx.fillStyle = healthPct > 0.5 ? '#22c55e' : healthPct > 0.25 ? '#eab308' : '#ef4444';
        ctx.fillRect(barX, barY, barW * healthPct, barH);
      }

      // ---- Fog of war (darken edges beyond visibility) ----
      const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.6);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // ---- Minimap ----
      const mmX = w - MINIMAP_W - 10;
      const mmY = 10;
      const mmScaleX = MINIMAP_W / world.width;
      const mmScaleY = MINIMAP_H / world.height;

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(mmX, mmY, MINIMAP_W, MINIMAP_H);

      // Zone colors on minimap
      ctx.fillStyle = 'rgba(220,60,60,0.3)';
      ctx.fillRect(mmX, mmY, world.leftZoneEnd * mmScaleX, MINIMAP_H);
      ctx.fillStyle = 'rgba(60,180,60,0.3)';
      ctx.fillRect(mmX + world.leftZoneEnd * mmScaleX, mmY, (world.middleZoneEnd - world.leftZoneEnd) * mmScaleX, MINIMAP_H);
      ctx.fillStyle = 'rgba(60,100,220,0.3)';
      ctx.fillRect(mmX + world.middleZoneEnd * mmScaleX, mmY, (world.width - world.middleZoneEnd) * mmScaleX, MINIMAP_H);

      // Players on minimap
      for (const p of snap.players) {
        const mx = mmX + p.x * mmScaleX;
        const my = mmY + p.y * mmScaleY;
        ctx.fillStyle = p.id === you.id ? PLAYER_SELF_COLOR : PLAYER_COLOR;
        ctx.fillRect(mx - 1, my - 1, 3, 3);
      }

      // Viewport box
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        mmX + camX * mmScaleX,
        mmY + camY * mmScaleY,
        w * mmScaleX,
        h * mmScaleY
      );

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(mmX, mmY, MINIMAP_W, MINIMAP_H);

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [canvasSize]);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ minHeight: 400 }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}
