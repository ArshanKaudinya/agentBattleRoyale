const { GoogleGenerativeAI } = require('@google/generative-ai');

let client = null;
let model = null;

function getModel() {
  if (!model) {
    client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return model;
}

async function getAction(prompt) {
  const result = await getModel().generateContent(prompt);
  const response = await result.response;
  return response.text();
}

module.exports = getAction;
