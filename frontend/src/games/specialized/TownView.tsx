import React, { useState, useEffect, useRef, useCallback } from 'react';

interface PlayerInventory {
  field: Record<string, number>;
  house: Record<string, number>;
}

interface PlayerInfo {
  id: string;
  name: string;
  label: number;
  typeIndex?: number;
}

interface GoodConfig {
  name: string;
  color: string;
}

interface TownViewProps {
  players: PlayerInfo[];
  currentPlayerId: string;
  inventories: Record<string, PlayerInventory>;
  goods: GoodConfig[];
  phase: 'production' | 'move' | 'complete' | 'waiting';
  allowStealing?: boolean;
  onMoveGoods?: (good: string, amount: number, fromLocation: 'field' | 'house', fromPlayerId: string, toPlayerId: string) => void;
}

interface DragState {
  good: string;
  goodColor: string;
  fromLocation: 'field' | 'house';
  fromPlayerId: string;
  // Current mouse position in SVG coordinates
  svgX: number;
  svgY: number;
}

// House SVG dimensions
const FIELD_W = 60;
const FIELD_H = 80;
const HOUSE_W = 70;
const HOUSE_H = 80;
const ROOF_H = 25;
const GAP = 4;
const UNIT_W = FIELD_W + GAP + HOUSE_W;
const UNIT_H = HOUSE_H + ROOF_H + 10;
const COL_GAP = 40;
const ROW_GAP = 16;
const LABEL_H = 18;

const TownView: React.FC<TownViewProps> = ({
  players,
  currentPlayerId,
  inventories,
  goods,
  phase,
  allowStealing = false,
  onMoveGoods,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  // Click-to-select fallback
  const [selected, setSelected] = useState<{ good: string; fromLocation: 'field' | 'house'; fromPlayerId: string } | null>(null);

  // Clear state when phase changes away from 'move'
  useEffect(() => {
    if (phase !== 'move') {
      setDrag(null);
      setSelected(null);
      setHoverTarget(null);
    }
  }, [phase]);

  const half = Math.ceil(players.length / 2);
  const leftCol = players.slice(0, half);
  const rightCol = players.slice(half);
  const rows = Math.max(leftCol.length, rightCol.length);

  const svgW = UNIT_W * 2 + COL_GAP + 40;
  const svgH = rows * (UNIT_H + ROW_GAP + LABEL_H) + 20;

  const canInteract = phase === 'move' && onMoveGoods;

  // Convert screen coordinates to SVG coordinates
  const screenToSvg = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  // Compute house bounding boxes for hit testing
  const getPlayerPositions = useCallback(() => {
    const positions: Array<{ playerId: string; houseX: number; houseY: number; roofTop: number; wallBottom: number }> = [];
    const addPlayer = (player: PlayerInfo, x: number, y: number) => {
      const houseX = x + FIELD_W + GAP;
      const houseY = y + LABEL_H;
      positions.push({
        playerId: player.id,
        houseX,
        houseY,
        roofTop: houseY - ROOF_H,
        wallBottom: houseY + HOUSE_H,
      });
    };
    leftCol.forEach((player, i) => {
      addPlayer(player, 10, i * (UNIT_H + ROW_GAP + LABEL_H) + 10);
    });
    rightCol.forEach((player, i) => {
      addPlayer(player, UNIT_W + COL_GAP + 10, i * (UNIT_H + ROW_GAP + LABEL_H) + 10);
    });
    return positions;
  }, [leftCol, rightCol]);

  // Find which house the cursor is over
  const findHouseAtPoint = useCallback((svgX: number, svgY: number): string | null => {
    const positions = getPlayerPositions();
    for (const pos of positions) {
      if (
        svgX >= pos.houseX &&
        svgX <= pos.houseX + HOUSE_W &&
        svgY >= pos.roofTop &&
        svgY <= pos.wallBottom
      ) {
        return pos.playerId;
      }
    }
    return null;
  }, [getPlayerPositions]);

  // --- Drag handlers ---
  const handleDragStart = useCallback((
    e: React.MouseEvent,
    good: string,
    goodColor: string,
    location: 'field' | 'house',
    playerId: string
  ) => {
    if (!canInteract) return;
    if (playerId !== currentPlayerId && !allowStealing) return;
    if (playerId !== currentPlayerId && location === 'field') return;

    const inv = inventories[playerId];
    if (!inv) return;
    const store = location === 'field' ? inv.field : inv.house;
    if ((store[good] || 0) < 1) return;

    e.preventDefault();
    e.stopPropagation();

    const svgPt = screenToSvg(e.clientX, e.clientY);
    setDrag({
      good,
      goodColor,
      fromLocation: location,
      fromPlayerId: playerId,
      svgX: svgPt.x,
      svgY: svgPt.y,
    });
    setSelected(null);
  }, [canInteract, currentPlayerId, allowStealing, inventories, screenToSvg]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag) return;
    const svgPt = screenToSvg(e.clientX, e.clientY);
    setDrag(prev => prev ? { ...prev, svgX: svgPt.x, svgY: svgPt.y } : null);
    setHoverTarget(findHouseAtPoint(svgPt.x, svgPt.y));
  }, [drag, screenToSvg, findHouseAtPoint]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drag || !onMoveGoods) {
      setDrag(null);
      setHoverTarget(null);
      return;
    }

    const svgPt = screenToSvg(e.clientX, e.clientY);
    const targetPlayerId = findHouseAtPoint(svgPt.x, svgPt.y);

    if (targetPlayerId) {
      onMoveGoods(drag.good, 1, drag.fromLocation, drag.fromPlayerId, targetPlayerId);
    }

    setDrag(null);
    setHoverTarget(null);
  }, [drag, onMoveGoods, screenToSvg, findHouseAtPoint]);

  // --- Click-to-select fallback ---
  const handleGoodClick = (e: React.MouseEvent, good: string, location: 'field' | 'house', playerId: string) => {
    if (!canInteract) return;
    if (playerId !== currentPlayerId && !allowStealing) return;
    if (playerId !== currentPlayerId && location === 'field') return;

    const inv = inventories[playerId];
    if (!inv) return;
    const store = location === 'field' ? inv.field : inv.house;
    if ((store[good] || 0) < 1) return;

    e.stopPropagation();
    setSelected({ good, fromLocation: location, fromPlayerId: playerId });
  };

  const handleHouseClick = (playerId: string) => {
    if (!canInteract || !selected) return;
    onMoveGoods!(selected.good, 1, selected.fromLocation, selected.fromPlayerId, playerId);
    setSelected(null);
  };

  // --- Rendering ---
  const renderGoodOvals = (
    items: Record<string, number>,
    x: number,
    y: number,
    w: number,
    _h: number,
    location: 'field' | 'house',
    playerId: string
  ) => {
    const elements: React.ReactElement[] = [];
    const ovalRx = 10;
    const ovalRy = 14;
    const startY = y + 10;
    const spacing = 32;

    goods.forEach((good, gi) => {
      const count = items[good.name] || 0;
      const cx = x + w / 2;
      const cy = startY + gi * spacing;

      const isSelected =
        selected?.good === good.name &&
        selected?.fromLocation === location &&
        selected?.fromPlayerId === playerId;

      const isDragging =
        drag?.good === good.name &&
        drag?.fromLocation === location &&
        drag?.fromPlayerId === playerId;

      const canPick = canInteract && (playerId === currentPlayerId || allowStealing) && count > 0;

      elements.push(
        <g
          key={`${playerId}-${location}-${good.name}`}
          onMouseDown={(e) => {
            if (canPick) {
              handleDragStart(e, good.name, good.color, location, playerId);
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (canPick && !drag) {
              handleGoodClick(e, good.name, location, playerId);
            }
          }}
          style={{ cursor: canPick ? 'grab' : 'default' }}
        >
          <ellipse
            cx={cx}
            cy={cy}
            rx={ovalRx}
            ry={ovalRy}
            fill={good.color}
            stroke={isSelected ? '#000' : isDragging ? '#FFD700' : 'none'}
            strokeWidth={isSelected || isDragging ? 2.5 : 0}
            opacity={isDragging ? 0.5 : 0.9}
          />
          <text
            x={cx}
            y={cy + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="13"
            fontWeight="bold"
            fill="white"
            pointerEvents="none"
          >
            {count}
          </text>
        </g>
      );
    });

    return elements;
  };

  const renderPlayerUnit = (player: PlayerInfo, x: number, y: number) => {
    const isSelf = player.id === currentPlayerId;
    const inv = inventories[player.id] || { field: {}, house: {} };
    const fillColor = isSelf ? '#c8e6c9' : '#e0e0e0';
    const strokeColor = isSelf ? '#4caf50' : '#9e9e9e';
    const isDropTarget = (selected || drag) && canInteract;
    const isHovered = hoverTarget === player.id && drag;

    // Field rectangle
    const fieldX = x;
    const fieldY = y + LABEL_H;

    // House shape
    const houseX = x + FIELD_W + GAP;
    const houseY = y + LABEL_H;
    const roofLeft = houseX;
    const roofRight = houseX + HOUSE_W;
    const roofTop = houseY - ROOF_H;
    const wallTop = houseY;
    const wallBottom = houseY + HOUSE_H;

    return (
      <g key={player.id}>
        {/* Label */}
        <text
          x={x + UNIT_W / 2}
          y={y + 12}
          textAnchor="middle"
          fontSize="12"
          fontWeight="bold"
          fill={isSelf ? '#2e7d32' : '#616161'}
        >
          {player.label}
        </text>

        {/* Type label */}
        <text
          x={x + 2}
          y={y + 12}
          fontSize="9"
          fill="#999"
        >
          T{(player.typeIndex ?? 0) + 1}
        </text>

        {/* Field (rectangle) */}
        <rect
          x={fieldX}
          y={fieldY}
          width={FIELD_W}
          height={FIELD_H}
          fill={isSelf ? '#e8f5e9' : '#f5f5f5'}
          stroke={strokeColor}
          strokeWidth={1.5}
          rx={3}
        />
        <text
          x={fieldX + FIELD_W / 2}
          y={fieldY + FIELD_H - 4}
          textAnchor="middle"
          fontSize="8"
          fill="#999"
          pointerEvents="none"
        >
          field
        </text>
        {renderGoodOvals(inv.field, fieldX, fieldY, FIELD_W, FIELD_H, 'field', player.id)}

        {/* House (pentagon shape) */}
        <polygon
          points={`${roofLeft},${wallTop} ${(roofLeft + roofRight) / 2},${roofTop} ${roofRight},${wallTop} ${roofRight},${wallBottom} ${roofLeft},${wallBottom}`}
          fill={isHovered ? '#bbdefb' : fillColor}
          stroke={isHovered ? '#1976d2' : strokeColor}
          strokeWidth={isHovered ? 2.5 : 1.5}
          onClick={() => {
            if (selected && canInteract) handleHouseClick(player.id);
          }}
          style={{ cursor: isDropTarget ? 'pointer' : 'default' }}
        />
        <text
          x={houseX + HOUSE_W / 2}
          y={wallBottom - 4}
          textAnchor="middle"
          fontSize="8"
          fill="#999"
          pointerEvents="none"
        >
          house
        </text>
        {/* House label number */}
        <text
          x={houseX + HOUSE_W - 8}
          y={roofTop + 10}
          fontSize="10"
          fontWeight="bold"
          fill={isSelf ? '#2e7d32' : '#757575'}
          textAnchor="end"
          pointerEvents="none"
        >
          {player.label}
        </text>
        {renderGoodOvals(inv.house, houseX, wallTop, HOUSE_W, HOUSE_H, 'house', player.id)}

        {/* Drop target highlight for click-to-select */}
        {selected && canInteract && !drag && (
          <>
            <polygon
              points={`${roofLeft},${wallTop} ${(roofLeft + roofRight) / 2},${roofTop} ${roofRight},${wallTop} ${roofRight},${wallBottom} ${roofLeft},${wallBottom}`}
              fill="transparent"
              stroke="none"
              onClick={() => handleHouseClick(player.id)}
              style={{ cursor: 'pointer' }}
            />
            <rect
              x={houseX - 2}
              y={roofTop - 2}
              width={HOUSE_W + 4}
              height={HOUSE_H + ROOF_H + 4}
              fill="none"
              stroke="#2196f3"
              strokeWidth={2}
              strokeDasharray="4,3"
              rx={4}
              opacity={0.6}
              pointerEvents="none"
            />
          </>
        )}

        {/* Drop target highlight for drag */}
        {drag && isHovered && (
          <rect
            x={houseX - 3}
            y={roofTop - 3}
            width={HOUSE_W + 6}
            height={HOUSE_H + ROOF_H + 6}
            fill="none"
            stroke="#1976d2"
            strokeWidth={3}
            rx={5}
            opacity={0.8}
            pointerEvents="none"
          />
        )}
      </g>
    );
  };

  return (
    <div className="relative">
      {selected && !drag && (
        <div className="absolute top-0 right-0 z-10 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded shadow">
          Selected {selected.good} — click a house to place it
          <button
            className="ml-2 text-blue-600 underline"
            onClick={() => setSelected(null)}
          >
            Cancel
          </button>
        </div>
      )}
      {drag && (
        <div className="absolute top-0 right-0 z-10 bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded shadow">
          Dragging {drag.good} — drop on a house
        </div>
      )}
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="max-w-full"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (drag) {
            setDrag(null);
            setHoverTarget(null);
          }
        }}
        style={{ cursor: drag ? 'grabbing' : 'default' }}
      >
        {/* Left column */}
        {leftCol.map((player, i) => {
          const x = 10;
          const y = i * (UNIT_H + ROW_GAP + LABEL_H) + 10;
          return renderPlayerUnit(player, x, y);
        })}

        {/* Right column */}
        {rightCol.map((player, i) => {
          const x = UNIT_W + COL_GAP + 10;
          const y = i * (UNIT_H + ROW_GAP + LABEL_H) + 10;
          return renderPlayerUnit(player, x, y);
        })}

        {/* Drag ghost — follows cursor */}
        {drag && (
          <g pointerEvents="none">
            <ellipse
              cx={drag.svgX}
              cy={drag.svgY}
              rx={12}
              ry={16}
              fill={drag.goodColor}
              opacity={0.8}
              stroke="#000"
              strokeWidth={1.5}
            />
            <text
              x={drag.svgX}
              y={drag.svgY + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="11"
              fontWeight="bold"
              fill="white"
            >
              1
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};

export default TownView;
