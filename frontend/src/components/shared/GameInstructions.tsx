import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { gameInstructions } from '../../games/gameInstructions';
import type { GameInstructionSet } from '../../games/gameInstructions';

interface GameInstructionsProps {
  gameType: string;
  variant?: 'student' | 'instructor';
}

/**
 * Collapsible instruction panel for game pages.
 * - 'student' variant: shows how-to-play instructions (for the Market page)
 * - 'instructor' variant: shows payoff functions, equilibrium, and teaching notes (for the Monitor page)
 */
export const GameInstructions: React.FC<GameInstructionsProps> = ({ gameType, variant = 'student' }) => {
  const [expanded, setExpanded] = useState(false);
  const instructions = gameInstructions[gameType];

  if (!instructions) return null;

  if (variant === 'student') {
    return <StudentInstructions instructions={instructions} expanded={expanded} setExpanded={setExpanded} />;
  }

  return <InstructorNotes instructions={instructions} expanded={expanded} setExpanded={setExpanded} />;
};

function StudentInstructions({
  instructions,
  expanded,
  setExpanded,
}: {
  instructions: GameInstructionSet;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  const { studentInstructions: info } = instructions;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-sky-100 mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-sky-50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2 text-sky-700">
          <HelpCircle className="w-5 h-5" />
          <span className="font-medium">How to Play</span>
          {!expanded && (
            <span className="text-sm text-gray-500 font-normal ml-2 hidden sm:inline">
              {info.premise.slice(0, 80)}...
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <p className="text-sm text-gray-700">{info.premise}</p>
          </div>

          <div className="bg-sky-50 rounded-md p-3">
            <div className="text-xs font-semibold text-sky-800 uppercase tracking-wide mb-1">Your Goal</div>
            <p className="text-sm text-sky-900">{info.yourGoal}</p>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">How It Works</div>
            <ul className="space-y-1">
              {info.howToPlay.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-sky-500 mt-0.5 flex-shrink-0">&#8226;</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>

          {info.tips && info.tips.length > 0 && (
            <div className="bg-amber-50 rounded-md p-3">
              <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">Tips</div>
              <ul className="space-y-1">
                {info.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-sm text-amber-900">
                    <span className="text-amber-500 mt-0.5 flex-shrink-0">&#9734;</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InstructorNotes({
  instructions,
  expanded,
  setExpanded,
}: {
  instructions: GameInstructionSet;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  const { instructorNotes: notes } = instructions;

  return (
    <div className="bg-white rounded-lg shadow-md border border-purple-100 mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-purple-50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2 text-purple-700">
          <BookOpen className="w-5 h-5" />
          <span className="font-medium">Instructor Notes</span>
          {!expanded && (
            <span className="text-sm text-gray-500 font-normal ml-2 hidden sm:inline">
              Payoff functions, equilibrium, teaching tips
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Payoff Functions</div>
            <div className="bg-gray-50 rounded-md p-3 space-y-1">
              {notes.payoffFunctions.map((fn, i) => (
                <p key={i} className="text-sm font-mono text-gray-800">{fn}</p>
              ))}
            </div>
          </div>

          {notes.equilibrium && (
            <div>
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Theoretical Equilibrium</div>
              <p className="text-sm text-gray-700 bg-purple-50 rounded-md p-3">{notes.equilibrium}</p>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Key Parameters</div>
            <ul className="space-y-1">
              {notes.keyParameters.map((param, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-purple-500 mt-0.5 flex-shrink-0">&#8226;</span>
                  <span>{param}</span>
                </li>
              ))}
            </ul>
          </div>

          {notes.teachingNotes && notes.teachingNotes.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Teaching Notes</div>
              <ul className="space-y-1">
                {notes.teachingNotes.map((note, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-green-500 mt-0.5 flex-shrink-0">&#10003;</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
