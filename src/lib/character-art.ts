import type { Character } from '@/game/types';
import { hashString, mulberry32 } from '@/game/rng';

/**
 * The image layer.
 *
 * Character.imageUrl always wins, and CHARACTER_IMAGE_BASE lets a deployment point the
 * whole roster at a CDN without touching the dataset. When neither is set we generate a
 * deterministic vector portrait locally: no external requests, no broken images, no
 * licensing question, and it still looks like a premium trading card.
 */
const REMOTE_BASE = process.env.NEXT_PUBLIC_CHARACTER_IMAGE_BASE ?? '';

export function characterImage(character: Character): string {
  if (character.imageUrl) return character.imageUrl;
  if (REMOTE_BASE) return `${REMOTE_BASE.replace(/\/$/, '')}/${character.id}.jpg`;
  return generatedPortrait(character);
}

export function hasRemoteArt(character: Character): boolean {
  return Boolean(character.imageUrl || REMOTE_BASE);
}

/** Deterministic per-character vector art, returned as an inline data URI. */
export function generatedPortrait(character: Character): string {
  return `data:image/svg+xml,${encodeURIComponent(portraitSvg(character))}`;
}

export function portraitSvg(character: Character, width = 320, height = 420): string {
  const [primary, secondary] = character.palette;
  const random = mulberry32(hashString(character.id));
  const uid = character.id.replace(/[^a-z0-9]/g, '');

  // Angular "energy shards" behind the emblem — placement is seeded, so a character's
  // portrait is identical on every client and across reloads.
  const shards: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const w = 30 + random() * 90;
    const h = 4 + random() * 12;
    const rotate = -40 + random() * 80;
    const opacity = (0.06 + random() * 0.16).toFixed(3);
    shards.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(
        1,
      )}" fill="#fff" opacity="${opacity}" transform="rotate(${rotate.toFixed(1)} ${x.toFixed(
        1,
      )} ${y.toFixed(1)})" rx="2"/>`,
    );
  }

  const rays: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const angle = (360 / 5) * i + random() * 30;
    rays.push(
      `<rect x="${width / 2 - 1}" y="0" width="2" height="${height}" fill="url(#ray${uid})" opacity="0.5" transform="rotate(${angle.toFixed(
        1,
      )} ${width / 2} ${height * 0.42})"/>`,
    );
  }

  const glyph = escapeXml(character.glyph || character.name.slice(0, 2).toUpperCase());
  const name = escapeXml(character.name.toUpperCase());

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(
    character.name,
  )} portrait">
<defs>
<linearGradient id="bg${uid}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${primary}" stop-opacity="0.85"/>
<stop offset="55%" stop-color="${secondary}" stop-opacity="0.45"/>
<stop offset="100%" stop-color="#05060a" stop-opacity="0.95"/>
</linearGradient>
<radialGradient id="core${uid}" cx="50%" cy="42%" r="52%">
<stop offset="0%" stop-color="#ffffff" stop-opacity="0.42"/>
<stop offset="60%" stop-color="${primary}" stop-opacity="0.18"/>
<stop offset="100%" stop-color="#000000" stop-opacity="0"/>
</radialGradient>
<linearGradient id="ray${uid}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
<stop offset="50%" stop-color="${secondary}" stop-opacity="0.7"/>
<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="fade${uid}" x1="0" y1="0" x2="0" y2="1">
<stop offset="55%" stop-color="#05060a" stop-opacity="0"/>
<stop offset="100%" stop-color="#05060a" stop-opacity="0.92"/>
</linearGradient>
</defs>
<rect width="${width}" height="${height}" fill="#080a10"/>
<rect width="${width}" height="${height}" fill="url(#bg${uid})"/>
<g>${rays.join('')}</g>
<rect width="${width}" height="${height}" fill="url(#core${uid})"/>
<g>${shards.join('')}</g>
<circle cx="${width / 2}" cy="${height * 0.42}" r="${Math.min(width, height) * 0.26}" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="1.5"/>
<circle cx="${width / 2}" cy="${height * 0.42}" r="${Math.min(width, height) * 0.32}" fill="none" stroke="${secondary}" stroke-opacity="0.4" stroke-width="1"/>
<text x="${width / 2}" y="${height * 0.42}" text-anchor="middle" dominant-baseline="central" font-family="Arial Black, Impact, sans-serif" font-size="${Math.min(width, height) * 0.3}" fill="#ffffff" fill-opacity="0.92" letter-spacing="-2">${glyph}</text>
<rect width="${width}" height="${height}" fill="url(#fade${uid})"/>
<text x="${width / 2}" y="${height - 26}" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="17" fill="#ffffff" fill-opacity="0.9" letter-spacing="1">${name}</text>
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Palette for player emblems. Colour carries most of the recognition at avatar size —
 * shape alone made every option look identical in the picker.
 */
const AVATAR_COLORS = [
  '#e01b3c',
  '#f5c451',
  '#3fd0ff',
  '#7b6bff',
  '#54e08a',
  '#ff7d92',
  '#c98b2e',
  '#2f6fe0',
  '#ffffff',
  '#b81230',
  '#54c8e0',
  '#a06bff',
];

/** Small emblem used for player avatars — same idea, far simpler geometry. */
export function avatarSvg(seed: string, color?: string): string {
  const tint = color ?? AVATAR_COLORS[hashString(seed) % AVATAR_COLORS.length];
  return emblemSvg(seed, tint);
}

function emblemSvg(seed: string, color: string): string {
  const random = mulberry32(hashString(seed));
  const uid = seed.replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'a';
  const points: string[] = [];
  const sides = 5 + Math.floor(random() * 3);
  for (let i = 0; i < sides; i += 1) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    const radius = 26 + random() * 10;
    points.push(`${(32 + Math.cos(angle) * radius).toFixed(1)},${(32 + Math.sin(angle) * radius).toFixed(1)}`);
  }
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><linearGradient id="g${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#11141c"/></linearGradient></defs><rect width="64" height="64" fill="#0a0c12"/><polygon points="${points.join(
      ' ',
    )}" fill="url(#g${uid})" stroke="#ffffff" stroke-opacity="0.25"/></svg>`,
  )}`;
}
