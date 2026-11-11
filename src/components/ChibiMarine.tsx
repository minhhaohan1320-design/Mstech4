import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { ref, onValue, set } from 'firebase/database';

const CHIBI_POSITIONS = {
  bloodAngel: { x: '0%', y: '0%' },
  ultramarine: { x: '100%', y: '0%' },
  imperialFist: { x: '0%', y: '50%' },
  whiteScar: { x: '100%', y: '50%' },
  salamander: { x: '0%', y: '100%' },
  ironHand: { x: '100%', y: '100%' },
} as const;

const CHAPTER_THEMES: Record<
  keyof typeof CHIBI_POSITIONS,
  { primary: string; secondary: string; visor: string; trim: string; bg: string; border: string }
> = {
  imperialFist: {
    primary: '#EAB308',
    secondary: '#CA8A04',
    visor: '#EF4444',
    trim: '#1F2937',
    bg: 'bg-yellow-50',
    border: 'border-yellow-300',
  },
  salamander: {
    primary: '#10B981',
    secondary: '#059669',
    visor: '#F59E0B',
    trim: '#FBBF24',
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
  },
  ultramarine: {
    primary: '#2563EB',
    secondary: '#1D4ED8',
    visor: '#EF4444',
    trim: '#FBBF24',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
  },
  ironHand: {
    primary: '#374151',
    secondary: '#1F2937',
    visor: '#EF4444',
    trim: '#9CA3AF',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
  },
  whiteScar: {
    primary: '#F9FAFB',
    secondary: '#E5E7EB',
    visor: '#10B981',
    trim: '#EF4444',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
  bloodAngel: {
    primary: '#DC2626',
    secondary: '#B91C1C',
    visor: '#10B981',
    trim: '#FBBF24',
    bg: 'bg-red-50',
    border: 'border-red-300',
  },
};

export type ChibiChapter = keyof typeof CHIBI_POSITIONS;

interface Props {
  chapter: ChibiChapter;
  className?: string;
  bgColor?: string;
  borderColor?: string;
}

export const ChibiMarine: React.FC<Props> = ({
  chapter,
  className = '',
  bgColor,
  borderColor,
}) => {
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);
  const theme = CHAPTER_THEMES[chapter] || CHAPTER_THEMES.ultramarine;
  const resolvedBg = bgColor && bgColor !== 'bg-white' ? bgColor : theme.bg;
  const resolvedBorder =
    borderColor && borderColor !== 'border-transparent' ? borderColor : theme.border;

  useEffect(() => {
    try {
      const localSprite = localStorage.getItem('chibiSprite');
      if (localSprite) {
        setSpriteUrl(localSprite);
      }
    } catch (e) {
      console.warn('localStorage error', e);
    }

    const spriteRef = ref(db, '/UI/chibiSprite');
    const unsubscribe = onValue(spriteRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        setSpriteUrl(val);
        try {
          localStorage.setItem('chibiSprite', val);
        } catch {
          // ignore storage quota errors
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = event.target?.result as string;
        try {
          localStorage.setItem('chibiSprite', result);
        } catch {
          // ignore storage quota errors
        }
        setSpriteUrl(result);

        try {
          await set(ref(db, '/UI/chibiSprite'), result);
        } catch (error) {
          console.error('Failed to sync sprite to Firebase:', error);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (!spriteUrl) {
    return (
      <div
        className={`w-full h-full ${resolvedBg} flex flex-col items-center justify-center text-center p-1.5 rounded-full border-2 ${resolvedBorder} relative cursor-pointer hover:scale-105 transition-transform shadow-sm ${className}`}
        title={`Warhammer 40k Chibi ${chapter} (Bấm để đổi ảnh Sprite)`}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm" aria-hidden="true">
          {/* Pauldrons / Vai giáp Space Marine */}
          <ellipse cx="22" cy="74" rx="18" ry="15" fill={theme.primary} stroke={theme.trim} strokeWidth="3" />
          <ellipse cx="78" cy="74" rx="18" ry="15" fill={theme.primary} stroke={theme.trim} strokeWidth="3" />
          {/* Chestplate / Giáp ngực Aquila */}
          <path d="M28 65 L72 65 L66 92 L34 92 Z" fill={theme.secondary} stroke={theme.trim} strokeWidth="2.5" />
          <path d="M38 74 L50 80 L62 74 L58 83 L42 83 Z" fill={theme.trim} />
          {/* Chibi Helmet / Mũ giáp */}
          <rect x="24" y="20" width="52" height="48" rx="22" fill={theme.primary} stroke="#1F2937" strokeWidth="3" />
          {/* Helmet Crest */}
          <rect x="44" y="14" width="12" height="14" rx="4" fill={theme.trim} stroke="#1F2937" strokeWidth="2" />
          {/* Glowing Visor Lenses */}
          <polygon points="30,42 46,45 45,51 29,48" fill={theme.visor} />
          <polygon points="70,42 54,45 55,51 71,48" fill={theme.visor} />
          {/* Faceplate Vox Grill */}
          <path d="M36 56 L50 50 L64 56 L59 66 L41 66 Z" fill={theme.secondary} stroke="#1F2937" strokeWidth="2" />
          <line x1="45" y1="56" x2="45" y2="63" stroke="#1F2937" strokeWidth="2" />
          <line x1="50" y1="54" x2="50" y2="63" stroke="#1F2937" strokeWidth="2" />
          <line x1="55" y1="56" x2="55" y2="63" stroke="#1F2937" strokeWidth="2" />
        </svg>
        <input
          type="file"
          accept="image/*"
          aria-label={`Tải ảnh Chibi ${chapter}`}
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={handleUpload}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden w-full h-full rounded-full border-2 ${resolvedBorder} ${resolvedBg} shadow-sm ${className}`}
      title={`Warhammer 40k Chibi ${chapter}`}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${spriteUrl})`,
          backgroundSize: '200% 300%',
          backgroundPosition: `${CHIBI_POSITIONS[chapter].x} ${CHIBI_POSITIONS[chapter].y}`,
          backgroundRepeat: 'no-repeat',
        }}
      />
    </div>
  );
};
