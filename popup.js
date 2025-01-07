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
    const apiKey = "AIzaSyAd9o5zMbmjRm0fHGonOI0lXxkAK5eeh_I"; // Replace with your Google API key
    const searchEngineId = "e66e097e6c9744999"; // Replace with your Custom Search Engine ID
  
    showLoader();
  
    try {
      // Search for the question
      const searchUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(question)}&key=${apiKey}&cx=${searchEngineId}`;
      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} - ${response.statusText}`);
      }
  
      const data = await response.json();
      if (!data.items || data.items.length === 0) {
        showResult("No results found.");
        return;
      }
  
      // Analyze the search results to find the best match
      const searchResults = data.items.map(item => item.snippet).join(" ");
      let bestOption = null;
      let bestScore = 0;
  
      options.forEach(option => {
        const score = searchResults.toLowerCase().split(option.toLowerCase()).length - 1;
        if (score > bestScore) {
          bestScore = score;
          bestOption = option;
        }
      });
  
      showResult(bestOption ? `The correct answer is likely: <strong>${bestOption}</strong>` : "Unable to determine the correct answer.");
    } catch (error) {
      console.error("Error fetching explanation:", error);
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