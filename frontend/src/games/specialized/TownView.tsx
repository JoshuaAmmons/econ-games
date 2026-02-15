import React, { useState, useEffect } from 'react';

interface PlayerInventory {
  field: Record<string, number>;
  house: Record<string, number>;
}

interface PlayerInfo {
  id: string;
  name: string;
  label: number;
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

interface SelectedGood {
  good: string;
  fromLocation: 'field' | 'house';
  fromPlayerId: string;
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
  const [selected, setSelected] = useState<SelectedGood | null>(null);

  // Clear selection when phase changes away from 'move'
  useEffect(() => {
    if (phase !== 'move') {
      setSelected(null);
    }
  }, [phase]);

  const half = Math.ceil(players.length / 2);
  const leftCol = players.slice(0, half);
  const rightCol = players.slice(half);
  const rows = Math.max(leftCol.length, rightCol.length);

  const svgW = UNIT_W * 2 + COL_GAP + 40;
  const svgH = rows * (UNIT_H + ROW_GAP + LABEL_H) + 20;

  const canInteract = phase === 'move' && onMoveGoods;

  const handleGoodClick = (good: string, location: 'field' | 'house', playerId: string) => {
    if (!canInteract) return;

    // Can only pick from own inventory (or from others if stealing)
    if (playerId !== currentPlayerId && !allowStealing) return;
    // Can only pick from others' house (not field) when stealing
    if (playerId !== currentPlayerId && location === 'field') return;

    const inv = inventories[playerId];
    if (!inv) return;
    const store = location === 'field' ? inv.field : inv.house;
    if ((store[good] || 0) < 1) return;

    setSelected({ good, fromLocation: location, fromPlayerId: playerId });
  };

  const handleHouseClick = (playerId: string) => {
    if (!canInteract || !selected) return;

    // Execute move
    onMoveGoods!(selected.good, 1, selected.fromLocation, selected.fromPlayerId, playerId);
    setSelected(null);
  };

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

      elements.push(
        <g
          key={`${playerId}-${location}-${good.name}`}
          onClick={(e) => {
            e.stopPropagation();
            handleGoodClick(good.name, location, playerId);
          }}
          style={{ cursor: canInteract && (playerId === currentPlayerId || allowStealing) ? 'pointer' : 'default' }}
        >
          <ellipse
            cx={cx}
            cy={cy}
            rx={ovalRx}
            ry={ovalRy}
            fill={good.color}
            stroke={isSelected ? '#000' : 'none'}
            strokeWidth={isSelected ? 2.5 : 0}
            opacity={0.9}
          />
          <text
            x={cx}
            y={cy + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="13"
            fontWeight="bold"
            fill="white"
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
    const isDropTarget = selected && canInteract;

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

        {/* Group label */}
        <text
          x={x + 2}
          y={y + 12}
          fontSize="9"
          fill="#999"
        >
          G1
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
          onClick={() => isDropTarget && handleHouseClick(player.id)}
          style={{ cursor: isDropTarget ? 'pointer' : 'default' }}
        />
        {renderGoodOvals(inv.field, fieldX, fieldY, FIELD_W, FIELD_H, 'field', player.id)}
        {/* Field drop target overlay (on top of ovals) */}
        {isDropTarget && (
          <rect
            x={fieldX}
            y={fieldY}
            width={FIELD_W}
            height={FIELD_H}
            fill="transparent"
            stroke="none"
            rx={3}
            onClick={() => handleHouseClick(player.id)}
            style={{ cursor: 'pointer' }}
          />
        )}

        {/* House (pentagon shape) */}
        <polygon
          points={`${roofLeft},${wallTop} ${(roofLeft + roofRight) / 2},${roofTop} ${roofRight},${wallTop} ${roofRight},${wallBottom} ${roofLeft},${wallBottom}`}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1.5}
          onClick={() => isDropTarget && handleHouseClick(player.id)}
          style={{ cursor: isDropTarget ? 'pointer' : 'default' }}
        />
        {/* House label number */}
        <text
          x={houseX + HOUSE_W - 8}
          y={roofTop + 10}
          fontSize="10"
          fontWeight="bold"
          fill={isSelf ? '#2e7d32' : '#757575'}
          textAnchor="end"
        >
          {player.label}
        </text>
        {renderGoodOvals(inv.house, houseX, wallTop, HOUSE_W, HOUSE_H, 'house', player.id)}

        {/* Drop target: clickable overlay on top of ovals + dashed highlight */}
        {isDropTarget && (
          <>
            {/* Transparent clickable polygon covering the whole house area */}
            <polygon
              points={`${roofLeft},${wallTop} ${(roofLeft + roofRight) / 2},${roofTop} ${roofRight},${wallTop} ${roofRight},${wallBottom} ${roofLeft},${wallBottom}`}
              fill="transparent"
              stroke="none"
              onClick={() => handleHouseClick(player.id)}
              style={{ cursor: 'pointer' }}
            />
            {/* Dashed border highlight */}
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
      </g>
    );
  };

  return (
    <div className="relative">
      {selected && (
        <div className="absolute top-0 right-0 z-10 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded shadow">
          Moving {selected.good} — click a house to place it
          <button
            className="ml-2 text-blue-600 underline"
            onClick={() => setSelected(null)}
          >
            Cancel
          </button>
        </div>
      )}
      <svg
        width="100%"
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="max-w-full"
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
      </svg>
    </div>
  );
};

export default TownView;
