const { LLM_TIMEOUT } = require('../game/constants');

const providers = {
  gpt: require('./openai'),
  claude: require('./anthropic'),
  gemini: require('./google'),
  mini: require('./openai-mini')
};

function parseAction(raw) {
  // Try direct parse
  try {
    const parsed = JSON.parse(raw);
    if (isValidAction(parsed)) return parsed;
  } catch (e) {
    // Continue to regex extraction
  }

  // Try extracting JSON from markdown code blocks or text
  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (isValidAction(parsed)) return parsed;
    } catch (e) {
      // Fall through
    }
  }

  // Try more aggressive extraction (find the last complete JSON object)
  const allMatches = raw.match(/\{[^{}]*\}/g);
  if (allMatches) {
    for (const match of allMatches) {
      try {
        const parsed = JSON.parse(match);
        if (isValidAction(parsed)) return parsed;
      } catch (e) {
        continue;
      }
    }
  }

  return null;
}

function isValidAction(parsed) {
  if (!parsed || !parsed.action) return false;
  const validActions = ['move', 'attack', 'defend', 'use_charm'];
  if (!validActions.includes(parsed.action)) return false;

  // Validate params for specific actions
  if (parsed.action === 'move') {
    if (!parsed.params || !parsed.params.direction) return false;
    const validDirs = ['north', 'south', 'east', 'west'];
    if (!validDirs.includes(parsed.params.direction)) return false;
  }

  if (parsed.action === 'attack') {
    if (!parsed.params || !parsed.params.target_id) return false;
  }

  return true;
}

function parseArchetypeChoice(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.archetype) return parsed;
  } catch (e) {
    // Try extraction
  }

  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.archetype) return parsed;
    } catch (e) {
      // Fall through
    }
  }

  // Last resort: look for archetype name in text
  const archetypes = ['berserker', 'tank', 'scout', 'mage'];
  const lower = raw.toLowerCase();
  for (const arch of archetypes) {
    if (lower.includes(arch)) {
      return { archetype: arch, reasoning: 'Extracted from text' };
    }
  }

  return null;
}

async function callWithTimeout(providerFn, prompt, timeoutMs) {
  return Promise.race([
    providerFn(prompt),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('LLM timeout')), timeoutMs)
    )
  ]);
}

async function getAgentAction(agentId, prompt) {
  const providerFn = providers[agentId];
  if (!providerFn) {
    console.error(`No provider for agent: ${agentId}`);
    return {
      agentId,
      raw: null,
      parsed: { action: 'defend', reasoning: 'No provider available' },
      responseTime: 0,
      timedOut: false,
      error: true
    };
  }

  const startTime = Date.now();

  try {
    const raw = await callWithTimeout(providerFn, prompt, LLM_TIMEOUT);
    const responseTime = Date.now() - startTime;
    const parsed = parseAction(raw);

    if (!parsed) {
      console.warn(`[${agentId}] Could not parse response:`, raw.substring(0, 200));
      return {
        agentId,
        raw,
        parsed: { action: 'defend', reasoning: 'Failed to parse response' },
        responseTime,
        timedOut: false,
        error: true
      };
    }

    return {
      agentId,
      raw,
      parsed,
      responseTime,
      timedOut: false,
      error: false
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`[${agentId}] LLM error:`, error.message);
    return {
      agentId,
      raw: null,
      parsed: { action: 'defend', reasoning: `Error: ${error.message}` },
      responseTime,
      timedOut: error.message === 'LLM timeout',
      error: true
    };
  }
}

async function getAllActions(aliveAgents, buildPromptFn, gameState) {
  const promises = aliveAgents.map(agent => {
    const prompt = buildPromptFn(agent, gameState);
    return getAgentAction(agent.id, prompt);
  });

  const results = await Promise.allSettled(promises);

  const actions = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .sort((a, b) => a.responseTime - b.responseTime);

  return actions;
}

async function getArchetypeChoices(agents, buildPromptFn) {
  const promises = agents.map(async (agent) => {
    const prompt = buildPromptFn(agent.id, agent.name);
    const providerFn = providers[agent.id];

    const startTime = Date.now();
    try {
      const raw = await callWithTimeout(providerFn, prompt, LLM_TIMEOUT);
      const responseTime = Date.now() - startTime;
      const parsed = parseArchetypeChoice(raw);

      return {
        agentId: agent.id,
        raw,
        parsed,
        responseTime,
        error: !parsed
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`[${agent.id}] Archetype selection error:`, error.message);
      return {
        agentId: agent.id,
        raw: null,
        parsed: null,
        responseTime,
        error: true
      };
    }
  });

  return Promise.all(promises);
}

module.exports = { getAllActions, getArchetypeChoices, parseAction, parseArchetypeChoice };
