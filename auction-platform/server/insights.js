const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function activitySignal(auction, bids) {
  const now = Date.now();
  const recentBids = bids.filter((bid) => now - new Date(bid.createdAt).getTime() <= 60 * 60_000).length;
  const previousHourBids = bids.filter((bid) => {
    const age = now - new Date(bid.createdAt).getTime();
    return age > 60 * 60_000 && age <= 120 * 60_000;
  }).length;
  const hoursRemaining = Math.max(0, (new Date(auction.endsAt).getTime() - now) / 3_600_000);
  const score = clamp(28 + recentBids * 17 - previousHourBids * 7 + Math.min(22, bids.length * 2), 8, 96);
  const momentum = score >= 70 ? 'Hot' : score >= 46 ? 'Building' : 'Steady';
  const direction = recentBids > previousHourBids ? 'up' : recentBids < previousHourBids ? 'cooling' : 'steady';
  const bidLabel = `${recentBids} ${recentBids === 1 ? 'bid' : 'bids'} in the last hour`;

  let summary;
  if (recentBids > previousHourBids && recentBids >= 2) {
    summary = `Bidding activity is picking up: ${bidLabel}, compared with ${previousHourBids} in the hour before.`;
  } else if (recentBids > 0) {
    summary = `${bidLabel}. The pace is ${direction === 'cooling' ? 'cooler than the previous hour' : 'holding fairly steady'}.`;
  } else {
    summary = `No bids have landed in the last hour. This lot has received ${bids.length} bids in total.`;
  }

  const closeNote = hoursRemaining < 2
    ? 'This lot closes soon; allow time for a final bid and any confirmation step.'
    : hoursRemaining < 12
      ? 'The closing window is approaching. Watch the timer rather than relying on the current pace.'
      : 'There is time remaining. Set a personal spending limit before you place a bid.';

  return {
    score,
    momentum,
    direction,
    recentBids,
    previousHourBids,
    totalBids: bids.length,
    hoursRemaining: Number(hoursRemaining.toFixed(1)),
    summary,
    watchFor: closeNote,
    confidence: bids.length >= 8 ? 'moderate' : 'limited',
    provider: 'Local activity model',
    disclaimer: 'This signal describes bidding activity only. It is not an appraisal, price prediction, or financial advice.',
  };
}

async function writeAiExplanation(auction, signal) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return signal;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(7000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.25,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You explain auction activity in concise, neutral language. Do not estimate an item’s fair value, predict a winning price, or tell the user what amount to bid. Return JSON with two string fields: summary and watchFor. Keep each under 180 characters. Mention that the signal is based on activity, not valuation.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              title: auction.title,
              category: auction.category,
              currentPrice: auction.currentPrice,
              totalBids: signal.totalBids,
              bidsLastHour: signal.recentBids,
              bidsPreviousHour: signal.previousHourBids,
              hoursRemaining: signal.hoursRemaining,
              activityLevel: signal.momentum,
            }),
          },
        ],
      }),
    });
    if (!response.ok) return signal;
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return signal;
    const parsed = JSON.parse(content);
    return {
      ...signal,
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 220) : signal.summary,
      watchFor: typeof parsed.watchFor === 'string' ? parsed.watchFor.slice(0, 220) : signal.watchFor,
      provider: `AI-assisted · ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`,
    };
  } catch {
    // A local, explainable signal remains available when an AI provider is down.
    return signal;
  }
}

export async function getAuctionInsights(auction, bids) {
  const signal = activitySignal(auction, bids);
  return writeAiExplanation(auction, signal);
}
