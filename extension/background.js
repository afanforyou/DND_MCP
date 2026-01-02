/**
 * Background Service Worker
 * Handles Native Messaging communication between MCP server and content scripts
 */

const NATIVE_HOST_NAME = 'com.roll20.mcp.host';

// Track active native messaging port
let nativePort = null;
let activeTabId = null;

// Connect to native messaging host (MCP server)
function connectNative() {
  console.log('[Background] Connecting to native host:', NATIVE_HOST_NAME);

  nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

  nativePort.onMessage.addListener((message) => {
    console.log('[Background] Received from native host:', message);

    // Forward message to active Roll20 tab
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'FROM_MCP',
        payload: message
      }).catch(err => {
        console.error('[Background] Failed to send to tab:', err);
      });
    }
  });

  nativePort.onDisconnect.addListener(() => {
    console.log('[Background] Native host disconnected');
    if (chrome.runtime.lastError) {
      console.error('[Background] Disconnect error:', chrome.runtime.lastError);
    }
    nativePort = null;

    // Attempt to reconnect after 5 seconds
    setTimeout(connectNative, 5000);
  });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received from content script:', message);

  if (message.type === 'INIT') {
    // Content script is ready, track the tab
    activeTabId = sender.tab.id;
    console.log('[Background] Active Roll20 tab:', activeTabId);

    // Connect to native host if not already connected
    if (!nativePort) {
      connectNative();
    }

    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TO_MCP') {
    // Forward message from content script to MCP server
    if (nativePort) {
      try {
        nativePort.postMessage(message.payload);
        sendResponse({ success: true });
      } catch (err) {
        console.error('[Background] Failed to send to native host:', err);
        sendResponse({ success: false, error: err.message });
      }
    } else {
      console.error('[Background] Native port not connected');
      sendResponse({ success: false, error: 'Native host not connected' });
    }
    return true;
  }
});

// Initialize connection on startup
connectNative();

console.log('[Background] Service worker initialized');
