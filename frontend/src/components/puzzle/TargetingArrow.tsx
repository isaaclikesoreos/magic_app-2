import { FC, useEffect } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const TargetingArrow: FC = () => {
  const { isTargeting, targetingOrigin, mousePosition, updateMousePosition, cancelTargeting } = usePuzzle();

  useEffect(() => {
    if (!isTargeting) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateMousePosition(e.clientX, e.clientY);
    };

    const handleRightClick = (e: MouseEvent) => {
      e.preventDefault();
      cancelTargeting();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelTargeting();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleRightClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', handleRightClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTargeting, updateMousePosition, cancelTargeting]);

  if (!isTargeting || !targetingOrigin) return null;

  const { x: x1, y: y1 } = targetingOrigin;
  const { x: x2, y: y2 } = mousePosition;

  // Calculate arrow head
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowLength = 15;
  const arrowAngle = Math.PI / 6; // 30 degrees

  const arrowPoint1 = {
    x: x2 - arrowLength * Math.cos(angle - arrowAngle),
    y: y2 - arrowLength * Math.sin(angle - arrowAngle),
  };
  const arrowPoint2 = {
    x: x2 - arrowLength * Math.cos(angle + arrowAngle),
    y: y2 - arrowLength * Math.sin(angle + arrowAngle),
  };

  return (
    <svg
      className="fixed inset-0 pointer-events-none z-50"
      style={{ width: '100vw', height: '100vh' }}
    >
      {/* Glow effect */}
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Main line */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#ef4444"
        strokeWidth="4"
        filter="url(#glow)"
      />

      {/* Arrow head */}
      <polygon
        points={`${x2},${y2} ${arrowPoint1.x},${arrowPoint1.y} ${arrowPoint2.x},${arrowPoint2.y}`}
        fill="#ef4444"
        filter="url(#glow)"
      />

      {/* Inner line for style */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#fca5a5"
        strokeWidth="2"
      />
    </svg>
  );
};

export default TargetingArrow;
