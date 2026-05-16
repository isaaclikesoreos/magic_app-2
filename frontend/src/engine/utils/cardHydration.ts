import cardService from '../../services/cardService';
import { Card, Token, GameState } from '@/types';

/**
 * Hydrate game state by fetching card definitions and merging with instances.
 *
 * Input state has card instances with only:
 *   { card_id: 1, instance_id: "bolt-1", is_token: false, tapped: false, ... }
 *
 * Output state has full card data merged:
 *   { card_id: 1, instance_id: "bolt-1", name: "Lightning Bolt", mana_cost: "{R}", ... }
 */

interface CardDefinition {
  id: number;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string;
  power?: string;
  toughness?: string;
  images?: { image_url: string; image_type?: string; is_primary?: boolean }[];
  abilities?: {
    keywords?: string[];
    triggered?: any[];
    activated?: any[];
    static?: any[];
    spell_effect?: any;
  };
}

interface TokenDefinition {
  id: number;
  name: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  abilities?: {
    keywords?: string[];
    triggered?: any[];
    activated?: any[];
    static?: any[];
  };
}

/**
 * Extract all unique card and token IDs from a game state
 */
function extractCardIds(state: any): { cardIds: number[]; tokenIds: number[] } {
  const cardIds = new Set<number>();
  const tokenIds = new Set<number>();

  function traverse(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    // Check if this is a card instance
    if (obj.card_id !== undefined && obj.instance_id !== undefined) {
      // Skip if card already has full data (name field present)
      // This handles old puzzles with inline card data
      if (obj.name !== undefined) {
        return;
      }

      // Skip if card_id is not a number (string IDs from old puzzles)
      if (typeof obj.card_id !== 'number') {
        return;
      }

      if (obj.is_token) {
        tokenIds.add(obj.card_id);
      } else {
        cardIds.add(obj.card_id);
      }
      return; // Don't recurse into card instances
    }

    // Recurse into objects and arrays
    if (Array.isArray(obj)) {
      obj.forEach(item => traverse(item));
    } else {
      Object.values(obj).forEach(value => traverse(value));
    }
  }

  traverse(state);

  return {
    cardIds: Array.from(cardIds),
    tokenIds: Array.from(tokenIds),
  };
}

/**
 * Hydrate a single card instance with its definition
 */
function hydrateCardInstance(instance: Partial<Card>, definition: CardDefinition | TokenDefinition | undefined): Card | Token {
  if (!definition) {
    console.error('No definition found for card_id:', instance.card_id);
    return instance as Card;
  }

  // Check if this is a card (not a token) to access card-only properties
  const isCard = 'cmc' in definition;
  const cardDef = definition as CardDefinition;

  // Convert colors string to array (API returns "RG", we need ["R", "G"])
  const colors = isCard && cardDef.colors
    ? cardDef.colors.split('')
    : [];

  // Merge definition with instance, keeping instance state
  const hydrated = {
    ...instance,
    // Card definition data
    name: definition.name,
    mana_cost: isCard ? (cardDef.mana_cost || '') : '',
    cmc: isCard ? (cardDef.cmc || 0) : 0,
    type_line: definition.type_line || '',
    oracle_text: definition.oracle_text || '',
    colors,
    power: definition.power,
    toughness: definition.toughness,
    images: (definition as any).images,
    // Abilities from abilities object (standardized format)
    keywords: definition.abilities?.keywords || [],
    triggered_abilities: definition.abilities?.triggered || [],
    activated_abilities: definition.abilities?.activated || [],
    static_abilities: definition.abilities?.static || [],
    spell_effect: isCard ? cardDef.abilities?.spell_effect : undefined,
  } as Card;

  // Merge any additional card_data fields (like hasStorm, hasHaste, etc.)
  // @ts-ignore - card_data may exist on the definition
  if (isCard && cardDef.card_data) {
    // @ts-ignore
    const cardData = cardDef.card_data;
    // Copy all card_data fields except spell_effect (already handled above)
    Object.keys(cardData).forEach(key => {
      if (key !== 'spell_effect') {
        // @ts-ignore
        hydrated[key] = cardData[key];
      }
    });
  }

  return hydrated;
}

/**
 * Recursively hydrate all card instances in a state object
 */
function hydrateState(
  state: any,
  cardMap: Map<number, CardDefinition>,
  tokenMap: Map<number, TokenDefinition>
): any {
  if (!state || typeof state !== 'object') {
    return state;
  }

  // Check if this is a card instance
  if (state.card_id !== undefined && state.instance_id !== undefined) {
    // Skip old inline card data (name already present — no hydration needed)
    if (state.name !== undefined) {
      return state;
    }
    // Skip old string card IDs (e.g. "bolt-1") — not DB references
    if (typeof state.card_id !== 'number') {
      return state;
    }
    const definition = state.is_token ? tokenMap.get(state.card_id) : cardMap.get(state.card_id);
    return hydrateCardInstance(state, definition);
  }

  // Recurse into objects and arrays
  if (Array.isArray(state)) {
    return state.map(item => hydrateState(item, cardMap, tokenMap));
  } else {
    const hydrated: any = {};
    for (const [key, value] of Object.entries(state)) {
      hydrated[key] = hydrateState(value, cardMap, tokenMap);
    }
    return hydrated;
  }
}

/**
 * Main hydration function: fetch card data and merge with state
 *
 * @param rawState - Game state with card_id references
 * @returns Hydrated game state with full card data
 */
export async function hydrateGameState(rawState: GameState): Promise<GameState> {
  try {
    // Extract all card and token IDs from the state
    const { cardIds, tokenIds } = extractCardIds(rawState);

    console.log(`Hydrating game state: ${cardIds.length} cards, ${tokenIds.length} tokens`);

    // Fetch all cards and tokens in bulk
    const [cards, tokens] = await Promise.all([
      cardIds.length > 0 ? cardService.getCards(cardIds) : Promise.resolve([]),
      tokenIds.length > 0 ? cardService.getTokens(tokenIds) : Promise.resolve([]),
    ]);

    // Create lookup maps
    const cardMap = new Map(cards.map(card => [card.id, card as CardDefinition]));
    const tokenMap = new Map(tokens.map(token => [token.id, token as TokenDefinition]));

    // Hydrate the state
    const hydratedState = hydrateState(rawState, cardMap, tokenMap) as GameState;

    // Set cardOwner on every card based on which player's zone it's in.
    // This tracks the MTG concept of "owner" (whose deck the card came from)
    // which never changes, even when control changes (e.g. reanimation).
    const zones = ['hand', 'battlefield', 'graveyard', 'exile', 'library'] as const;
    (['you', 'opponent'] as const).forEach(playerKey => {
      zones.forEach(zone => {
        const cards = (hydratedState.players[playerKey] as any)[zone];
        if (Array.isArray(cards)) {
          cards.forEach((card: any) => {
            if (card && typeof card === 'object' && card.card_id !== undefined) {
              card.cardOwner = playerKey;
            }
          });
        }
      });
    });

    console.log('Game state hydration complete');

    return hydratedState;
  } catch (error) {
    console.error('Error hydrating game state:', error);
    throw error;
  }
}
