import { FC, useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { GameBoard, StackDisplay } from '../components/puzzle';
import ProtectionColorSelector from '../components/puzzle/ProtectionColorSelector';
import StormTargetingControls from '../components/puzzle/StormTargetingControls';
import { PuzzleProvider, usePuzzle } from '../context/PuzzleContext';
import { ManaPool as ManaPoolDisplay } from '../components/puzzle';
import cardService from '../services/cardService';
import api from '../services/api';
import { GameState, Card } from '@/types';

const BLANK_STATE: GameState = {
  players: {
    you: {
      life: 20,
      mana_pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
      library: [],
      library_count: 0,
      hand: [],
      battlefield: [],
      graveyard: [],
      exile: [],
    },
    opponent: {
      life: 20,
      mana_pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
      library: [],
      library_count: 0,
      hand: [],
      battlefield: [],
      graveyard: [],
      exile: [],
    },
  },
  turn_phase: 'main1',
  active_player: 'you',
};

interface SearchResult {
  id: number;
  name: string;
  mana_cost: string;
  type_line: string;
}

const MANA_COLORS = [
  { key: 'W', label: 'W', bg: 'bg-yellow-100', text: 'text-yellow-900' },
  { key: 'U', label: 'U', bg: 'bg-blue-500', text: 'text-white' },
  { key: 'B', label: 'B', bg: 'bg-gray-900', text: 'text-white', border: 'border border-gray-600' },
  { key: 'R', label: 'R', bg: 'bg-red-600', text: 'text-white' },
  { key: 'G', label: 'G', bg: 'bg-green-600', text: 'text-white' },
  { key: 'C', label: 'C', bg: 'bg-gray-400', text: 'text-gray-900' },
];

type ZoneOption = 'hand' | 'battlefield' | 'graveyard' | 'library';
type PlayerOption = 'you' | 'opponent';

const ZONE_OPTIONS: { value: ZoneOption; label: string }[] = [
  { value: 'hand', label: 'Hand' },
  { value: 'battlefield', label: 'Battlefield' },
  { value: 'graveyard', label: 'Graveyard' },
  { value: 'library', label: 'Library' },
];

const GodModePanel: FC = () => {
  const { addCardToZone, addMana, gameState } = usePuzzle();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [targetPlayer, setTargetPlayer] = useState<PlayerOption>('you');
  const [targetZone, setTargetZone] = useState<ZoneOption>('hand');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await api.get(`/cards/search/?q=${encodeURIComponent(query)}`);
      setSearchResults(response.data);
    } catch (err) {
      console.error('Card search failed:', err);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(searchQuery), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, doSearch]);

  const handleAddCard = useCallback(async (result: SearchResult) => {
    try {
      const cardData = await cardService.getCard(result.id);
      const colors = (cardData as any).colors
        ? String((cardData as any).colors).split('')
        : [];
      const instanceId = `freestyle-${result.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const card: Card = {
        card_id: result.id,
        instance_id: instanceId,
        name: cardData.name,
        mana_cost: cardData.mana_cost || '',
        cmc: (cardData as any).cmc || 0,
        type_line: cardData.type_line || '',
        oracle_text: cardData.oracle_text || '',
        colors,
        power: cardData.power,
        toughness: cardData.toughness,
        is_token: false,
        keywords: cardData.abilities?.keywords || [],
        triggered_abilities: cardData.abilities?.triggered || [],
        activated_abilities: cardData.abilities?.activated || [],
        static_abilities: cardData.abilities?.static || [],
        spell_effect: cardData.abilities?.spell_effect,
      } as Card;

      // Merge any extra card_data fields
      if ((cardData as any).card_data) {
        const extra = (cardData as any).card_data;
        Object.keys(extra).forEach(key => {
          if (key !== 'spell_effect') {
            (card as any)[key] = extra[key];
          }
        });
      }

      addCardToZone(card, targetPlayer, targetZone);
      const playerLabel = targetPlayer === 'you' ? 'your' : "opponent's";
      setAddedMessage(`${result.name} to ${playerLabel} ${targetZone}`);
      setTimeout(() => setAddedMessage(null), 1500);
    } catch (err) {
      console.error('Failed to add card:', err);
    }
  }, [addCardToZone, targetPlayer, targetZone]);

  const handleAddMana = useCallback((color: string) => {
    addMana(color, 1);
  }, [addMana]);

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-bold text-white">God Mode</h3>

      {/* Stack & Priority */}
      <StackDisplay />

      {/* Mana Section */}
      <div>
        <h4 className="text-sm font-semibold text-gray-400 mb-2">Add Mana</h4>
        <div className="flex gap-2 mb-2">
          {MANA_COLORS.map(c => (
            <button
              key={c.key}
              onClick={() => handleAddMana(c.key)}
              className={`w-9 h-9 rounded-full ${c.bg} ${c.text} ${c.border || ''} font-bold text-sm hover:ring-2 hover:ring-white/50 transition-all`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {gameState && (
          <ManaPoolDisplay mana={gameState.players.you.mana_pool} />
        )}
      </div>

      {/* Card Search Section */}
      <div>
        <h4 className="text-sm font-semibold text-gray-400 mb-2">Add Card</h4>

        {/* Player & Zone selectors */}
        <div className="flex gap-2 mb-2">
          <div className="flex rounded overflow-hidden border border-gray-600">
            {(['you', 'opponent'] as PlayerOption[]).map(p => (
              <button
                key={p}
                onClick={() => setTargetPlayer(p)}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${
                  targetPlayer === p
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {p === 'you' ? 'You' : 'Opponent'}
              </button>
            ))}
          </div>
          <select
            value={targetZone}
            onChange={e => setTargetZone(e.target.value as ZoneOption)}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500"
          >
            {ZONE_OPTIONS.map(z => (
              <option key={z.value} value={z.value}>{z.label}</option>
            ))}
          </select>
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search cards..."
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        {addedMessage && (
          <div className="text-green-400 text-xs mt-1">Added {addedMessage}</div>
        )}
        {searching && (
          <div className="text-gray-500 text-xs mt-1">Searching...</div>
        )}
        <div className="mt-2 max-h-80 overflow-y-auto space-y-1">
          {searchResults.map(result => (
            <button
              key={result.id}
              onClick={() => handleAddCard(result)}
              className="w-full text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              <span className="text-white">{result.name}</span>
              <span className="text-gray-400 ml-2 text-xs">{result.mana_cost}</span>
              <div className="text-gray-500 text-xs">{result.type_line}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const Freestyle: FC = () => {
  const [key, setKey] = useState(0);

  const handleReset = () => setKey(prev => prev + 1);

  return (
    <PuzzleProvider key={key} initialGameState={JSON.parse(JSON.stringify(BLANK_STATE))}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-4">
          <Link to="/" className="text-purple-400 hover:text-purple-300 text-sm">
            &larr; Home
          </Link>
          <button
            onClick={handleReset}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
          >
            Reset Board
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <GameBoard />
          </div>
          <div className="lg:col-span-1">
            <GodModePanel />
          </div>
        </div>

        <ProtectionColorSelector />
        <StormTargetingControls />
      </div>
    </PuzzleProvider>
  );
};

export default Freestyle;
