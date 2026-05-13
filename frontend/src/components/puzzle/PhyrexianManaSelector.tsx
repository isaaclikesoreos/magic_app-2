import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const COLOR_SYMBOLS: Record<string, string> = {
  W: '{W}', U: '{U}', B: '{B}', R: '{R}', G: '{G}'
};

const PhyrexianManaSelector: FC = () => {
  const {
    phyrexianManaState,
    setPhyrexianPipsPayingLife,
    confirmPhyrexianCast,
    cancelPhyrexianCast,
    gameState
  } = usePuzzle();

  if (!phyrexianManaState || !gameState) return null;

  const { card, phyrexianPips, pipsPayingLife } = phyrexianManaState;
  const totalPips = phyrexianPips.length;
  const lifeCost = pipsPayingLife * 2;
  const currentLife = gameState.players.you.life;
  // Can't pay more life than you have (must survive — paying to exactly 0 is losing)
  const maxLifePips = Math.min(totalPips, Math.floor((currentLife - 1) / 2));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-fuchsia-500 rounded-lg p-6 shadow-xl max-w-md">
        <div className="text-white font-semibold mb-2 text-center">
          Cast {card.name}
        </div>
        <div className="text-fuchsia-400 text-sm text-center mb-4">
          Choose how many Phyrexian pips to pay with life (2 life each)
        </div>

        <div className="space-y-4">
          {/* Pip display */}
          <div className="flex justify-center gap-2">
            {phyrexianPips.map((color, i) => {
              const payingLife = i < pipsPayingLife;
              return (
                <div
                  key={i}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                    payingLife
                      ? 'bg-fuchsia-900 border-fuchsia-400 text-fuchsia-300'
                      : 'bg-gray-700 border-gray-500 text-white'
                  }`}
                >
                  {payingLife ? '♥2' : COLOR_SYMBOLS[color] || color}
                </div>
              );
            })}
          </div>

          {/* Counter */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setPhyrexianPipsPayingLife(Math.max(0, pipsPayingLife - 1))}
              disabled={pipsPayingLife <= 0}
              className="w-10 h-10 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg font-bold text-xl transition"
            >
              -
            </button>
            <div className="text-center">
              <div className="text-3xl font-bold text-white">{pipsPayingLife}</div>
              <div className="text-xs text-gray-400">of {totalPips} pips</div>
            </div>
            <button
              onClick={() => setPhyrexianPipsPayingLife(Math.min(maxLifePips, pipsPayingLife + 1))}
              disabled={pipsPayingLife >= maxLifePips}
              className="w-10 h-10 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg font-bold text-xl transition"
            >
              +
            </button>
          </div>

          {/* Cost summary */}
          <div className="text-center space-y-1">
            {lifeCost > 0 && (
              <div className="text-fuchsia-400 text-sm">
                Pay <span className="font-bold">{lifeCost} life</span> (life: {currentLife} → {currentLife - lifeCost})
              </div>
            )}
            <div className="text-gray-400 text-sm">
              {pipsPayingLife === totalPips
                ? 'All Phyrexian pips paid with life'
                : pipsPayingLife === 0
                ? 'All Phyrexian pips paid with mana'
                : `${pipsPayingLife} with life, ${totalPips - pipsPayingLife} with mana`
              }
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={cancelPhyrexianCast}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={confirmPhyrexianCast}
            className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-700 text-white py-2 rounded font-medium transition"
          >
            Cast{lifeCost > 0 ? ` (-${lifeCost} life)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhyrexianManaSelector;
