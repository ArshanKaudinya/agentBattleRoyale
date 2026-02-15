const OpenAI = require('openai');

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

async function getAction(prompt) {
  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
    temperature: 0.7
  });
  return response.choices[0].message.content;
}

module.exports = getAction;
