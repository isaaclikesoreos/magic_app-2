import { FC, useState } from 'react';
import { getPuzzleSolution } from '../../services/api';
import StackDisplay from './StackDisplay';

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-600',
  medium: 'bg-yellow-600',
  hard: 'bg-orange-600',
  expert: 'bg-red-600',
};

interface Puzzle {
  id: number;
  title: string;
  difficulty: string;
  description?: string;
  created_by_name?: string;
  created_at?: string;
}

interface PuzzleInfoProps {
  puzzle: Puzzle;
}

const PuzzleInfo: FC<PuzzleInfoProps> = ({ puzzle }) => {
  const [showSolution, setShowSolution] = useState(false);
  const [solution, setSolution] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRevealSolution = async () => {
    if (solution) {
      setShowSolution(true);
      return;
    }

    setLoading(true);
    try {
      const res = await getPuzzleSolution(puzzle.id);
      setSolution(res.data.solution_text);
      setShowSolution(true);
    } catch (err) {
      console.error('Failed to load solution:', err);
    } finally {
      setLoading(false);
    }
  };

  const difficultyColor = DIFFICULTY_COLORS[puzzle.difficulty] || 'bg-gray-600';

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      {/* Title */}
      <h1 className="text-2xl font-bold text-white mb-2">{puzzle.title}</h1>

      {/* Difficulty badge */}
      <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium text-white ${difficultyColor} capitalize`}>
        {puzzle.difficulty}
      </span>

      {/* Description */}
      {puzzle.description && (
        <p className="text-gray-300 mt-4">{puzzle.description}</p>
      )}

      {/* Goal hint */}
      <div className="mt-4 p-3 bg-purple-900/30 rounded border border-purple-700">
        <div className="text-sm text-purple-300 font-medium">Goal</div>
        <div className="text-white">Find lethal this turn!</div>
      </div>

      {/* Stack Display */}
      <StackDisplay />

      {/* Solution reveal */}
      <div className="mt-6">
        {!showSolution ? (
          <button
            onClick={handleRevealSolution}
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white py-3 px-4 rounded-lg font-medium transition"
          >
            {loading ? 'Loading...' : 'Reveal Solution'}
          </button>
        ) : (
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
            <div className="text-sm text-gray-400 mb-2">Solution</div>
            <div className="text-white whitespace-pre-wrap">{solution}</div>
            <button
              onClick={() => setShowSolution(false)}
              className="mt-3 text-sm text-purple-400 hover:text-purple-300"
            >
              Hide Solution
            </button>
          </div>
        )}
      </div>

      {/* Meta info */}
      <div className="mt-6 pt-4 border-t border-gray-700 text-sm text-gray-500">
        {puzzle.created_by_name && (
          <div>Created by: {puzzle.created_by_name}</div>
        )}
        {puzzle.created_at && (
          <div>Added: {new Date(puzzle.created_at).toLocaleDateString()}</div>
        )}
      </div>
    </div>
  );
};

export default PuzzleInfo;
