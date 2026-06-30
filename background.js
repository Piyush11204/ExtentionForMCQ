chrome.runtime.onInstalled.addListener(() => {
  console.log("Study Helper extension installed.");
});

// Gemini integration helper
// NOTE: Set this to the correct Generative Language API endpoint / model you want to use.
// Example: 'https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText'
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText';

function getStoredApiKey() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['GEMINI_API_KEY'], (res) => {
        resolve(res && res.GEMINI_API_KEY ? res.GEMINI_API_KEY : null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

async function callGemini(promptText) {
  const apiKey = await getStoredApiKey();
  if (!apiKey) throw new Error('No GEMINI API key configured. Add it in the popup.');

  const url = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
  const body = {
    // This body shape works for many Google Generative Language endpoints; adapt if your endpoint expects a different shape.
    prompt: { text: promptText },
    temperature: 0.2,
    max_output_tokens: 512
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} ${resp.statusText} - ${txt}`);
  }

  const data = await resp.json();

  // Try to extract text from common response shapes
  if (data.candidates && data.candidates.length > 0) {
    return data.candidates[0].content || data.candidates[0].output || data.candidates[0];
  }
  if (data.output && data.output.length > 0 && data.output[0].content) {
    // content may be an array of {text: '...'}
    const content = data.output[0].content;
    if (Array.isArray(content)) {
      return content.map(c => c.text || c).join('\n');
    }
    return content.text || content;
  }

  return JSON.stringify(data);
}

// Message bridge: handle calls from popup or other extension parts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return;

  if (message.action === 'callGemini') {
    callGemini(message.prompt)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    // indicate we'll respond asynchronously
    return true;
  }

  if (message.action === 'saveGeminiKey') {
    const key = message.key || null;
    chrome.storage.local.set({ GEMINI_API_KEY: key }, () => sendResponse({ success: true }));
    return true;
  }

});
