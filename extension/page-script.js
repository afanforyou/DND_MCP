/**
 * Page Script
 * Runs in the main page context with access to Roll20's internal API
 * Communicates with content script via window.postMessage
 */

console.log('[Page Script] Roll20 MCP Bridge injected into page context');

// Store pending requests
const pendingRequests = new Map();
let requestIdCounter = 0;

// Helper to send response back to MCP
function sendResponse(requestId, data, error = null) {
  window.postMessage({
    type: 'FROM_PAGE',
    payload: {
      requestId,
      data,
      error
    }
  }, '*');
}

// Helper to wait for Roll20 API to be ready
function waitForRoll20API() {
  return new Promise((resolve) => {
    const checkReady = () => {
      // Check if Campaign exists and has its collections loaded
      if (window.Campaign &&
          window.Campaign.characters &&
          window.Campaign.handouts &&
          typeof window.Campaign.characters.length !== 'undefined') {
        return true;
      }
      return false;
    };

    if (checkReady()) {
      console.log('[Page Script] Campaign already loaded');
      resolve();
      return;
    }

    console.log('[Page Script] Waiting for Campaign to load...');
    const checkInterval = setInterval(() => {
      if (checkReady()) {
        clearInterval(checkInterval);
        console.log('[Page Script] Campaign loaded successfully');
        resolve();
      }
    }, 250);

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      console.warn('[Page Script] Timeout waiting for Campaign, proceeding anyway');
      resolve();
    }, 30000);
  });
}

// Roll20 API Operations
const Roll20API = {
  /**
   * List all characters in the campaign
   */
  listCharacters() {
    try {
      if (!window.Campaign) {
        throw new Error('Roll20 Campaign object not found. Please ensure you are on the Roll20 editor page and the campaign is fully loaded.');
      }

      if (!window.Campaign.characters) {
        throw new Error('Campaign.characters collection not available. Campaign may still be loading.');
      }

      console.log('[Page Script] Found', window.Campaign.characters.length, 'characters');

      const characters = window.Campaign.characters.map(char => ({
        id: char.id,
        name: char.attributes.name || 'Unnamed',
        avatar: char.attributes.avatar || '',
        controlledby: char.attributes.controlledby || '',
        inplayerjournals: char.attributes.inplayerjournals || ''
      }));

      return { characters, count: characters.length };
    } catch (error) {
      console.error('[Page Script] listCharacters error:', error);
      throw new Error(`Failed to list characters: ${error.message}`);
    }
  },

  /**
   * Get detailed character information
   */
  getCharacter(characterId) {
    try {
      if (!window.Campaign || !window.Campaign.characters) {
        throw new Error('Roll20 Campaign object not available');
      }

      const char = window.Campaign.characters.get(characterId);
      if (!char) {
        throw new Error(`Character not found: ${characterId}`);
      }

      return {
        id: char.id,
        name: char.attributes.name || 'Unnamed',
        avatar: char.attributes.avatar || '',
        bio: char.attributes.bio || '',
        gmnotes: char.attributes.gmnotes || '',
        controlledby: char.attributes.controlledby || '',
        inplayerjournals: char.attributes.inplayerjournals || '',
        attributes: char.attribs ? char.attribs.map(attr => ({
          name: attr.attributes.name,
          current: attr.attributes.current,
          max: attr.attributes.max
        })) : []
      };
    } catch (error) {
      throw new Error(`Failed to get character: ${error.message}`);
    }
  },

  /**
   * Create a new character
   */
  createCharacter(name, data = {}) {
    try {
      if (!window.Campaign || !window.Campaign.characters) {
        throw new Error('Roll20 Campaign object not available');
      }

      // Create character with basic attributes
      const characterData = {
        name: name,
        avatar: data.avatar || '',
        controlledby: data.controlledby || '',
        inplayerjournals: data.inplayerjournals || ''
      };

      const newChar = window.Campaign.characters.create(characterData);

      // Wait for character to be created, then set bio/gmnotes
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (newChar && newChar.id) {
            // Set bio and gmnotes separately (they are lazy-loaded fields)
            if (data.bio) {
              newChar.save({ bio: data.bio });
            }
            if (data.gmnotes) {
              newChar.save({ gmnotes: data.gmnotes });
            }

            console.log('[Page Script] Character created with bio/gmnotes:', newChar.id);

            resolve({
              id: newChar.id,
              name: newChar.attributes.name,
              success: true
            });
          } else {
            reject(new Error('Character creation failed'));
          }
        }, 500);
      });
    } catch (error) {
      throw new Error(`Failed to create character: ${error.message}`);
    }
  },

  /**
   * Update character attributes
   */
  updateCharacter(characterId, updates) {
    try {
      if (!window.Campaign || !window.Campaign.characters) {
        throw new Error('Roll20 Campaign object not available');
      }

      const char = window.Campaign.characters.get(characterId);
      if (!char) {
        throw new Error(`Character not found: ${characterId}`);
      }

      // Update basic attributes (name, avatar)
      const basicUpdates = {};
      if (updates.name) basicUpdates.name = updates.name;
      if (updates.avatar) basicUpdates.avatar = updates.avatar;

      if (Object.keys(basicUpdates).length > 0) {
        char.save(basicUpdates);
      }

      // Update bio and gmnotes separately (lazy-loaded fields)
      if (updates.bio !== undefined) {
        char.save({ bio: updates.bio });
        console.log('[Page Script] Updated bio for character:', characterId);
      }
      if (updates.gmnotes !== undefined) {
        char.save({ gmnotes: updates.gmnotes });
        console.log('[Page Script] Updated gmnotes for character:', characterId);
      }

      return { success: true, id: characterId };
    } catch (error) {
      throw new Error(`Failed to update character: ${error.message}`);
    }
  },

  /**
   * List all handouts in the campaign
   */
  listHandouts() {
    try {
      if (!window.Campaign || !window.Campaign.handouts) {
        throw new Error('Roll20 Campaign object not available');
      }

      const handouts = window.Campaign.handouts.map(handout => ({
        id: handout.id,
        name: handout.attributes.name || 'Unnamed',
        archived: handout.attributes.archived || false,
        inplayerjournals: handout.attributes.inplayerjournals || ''
      }));

      return { handouts, count: handouts.length };
    } catch (error) {
      throw new Error(`Failed to list handouts: ${error.message}`);
    }
  },

  /**
   * Create a new handout
   */
  createHandout(name, content = '') {
    try {
      if (!window.Campaign || !window.Campaign.handouts) {
        throw new Error('Roll20 Campaign object not available');
      }

      // Create handout with basic attributes
      const handoutData = {
        name: name,
        archived: false
      };

      const newHandout = window.Campaign.handouts.create(handoutData);

      // Wait for handout to be created, then set notes
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (newHandout && newHandout.id) {
            // Set notes separately (it's a lazy-loaded field)
            if (content) {
              newHandout.save({ notes: content });
              console.log('[Page Script] Handout created with notes:', newHandout.id);
            }

            resolve({
              id: newHandout.id,
              name: newHandout.attributes.name,
              success: true
            });
          } else {
            reject(new Error('Handout creation failed'));
          }
        }, 500);
      });
    } catch (error) {
      throw new Error(`Failed to create handout: ${error.message}`);
    }
  },

  /**
   * Update a handout
   */
  updateHandout(handoutId, updates) {
    try {
      if (!window.Campaign || !window.Campaign.handouts) {
        throw new Error('Roll20 Campaign object not available');
      }

      const handout = window.Campaign.handouts.get(handoutId);
      if (!handout) {
        throw new Error(`Handout not found: ${handoutId}`);
      }

      // Update basic attributes (name)
      const basicUpdates = {};
      if (updates.name) basicUpdates.name = updates.name;
      if (updates.archived !== undefined) basicUpdates.archived = updates.archived;

      if (Object.keys(basicUpdates).length > 0) {
        handout.save(basicUpdates);
      }

      // Update notes separately (lazy-loaded field)
      if (updates.content !== undefined) {
        handout.save({ notes: updates.content });
        console.log('[Page Script] Updated notes for handout:', handoutId);
      }

      // Also support gmnotes for handouts
      if (updates.gmnotes !== undefined) {
        handout.save({ gmnotes: updates.gmnotes });
        console.log('[Page Script] Updated gmnotes for handout:', handoutId);
      }

      return { success: true, id: handoutId };
    } catch (error) {
      throw new Error(`Failed to update handout: ${error.message}`);
    }
  },

  /**
   * Get campaign information
   */
  getCampaignInfo() {
    try {
      if (!window.Campaign) {
        throw new Error('Roll20 Campaign object not available');
      }

      return {
        id: window.Campaign.id,
        name: window.Campaign.attributes.name || 'Unnamed Campaign',
        playerCount: window.Campaign.players ? window.Campaign.players.length : 0,
        characterCount: window.Campaign.characters ? window.Campaign.characters.length : 0,
        handoutCount: window.Campaign.handouts ? window.Campaign.handouts.length : 0,
        pageCount: window.Campaign.pages ? window.Campaign.pages.length : 0
      };
    } catch (error) {
      throw new Error(`Failed to get campaign info: ${error.message}`);
    }
  }
};

// Message handler from content script
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (event.data.type !== 'TO_PAGE') return;

  const { requestId, method, params } = event.data.payload;

  console.log('[Page Script] Received request:', { requestId, method, params });

  try {
    // Ensure Roll20 API is ready
    await waitForRoll20API();

    // Route to appropriate handler
    let result;
    switch (method) {
      case 'listCharacters':
        result = Roll20API.listCharacters();
        break;
      case 'getCharacter':
        result = Roll20API.getCharacter(params.characterId);
        break;
      case 'createCharacter':
        result = await Roll20API.createCharacter(params.name, params.data);
        break;
      case 'updateCharacter':
        result = Roll20API.updateCharacter(params.characterId, params.updates);
        break;
      case 'listHandouts':
        result = Roll20API.listHandouts();
        break;
      case 'createHandout':
        result = await Roll20API.createHandout(params.name, params.content);
        break;
      case 'updateHandout':
        result = Roll20API.updateHandout(params.handoutId, params.updates);
        break;
      case 'getCampaignInfo':
        result = Roll20API.getCampaignInfo();
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }

    console.log('[Page Script] Sending successful response:', { requestId, result });
    sendResponse(requestId, result);
  } catch (error) {
    console.error('[Page Script] Error handling request:', error);
    console.error('[Page Script] Error stack:', error.stack);
    sendResponse(requestId, null, error.message);
  }
});

// Signal that page script is ready
console.log('[Page Script] Ready and waiting for Roll20 API...');
waitForRoll20API().then(() => {
  console.log('[Page Script] Roll20 API detected and ready!');
  sendResponse('init', { ready: true, campaign: window.Campaign?.attributes?.name });
});
