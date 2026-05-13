import { useState, useEffect, memo, FC, CSSProperties } from 'react';
import { useImageCache } from '../context/ImageCacheContext';
import { Card } from '@/types';

interface CardImage {
  image_url?: string;
}

interface CardWithImages {
  name: string;
  images?: CardImage[];
}

// Get card image URL helper
export function getCardImageUrl(card: Card | CardWithImages): string {
  // Check if card has images array (legacy format)
  if ('images' in card && card.images && card.images.length > 0) {
    const normalImage = card.images.find(img => img.image_url?.includes('normal'));
    return normalImage?.image_url || card.images[0]?.image_url || '';
  }

  // Check if card has image_url (current format)
  if ('image_url' in card && card.image_url) {
    return card.image_url;
  }

  // Fallback to Scryfall API
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image`;
}

interface CachedCardImageProps {
  card: Card | CardWithImages;
  className?: string;
  style?: CSSProperties;
  alt?: string;
  onLoad?: () => void;
  onError?: (e: any) => void;
  showPlaceholder?: boolean;
}

// Memoized card image component with caching
const CachedCardImage: FC<CachedCardImageProps> = memo(({
  card,
  className = '',
  style = {},
  alt,
  onLoad,
  onError,
  showPlaceholder = true,
}) => {
  const [loaded, setLoaded] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const { preloadImage, isImageCached } = useImageCache();

  const imageUrl = getCardImageUrl(card);
  const isPreCached = isImageCached(imageUrl);

  useEffect(() => {
    // Preload the image when component mounts
    if (!isPreCached) {
      preloadImage(imageUrl);
    }
  }, [imageUrl, isPreCached, preloadImage]);

  const handleLoad = () => {
    setLoaded(true);
    onLoad?.();
  };

  const handleError = (e: any) => {
    setError(true);
    onError?.(e);
  };

  if (error) {
    return (
      <div
        className={`bg-gray-700 flex items-center justify-center text-gray-400 text-xs text-center p-2 ${className}`}
        style={style}
      >
        {card.name}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={style}>
      {/* Placeholder while loading */}
      {showPlaceholder && !loaded && !isPreCached && (
        <div className="absolute inset-0 bg-gray-700 animate-pulse rounded flex items-center justify-center">
          <span className="text-gray-500 text-xs">{card.name?.substring(0, 15)}...</span>
        </div>
      )}

      {/* Actual image */}
      <img
        src={imageUrl}
        alt={alt || card.name}
        className={`w-full h-full object-cover transition-opacity duration-200 ${
          loaded || isPreCached ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
});

CachedCardImage.displayName = 'CachedCardImage';

export default CachedCardImage;
