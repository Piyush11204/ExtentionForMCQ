chrome.runtime.onInstalled.addListener(() => {
  console.log("Study Helper extension installed.");
});

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'meta/llama-3.1-70b-instruct';

function getStoredApiKey() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['NVIDIA_API_KEY'], (res) => {
        resolve(res && res.NVIDIA_API_KEY ? res.NVIDIA_API_KEY : null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

async function callNvidia(promptText) {
  const apiKey = await getStoredApiKey();
  if (!apiKey) throw new Error('No NVIDIA API key configured. Add it in the popup.');

  const resp = await fetch(NVIDIA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        {
          role: 'user',
          content: promptText
        }
      ],
      temperature: 0,
      max_tokens: 512,
      stream: false
    })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`NVIDIA API error: ${resp.status} ${resp.statusText} - ${txt}`);
  }

  const data = await resp.json();

  if (Array.isArray(data.choices) && data.choices[0] && data.choices[0].message) {
    const content = data.choices[0].message.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
  }

  return JSON.stringify(data);
}

// Message bridge: handle calls from popup or other extension parts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return;

  if (message.action === 'callNvidia') {
    callNvidia(message.prompt)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    // indicate we'll respond asynchronously
    return true;
  }

  if (message.action === 'saveNvidiaKey') {
    const key = message.key ? message.key.trim() : null;
    if (!key) {
      chrome.storage.local.remove('NVIDIA_API_KEY', () => {
        sendResponse({ success: !chrome.runtime.lastError, error: chrome.runtime.lastError && chrome.runtime.lastError.message });
      });
      return true;
    }

    chrome.storage.local.set({ NVIDIA_API_KEY: key }, () => {
      sendResponse({ success: !chrome.runtime.lastError, error: chrome.runtime.lastError && chrome.runtime.lastError.message });
    });
    return true;
  }

});
