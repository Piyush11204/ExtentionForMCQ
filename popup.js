const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

document.getElementById("searchBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: getHighlightedText
  }, (results) => {
    const highlightedText = results[0].result;
    if (highlightedText) {
      const { question, options } = parseQuestionAndOptions(highlightedText);
      if (question && options.length > 0) {
        findCorrectAnswer(question, options);
      } else {
        showResult("Unable to parse question and options. Please highlight them properly.");
      }
    } else {
      showResult("Please highlight the question and options first.");
    }
  });
});
  
  function getHighlightedText() {
    return window.getSelection().toString();
  }
  
  function parseQuestionAndOptions(text) {
    const lines = text.split("\n").filter(line => line.trim() !== "");
    const question = lines[0].trim();
    const options = lines.slice(1).map(option => option.replace(/^\s*[A-Da-d][).]\s*/, "").trim());
    return { question, options };
  }
  
  async function findCorrectAnswer(question, options) {
  showLoader();

  try {
    const prompt = `Pick the correct answer for this multiple-choice question. Reply with only the option letter and answer text. Do not explain unless absolutely necessary.\n\nQuestion: ${question}\nOptions:\n${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}\n\nAnswer:`;

    const answer = await callGemini(prompt);
    showResult(answer);
  } catch (error) {
    console.error("Error calling Gemini:", error);
    showResult(`Error: ${error.message}`);
  }
  }
  
  function showLoader() {
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = '<div class="loader"></div>';
  }
  
  function showResult(message) {
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = message;
  }

function getStoredApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['GEMINI_API_KEY'], (res) => {
      resolve(res && res.GEMINI_API_KEY ? res.GEMINI_API_KEY : null);
    });
  });
}

async function callGemini(promptText) {
  const apiKey = await getStoredApiKey();
  if (!apiKey) throw new Error('No Gemini API key saved.');

  const resp = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: promptText }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 128
      }
    })
  });

  if (!resp.ok) {
    const message = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} ${message}`);
  }

  const data = await resp.json();
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;

  if (Array.isArray(parts)) {
    const text = parts.map(part => part.text || '').filter(Boolean).join('\n').trim();
    if (text) return text;
  }

  throw new Error('Gemini did not return an answer.');
}

function saveApiKey(value) {
  return new Promise((resolve) => {
    const key = value ? value.trim() : '';

    if (!key) {
      chrome.storage.local.remove('GEMINI_API_KEY', () => {
        resolve({ success: !chrome.runtime.lastError, error: chrome.runtime.lastError && chrome.runtime.lastError.message });
      });
      return;
    }

    chrome.storage.local.set({ GEMINI_API_KEY: key }, () => {
      resolve({ success: !chrome.runtime.lastError, error: chrome.runtime.lastError && chrome.runtime.lastError.message });
    });
  });
}

document.getElementById('saveKeyBtn').addEventListener('click', async () => {
  const val = document.getElementById('apiKeyInput').value || '';
  const res = await saveApiKey(val);

  if (res.success) {
    showResult(val.trim() ? 'API key saved.' : 'API key removed.');
  } else {
    showResult(`Failed to save API key${res.error ? `: ${res.error}` : '.'}`);
  }
});

// Load stored key into input when popup opens
document.addEventListener('DOMContentLoaded', () => {
  try {
    chrome.storage.local.get(['GEMINI_API_KEY'], (res) => {
      if (res && res.GEMINI_API_KEY) document.getElementById('apiKeyInput').value = res.GEMINI_API_KEY;
    });
  } catch (e) {
    // ignore
  }
});
