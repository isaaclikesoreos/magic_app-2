import { FC, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPopularCubes, getActiveLobbies } from '../services/api';

interface Cube {
  id: number;
  name: string;
  card_count: number;
  power_level?: string;
  draft_count: number;
}

interface Lobby {
  id: number;
  cube?: {
    name: string;
  };
  player_count: number;
  pack_count: number;
}

const Home: FC = () => {
  const [popularCubes, setPopularCubes] = useState<Cube[]>([]);
  const [activeLobbies, setActiveLobbies] = useState<Lobby[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getPopularCubes(), getActiveLobbies()])
      .then(([cubesRes, lobbiesRes]) => {
        setPopularCubes(cubesRes.data);
        setActiveLobbies(lobbiesRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-purple-400 mb-4">
          MTG Draft Simulator
        </h1>
        <p className="text-xl text-gray-400 mb-8">
          Draft your favorite cubes with friends online
        </p>
        <div className="flex justify-center space-x-4">
          <Link
            to="/draft/new"
            className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-lg text-lg font-semibold"
          >
            Start Draft
          </Link>
          <Link
            to="/cubes"
            className="bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-lg text-lg font-semibold"
          >
            Browse Cubes
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Popular Cubes */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-4 text-purple-300">
            Popular Cubes
          </h2>
          {popularCubes.length === 0 ? (
            <p className="text-gray-400">No cubes yet. Be the first to create one!</p>
          ) : (
            <div className="space-y-3">
              {popularCubes.slice(0, 5).map((cube) => (
                <Link
                  key={cube.id}
                  to={`/cubes/${cube.id}`}
                  className="block bg-gray-700 hover:bg-gray-600 rounded p-4 transition"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold">{cube.name}</h3>
                      <p className="text-sm text-gray-400">
                        {cube.card_count} cards • {cube.power_level || 'Unknown'} power
                      </p>
                    </div>
                    <div className="text-sm text-gray-400">
                      {cube.draft_count} drafts
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Active Lobbies */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-4 text-green-300">
            Active Lobbies
          </h2>
          {activeLobbies.length === 0 ? (
            <p className="text-gray-400">No active lobbies. Start one!</p>
          ) : (
            <div className="space-y-3">
              {activeLobbies.slice(0, 5).map((lobby) => (
                <Link
                  key={lobby.id}
                  to={`/draft/${lobby.id}`}
                  className="block bg-gray-700 hover:bg-gray-600 rounded p-4 transition"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold">{lobby.cube?.name || 'Draft'}</h3>
                      <p className="text-sm text-gray-400">
                        {lobby.player_count} players • {lobby.pack_count} packs
                      </p>
                    </div>
                    <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">
                      Join
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
