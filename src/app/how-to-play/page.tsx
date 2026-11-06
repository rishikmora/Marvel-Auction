'use client';

import Link from 'next/link';
import { DEFAULT_SCORING, GAME_MODES } from '@/game/config';
import { SYNERGY_RULES } from '@/game/data/synergy-rules';
import { ROLE_PILLARS } from '@/game/scoring';
import { STAT_KEYS, STAT_LABELS } from '@/game/types';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';

/** One rule section: title, a muted meta line, then plain prose. */
function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/8 py-7">
      <h2 className="display text-lg text-cream">{title}</h2>
      {meta ? <p className="mt-1 text-sm text-muted">{meta}</p> : null}
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-subtle">{children}</div>
    </section>
  );
}

export default function HowToPlayPage() {
  const pct = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[640px] px-5 pb-4 pt-10 sm:pt-14">
        <h1 className="display text-4xl text-cream sm:text-5xl">How to play</h1>
        <p className="mt-3 text-base leading-relaxed text-subtle">
          A live auction for superheroes. Everyone gets the same credits, and the strongest team
          wins — not the biggest spender. Nothing about the scoring is hidden; this page is the
          whole formula.
        </p>
        <Link
          href="/create"
          className="mt-4 inline-block text-sm font-semibold text-accent hover:underline"
        >
          Start a game
        </Link>

        <Section title="The round" meta="2 to 10 players">
          <p>
            The host reveals a character and opens the floor. Anyone with budget and a free roster
            slot can bid; every bid must beat the current one by the minimum increment. When the
            clock runs out the highest bid wins, credits come off that player&rsquo;s balance and
            the character joins their roster for good. A lot nobody bids on is passed and leaves
            the board. The auction ends when the host calls it, when the vault empties, or when
            every roster is full.
          </p>
          <p>
            Everything is checked on the server — budget, roster space, increments and timing — so
            a tampered client cannot buy what it cannot afford or bid after the bell.
          </p>
        </Section>

        <Section title="Your budget" meta="1000 credits, 7 slots by default">
          <p>
            Seven slots and a fixed balance means every purchase is a trade-off. Buying a
            900-power legend for a third of your budget leaves six slots on scraps. By default the
            game also holds back enough credits to fill your remaining slots at the cheapest price
            still on the board, so you cannot strand yourself with empty slots and no money — the
            host can switch that off.
          </p>
        </Section>

        <Section title="How your score is calculated">
          <p className="rounded-card border border-white/10 bg-panel px-4 py-3 text-center font-semibold text-cream">
            Character Power + Synergy + Team Balance + Leadership − Penalties
          </p>
          <p>
            <strong className="text-cream">Character power</strong> is a weighted sum of nine
            stats, each 0–100, scaled ×{DEFAULT_SCORING.powerScale}. The default weights are{' '}
            {STAT_KEYS.map(
              (key, index) =>
                `${STAT_LABELS[key]} ${pct(DEFAULT_SCORING.weights[key])}${
                  index === STAT_KEYS.length - 1 ? '' : ', '
                }`,
            )}
            . A strong character lands around 800–950, so a full roster is roughly 6,000.
          </p>
          <p>
            <strong className="text-cream">Synergy</strong> rewards rosters that make sense
            together — {SYNERGY_RULES.length} rules in all, like{' '}
            {SYNERGY_RULES.slice(0, 4)
              .map((rule) => rule.name)
              .join(', ')}
            . It is capped at {pct(DEFAULT_SCORING.maxSynergyPct)} of your raw character power, so
            no combination of bonuses can ever outweigh the characters you actually bought.
          </p>
          <p>
            <strong className="text-cream">Team balance</strong> is capped at{' '}
            {pct(DEFAULT_SCORING.maxBalancePct)} and measures how many role pillars you cover:{' '}
            {ROLE_PILLARS.map((pillar) => pillar.label).join(', ')}. Seven damage dealers is not a
            team, and stacking more than {DEFAULT_SCORING.redundancyThreshold} of the same role
            costs you a penalty.
          </p>
          <p>
            <strong className="text-cream">Leadership</strong> is capped at{' '}
            {pct(DEFAULT_SCORING.maxLeadershipPct)}, driven mostly by your best commander and
            partly by the roster average. One genuine leader is worth more than seven soloists.
          </p>
          <p>
            Every player can open &ldquo;how was this calculated?&rdquo; on any team and see each
            term with the exact numbers behind it.
          </p>
        </Section>

        <Section title="The clock" meta="30 seconds a lot by default">
          <p>
            The timer turns amber in the last ten seconds and red in the last five. A bid inside
            the final five seconds pushes the clock back out by five, so a lot cannot be stolen on
            the bell — the host sets both numbers, or turns anti-snipe off entirely in Hardcore.
            Hosts can also pause, add time, sell early or pass a lot, and can require a manual
            confirmation instead of an automatic sale.
          </p>
        </Section>

        <Section title="Ways to play" meta={`${GAME_MODES.length} modes`}>
          <ul className="space-y-2">
            {GAME_MODES.map((mode) => (
              <li key={mode.id}>
                <strong className="text-cream">{mode.name}</strong>{' '}
                <span className="text-muted">— {mode.tagline}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="If two teams tie">
          <p>
            Ties break in a fixed order: higher synergy score, then higher average character
            power, then higher remaining budget, then the strongest single character. If nothing
            separates them a shared victory is declared, and the results screen names whichever
            rule decided it.
          </p>
        </Section>

        <Section title="Dropped connection">
          <p>
            Your roster and credits are held on the server, so a lost connection costs you nothing
            but time. Reopen the room and you are back where you were, with the live lot, the
            current bid and the leaderboard restored. Hosts choose whether a reconnecting player
            can keep bidding, and can remove someone who has gone for good — their characters
            return to the pool.
          </p>
        </Section>

        <Section title="Afterwards">
          <p>
            The results screen reveals the rankings from the bottom up, then the champion, then
            the full comparison and the standout purchases. From there you can run an exhibition
            battle between the top two rosters, or open the War Room for the analytics, the
            lot-by-lot history and a scrubable replay rebuilt from every bid.
          </p>
        </Section>

        <div className="flex flex-wrap gap-3 border-t border-white/8 pt-7">
          <Link
            href="/create"
            className="no-tap-highlight rounded-xl bg-accent px-6 py-3 text-sm font-bold text-ink transition-colors hover:bg-accent-soft"
          >
            Host an auction
          </Link>
          <Link
            href="/join"
            className="no-tap-highlight rounded-xl border border-white/15 px-6 py-3 text-sm font-bold text-cream transition-colors hover:bg-white/[0.06]"
          >
            Join a room
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
