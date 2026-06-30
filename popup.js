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
        document.getElementById("question").innerText = `Question: ${question}`;
        document.getElementById("options").innerText = `Options: ${options.join(", ")}`;
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
    // Build a prompt for Gemini
    const prompt = `You are a helpful assistant. Given the multiple-choice question and options, pick the most likely correct option and give a one-sentence explanation.\n\nQuestion: ${question}\nOptions:\n${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}\n\nAnswer:`;

    const res = await callBackgroundGemini(prompt);
    if (!res) {
      showResult('No response from Gemini.');
      return;
    }
    if (!res.success) {
      showResult(`Error: ${res.error}`);
      return;
    }

    // Display the result returned by background
    showResult(res.result);
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

// Bridge to background: call Gemini
function callBackgroundGemini(prompt) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'callGemini', prompt }, (res) => {
      resolve(res);
    });
  });
}

// Save API key from input to storage via background
document.getElementById('saveKeyBtn').addEventListener('click', () => {
  const val = document.getElementById('apiKeyInput').value || null;
  chrome.runtime.sendMessage({ action: 'saveGeminiKey', key: val }, (res) => {
    if (res && res.success) showResult('API key saved.'); else showResult('Failed to save API key.');
  });
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