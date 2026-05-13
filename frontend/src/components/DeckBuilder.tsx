import { useState, useCallback, useEffect, FC, DragEvent } from 'react';
import { useImageCache } from '../context/ImageCacheContext';
import { getCardImageUrl } from './CachedCardImage';
import { Card } from '@/types';

type ColumnType = '0' | '1' | '2' | '3' | '4' | '5' | '6+' | 'lands' | 'sideboard';

interface DeckCard extends Card {
  id: number;
  column?: ColumnType;
}

// Get mana cost value from card
function getManaCostValue(manaCost?: string): number {
  if (!manaCost) return 0;

  let total = 0;
  const genericMatch = manaCost.match(/\{(\d+)\}/g);
  if (genericMatch) {
    genericMatch.forEach(m => {
      total += parseInt(m.replace(/[{}]/g, ''), 10);
    });
  }
  const coloredSymbols = manaCost.match(/\{[WUBRGC]\}/gi);
  if (coloredSymbols) {
    total += coloredSymbols.length;
  }
  const hybridSymbols = manaCost.match(/\{[WUBRG]\/[WUBRGP]\}/gi);
  if (hybridSymbols) {
    total += hybridSymbols.length;
  }
  return total;
}

// Check if card is a land
function isLand(card: DeckCard): boolean {
  return (card.type_line || '').toLowerCase().includes('land');
}

// Get the default column for a card based on its mana cost
export function getDefaultColumn(card: DeckCard): ColumnType {
  if (isLand(card)) return 'lands';
  const cmc = getManaCostValue(card.mana_cost);
  if (cmc === 0) return '0';
  if (cmc === 1) return '1';
  if (cmc === 2) return '2';
  if (cmc === 3) return '3';
  if (cmc === 4) return '4';
  if (cmc === 5) return '5';
  return '6+';
}

const COLUMNS: ColumnType[] = ['0', '1', '2', '3', '4', '5', '6+', 'lands'];
const COLUMN_LABELS: Record<string, string> = {
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6+': '6+',
  'lands': 'Lands'
};

interface DeckBuilderProps {
  cards: DeckCard[];
  onCardColumnChange?: (cardId: number, column: ColumnType) => void;
  onPickCard?: (cardData: any, column: ColumnType) => void;
  expanded?: boolean;
  onHoverCard?: (card: DeckCard) => void;
  onLeaveCard?: () => void;
}

interface HoveredCard {
  id: number;
  column: ColumnType;
}

const DeckBuilder: FC<DeckBuilderProps> = ({
  cards,
  onCardColumnChange,
  onPickCard,
  expanded = false,
  onHoverCard,
  onLeaveCard
}) => {
  const [draggedCard, setDraggedCard] = useState<DeckCard | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnType | null>(null);
  const [hoveredCardInColumn, setHoveredCardInColumn] = useState<HoveredCard | null>(null);
  const { preloadImages } = useImageCache();

  // Preload images for all cards in deck
  useEffect(() => {
    if (cards.length > 0) {
      const imageUrls = cards.map(card => getCardImageUrl(card));
      preloadImages(imageUrls);
    }
  }, [cards, preloadImages]);

  // Organize cards by column
  const cardsByColumn: Record<ColumnType, DeckCard[]> = {
    '0': [],
    '1': [],
    '2': [],
    '3': [],
    '4': [],
    '5': [],
    '6+': [],
    'lands': [],
    'sideboard': []
  };

  cards.forEach(card => {
    const column = card.column || getDefaultColumn(card);
    if (cardsByColumn[column]) {
      cardsByColumn[column].push(card);
    }
  });

  // Count main deck cards (not sideboard)
  const mainDeckCount = cards.filter(c => c.column !== 'sideboard').length;
  const sideboardCount = cardsByColumn['sideboard'].length;

  // Drag handlers
  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, card: DeckCard) => {
    setDraggedCard(card);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(card.id));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedCard(null);
    setDragOverColumn(null);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, column: ColumnType) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(column);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>, column: ColumnType) => {
    e.preventDefault();

    // Check if this is a card being dragged from the pack
    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const cardData = JSON.parse(jsonData);
        if (cardData.fromPack && onPickCard) {
          onPickCard(cardData, column);
          setDragOverColumn(null);
          return;
        }
      } catch (err) {
        // Not valid JSON, continue with normal handling
      }
    }

    // Normal drag between columns
    if (draggedCard && onCardColumnChange) {
      onCardColumnChange(draggedCard.id, column);
    }
    setDraggedCard(null);
    setDragOverColumn(null);
  }, [draggedCard, onCardColumnChange, onPickCard]);

  return (
    <div className={`bg-gray-900 border-t border-gray-700 flex-1 min-h-0 flex flex-col overflow-hidden`}>
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-bold text-white">Deck ({mainDeckCount})</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 font-medium">Sideboard ({sideboardCount})</span>
        </div>
      </div>

      {/* Columns Container */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Main Deck Columns */}
        <div className="flex-1 flex gap-2 p-2 min-h-0">
          {COLUMNS.map(column => (
            <div
              key={column}
              className={`flex flex-col rounded min-h-0 flex-1 min-w-[100px] ${
                dragOverColumn === column ? 'bg-green-900/30 ring-2 ring-green-500' : 'bg-gray-800/50'
              }`}
              onDragOver={(e) => handleDragOver(e, column)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column)}
            >
              {/* Column Header */}
              <div className="flex justify-between items-center px-2 py-1 border-b border-gray-700">
                <span className="text-xs font-bold text-gray-300">{COLUMN_LABELS[column]}</span>
                <span className="text-xs text-gray-500">{cardsByColumn[column].length}</span>
              </div>

              {/* Cards - Draftmancer style stacked images */}
              <div className={`flex-1 overflow-y-auto p-1 min-h-0`}>
                {/* Each card shows 22px (title bar), calculate total height needed */}
                <div
                  className="relative"
                  style={{
                    // Height = (n-1) * 22px for stacked cards + full height for last card
                    // Approximate card aspect ratio is 1:1.4, so height ≈ width * 1.4
                    height: cardsByColumn[column].length > 0
                      ? `calc(${(cardsByColumn[column].length - 1) * 22}px + 140%)`
                      : '0'
                  }}
                >
                  {cardsByColumn[column].map((card, index) => {
                    const isLastCard = index === cardsByColumn[column].length - 1;
                    const isHovered = hoveredCardInColumn?.id === card.id && hoveredCardInColumn?.column === column;

                    return (
                      <div
                        key={`${card.id}-${index}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card)}
                        onDragEnd={handleDragEnd}
                        onMouseEnter={() => {
                          setHoveredCardInColumn({ id: card.id, column });
                          onHoverCard && onHoverCard(card);
                        }}
                        onMouseLeave={() => {
                          setHoveredCardInColumn(null);
                          onLeaveCard && onLeaveCard();
                        }}
                        className={`absolute left-0 right-0 cursor-grab active:cursor-grabbing transition-all duration-150 ${
                          draggedCard?.id === card.id ? 'opacity-50' : ''
                        } ${isHovered && !isLastCard ? 'z-50' : ''}`}
                        style={{
                          // Stack cards with 22px visible for each (title bar height)
                          top: `${index * 22}px`,
                          zIndex: isHovered ? 100 : index,
                        }}
                      >
                        <img
                          src={getCardImageUrl(card)}
                          alt={card.name}
                          className={`w-full rounded shadow-sm transition-all ${
                            isHovered ? 'ring-2 ring-purple-500 shadow-lg' : ''
                          }`}
                          loading="lazy"
                        />
                        {/* Hover overlay to show full card */}
                        {isHovered && !isLastCard && (
                          <div className="absolute left-full ml-2 top-0 z-[100] pointer-events-none">
                            <img
                              src={getCardImageUrl(card)}
                              alt={card.name}
                              className="w-40 rounded-lg shadow-2xl border-2 border-purple-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sideboard */}
        <div
          className={`${expanded ? 'w-[220px]' : 'w-[180px]'} flex flex-col border-l border-gray-700 min-h-0 ${
            dragOverColumn === 'sideboard' ? 'bg-purple-900/30 ring-2 ring-purple-500' : 'bg-gray-800/30'
          }`}
          onDragOver={(e) => handleDragOver(e, 'sideboard')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'sideboard')}
        >
          <div className="flex justify-between items-center px-2 py-1 border-b border-gray-700 bg-gray-800 flex-shrink-0">
            <span className="text-xs font-bold text-gray-300">Sideboard</span>
            <span className="text-xs text-gray-500">{sideboardCount}</span>
          </div>
          <div className={`flex-1 overflow-y-auto p-1 min-h-0`}>
            <div
              className="relative"
              style={{
                height: cardsByColumn['sideboard'].length > 0
                  ? `calc(${(cardsByColumn['sideboard'].length - 1) * 22}px + 140%)`
                  : '0'
              }}
            >
              {cardsByColumn['sideboard'].map((card, index) => {
                const isLastCard = index === cardsByColumn['sideboard'].length - 1;
                const isHovered = hoveredCardInColumn?.id === card.id && hoveredCardInColumn?.column === 'sideboard';

                return (
                  <div
                    key={`${card.id}-sb-${index}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card)}
                    onDragEnd={handleDragEnd}
                    onMouseEnter={() => {
                      setHoveredCardInColumn({ id: card.id, column: 'sideboard' });
                      onHoverCard && onHoverCard(card);
                    }}
                    onMouseLeave={() => {
                      setHoveredCardInColumn(null);
                      onLeaveCard && onLeaveCard();
                    }}
                    className={`absolute left-0 right-0 cursor-grab active:cursor-grabbing transition-all duration-150 ${
                      draggedCard?.id === card.id ? 'opacity-50' : ''
                    } ${isHovered && !isLastCard ? 'z-50' : ''}`}
                    style={{
                      top: `${index * 22}px`,
                      zIndex: isHovered ? 100 : index,
                    }}
                  >
                    <img
                      src={getCardImageUrl(card)}
                      alt={card.name}
                      className={`w-full rounded shadow-sm transition-all ${
                        isHovered ? 'ring-2 ring-purple-500 shadow-lg' : ''
                      }`}
                      loading="lazy"
                    />
                    {/* Hover overlay - show to the left for sideboard */}
                    {isHovered && !isLastCard && (
                      <div className="absolute right-full mr-2 top-0 z-[100] pointer-events-none">
                        <img
                          src={getCardImageUrl(card)}
                          alt={card.name}
                          className="w-40 rounded-lg shadow-2xl border-2 border-purple-500"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeckBuilder;
