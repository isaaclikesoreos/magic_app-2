import api from './api';

/**
 * Card and Token Service with caching
 *
 * Provides a centralized service for fetching and caching card/token data.
 * Used by puzzles to fetch card definitions at runtime.
 */

// Types for API responses
interface CardData {
  id: number;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string;
  power?: string;
  toughness?: string;
  abilities?: {
    keywords?: string[];
    triggered?: any[];
    activated?: any[];
    static?: any[];
    spell_effect?: any;
  };
}

interface TokenData {
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

interface CacheStats {
  cardsCached: number;
  tokensCached: number;
  pendingCardFetches: number;
  pendingTokenFetches: number;
}

class CardService {
  private cardCache: Map<number, CardData>;
  private tokenCache: Map<number, TokenData>;
  private pendingCardFetches: Map<number, Promise<CardData>>;
  private pendingTokenFetches: Map<number, Promise<TokenData>>;

  constructor() {
    // In-memory caches
    this.cardCache = new Map();
    this.tokenCache = new Map();

    // Track pending fetches to avoid duplicate requests
    this.pendingCardFetches = new Map();
    this.pendingTokenFetches = new Map();
  }

  /**
   * Get a single card by ID (cached)
   */
  async getCard(cardId: number): Promise<CardData> {
    // Check cache first
    if (this.cardCache.has(cardId)) {
      return this.cardCache.get(cardId)!;
    }

    // Check if already fetching
    if (this.pendingCardFetches.has(cardId)) {
      return this.pendingCardFetches.get(cardId)!;
    }

    // Fetch from API
    const fetchPromise = api.get(`/cards/${cardId}/`)
      .then(response => {
        const card = response.data as CardData;
        this.cardCache.set(cardId, card);
        this.pendingCardFetches.delete(cardId);
        return card;
      })
      .catch(error => {
        this.pendingCardFetches.delete(cardId);
        throw error;
      });

    this.pendingCardFetches.set(cardId, fetchPromise);
    return fetchPromise;
  }

  /**
   * Get multiple cards by IDs in bulk (cached)
   */
  async getCards(cardIds: number[]): Promise<CardData[]> {
    if (!cardIds || cardIds.length === 0) {
      return [];
    }

    // Separate cached from uncached
    const cached: CardData[] = [];
    const needFetch: number[] = [];

    cardIds.forEach(id => {
      if (this.cardCache.has(id)) {
        cached.push(this.cardCache.get(id)!);
      } else {
        needFetch.push(id);
      }
    });

    // If all cached, return immediately
    if (needFetch.length === 0) {
      return cached;
    }

    // Fetch missing cards in bulk
    try {
      const response = await api.post('/cards/bulk_fetch/', {
        card_ids: needFetch
      });

      const fetchedCards = response.data as CardData[];

      // Cache the fetched cards
      fetchedCards.forEach(card => {
        this.cardCache.set(card.id, card);
      });

      // Return all cards
      return [...cached, ...fetchedCards];
    } catch (error) {
      console.error('Error bulk fetching cards:', error);
      throw error;
    }
  }

  /**
   * Get a single token by ID (cached)
   */
  async getToken(tokenId: number): Promise<TokenData> {
    // Check cache first
    if (this.tokenCache.has(tokenId)) {
      return this.tokenCache.get(tokenId)!;
    }

    // Check if already fetching
    if (this.pendingTokenFetches.has(tokenId)) {
      return this.pendingTokenFetches.get(tokenId)!;
    }

    // Fetch from API
    const fetchPromise = api.get(`/tokens/${tokenId}/`)
      .then(response => {
        const token = response.data as TokenData;
        this.tokenCache.set(tokenId, token);
        this.pendingTokenFetches.delete(tokenId);
        return token;
      })
      .catch(error => {
        this.pendingTokenFetches.delete(tokenId);
        throw error;
      });

    this.pendingTokenFetches.set(tokenId, fetchPromise);
    return fetchPromise;
  }

  /**
   * Get multiple tokens by IDs in bulk (cached)
   */
  async getTokens(tokenIds: number[]): Promise<TokenData[]> {
    if (!tokenIds || tokenIds.length === 0) {
      return [];
    }

    // Separate cached from uncached
    const cached: TokenData[] = [];
    const needFetch: number[] = [];

    tokenIds.forEach(id => {
      if (this.tokenCache.has(id)) {
        cached.push(this.tokenCache.get(id)!);
      } else {
        needFetch.push(id);
      }
    });

    // If all cached, return immediately
    if (needFetch.length === 0) {
      return cached;
    }

    // Fetch missing tokens in bulk
    try {
      const response = await api.post('/tokens/bulk_fetch/', {
        token_ids: needFetch
      });

      const fetchedTokens = response.data as TokenData[];

      // Cache the fetched tokens
      fetchedTokens.forEach(token => {
        this.tokenCache.set(token.id, token);
      });

      // Return all tokens
      return [...cached, ...fetchedTokens];
    } catch (error) {
      console.error('Error bulk fetching tokens:', error);
      throw error;
    }
  }

  /**
   * Prefetch cards for a puzzle (call this when loading a puzzle)
   */
  async prefetchForPuzzle(cardIds: number[], tokenIds: number[] = []): Promise<[CardData[], TokenData[]]> {
    const promises: [Promise<CardData[]>, Promise<TokenData[]>] = [
      Promise.resolve([]),
      Promise.resolve([])
    ];

    if (cardIds && cardIds.length > 0) {
      promises[0] = this.getCards(cardIds);
    }

    if (tokenIds && tokenIds.length > 0) {
      promises[1] = this.getTokens(tokenIds);
    }

    return Promise.all(promises);
  }

  /**
   * Clear the cache (useful for testing or when data changes)
   */
  clearCache(): void {
    this.cardCache.clear();
    this.tokenCache.clear();
    this.pendingCardFetches.clear();
    this.pendingTokenFetches.clear();
  }

  /**
   * Get cache statistics (for debugging)
   */
  getCacheStats(): CacheStats {
    return {
      cardsCached: this.cardCache.size,
      tokensCached: this.tokenCache.size,
      pendingCardFetches: this.pendingCardFetches.size,
      pendingTokenFetches: this.pendingTokenFetches.size,
    };
  }
}

// Export singleton instance
const cardService = new CardService();
export default cardService;
