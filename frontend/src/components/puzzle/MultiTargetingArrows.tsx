import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const MultiTargetingArrows: FC = () => {
  const { multiTargetingState } = usePuzzle();

  if (!multiTargetingState || !multiTargetingState.assignments) return null;

  return (
    <svg
      className="fixed inset-0 pointer-events-none z-50"
      style={{ width: '100vw', height: '100vh' }}
    >
      <defs>
        <filter id="multi-glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker
          id="arrowhead-multi"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 10 3, 0 6" fill="#f59e0b" />
        </marker>
      </defs>

      {multiTargetingState.assignments.map((assignment, idx) => {
        if (!assignment.arrow || !assignment.arrow.origin || !assignment.arrow.destination || assignment.damage === 0) return null;

        const midX = (assignment.arrow.origin.x + assignment.arrow.destination.x) / 2;
        const midY = (assignment.arrow.origin.y + assignment.arrow.destination.y) / 2;

        return (
          <g key={idx}>
            {/* Arrow line */}
            <line
              x1={assignment.arrow.origin.x}
              y1={assignment.arrow.origin.y}
              x2={assignment.arrow.destination.x}
              y2={assignment.arrow.destination.y}
              stroke="#f59e0b"
              strokeWidth="4"
              markerEnd="url(#arrowhead-multi)"
              filter="url(#multi-glow)"
            />

            {/* Damage label */}
            <circle
              cx={midX}
              cy={midY}
              r="18"
              fill="#f59e0b"
              filter="url(#multi-glow)"
            />
            <text
              x={midX}
              y={midY}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize="16"
              fontWeight="bold"
            >
              {assignment.damage}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default MultiTargetingArrows;
