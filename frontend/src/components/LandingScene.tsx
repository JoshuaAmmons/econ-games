import React from 'react';

/**
 * Animated landing page scene — moonlit bay with pirate ship, flocking birds,
 * and supply-and-demand figurehead. Pure CSS/SVG, zero image assets.
 */
export const LandingScene: React.FC = () => {
  return (
    <div className="landing-scene" aria-hidden="true">
      {/* Sky gradient + moon */}
      <div className="scene-sky">
        <div className="scene-moon" />
        <div className="scene-stars" />
      </div>

      {/* Flocking birds */}
      <div className="scene-birds">
        {[...Array(8)].map((_, i) => (
          <svg
            key={i}
            className={`scene-bird scene-bird-${i}`}
            viewBox="0 0 20 8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 4 Q5 0 10 3 Q15 0 20 4"
              stroke="rgba(220,225,235,0.7)"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        ))}
      </div>

      {/* Ship + figurehead */}
      <div className="scene-ship-wrapper">
        <svg
          className="scene-ship"
          viewBox="0 0 320 260"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Hull */}
          <path
            d="M60 180 Q70 210 160 215 Q250 210 260 180 L240 180 Q230 200 160 205 Q90 200 80 180 Z"
            fill="#0c1018"
            stroke="#253040"
            strokeWidth="1.2"
          />
          {/* Hull trim */}
          <path
            d="M75 185 Q85 198 160 202 Q235 198 245 185"
            stroke="#2a3545"
            strokeWidth="0.7"
            fill="none"
          />

          {/* Bowsprit (front spar extending from prow) */}
          <line x1="75" y1="178" x2="30" y2="155" stroke="#222d3d" strokeWidth="1.5" />

          {/* Main mast */}
          <line x1="160" y1="175" x2="160" y2="50" stroke="#222d3d" strokeWidth="2.5" />
          {/* Fore mast */}
          <line x1="110" y1="178" x2="110" y2="70" stroke="#222d3d" strokeWidth="2" />
          {/* Mizzen mast */}
          <line x1="210" y1="178" x2="210" y2="80" stroke="#222d3d" strokeWidth="2" />

          {/* Yard arms (horizontal spars) */}
          <line x1="130" y1="65" x2="190" y2="65" stroke="#222d3d" strokeWidth="1.2" />
          <line x1="135" y1="100" x2="185" y2="100" stroke="#222d3d" strokeWidth="1.2" />
          <line x1="85" y1="85" x2="135" y2="85" stroke="#222d3d" strokeWidth="1.2" />
          <line x1="185" y1="95" x2="235" y2="95" stroke="#222d3d" strokeWidth="1.2" />

          {/* Rigging lines */}
          <line x1="110" y1="70" x2="75" y2="178" stroke="#1a2535" strokeWidth="0.6" />
          <line x1="110" y1="70" x2="145" y2="178" stroke="#1a2535" strokeWidth="0.6" />
          <line x1="160" y1="50" x2="100" y2="178" stroke="#1a2535" strokeWidth="0.6" />
          <line x1="160" y1="50" x2="220" y2="178" stroke="#1a2535" strokeWidth="0.6" />
          <line x1="210" y1="80" x2="175" y2="178" stroke="#1a2535" strokeWidth="0.6" />
          <line x1="210" y1="80" x2="245" y2="178" stroke="#1a2535" strokeWidth="0.6" />

          {/* Furled sails (subtle rectangles) */}
          <rect x="132" y="62" width="56" height="5" rx="2" fill="#121a28" stroke="#222d3d" strokeWidth="0.6" />
          <rect x="137" y="97" width="46" height="4.5" rx="1.5" fill="#121a28" stroke="#222d3d" strokeWidth="0.6" />
          <rect x="87" y="82" width="46" height="4.5" rx="1.5" fill="#121a28" stroke="#222d3d" strokeWidth="0.6" />
          <rect x="187" y="92" width="46" height="4.5" rx="1.5" fill="#121a28" stroke="#222d3d" strokeWidth="0.6" />

          {/* Crow's nest */}
          <rect x="155" y="55" width="10" height="6" rx="1" fill="#0c1018" stroke="#222d3d" strokeWidth="0.6" />

          {/* Stern cabin */}
          <rect x="225" y="165" width="30" height="15" rx="2" fill="#0c1018" stroke="#253040" strokeWidth="1" />
          <rect x="228" y="168" width="5" height="5" rx="0.5" fill="#101820" stroke="#2a3545" strokeWidth="0.4" />
          <rect x="236" y="168" width="5" height="5" rx="0.5" fill="#101820" stroke="#2a3545" strokeWidth="0.4" />

          {/* === Figurehead at the prow === */}
          <g transform="translate(38, 140) scale(0.65)">
            {/* Skull */}
            <ellipse cx="20" cy="12" rx="12" ry="10" fill="#1e2838" stroke="#4a5568" strokeWidth="1.2" />
            {/* Eye sockets */}
            <ellipse cx="15" cy="10" rx="3" ry="2.5" fill="#080c12" />
            <ellipse cx="25" cy="10" rx="3" ry="2.5" fill="#080c12" />
            {/* Nose */}
            <path d="M19 14 L21 14 L20 16 Z" fill="#080c12" />
            {/* Grin */}
            <path d="M14 18 Q20 22 26 18" stroke="#080c12" strokeWidth="1.2" fill="none" />
            {/* Teeth marks */}
            <line x1="16" y1="18" x2="16" y2="20" stroke="#080c12" strokeWidth="0.6" />
            <line x1="18" y1="18.5" x2="18" y2="20.5" stroke="#080c12" strokeWidth="0.6" />
            <line x1="20" y1="19" x2="20" y2="21" stroke="#080c12" strokeWidth="0.6" />
            <line x1="22" y1="18.5" x2="22" y2="20.5" stroke="#080c12" strokeWidth="0.6" />
            <line x1="24" y1="18" x2="24" y2="20" stroke="#080c12" strokeWidth="0.6" />

            {/* "Crossbones" as S/D curves */}
            {/* Supply curve (upward sloping from left) */}
            <path
              d="M0 38 Q10 30 20 22 Q30 14 40 6"
              stroke="#c5a059"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              opacity="0.85"
            />
            {/* Demand curve (downward sloping from left) */}
            <path
              d="M0 6 Q10 14 20 22 Q30 30 40 38"
              stroke="#c5a059"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              opacity="0.85"
            />
            {/* Equilibrium dot at intersection */}
            <circle cx="20" cy="22" r="2.5" fill="#c5a059" opacity="0.9" />
          </g>

          {/* Lanterns (amber glowing dots) */}
          <circle className="scene-lantern" cx="100" cy="175" r="2" />
          <circle className="scene-lantern scene-lantern-delay-1" cx="140" cy="172" r="1.5" />
          <circle className="scene-lantern scene-lantern-delay-2" cx="180" cy="172" r="1.5" />
          <circle className="scene-lantern scene-lantern-delay-3" cx="220" cy="170" r="2" />

          {/* Anchor chain (from hull to below waterline) */}
          <path d="M120 195 L115 225 L118 228" stroke="#1a2030" strokeWidth="0.8" fill="none" strokeDasharray="2 2" />
        </svg>
      </div>

      {/* Water surface with moonlight reflections */}
      <div className="scene-water">
        <svg className="scene-wave scene-wave-1" viewBox="0 0 1440 120" preserveAspectRatio="none">
          <path d="M0 40 Q180 10 360 40 T720 40 T1080 40 T1440 40 L1440 120 L0 120 Z" fill="#080d15" />
        </svg>
        <svg className="scene-wave scene-wave-2" viewBox="0 0 1440 120" preserveAspectRatio="none">
          <path d="M0 50 Q180 25 360 50 T720 50 T1080 50 T1440 50 L1440 120 L0 120 Z" fill="#060a12" />
        </svg>
        <svg className="scene-wave scene-wave-3" viewBox="0 0 1440 120" preserveAspectRatio="none">
          <path d="M0 60 Q180 40 360 60 T720 60 T1080 60 T1440 60 L1440 120 L0 120 Z" fill="#0d1117" />
        </svg>
        {/* Moonlight reflections on water */}
        <div className="scene-water-shimmer" />
      </div>
    </div>
  );
};
