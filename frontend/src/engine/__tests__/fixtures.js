/**
 * Shared test fixtures for engine module tests.
 */

export const createGameState = (overrides = {}) => ({
  players: {
    you: {
      life: 20,
      mana_pool: {},
      battlefield: [],
      hand: [],
      graveyard: [],
      library: [],
      exile: [],
      ...(overrides.you || {})
    },
    opponent: {
      life: 20,
      mana_pool: {},
      battlefield: [],
      hand: [],
      graveyard: [],
      library: [],
      exile: [],
      ...(overrides.opponent || {})
    }
  },
  turn_phase: 'main1',
  active_player: 'you',
  ...overrides,
  // Re-apply players after spread to avoid overrides clobbering nested structure
  ...(overrides.players ? { players: undefined } : {}),
});

// Fix: properly handle nested player overrides
export const makeGameState = (youOverrides = {}, opponentOverrides = {}, stateOverrides = {}) => ({
  players: {
    you: {
      life: 20,
      mana_pool: {},
      battlefield: [],
      hand: [],
      graveyard: [],
      library: [],
      exile: [],
      ...youOverrides
    },
    opponent: {
      life: 20,
      mana_pool: {},
      battlefield: [],
      hand: [],
      graveyard: [],
      library: [],
      exile: [],
      ...opponentOverrides
    }
  },
  turn_phase: 'main1',
  active_player: 'you',
  ...stateOverrides,
});

let _creatureCounter = 0;
export const createCreature = (overrides = {}) => ({
  card_id: `creature-${++_creatureCounter}`,
  name: 'Test Creature',
  type_line: 'Creature - Human',
  power: '2',
  toughness: '2',
  counters: {},
  tapped: false,
  summoning_sick: false,
  ...overrides,
});

let _stackCounter = 0;
export const createStackItem = (overrides = {}) => ({
  id: `stack-${++_stackCounter}`,
  type: 'spell',
  source: { card_id: 'source-1', name: 'Test Spell', owner: 'you' },
  effect: {},
  requires_input: false,
  targeting_data: null,
  resolved: false,
  timestamp: Date.now(),
  ...overrides,
});

export const createLand = (overrides = {}) => ({
  card_id: `land-${++_creatureCounter}`,
  name: 'Test Land',
  type_line: 'Land',
  tapped: false,
  ...overrides,
});

export const mockHelpers = () => {
  const logs = [];
  return {
    addLog: (msg) => logs.push(msg),
    logs,
  };
};
