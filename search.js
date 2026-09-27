// search.js
import fetch from 'node-fetch';
import { loadPersona, buildPersonaBlock } from './persona.js';

const GREETING_REGEX = /^(hi|hai|halo|hello|hey|pagi|siang|sore|malam|assalamualaikum)[\s!.,?]*$/i;

export function isGreeting(message) {
  return GREETING_REGEX.test((message || '').trim());
}

export async function webSearch(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GuritaGPT-Web/1.0' }
    });
    const data = await res.json();

    const results = [];

    if (data.AbstractText) {
      results.push({
        source: data.AbstractSource || 'DuckDuckGo',
        text: data.AbstractText,
        url: data.AbstractURL || '',
      });
    }

    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text) {
          results.push({
            source: 'Related',
            text: topic.Text,
            url: topic.FirstURL || '',
          });
        }
      }
    }

    return results;
  } catch (err) {
    console.error('[search] error:', err.message);
    return [];
  }
}

export function buildSearchEnhancedPrompt(userMessage, searchResults, examples = []) {
  const persona = loadPersona();
  let prompt = buildPersonaBlock(persona, 'user');

  for (const ex of examples.slice(0, 3)) {
    prompt += `User: ${ex.user}\nAssistant: ${ex.assistant}\n\n`;
  }

  if (searchResults.length > 0) {
    prompt += 'Konteks terbaru dari internet:\n';
    for (const r of searchResults) {
      prompt += `- ${r.text} (${r.source})\n`;
    }
    prompt += '\n';
  }

  prompt += `User: ${userMessage}\nAssistant:`;
  return prompt;
}

export function buildConversationPrompt(history, searchResults, examples, mode = 'user') {
  const persona = loadPersona();
  let prompt = buildPersonaBlock(persona, mode);

  for (const ex of examples.slice(0, 2)) {
    prompt += `User: ${ex.user}\nAssistant: ${ex.assistant}\n\n`;
  }

  if (searchResults.length > 0) {
    prompt += 'Konteks terbaru dari internet:\n';
    for (const r of searchResults) {
      prompt += `- ${r.text} (${r.source})\n`;
    }
    prompt += '\n';
  }

  for (const m of history) {
    if (m.role === 'user') prompt += `User: ${m.content}\n`;
    else if (m.role === 'assistant') prompt += `Assistant: ${m.content}\n`;
  }

  prompt += 'Assistant:';
  return prompt;
}