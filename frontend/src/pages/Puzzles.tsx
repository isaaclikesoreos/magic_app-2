import { FC, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPuzzles } from '../services/api';

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
}

const Puzzles: FC = () => {
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    getPuzzles()
      .then((res) => setPuzzles(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredPuzzles = filter === 'all'
    ? puzzles
    : puzzles.filter(p => p.difficulty === filter);

  const difficulties = ['all', 'easy', 'medium', 'hard', 'expert'];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-xl">Loading puzzles...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-purple-400">Lethal Puzzles</h1>
      </div>

      {/* Description */}
      <p className="text-gray-400 mb-6">
        Test your Magic skills! Each puzzle presents a board state where you need to find lethal.
        Think through the solution, then reveal the answer to check your work.
      </p>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        {difficulties.map((level) => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={`px-4 py-2 rounded-lg capitalize transition ${
              filter === level
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {level}
          </button>
        ))}
      </div>

      {/* Puzzle Grid */}
      {filteredPuzzles.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-xl mb-4">No puzzles found</p>
          <p className="text-sm">Check back later for new puzzles!</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPuzzles.map((puzzle) => (
            <Link
              key={puzzle.id}
              to={`/puzzles/${puzzle.id}`}
              className="bg-gray-800 hover:bg-gray-750 rounded-lg overflow-hidden transition group border border-gray-700 hover:border-purple-500"
            >
              <div className="h-32 bg-gradient-to-br from-purple-900 to-gray-800 relative flex items-center justify-center">
                <span className="text-6xl opacity-50">🧩</span>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold group-hover:text-purple-400 transition">
                    {puzzle.title}
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${DIFFICULTY_COLORS[puzzle.difficulty]}`}>
                    {puzzle.difficulty}
                  </span>
                </div>
                <p className="text-sm text-gray-400 line-clamp-2">
                  {puzzle.description || 'Find the lethal line!'}
                </p>
                {puzzle.created_by_name && (
                  <div className="mt-3 text-xs text-gray-500">
                    By {puzzle.created_by_name}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Puzzles;
