import { useRef, useEffect, useCallback, useState } from 'react';
import { DEFAULT_RULES } from './discoveryProcessRules';
import type { GameRules } from './discoveryProcessRules';

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

export type { GameRules };

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
  rules?: GameRules;
}

/** What the player tapped on. */
export type CanvasTarget =
  | { kind: 'prey'; id: string }
  | { kind: 'player'; id: string }
  | { kind: 'pot'; id: string }
  | { kind: 'ground'; x: number; y: number };

interface GameCanvasProps {
  tick: GameTick | null;
  /** Prey currently being chased (drawn with a target marker). */
  chasePreyId: string | null;
  /** Called on tap/click (and right-click) with the thing under the pointer and its screen position in the canvas. */
  onSelect: (target: CanvasTarget, screenX: number, screenY: number) => void;
}

// ============================================================================
// Constants
// ============================================================================

const PLAYER_RADIUS = 16;
const PREY_LARGE_RADIUS = 14;
const PREY_SMALL_RADIUS = 8;
const POT_RADIUS = 20;
const MINIMAP_W = 180;
const MINIMAP_H = 24;
// Generous tap tolerance so small prey are hittable on a phone
const PICK_SLOP = 28;

// Colors
const ZONE_COLORS = {
  left: 'rgba(220, 60, 60, 0.10)',   // red tint – large prey
  middle: 'rgba(60, 180, 60, 0.10)', // green tint – camp / trading
  right: 'rgba(60, 100, 220, 0.10)', // blue tint – small prey
};

const PLAYER_COLOR = '#2563eb';      // blue-600
const PLAYER_SELF_COLOR = '#f59e0b'; // amber-500
const PLAYER_STUNNED_COLOR = '#9ca3af'; // gray-400
const PLAYER_TUG_COLOR = '#dc2626';  // red-600
const PREY_LARGE_COLOR = '#b45309';  // amber-700
const PREY_SMALL_COLOR = '#65a30d';  // lime-600
const POT_COLOR = '#92400e';         // amber-800
const IN_RANGE_COLOR = '#facc15';    // yellow-400

// ============================================================================
// Component
// ============================================================================

export default function GameCanvas({ tick, chasePreyId, onSelect }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 500 });

  // Interpolation: store prev + curr snapshots
  const prevSnap = useRef<GameTick | null>(null);
  const currSnap = useRef<GameTick | null>(null);
  const lastTickNum = useRef<number>(-1);
  const snapTime = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const chaseRef = useRef<string | null>(chasePreyId);
  useEffect(() => { chaseRef.current = chasePreyId; }, [chasePreyId]);

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

  // ---- Hit testing ----
  const screenPoint = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { sx: clientX - rect.left, sy: clientY - rect.top };
  }, []);

  const pick = useCallback((sx: number, sy: number): CanvasTarget | null => {
    const snap = currSnap.current;
    if (!snap) return null;
    const cam = cameraRef.current;
    const wx = sx + cam.x;
    const wy = sy + cam.y;
    const near = (x: number, y: number, r: number) => Math.hypot(x - wx, y - wy) <= r + PICK_SLOP;

    if (snap.phase === 'hunting') {
      let best: TickPrey | null = null;
      let bestD = Infinity;
      for (const p of snap.prey) {
        const r = p.type === 'large' ? PREY_LARGE_RADIUS : PREY_SMALL_RADIUS;
        const d = Math.hypot(p.x - wx, p.y - wy);
        if (near(p.x, p.y, r) && d < bestD) { best = p; bestD = d; }
      }
      if (best) return { kind: 'prey', id: best.id };
    }

    if (snap.phase === 'trading') {
      // Closest player or pot under the pointer (a player can be standing on a pot)
      let best: CanvasTarget | null = null;
      let bestD = Infinity;
      for (const p of snap.players) {
        const d = Math.hypot(p.x - wx, p.y - wy);
        if (p.id !== snap.you.id && near(p.x, p.y, PLAYER_RADIUS) && d < bestD) { best = { kind: 'player', id: p.id }; bestD = d; }
      }
      for (const pot of snap.pots) {
        const d = Math.hypot(pot.x - wx, pot.y - wy);
        if (near(pot.x, pot.y, POT_RADIUS) && d < bestD) { best = { kind: 'pot', id: pot.id }; bestD = d; }
      }
      if (best) return best;
    }

    return { kind: 'ground', x: wx, y: wy };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { sx, sy } = screenPoint(e.clientX, e.clientY);
    const target = pick(sx, sy);
    if (target) onSelect(target, sx, sy);
  }, [onSelect, pick, screenPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { sx, sy } = screenPoint(e.clientX, e.clientY);
    const target = pick(sx, sy);
    e.currentTarget.style.cursor = target && target.kind !== 'ground' ? 'pointer' : 'crosshair';
  }, [pick, screenPoint]);

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
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Interpolation factor (0..1 between prev and curr snapshots)
      const elapsed = performance.now() - snapTime.current;
      const alpha = Math.min(1, elapsed / 100); // 100ms between ticks

      const prev = prevSnap.current;
      const you = snap.you;
      const world = snap.world;
      const rules = snap.rules ?? DEFAULT_RULES;

      // Interpolated own position (camera follows it)
      let youX = you.x;
      let youY = you.y;
      if (prev?.you) {
        youX = prev.you.x + (you.x - prev.you.x) * alpha;
        youY = prev.you.y + (you.y - prev.you.y) * alpha;
      }

      // Camera: center on player
      const camX = youX - w / 2;
      const camY = youY - h / 2;
      cameraRef.current = { x: camX, y: camY };

      ctx.clearRect(0, 0, w, h);

      const toScreen = (wx: number, wy: number) => ({
        x: wx - camX,
        y: wy - camY,
      });

      // ---- Draw zone backgrounds ----
      const lx = toScreen(0, 0);
      ctx.fillStyle = ZONE_COLORS.left;
      ctx.fillRect(lx.x, lx.y, world.leftZoneEnd, world.height);

      const mx = toScreen(world.leftZoneEnd, 0);
      ctx.fillStyle = ZONE_COLORS.middle;
      ctx.fillRect(mx.x, mx.y, world.middleZoneEnd - world.leftZoneEnd, world.height);

      const rx = toScreen(world.middleZoneEnd, 0);
      ctx.fillStyle = ZONE_COLORS.right;
      ctx.fillRect(rx.x, rx.y, world.width - world.middleZoneEnd, world.height);

      // World edge
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(lx.x, lx.y, world.width, world.height);

      // Zone boundary lines
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      for (const bx of [world.leftZoneEnd, world.middleZoneEnd]) {
        const b = toScreen(bx, 0);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x, b.y + world.height);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // ---- Zone labels (pinned near the bottom of the view so they clear the minimap,
      //      centered in the visible part of each zone) ----
      const pct = Math.round(rules.largePreyCaptureProb * 100);
      const zones = [
        { from: 0, to: world.leftZoneEnd, color: '#991b1b', title: 'BIG GAME', sub: `${rules.largePreyValue} food each · ${pct}% catch chance` },
        { from: world.leftZoneEnd, to: world.middleZoneEnd, color: '#166534', title: 'CAMP', sub: snap.phase === 'trading' ? 'Give, share, or take food here' : 'Trading happens here after the hunt' },
        { from: world.middleZoneEnd, to: world.width, color: '#1e40af', title: 'SMALL GAME', sub: `${rules.smallPreyValue} food each · always caught` },
      ];
      ctx.textAlign = 'center';
      for (const z of zones) {
        const a = Math.max(toScreen(z.from, 0).x, 0);
        const b = Math.min(toScreen(z.to, 0).x, w);
        if (b - a < 120) continue;
        ctx.font = '11px sans-serif';
        const half = ctx.measureText(z.sub).width / 2 + 6;
        const cx = Math.min(Math.max((a + b) / 2, half), w - half);
        const ty = Math.min(toScreen(0, world.height).y, h) - 30;
        ctx.fillStyle = z.color;
        ctx.globalAlpha = 0.75;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(z.title, cx, ty);
        ctx.font = '11px sans-serif';
        ctx.fillText(z.sub, cx, ty + 15);
        ctx.globalAlpha = 1;
      }

      // ---- Your reach ring (capture range while hunting, interaction range while trading) ----
      const selfScreen = toScreen(youX, youY);
      const reach = snap.phase === 'hunting' ? rules.captureRadius : snap.phase === 'trading' ? rules.interactRadius : 0;
      if (reach > 0) {
        ctx.beginPath();
        ctx.arc(selfScreen.x, selfScreen.y, reach, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.07)';
        ctx.fill();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ---- Draw pots ----
      for (const pot of snap.pots) {
        const sp = toScreen(pot.x, pot.y);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, POT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = POT_COLOR;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(pot.food), sp.x, sp.y + 4);
        ctx.fillStyle = '#451a03';
        ctx.font = '10px sans-serif';
        ctx.fillText('food pot', sp.x, sp.y + POT_RADIUS + 12);
      }

      // ---- Draw prey ----
      for (const prey of snap.prey) {
        let px = prey.x;
        let py = prey.y;
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
        const inRange = snap.phase === 'hunting' && Math.hypot(prey.x - you.x, prey.y - you.y) <= rules.captureRadius;

        if (inRange) {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = IN_RANGE_COLOR;
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = `bold ${prey.type === 'large' ? 10 : 8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(prey.type === 'large' ? 'L' : 's', sp.x, sp.y + 3);

        // Chase marker
        if (prey.id === chaseRef.current) {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, r + 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(selfScreen.x, selfScreen.y);
          ctx.lineTo(sp.x, sp.y);
          ctx.setLineDash([4, 6]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
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
        ctx.fillText(p.name, sp.x, sp.y - PLAYER_RADIUS - 16);
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#374151';
        ctx.fillText(`${p.food} food`, sp.x, sp.y - PLAYER_RADIUS - 5);
        if (p.stunned || p.inTug) {
          ctx.fillStyle = p.inTug ? PLAYER_TUG_COLOR : '#4b5563';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText(p.inTug ? 'TUG-OF-WAR' : 'STUNNED', sp.x, sp.y + PLAYER_RADIUS + 20);
        }

        // Health bar
        const barW = 30;
        const barH = 4;
        const barX = sp.x - barW / 2;
        const barY = sp.y + PLAYER_RADIUS + 4;
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(barX, barY, barW, barH);
        const healthPct = Math.max(0, Math.min(1, p.health / rules.maxHealth));
        ctx.fillStyle = healthPct > 0.5 ? '#22c55e' : healthPct > 0.25 ? '#eab308' : '#ef4444';
        ctx.fillRect(barX, barY, barW * healthPct, barH);
      }

      // ---- Draw current player ----
      {
        const sp = selfScreen;
        let color = PLAYER_SELF_COLOR;
        if (you.stunned) color = PLAYER_STUNNED_COLOR;
        if (you.inTug) color = PLAYER_TUG_COLOR;

        // Glow ring
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, PLAYER_RADIUS + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#92400e';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('You', sp.x, sp.y - PLAYER_RADIUS - 6);

        const barW = 30;
        const barH = 4;
        const barX = sp.x - barW / 2;
        const barY = sp.y + PLAYER_RADIUS + 4;
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(barX, barY, barW, barH);
        const healthPct = Math.max(0, Math.min(1, you.health / rules.maxHealth));
        ctx.fillStyle = healthPct > 0.5 ? '#22c55e' : healthPct > 0.25 ? '#eab308' : '#ef4444';
        ctx.fillRect(barX, barY, barW * healthPct, barH);
      }

      // ---- Fog of war (darken edges beyond visibility) ----
      const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.6);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // ---- Minimap ----
      const mmW = Math.min(MINIMAP_W, w - 20);
      const mmX = w - mmW - 10;
      const mmY = 10;
      const mmScaleX = mmW / world.width;
      const mmScaleY = MINIMAP_H / world.height;

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(mmX, mmY, mmW, MINIMAP_H);

      ctx.fillStyle = 'rgba(220,60,60,0.45)';
      ctx.fillRect(mmX, mmY, world.leftZoneEnd * mmScaleX, MINIMAP_H);
      ctx.fillStyle = 'rgba(60,180,60,0.45)';
      ctx.fillRect(mmX + world.leftZoneEnd * mmScaleX, mmY, (world.middleZoneEnd - world.leftZoneEnd) * mmScaleX, MINIMAP_H);
      ctx.fillStyle = 'rgba(60,100,220,0.45)';
      ctx.fillRect(mmX + world.middleZoneEnd * mmScaleX, mmY, (world.width - world.middleZoneEnd) * mmScaleX, MINIMAP_H);

      for (const p of snap.players) {
        const px = mmX + p.x * mmScaleX;
        const py = mmY + p.y * mmScaleY;
        ctx.fillStyle = p.id === you.id ? PLAYER_SELF_COLOR : PLAYER_COLOR;
        ctx.fillRect(px - 2, py - 2, p.id === you.id ? 5 : 3, p.id === you.id ? 5 : 3);
      }

      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(mmX + camX * mmScaleX, mmY + camY * mmScaleY, w * mmScaleX, h * mmScaleY);

      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.strokeRect(mmX, mmY, mmW, MINIMAP_H);

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Big game', mmX + 2, mmY + MINIMAP_H + 10);
      ctx.textAlign = 'center';
      ctx.fillText('Camp', mmX + ((world.leftZoneEnd + world.middleZoneEnd) / 2) * mmScaleX, mmY + MINIMAP_H + 10);
      ctx.textAlign = 'right';
      ctx.fillText('Small game', mmX + mmW - 2, mmY + MINIMAP_H + 10);

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [canvasSize]);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ minHeight: 320 }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair"
        onClick={handleClick}
        onContextMenu={handleClick}
        onMouseMove={handleMouseMove}
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}
