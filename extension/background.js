/**
 * Background Service Worker
 * Handles WebSocket communication between MCP server and content scripts
 */

const WS_URL = 'ws://localhost:8765';

let ws = null;
let activeTabId = null;
let reconnectTimer = null;

// Connect to WebSocket server (MCP server)
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('[Background] WebSocket already connected');
    return;
  }

  console.log('[Background] Connecting to WebSocket:', WS_URL);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[Background] WebSocket connected to MCP server');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('[Background] Received from MCP server:', message);

      // If no active tab, try to find Roll20 tab
      if (!activeTabId) {
        console.log('[Background] No active tab, searching for Roll20 tab...');
        const tabs = await chrome.tabs.query({ url: '*://app.roll20.net/editor/*' });
        if (tabs.length > 0) {
          activeTabId = tabs[0].id;
          console.log('[Background] Found Roll20 tab:', activeTabId);
        } else {
          console.error('[Background] No Roll20 editor tab found. Please open Roll20.');
          return;
        }
      }

      // Forward message to active Roll20 tab
      console.log('[Background] Forwarding to tab', activeTabId, ':', message);
      chrome.tabs.sendMessage(activeTabId, {
        type: 'FROM_MCP',
        payload: message
      }).then(() => {
        console.log('[Background] Successfully sent to tab');
      }).catch(err => {
        console.error('[Background] Failed to send to tab:', err);
        // Clear activeTabId on failure so it tries to find it again
        activeTabId = null;
      });
    } catch (error) {
      console.error('[Background] Error parsing WebSocket message:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('[Background] WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('[Background] WebSocket disconnected');
    ws = null;

    // Attempt to reconnect after 5 seconds
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(connectWebSocket, 5000);
    }
  };
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received from content script:', message);

  if (message.type === 'INIT') {
    // Content script is ready, track the tab
    activeTabId = sender.tab.id;
    console.log('[Background] Active Roll20 tab:', activeTabId);

    // Connect to WebSocket if not already connected
    connectWebSocket();

    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TO_MCP') {
    // Forward message from content script to MCP server via WebSocket
    console.log('[Background] Sending to MCP server via WebSocket:', message.payload);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        const jsonPayload = JSON.stringify(message.payload);
        console.log('[Background] WebSocket send:', jsonPayload);
        ws.send(jsonPayload);
        sendResponse({ success: true });
      } catch (err) {
        console.error('[Background] Failed to send to WebSocket:', err);
        sendResponse({ success: false, error: err.message });
      }
    } else {
      console.error('[Background] WebSocket not connected, readyState:', ws?.readyState);
      sendResponse({ success: false, error: 'WebSocket not connected' });
    }
    return true;
  }
});

// Initialize connection on startup
connectWebSocket();

console.log('[Background] Service worker initialized');
