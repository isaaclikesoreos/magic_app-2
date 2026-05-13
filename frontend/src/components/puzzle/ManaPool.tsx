import { FC } from 'react';
import { ManaPool as ManaPoolType } from '@/types';

interface ColorInfo {
  bg: string;
  text: string;
  label: string;
}

const MANA_COLORS: Record<string, ColorInfo> = {
  W: { bg: 'bg-yellow-100', text: 'text-yellow-900', label: 'White' },
  U: { bg: 'bg-blue-500', text: 'text-white', label: 'Blue' },
  B: { bg: 'bg-gray-900', text: 'text-white', label: 'Black' },
  R: { bg: 'bg-red-600', text: 'text-white', label: 'Red' },
  G: { bg: 'bg-green-600', text: 'text-white', label: 'Green' },
  C: { bg: 'bg-gray-400', text: 'text-gray-900', label: 'Colorless' },
};

interface ManaPoolProps {
  mana?: Partial<ManaPoolType>;
}

const ManaPool: FC<ManaPoolProps> = ({ mana = {} }) => {
  const manaEntries = Object.entries(mana).filter(([_, amount]) => (amount || 0) > 0);

  if (manaEntries.length === 0) {
    return (
      <div className="flex items-center gap-1 text-gray-500 text-sm">
        <span>No mana available</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {manaEntries.map(([color, amount]) => {
        const colorInfo = MANA_COLORS[color] || MANA_COLORS.C;
        return (
          <div
            key={color}
            className={`w-7 h-7 rounded-full ${colorInfo.bg} ${colorInfo.text} flex items-center justify-center font-bold text-sm border border-gray-600`}
            title={`${amount} ${colorInfo.label} mana`}
          >
            {amount}
          </div>
        );
      })}
    </div>
  );
};

export default ManaPool;
