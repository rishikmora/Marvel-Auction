import type { Rarity, Role, Tier, Universe } from '@/game/types';

export function credits(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function clock(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function timeAgo(at: number, now = Date.now()): string {
  const delta = Math.max(0, now - at);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function timestamp(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export const UNIVERSE_NAME: Record<Universe, string> = {
  AVENGERS: 'Avengers',
  X_MEN: 'X-Men',
  FANTASTIC_FOUR: 'Fantastic Four',
  GUARDIANS: 'Guardians',
  SPIDER_VERSE: 'Spider-Verse',
  COSMIC: 'Cosmic',
  VILLAINS: 'Villains',
  STREET: 'Street Level',
  MYSTIC: 'Mystic',
};

export const ROLE_NAME: Record<Role, string> = {
  TANK: 'Tank',
  DAMAGE: 'Damage',
  SUPPORT: 'Support',
  LEADER: 'Leader',
  STRATEGIST: 'Strategist',
  SPEEDSTER: 'Speedster',
  RANGED: 'Ranged',
  MAGICAL: 'Magical',
  COSMIC: 'Cosmic',
  TECH: 'Tech',
  MUTANT: 'Mutant',
  ASSASSIN: 'Assassin',
};

export const RARITY_STYLE: Record<Rarity, { label: string; text: string; ring: string; glow: string }> = {
  COMMON: {
    label: 'Common',
    text: 'text-slate-300',
    ring: 'ring-white/12',
    glow: 'shadow-none',
  },
  RARE: {
    label: 'Rare',
    text: 'text-sky',
    ring: 'ring-sky/40',
    glow: 'shadow-[0_0_24px_-8px_rgba(91,200,232,.6)]',
  },
  EPIC: {
    label: 'Epic',
    text: 'text-violet',
    ring: 'ring-violet/45',
    glow: 'shadow-[0_0_26px_-8px_rgba(169,139,255,.7)]',
  },
  LEGENDARY: {
    label: 'Legendary',
    text: 'text-gold',
    ring: 'ring-gold/50',
    glow: 'shadow-[0_0_30px_-8px_rgba(242,193,78,.75)]',
  },
  MYTHIC: {
    label: 'Mythic',
    text: 'text-accent-soft',
    ring: 'ring-accent/60',
    glow: 'shadow-[0_0_34px_-6px_rgba(255,77,141,.85)]',
  },
};

export const TIER_NAME: Record<Tier, string> = {
  STREET: 'Street',
  ENHANCED: 'Enhanced',
  ELITE: 'Elite',
  COSMIC: 'Cosmic',
  OMEGA: 'Omega',
};

export function ordinal(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th';
  return `${rank}${suffix}`;
}

export function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
