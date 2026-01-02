/**
 * Content Script
 * Runs in isolated context on Roll20 pages
 * Injects page-script.js to access Roll20's internal API
 */

console.log('[Content Script] Roll20 MCP Bridge loaded');

// Inject the page script that can access Roll20's window objects
function injectPageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page-script.js');
  script.onload = () => {
    console.log('[Content Script] Page script injected');
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// Communication bridge between page script and background
window.addEventListener('message', (event) => {
  // Only accept messages from same origin
  if (event.source !== window) return;

  if (event.data.type === 'FROM_PAGE') {
    console.log('[Content Script] Received from page script:', event.data.payload);

    // Forward to background script (and then to MCP server)
    chrome.runtime.sendMessage({
      type: 'TO_MCP',
      payload: event.data.payload
    }).then(response => {
      console.log('[Content Script] Sent to MCP server:', response);
    }).catch(err => {
      console.error('[Content Script] Error sending to background:', err);
    });
  }
});

// Listen for messages from background (MCP server responses)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content Script] Received from background:', message);

  if (message.type === 'FROM_MCP') {
    console.log('[Content Script] Forwarding to page script:', message.payload);
    // Forward to page script
    window.postMessage({
      type: 'TO_PAGE',
      payload: message.payload
    }, '*');
    sendResponse({ success: true });
  }

  return true;
});

// Initialize
function init() {
  console.log('[Content Script] Initializing...');

  // Inject page script
  injectPageScript();

  // Notify background that we're ready
  chrome.runtime.sendMessage({ type: 'INIT' })
    .then(response => {
      console.log('[Content Script] Initialized:', response);
    })
    .catch(err => {
      console.error('[Content Script] Initialization failed:', err);
    });
}

// Wait for page to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
