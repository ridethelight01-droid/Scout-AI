const fetch = require('node-fetch');
const { anthropicKey, anthropicModel } = require('../config/env');

async function askClaude(prompt) {
  if (!anthropicKey) {
    const error = new Error('ANTHROPIC_KEY manquante');
    error.statusCode = 500;
    throw error;
  }

  // Support both legacy string prompts and the new { system, user } split
  // used for Anthropic prompt caching (system block is reused across requests).
  let systemContent;
  let userContent;

  if (prompt && typeof prompt === 'object' && prompt.system && prompt.user) {
    systemContent = [
      {
        type: 'text',
        text: prompt.system,
        cache_control: { type: 'ephemeral' }
      }
    ];
    userContent = prompt.user;
  } else {
    systemContent = undefined;
    userContent = String(prompt);
  }

  const body = {
    model: anthropicModel,
    max_tokens: 1200,
    messages: [{ role: 'user', content: userContent }]
  };

  if (systemContent) {
    body.system = systemContent;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    const error = new Error(data.error ? data.error.message : 'Erreur Anthropic');
    error.statusCode = response.status || 500;
    throw error;
  }

  let text = '';
  if (data.content) {
    data.content.forEach(function(block) {
      if (block.type === 'text') text += block.text;
    });
  }
  return text || 'Aucune réponse.';
}

module.exports = { askClaude };
