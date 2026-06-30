chrome.runtime.onInstalled.addListener(() => {
  console.log("Study Helper extension installed.");
});

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 512
    }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} ${resp.statusText} - ${txt}`);
  }

  const data = await resp.json();

  if (data.candidates && data.candidates.length > 0) {
    const parts = data.candidates[0].content && data.candidates[0].content.parts;
    if (Array.isArray(parts)) {
      return parts.map(part => part.text || '').filter(Boolean).join('\n');
    }
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
    const key = message.key ? message.key.trim() : null;
    if (!key) {
      chrome.storage.local.remove('GEMINI_API_KEY', () => {
        sendResponse({ success: !chrome.runtime.lastError, error: chrome.runtime.lastError && chrome.runtime.lastError.message });
      });
      return true;
    }

    chrome.storage.local.set({ GEMINI_API_KEY: key }, () => {
      sendResponse({ success: !chrome.runtime.lastError, error: chrome.runtime.lastError && chrome.runtime.lastError.message });
    });
    return true;
  }

});
