const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'meta/llama-3.1-70b-instruct';

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
    const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
    const firstOptionIndex = lines.findIndex(line => isOptionLine(line));

    if (firstOptionIndex > 0) {
      const question = lines.slice(0, firstOptionIndex).join(" ");
      const options = parseOptions(lines.slice(firstOptionIndex));
      return { question, options };
    }

    const question = lines[0] || "";
    const options = parseOptions(lines.slice(1));
    return { question, options };
  }

  function isOptionLine(line) {
    return /^\s*(?:[A-Ha-h][).:-]|\d+[).:-])\s+/.test(line);
  }

  function cleanOptionLine(option) {
    return option.replace(/^\s*(?:[A-Ha-h][).:-]|\d+[).:-])\s*/, "").trim();
  }

  function parseOptions(lines) {
    const options = [];

    lines.forEach((line) => {
      if (isOptionLine(line) || options.length === 0) {
        options.push(cleanOptionLine(line));
      } else {
        options[options.length - 1] = `${options[options.length - 1]} ${line}`.trim();
      }
    });

    return options.filter(Boolean);
  }
  
  async function findCorrectAnswer(question, options) {
  showLoader();

  try {
    const prompt = buildOdooFunctionalPrompt(question, options);

    const answer = await callNvidia(prompt);
    showResult(answer);
  } catch (error) {
    console.error('Error calling NVIDIA API:', error);
    showResult(`Error: ${error.message}`);
  }
  }

function buildOdooFunctionalPrompt(question, options) {
  return `You are an Odoo 19 Functional Certification exam assistant.

Your only task is to answer Odoo Functional 19 exam-style multiple-choice questions accurately.

Use Odoo 19 functional behavior and certification scope first, especially:
- CRM, Sales, Purchase, Inventory, Manufacturing, Accounting/Invoicing, Project, Timesheets, Helpdesk, Website/eCommerce, POS, HR, Subscriptions, Sign, Studio, Spreadsheet, Approvals, Documents, Barcode, Email/Discuss, and general Odoo configuration.
- Functional workflows, menu actions, field effects, access rights, routes, replenishment, valuation, taxes, fiscal positions, payment terms, journals, pricelists, quotation/order/invoice flows, lots/serial numbers, units of measure, warehouses, locations, operation types, rules, and Odoo terminology.
- Prefer standard Odoo behavior over generic ERP assumptions.

Answering rules:
1. Read the question carefully and identify the exact Odoo app, workflow, and version-specific concept.
2. Compare every option against standard Odoo 19 functional behavior.
3. Pick only one option unless the question clearly asks for multiple answers.
4. If the options are ambiguous or the correct answer cannot be determined from Odoo 19 functional knowledge, say "Review needed" and give the most likely option with low confidence.
5. Do not invent features, menus, or behavior.

Reply format:
Answer: <letter>. <option text>
Confidence: High/Medium/Low
Reason: <one short Odoo-specific reason>

Question:
${question}

Options:
${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}`;
}
  
  function showLoader() {
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = '<div class="loader"></div>';
  }
  
  function showResult(message) {
    const resultDiv = document.getElementById("result");
    resultDiv.textContent = message;
  }

function getStoredApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['NVIDIA_API_KEY'], (res) => {
      resolve(res && res.NVIDIA_API_KEY ? res.NVIDIA_API_KEY : null);
    });
  });
}

async function callNvidia(promptText) {
  const apiKey = await getStoredApiKey();
  if (!apiKey) throw new Error('No NVIDIA API key saved.');

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
      max_tokens: 128,
      temperature: 0,
      stream: false
    })
  });

  if (!resp.ok) {
    throw new Error(await getNvidiaErrorMessage(resp));
  }

  const data = await resp.json();
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const message = choice && choice.message;

  if (message && typeof message.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }

  throw new Error('NVIDIA API did not return an answer.');
}

async function getNvidiaErrorMessage(resp) {
  const fallback = `NVIDIA API error: ${resp.status}`;

  try {
    const data = await resp.json();
    const message = data && (data.error && data.error.message ? data.error.message : data.message);

    if (resp.status === 429) {
      const retryDelay = getRetryDelay(data);
      return `NVIDIA quota/rate limit reached${retryDelay ? `. Try again in about ${retryDelay}` : ''}. If it keeps happening, check your NVIDIA API access and billing status.`;
    }

    return message ? `${fallback}: ${message}` : fallback;
  } catch (e) {
    return fallback;
  }
}

function getRetryDelay(data) {
  const details = data && data.error && data.error.details;
  if (!Array.isArray(details)) return '';

  const retryInfo = details.find(detail => detail.retryDelay);
  return retryInfo ? retryInfo.retryDelay.replace('s', ' seconds') : '';
}

function saveApiKey(value) {
  return new Promise((resolve) => {
    const key = value ? value.trim() : '';

    if (!key) {
      chrome.storage.local.remove('NVIDIA_API_KEY', () => {
        resolve({ success: !chrome.runtime.lastError, error: chrome.runtime.lastError && chrome.runtime.lastError.message });
      });
      return;
    }

    chrome.storage.local.set({ NVIDIA_API_KEY: key }, () => {
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
    chrome.storage.local.get(['NVIDIA_API_KEY'], (res) => {
      if (res && res.NVIDIA_API_KEY) document.getElementById('apiKeyInput').value = res.NVIDIA_API_KEY;
    });
  } catch (e) {
    // ignore
  }
});
