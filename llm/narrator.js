const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function getNarration(roundSummary, gameState) {
  const prompt = buildNarrationPrompt(roundSummary, gameState);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a dramatic sports commentator for an AI battle royale. Your commentary is energetic, witty, and entertaining. You make bold predictions, celebrate great plays, and roast poor decisions. Keep responses to really short to 2 sentences max.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.9
  });

  return response.choices[0].message.content.trim();
}

function buildNarrationPrompt(roundSummary, gameState) {
  const turn = gameState.meta.turn;
  const aliveAgents = Object.values(gameState.agents).filter(a => a.is_alive);
  const zone = gameState.meta.zone;

  let prompt = `TURN ${turn} COMMENTARY

=== CURRENT STANDINGS ===
`;

  for (const agent of aliveAgents) {
    const healthPct = Math.round((agent.health / agent.max_health) * 100);
    prompt += `- ${agent.id.toUpperCase()}: ${agent.health}/${agent.max_health} HP (${healthPct}%) - ${agent.archetype}\n`;
  }

  prompt += `\nZone radius: ${zone.radius} | Shrinking to ${zone.radius - 1} at turn ${zone.next_shrink_turn}\n\n`;

  prompt += `=== THIS ROUND ===\n${roundSummary}\n\n`;

  prompt += `Provide dramatic, entertaining commentary on this round. Be bold, make judgments, celebrate wins, roast failures. 2-3 sentences max.`;

  return prompt;
}

module.exports = { getNarration };
