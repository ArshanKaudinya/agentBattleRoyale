const { LLM_TIMEOUT } = require('../game/constants');

const providers = {
  gpt: require('./openai'),
  claude: require('./anthropic'),
  haiku: require('./anthropic-haiku'),
  mini: require('./openai-mini')
};

function stripCodeBlock(raw) {
  // Remove ```json ... ``` or ``` ... ``` wrappers
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return codeBlockMatch ? codeBlockMatch[1].trim() : raw.trim();
}

function extractOuterJson(text) {
  // Find the outermost balanced { ... } in the text
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.substring(start, i + 1);
    }
  }
  return null;
}

function parseAction(raw) {
  // Step 1: Strip markdown code blocks
  const cleaned = stripCodeBlock(raw);

  // Step 2: Try direct parse
  try {
    const parsed = JSON.parse(cleaned);
    if (isValidAction(parsed)) return parsed;
  } catch (e) {
    // Continue to extraction
  }

  // Step 3: Extract outermost balanced JSON object
  const jsonStr = extractOuterJson(cleaned);
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (isValidAction(parsed)) return parsed;
    } catch (e) {
      // Fall through
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
  const cleaned = stripCodeBlock(raw);

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.archetype) return parsed;
  } catch (e) {
    // Try extraction
  }

  const jsonStr = extractOuterJson(cleaned);
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
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
      console.warn(`[${agentId}] Could not parse response:`, raw.substring(0, 500));
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
