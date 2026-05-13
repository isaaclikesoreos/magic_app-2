import { createContext, useContext, useRef, useCallback, ReactNode, FC } from 'react';

interface ImageCacheContextValue {
  preloadImage: (url: string) => Promise<string | null>;
  preloadImages: (urls: string[]) => Promise<(string | null)[]>;
  isImageCached: (url: string) => boolean;
  getCacheStats: () => { cachedCount: number; loadingCount: number };
}

const ImageCacheContext = createContext<ImageCacheContextValue | null>(null);

export const useImageCache = () => {
  const context = useContext(ImageCacheContext);
  if (!context) {
    throw new Error('useImageCache must be used within ImageCacheProvider');
  }
  return context;
};

interface ImageCacheProviderProps {
  children: ReactNode;
}

export const ImageCacheProvider: FC<ImageCacheProviderProps> = ({ children }) => {
  // Use refs to store cache state without causing re-renders
  const imageCache = useRef(new Map<string, string>());
  const loadingPromises = useRef(new Map<string, Promise<string | null>>());

  // Preload a single image and cache it
  const preloadImage = useCallback((url: string): Promise<string | null> => {
    if (!url) return Promise.resolve(null);

    // Already cached
    if (imageCache.current.has(url)) {
      return Promise.resolve(imageCache.current.get(url)!);
    }

    // Already loading
    if (loadingPromises.current.has(url)) {
      return loadingPromises.current.get(url)!;
    }

    // Start loading
    const promise = new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        imageCache.current.set(url, url);
        loadingPromises.current.delete(url);
        resolve(url);
      };
      img.onerror = () => {
        loadingPromises.current.delete(url);
        resolve(null);
      };
      img.src = url;
    });

    loadingPromises.current.set(url, promise);
    return promise;
  }, []);

  // Preload multiple images (for pack cards)
  const preloadImages = useCallback((urls: string[]) => {
    return Promise.all(urls.filter(Boolean).map(preloadImage));
  }, [preloadImage]);

  // Check if an image is cached
  const isImageCached = useCallback((url: string): boolean => {
    return imageCache.current.has(url);
  }, []);

  // Get cache statistics
  const getCacheStats = useCallback(() => {
    return {
      cachedCount: imageCache.current.size,
      loadingCount: loadingPromises.current.size,
    };
  }, []);

  return (
    <ImageCacheContext.Provider value={{
      preloadImage,
      preloadImages,
      isImageCached,
      getCacheStats
    }}>
      {children}
    </ImageCacheContext.Provider>
  );
};
