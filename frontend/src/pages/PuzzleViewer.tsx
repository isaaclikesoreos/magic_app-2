import { FC, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPuzzle } from '../services/api';
import { GameBoard, PuzzleInfo } from '../components/puzzle';
import ProtectionColorSelector from '../components/puzzle/ProtectionColorSelector';
import StormTargetingControls from '../components/puzzle/StormTargetingControls';
import { PuzzleProvider } from '../context/PuzzleContext';

interface Puzzle {
  id: number;
  title: string;
  difficulty: string;
  description?: string;
  created_by_name?: string;
  created_at?: string;
  game_state: any;
}

const PuzzleViewer: FC = () => {
  const { id } = useParams<{ id: string }>();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getPuzzle(id!)
      .then((res) => setPuzzle(res.data))
      .catch((err) => {
        console.error('Failed to load puzzle:', err);
        setError('Failed to load puzzle');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleReset = () => {
    // Reload puzzle from API to reset state
    setLoading(true);
    getPuzzle(id!)
      .then((res) => setPuzzle(res.data))
      .catch((err) => {
        console.error('Failed to reload puzzle:', err);
      })
      .finally(() => setLoading(false));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-xl">Loading puzzle...</div>
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="text-xl text-red-400 mb-4">{error || 'Puzzle not found'}</div>
          <Link to="/puzzles" className="text-purple-400 hover:text-purple-300">
            Back to Puzzles
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PuzzleProvider initialGameState={puzzle.game_state}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Back link and Reset button */}
        <div className="flex justify-between items-center mb-4">
          <Link to="/puzzles" className="text-purple-400 hover:text-purple-300 text-sm">
            ← Back to Puzzles
          </Link>
          <button
            onClick={handleReset}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
          >
            Reset Puzzle
          </button>
        </div>

        {/* Main layout: Game board + Info sidebar */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Game Board */}
          <div className="lg:col-span-2">
            <GameBoard />
          </div>

          {/* Puzzle Info Sidebar */}
          <div className="lg:col-span-1">
            <PuzzleInfo puzzle={puzzle} />
          </div>
        </div>

        {/* Protection Color Selector Modal */}
        <ProtectionColorSelector />

        {/* Storm Targeting Controls */}
        <StormTargetingControls />
      </div>
    </PuzzleProvider>
  );
};

export default PuzzleViewer;
