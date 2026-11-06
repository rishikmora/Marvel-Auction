import Anthropic from '@anthropic-ai/sdk';
import type { AuctionAnalytics } from '@/game/analytics';
import { judgeAuction, type JudgeVerdict } from '@/game/judge';
import type { Character, RankedTeam } from '@/game/types';

/**
 * The Claude-backed Judge.
 *
 * The local engine in game/judge.ts always runs first: it does the measuring and produces
 * a complete, deterministic verdict. When an API key is available Claude is asked to
 * re-argue that same evidence in its own words — it may reach a different winner, which
 * is the point of a second opinion.
 *
 * Every failure path falls back to the local verdict, so the feature degrades to "works
 * without a key" rather than to an error.
 */

const MODEL = 'claude-opus-5-5';

/** Credentials resolve from ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant` profile. */
export function aiJudgeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** The compact, structured picture of the auction that the model reasons over. */
function buildBrief(
  rankings: RankedTeam[],
  characters: Map<string, Character>,
  analytics: AuctionAnalytics,
) {
  return {
    teams: rankings.map((team) => {
      const analytic = analytics.players.find((entry) => entry.playerId === team.playerId);
      return {
        playerId: team.playerId,
        teamName: team.player.teamName,
        officialRank: team.rank,
        officialScore: team.total,
        breakdown: {
          characterPower: team.characterPower,
          synergy: team.synergyBonus,
          balance: team.balanceBonus,
          leadership: team.leadershipBonus,
          penalty: team.penalty,
        },
        creditsSpent: analytic?.spent ?? 0,
        creditsLeft: analytic?.remaining ?? 0,
        powerPerCredit: analytic?.powerPerCredit ?? 0,
        rolesMissing: team.balance.rolesMissing,
        synergiesMatched: team.synergies.map((hit) => hit.name),
        roster: team.characters
          .map((entry) => {
            const character = characters.get(entry.characterId);
            if (!character) return null;
            const purchase = analytics.purchases.find(
              (row) => row.characterId === entry.characterId,
            );
            return {
              name: character.name,
              power: entry.power,
              paid: purchase?.price ?? 0,
              basePrice: character.basePrice,
              roles: character.roles,
              tags: character.synergyTags.slice(0, 5),
            };
          })
          .filter(Boolean),
      };
    }),
    auction: {
      lotsSold: analytics.soldLots,
      lotsPassed: analytics.passedLots,
      averagePrice: analytics.averagePrice,
      mostContested: analytics.mostContested?.characterName ?? null,
      bestValue: analytics.bestValue?.characterName ?? null,
      largestOverpay: analytics.largestOverpay?.characterName ?? null,
    },
  };
}

const SYSTEM_PROMPT = `You are the Judge for a fantasy superhero auction game.

The game already has an official winner, decided by a published formula: character power
plus capped bonuses for synergy, team balance and leadership. That result is transparent
and is shown to players separately.

Your job is a second opinion on the same rosters. Weigh what the formula deliberately
ignores:
- depth: is the strength spread, or is one carry holding it up?
- value: power bought per credit — shrewd buying is a real skill
- star power: does anyone on the roster win a fight by themselves?
- identity: does the roster read as one team, or seven strangers?

You may disagree with the official result, and you should when the evidence supports it.
When the power gap is wide, don't contrive a disagreement.

Write like a sharp, fair pundit: concrete, specific to these rosters, naming actual
characters and numbers from the brief. No hedging, no filler, no restating the brief back.
Each reasoning line is one sentence. Never invent a character, price or statistic that is
not in the brief.`;

const VERDICT_SCHEMA = {
  type: 'object' as const,
  properties: {
    winnerPlayerId: {
      type: 'string' as const,
      description: 'playerId of the team you crown. Must match a playerId from the brief.',
    },
    confidence: {
      type: 'number' as const,
      description: '0 to 1. Low when the call was genuinely close.',
    },
    headline: {
      type: 'string' as const,
      description: 'Under 60 characters. The verdict in one line.',
    },
    reasoning: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: '3 to 5 sentences making the case, strongest first.',
    },
    teamNotes: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          playerId: { type: 'string' as const },
          strengths: { type: 'array' as const, items: { type: 'string' as const } },
          weaknesses: { type: 'array' as const, items: { type: 'string' as const } },
        },
        required: ['playerId', 'strengths', 'weaknesses'],
        additionalProperties: false,
      },
    },
  },
  required: ['winnerPlayerId', 'confidence', 'headline', 'reasoning', 'teamNotes'],
  additionalProperties: false,
};

interface ModelVerdict {
  winnerPlayerId: string;
  confidence: number;
  headline: string;
  reasoning: string[];
  teamNotes: { playerId: string; strengths: string[]; weaknesses: string[] }[];
}

export interface AiJudgeResult {
  verdict: JudgeVerdict;
  /** Why the local engine was used, when it was. */
  fallbackReason: string | null;
}

export async function runAiJudge(input: {
  rankings: RankedTeam[];
  characters: Map<string, Character>;
  analytics: AuctionAnalytics;
  seed: string;
}): Promise<AiJudgeResult> {
  // The local verdict is both the zero-config path and the fallback.
  const local = judgeAuction(input);

  if (!aiJudgeConfigured()) {
    return { verdict: local, fallbackReason: 'No API key configured — using the local Judge.' };
  }
  if (input.rankings.length < 2) {
    return { verdict: local, fallbackReason: 'Only one roster to weigh.' };
  }

  const brief = buildBrief(input.rankings, input.characters, input.analytics);
  const validIds = new Set(input.rankings.map((team) => team.playerId));

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      // Opus 5.5 thinks by default; medium is ample for weighing a handful of rosters.
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: VERDICT_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: `Here is the finished auction. Deliver your verdict.\n\n${JSON.stringify(
            brief,
            null,
            2,
          )}`,
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return { verdict: local, fallbackReason: 'The model declined this request.' };
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    if (!text.trim()) {
      return { verdict: local, fallbackReason: 'The model returned no verdict.' };
    }

    const parsed = JSON.parse(text) as ModelVerdict;

    // Never trust the model with the identity of the winner: it must name a real team.
    if (!parsed.winnerPlayerId || !validIds.has(parsed.winnerPlayerId)) {
      return { verdict: local, fallbackReason: 'The model named a team that is not in this game.' };
    }

    const winner = input.rankings.find((team) => team.playerId === parsed.winnerPlayerId)!;
    const official = input.rankings.find((team) => team.rank === 1) ?? input.rankings[0];
    const disagrees = official.playerId !== winner.playerId;

    // Keep the local engine's measured criteria and scores — those are evidence, not prose —
    // and layer the model's argument and per-team notes on top.
    const teams = local.teams.map((note) => {
      const fromModel = parsed.teamNotes?.find((entry) => entry.playerId === note.playerId);
      return {
        ...note,
        strengths: fromModel?.strengths?.length ? fromModel.strengths : note.strengths,
        weaknesses: fromModel?.weaknesses?.length ? fromModel.weaknesses : note.weaknesses,
      };
    });

    return {
      verdict: {
        ...local,
        winnerPlayerId: winner.playerId,
        winnerTeamName: winner.player.teamName,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || local.confidence)),
        headline: parsed.headline?.slice(0, 80) || local.headline,
        reasoning: Array.isArray(parsed.reasoning) && parsed.reasoning.length
          ? parsed.reasoning.slice(0, 6).map((line) => String(line))
          : local.reasoning,
        teams,
        dissent: disagrees
          ? `The Judge picks ${winner.player.teamName}; the power score crowns ${official.player.teamName}.`
          : null,
        source: 'claude',
        model: MODEL,
      },
      fallbackReason: null,
    };
  } catch (error) {
    // Typed, most-specific-first: a bad key and a rate limit are different problems.
    let reason = 'The Judge could not be reached — using the local verdict.';
    if (error instanceof Anthropic.AuthenticationError) {
      reason = 'The configured API key was rejected.';
    } else if (error instanceof Anthropic.RateLimitError) {
      reason = 'Rate limited — try again shortly.';
    } else if (error instanceof Anthropic.BadRequestError) {
      reason = `The verdict request was rejected: ${error.message}`;
    } else if (error instanceof Anthropic.APIConnectionError) {
      reason = 'Could not reach the API.';
    } else if (error instanceof SyntaxError) {
      reason = 'The model returned malformed JSON.';
    }
    console.error('[ai-judge]', error);
    return { verdict: local, fallbackReason: reason };
  }
}
