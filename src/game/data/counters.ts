import type { CounterRelationship } from '../types';

/**
 * Matchup relationships used *only* by Battle Simulation mode.
 *
 * These deliberately do not feed the auction score: the auction winner is decided by
 * the transparent team-power formula, while counters add texture to the exhibition
 * battle afterwards. Rows are matched tag-to-tag so new characters inherit matchups
 * for free simply by carrying the right synergy tags.
 */
export const COUNTER_RELATIONSHIPS: CounterRelationship[] = [
  {
    id: 'magic-beats-bruiser',
    sourceTag: 'magic',
    targetTag: 'bruiser',
    advantageMultiplier: 1.18,
    reason: 'Raw physical power struggles against opponents who refuse to be where the punch lands.',
  },
  {
    id: 'magic-beats-symbiote',
    sourceTag: 'magic',
    targetTag: 'symbiote',
    advantageMultiplier: 1.16,
    reason: 'Symbiotes recoil from sonic and mystic disruption.',
  },
  {
    id: 'speed-beats-bruiser',
    sourceTag: 'speedster',
    targetTag: 'bruiser',
    advantageMultiplier: 1.2,
    reason: 'Heavy hitters cannot connect with a target moving several times faster.',
  },
  {
    id: 'speed-beats-armor',
    sourceTag: 'speedster',
    targetTag: 'armor',
    advantageMultiplier: 1.12,
    reason: 'Armoured platforms have poor tracking against hypersonic movement.',
  },
  {
    id: 'telepath-beats-berserker',
    sourceTag: 'telepath',
    targetTag: 'berserker',
    advantageMultiplier: 1.24,
    reason: 'An undisciplined mind is trivial to enter and redirect.',
  },
  {
    id: 'telepath-beats-martial',
    sourceTag: 'telepath',
    targetTag: 'martial-artist',
    advantageMultiplier: 1.14,
    reason: 'Trained combat reflexes are useless when the next move is read in advance.',
  },
  {
    id: 'tech-beats-magic-ward',
    sourceTag: 'tech',
    targetTag: 'magic',
    advantageMultiplier: 1.08,
    reason: 'Sensor suites and countermeasure fields disrupt spellcasting rhythms.',
  },
  {
    id: 'energy-beats-armor',
    sourceTag: 'energy-projector',
    targetTag: 'armor',
    advantageMultiplier: 1.15,
    reason: 'Sustained energy output cooks armour plating from the outside in.',
  },
  {
    id: 'power-absorber-beats-energy',
    sourceTag: 'power-absorber',
    targetTag: 'energy-projector',
    advantageMultiplier: 1.28,
    reason: 'Absorption turns the enemy artillery into a supply line.',
  },
  {
    id: 'armor-beats-ranged',
    sourceTag: 'armor',
    targetTag: 'ranged',
    advantageMultiplier: 1.16,
    reason: 'Conventional projectiles are wasted on plated targets.',
  },
  {
    id: 'regenerator-beats-assassin',
    sourceTag: 'regenerator',
    targetTag: 'assassin',
    advantageMultiplier: 1.22,
    reason: 'A precision kill is meaningless against something that reassembles itself.',
  },
  {
    id: 'assassin-beats-strategist',
    sourceTag: 'assassin',
    targetTag: 'strategist',
    advantageMultiplier: 1.2,
    reason: 'Remove the planner and the plan collapses with them.',
  },
  {
    id: 'stealth-beats-precog',
    sourceTag: 'stealth',
    targetTag: 'precog',
    advantageMultiplier: 1.15,
    reason: 'Danger-sense needs something to detect; true camouflage gives it nothing.',
  },
  {
    id: 'symbiote-beats-spider',
    sourceTag: 'symbiote',
    targetTag: 'spider',
    advantageMultiplier: 1.26,
    reason: 'Symbiotes are the one attacker a spider-sense will not register.',
  },
  {
    id: 'hunter-beats-agility',
    sourceTag: 'hunter',
    targetTag: 'agility',
    advantageMultiplier: 1.14,
    reason: 'A hunter studies the movement pattern before the fight begins.',
  },
  {
    id: 'mimic-beats-martial',
    sourceTag: 'mimic',
    targetTag: 'martial-artist',
    advantageMultiplier: 1.22,
    reason: 'Copied reflexes neutralise a trained style within a single exchange.',
  },
  {
    id: 'cosmic-beats-street',
    sourceTag: 'cosmic',
    targetTag: 'street',
    advantageMultiplier: 1.3,
    reason: 'Ground-level operators have no answer to planetary-scale output.',
  },
  {
    id: 'street-beats-strategist',
    sourceTag: 'tactician',
    targetTag: 'chaos',
    advantageMultiplier: 1.12,
    reason: 'Disciplined command absorbs chaotic aggression and redirects it.',
  },
  {
    id: 'blade-beats-immortal',
    sourceTag: 'blade',
    targetTag: 'immortal',
    advantageMultiplier: 1.18,
    reason: 'Enchanted edges are one of the few things that make immortality negotiable.',
  },
  {
    id: 'reality-warper-beats-all',
    sourceTag: 'reality-warper',
    targetTag: 'tech',
    advantageMultiplier: 1.25,
    reason: 'Engineering assumes stable physics. That assumption is the vulnerability.',
  },
  {
    id: 'unstoppable-beats-anchor',
    sourceTag: 'unstoppable',
    targetTag: 'anchor',
    advantageMultiplier: 1.2,
    reason: 'A wall only works against something that can be stopped.',
  },
  {
    id: 'illusionist-beats-tactician',
    sourceTag: 'illusionist',
    targetTag: 'tactician',
    advantageMultiplier: 1.19,
    reason: 'A commander acting on false intelligence loses before contact.',
  },
];
