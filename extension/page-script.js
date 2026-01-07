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
   * Get ALL character attributes including integrants (for introspection)
   */
  getAllCharacterAttributes(characterId) {
    try {
      if (!window.Campaign || !window.Campaign.characters) {
        throw new Error('Roll20 Campaign object not available');
      }

      const char = window.Campaign.characters.get(characterId);
      if (!char) {
        throw new Error(`Character not found: ${characterId}`);
      }

      console.log('[Page Script] Getting all attributes for character:', characterId);

      // Get all simple attributes
      const simpleAttributes = {};
      if (char.attribs) {
        char.attribs.forEach(attr => {
          const name = attr.attributes.name;
          // Skip complex objects like store and builder
          if (name !== 'store' && name !== 'builder') {
            simpleAttributes[name] = {
              current: attr.attributes.current,
              max: attr.attributes.max
            };
          }
        });
      }

      // Get all integrants
      const integrantsData = {};
      const storeAttr = char.attribs.find(a => a.attributes.name === 'store');
      if (storeAttr && storeAttr.attributes.current.integrants) {
        const integrants = storeAttr.attributes.current.integrants.integrants;

        // Organize integrants by type for easier viewing
        Object.entries(integrants).forEach(([key, integrant]) => {
          const type = integrant.type;
          if (!integrantsData[type]) {
            integrantsData[type] = [];
          }

          // Simplify the integrant data for display
          const simplified = {
            key: key,
            shortID: integrant.shortID,
            name: integrant.name,
            enabled: integrant._enabled,
            label: integrant._label
          };

          // Add type-specific fields
          if (type === 'Ability Score') {
            simplified.ability = integrant.ability;
            simplified.value = integrant.valueFormula?.flatValue;
          } else if (type === 'Armor Class') {
            simplified.value = integrant.valueFormula?.flatValue;
          } else if (type === 'Hit Points') {
            simplified.hitpointType = integrant.hitpointType;
            simplified.value = integrant.valueFormula?.flatValue;
          } else if (type === 'Speed') {
            simplified.speedType = integrant.speed;
            simplified.value = integrant.valueFormula?.flatValue;
          } else if (type === 'Skill') {
            simplified.ability = integrant.ability;
          }

          integrantsData[type].push(simplified);
        });
      }

      return {
        id: char.id,
        name: char.attributes.name,
        simpleAttributes,
        integrants: integrantsData,
        summary: {
          simpleAttributeCount: Object.keys(simpleAttributes).length,
          integrantTypeCount: Object.keys(integrantsData).length,
          totalIntegrants: Object.values(integrantsData).reduce((sum, arr) => sum + arr.length, 0)
        }
      };
    } catch (error) {
      console.error('[Page Script] getAllCharacterAttributes error:', error);
      throw new Error(`Failed to get all character attributes: ${error.message}`);
    }
  },

  /**
   * Initialize D&D 2024 character sheet attributes (store, builder, etc.)
   */
  initializeDND2024Sheet(character) {
    console.log('[Page Script] Initializing D&D 2024 sheet attributes for:', character.id);

    // Create minimal store structure
    const minimalStore = {
      integrants: {
        integrants: {}
      },
      about: {
        characteristics: {},
        aboutTabApperancesDisplayOrder: '[]',
        aboutTabCharacteristicsDisplayOrder: '[]'
      },
      actions: {
        actionDisplayOrder: '[]',
        bonusActionDisplayOrder: '[]',
        reactionDisplayOrder: '[]',
        freeActionDisplayOrder: '[]'
      },
      attacks: {
        attackDisplayOrder: '[]'
      },
      background: {
        aboutTabBackgroundDisplayOrder: '[]'
      },
      bastion: {
        bastionDefenders: '',
        bastionDescription: '',
        bastionLevel: 1,
        characterLink: ''
      },
      character: {
        createdWithBuilder: false,
        creatureType: '',
        pronouns: ''
      },
      classLevel: {
        currentExp: 0
      },
      currencies: {
        initialized: true
      },
      effects: {
        effectDisplayOrder: '[]'
      },
      features: {
        classFeatureDisplayOrder: '[]',
        speciesTraitsDisplayOrder: '[]',
        featsDisplayOrder: '[]',
        otherDisplayOrder: '[]'
      },
      hitpoints: {
        currentHP: 0,
        deathSaves: {
          failures: 0,
          successes: 0,
          open: false
        }
      },
      inspiration: {
        isInspired: false
      },
      inventory: {
        equipmentDisplayOrder: '[]',
        incrementalQuantityEditing: true,
        otherPossessionsDisplayOrder: '[]'
      },
      notes: {
        order: {
          Organizations: '[]',
          Allies: '[]',
          Enemies: '[]'
        },
        emptyCategories: '[]'
      },
      npc: {
        acNotes: '',
        challengeRating: '',
        customXP: '',
        gear: '',
        habitat: '',
        legendaryActionCompendiumNum: 0,
        legendaryActionSummary: '',
        mythicActionSummary: '',
        rollHP: '',
        treasure: ''
      },
      npcEdit: {},
      rest: {
        longRestModalData: {
          dawnResources: true,
          recoverExhaustion: false,
          resetHpMax: false,
          spellManagement: false
        },
        shortRestModalData: {
          autoApplyHealing: true,
          dawnResources: false,
          resetHpMax: false
        }
      },
      settings: {
        addDexTiebreaker: false,
        encumbranceType: 'Normal',
        ignoreCoinWeight: false,
        layoutState: 'Compact',
        newRules: true,
        rollDamageAutomatic: false,
        rolls: {
          advancedMode: 'Normal',
          mode: 'Automatic',
          privacy: 'public'
        },
        showPreparedSpells: false,
        useConditionTokenSync: false
      },
      shop: {
        isLocked: false,
        lockDC: 10,
        shopDescription: '',
        shopDiscountMarkup: 0,
        shopOwner: '',
        shopStaff: '',
        type: 'shop'
      },
      spellSlots: {
        currentByLevel: {
          CANTRIP: 0,
          EIGHTH: 0,
          FIFTH: 0,
          FIRST: 0,
          FOURTH: 0,
          NINTH: 0,
          SECOND: 0,
          SEVENTH: 0,
          SIXTH: 0,
          THIRD: 0
        },
        currentPactByLevel: {
          CANTRIP: 0,
          EIGHTH: 0,
          FIFTH: 0,
          FIRST: 0,
          FOURTH: 0,
          NINTH: 0,
          SECOND: 0,
          SEVENTH: 0,
          SIXTH: 0,
          THIRD: 0
        },
        useSpellSlotOnCast: true
      },
      spells: {
        displayOrder: ['[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]'],
        generalSpellSettings: {
          defaultToFullscreen: false,
          showPreparedBar: false,
          showPreparedSpellsOnly: false,
          spellcastings: '$__$[]',
          useSlotAlwaysPrepared: false,
          useSlotDefault: true
        }
      },
      weaponMasteries: {
        masteryDisplayOrder: '[]'
      }
    };

    const minimalBuilder = {
      abilities: {
        assignAllToggled: false,
        generationMethod: 'Standard Array',
        hasVisited: false,
        isUsingTCERulesASI: false,
        rolledArray: '-1, -1, -1, -1, -1, -1'
      },
      about: { hasVisited: false },
      background: { hasVisited: false },
      class: { hasVisited: false },
      customBackground: {
        initialDecision: {},
        options: {},
        tempCustomBackground: {},
        tempFeatures: {},
        tempFeatureChildren: {}
      },
      customClass: {
        initialDecision: {},
        options: {},
        tempCustomClass: {},
        tempFeatures: {},
        tempFeatureChildren: {}
      },
      customSpecies: {
        initialDecision: {},
        options: {},
        tempCustomSpecies: {},
        tempFeatures: {},
        tempFeatureChildren: {}
      },
      customSubclass: {
        initialDecision: {},
        options: {},
        tempCustomSubclass: {},
        tempFeatures: {},
        tempFeatureChildren: {}
      },
      decisions: {
        allDecisions: {}
      },
      equipment: { hasVisited: false },
      feats: { hasVisited: false },
      finalize: {
        builderIterations: {}
      },
      hasCompletedOnce: false,
      isInProgress: false,
      lists: {
        localLists: {}
      },
      skills: { hasVisited: false },
      species: { hasVisited: false },
      spells: { hasVisited: false }
    };

    // Create the required attributes
    character.attribs.create({
      name: 'store',
      current: minimalStore,
      max: '',
      characterid: character.id
    });

    character.attribs.create({
      name: 'builder',
      current: minimalBuilder,
      max: '',
      characterid: character.id
    });

    character.attribs.create({
      name: 'appState',
      current: '',
      max: '',
      characterid: character.id
    });

    character.attribs.create({
      name: 'sheetVersion',
      current: 11,
      max: '',
      characterid: character.id
    });

    character.attribs.create({
      name: 'updateId',
      current: this.generateShortID() + this.generateShortID(),
      max: '',
      characterid: character.id
    });

    console.log('[Page Script] D&D 2024 sheet attributes initialized');
  },

  /**
   * Create a new character
   */
  createCharacter(name, data = {}) {
    try {
      if (!window.Campaign || !window.Campaign.characters) {
        throw new Error('Roll20 Campaign object not available');
      }

      console.log('[Page Script] Creating character:', { name, hasBio: !!data.bio, hasGmnotes: !!data.gmnotes });

      // Create character with basic attributes only
      const characterData = {
        name: name,
        avatar: data.avatar || '',
        controlledby: data.controlledby || '',
        inplayerjournals: data.inplayerjournals || '',
        charactersheetname: data.charactersheetname || 'dnd2024byroll20' // Set D&D 2024 character sheet
      };

      const newChar = window.Campaign.characters.create(characterData);

      // Wait longer for character to be created and synced, then initialize D&D 2024 sheet
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (newChar && newChar.id) {
            console.log('[Page Script] Character created, ID:', newChar.id);

            // Initialize D&D 2024 character sheet attributes
            this.initializeDND2024Sheet(newChar);

            // Set bio and gmnotes using updateBlobs (proper method for HTML content fields)
            if (data.bio || data.gmnotes) {
              console.log('[Page Script] Setting bio/gmnotes via updateBlobs');
              const blobsToUpdate = {};
              if (data.bio) blobsToUpdate.bio = data.bio;
              if (data.gmnotes) blobsToUpdate.gmnotes = data.gmnotes;

              newChar.updateBlobs(blobsToUpdate);

              // Wait for blobs to update and sync
              setTimeout(() => {
                console.log('[Page Script] Character blobs update completed');
                console.log('[Page Script] Character bio value:', newChar.get('bio'));
                console.log('[Page Script] Character gmnotes value:', newChar.get('gmnotes'));

                resolve({
                  id: newChar.id,
                  name: newChar.attributes.name,
                  success: true
                });
              }, 1000);
            } else {
              resolve({
                id: newChar.id,
                name: newChar.attributes.name,
                success: true
              });
            }
          } else {
            reject(new Error('Character creation failed'));
          }
        }, 1000);
      });
    } catch (error) {
      console.error('[Page Script] createCharacter error:', error);
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

      // Update bio and gmnotes using updateBlobs (proper method for HTML content fields)
      const blobUpdates = {};
      if (updates.bio !== undefined) blobUpdates.bio = updates.bio;
      if (updates.gmnotes !== undefined) blobUpdates.gmnotes = updates.gmnotes;

      if (Object.keys(blobUpdates).length > 0) {
        console.log('[Page Script] Updating character blobs:', Object.keys(blobUpdates));
        char.updateBlobs(blobUpdates);
      }

      return { success: true, id: characterId };
    } catch (error) {
      throw new Error(`Failed to update character: ${error.message}`);
    }
  },

  /**
   * Generate a random 9-character shortID for integrants
   */
  generateShortID() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < 9; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  /**
   * Set character attributes for D&D 2024 character sheet (uses integrants system)
   */
  setCharacterAttributes(characterId, attributes) {
    try {
      if (!window.Campaign || !window.Campaign.characters) {
        throw new Error('Roll20 Campaign object not available');
      }

      const char = window.Campaign.characters.get(characterId);
      if (!char) {
        throw new Error(`Character not found: ${characterId}`);
      }

      console.log('[Page Script] Setting attributes for D&D 2024 character:', characterId, attributes);

      // Get the store attribute (D&D 2024 uses integrants stored in 'store')
      const storeAttr = char.attribs.find(a => a.attributes.name === 'store');
      if (!storeAttr) {
        throw new Error('D&D 2024 character sheet store attribute not found');
      }

      const store = storeAttr.attributes.current;
      if (!store.integrants || !store.integrants.integrants) {
        throw new Error('Integrants system not initialized');
      }

      const integrants = store.integrants.integrants;
      let updatedCount = 0;

      // Helper to create/update an integrant
      const setIntegrant = (type, searchFn, integrantData) => {
        // Find existing integrant
        let existingKey = Object.keys(integrants).find(key => searchFn(integrants[key]));

        if (existingKey) {
          // Update existing integrant
          Object.assign(integrants[existingKey], integrantData);
        } else {
          // Create new integrant with UUID key
          const uuid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          integrants[uuid] = {
            ...integrantData,
            shortID: this.generateShortID(),
            createdTime: Date.now(),
            _enabled: true,
            name: '',
            parentID: '',
            parentDisabled: false,
            overwriteDisabled: false,
            childIDs: '[]',
            builderDisplayName: ''
          };
        }
        updatedCount++;
      };

      // Map of ability score names
      const abilityMap = {
        strength: 'Strength',
        dexterity: 'Dexterity',
        constitution: 'Constitution',
        intelligence: 'Intelligence',
        wisdom: 'Wisdom',
        charisma: 'Charisma'
      };

      // Process each attribute
      Object.keys(attributes).forEach(attrName => {
        const value = attributes[attrName];

        // Handle ability scores
        if (abilityMap[attrName.toLowerCase()]) {
          const abilityName = abilityMap[attrName.toLowerCase()];
          setIntegrant(
            'Ability Score',
            i => i.type === 'Ability Score' && i.ability === abilityName,
            {
              type: 'Ability Score',
              ability: abilityName,
              calculation: 'Set Value',
              source: 'Custom',
              _label: 'Override (Custom)',
              valueFormula: { flatValue: Number(value) },
              arrayPosition: Object.keys(abilityMap).indexOf(attrName.toLowerCase())
            }
          );
        }
        // Handle AC
        else if (attrName === 'ac') {
          setIntegrant(
            'Armor Class',
            i => i.type === 'Armor Class' && i.source === 'Custom',
            {
              type: 'Armor Class',
              calculation: 'Set Value',
              source: 'Custom',
              defaultAbility: false,
              _label: 'Unknown',
              valueFormula: { flatValue: Number(value) },
              arrayPosition: 6
            }
          );
        }
        // Handle HP
        else if (attrName === 'hp') {
          const hpValue = typeof value === 'object' ? value.max || value.current : value;
          setIntegrant(
            'Hit Points',
            i => i.type === 'Hit Points' && i.hitpointType === 'Maximum',
            {
              type: 'Hit Points',
              hitpointType: 'Maximum',
              calculation: 'Set Value',
              source: 'Custom',
              isFixed: false,
              isTemp: false,
              _label: 'Override Max HP',
              valueFormula: { flatValue: Number(hpValue) },
              arrayPosition: 45
            }
          );
        }
        // Handle Speed (walking speed)
        else if (attrName === 'speed') {
          // Parse speed value - could be "30 ft", "30", or 30
          const speedStr = String(value);
          const speedMatch = speedStr.match(/(\d+)/);
          const speedValue = speedMatch ? Number(speedMatch[1]) : Number(value);

          setIntegrant(
            'Speed',
            i => i.type === 'Speed' && i.speed === 'Walk' && i.source === 'Custom',
            {
              type: 'Speed',
              speed: 'Walk',
              calculation: 'Set Value',
              source: 'Custom',
              _label: '',
              valueFormula: { flatValue: speedValue },
              arrayPosition: 80
            }
          );
        }
        // Handle other attributes (size, type, etc.) - use simple attributes
        else {
          let attr = char.attribs.find(a => a.attributes.name === attrName);
          if (attr) {
            if (typeof value === 'object' && value !== null) {
              if (value.current !== undefined) attr.set('current', String(value.current));
              if (value.max !== undefined) attr.set('max', String(value.max));
            } else {
              attr.set('current', String(value));
            }
            attr.save();
          } else {
            char.attribs.create({
              name: attrName,
              current: typeof value === 'object' && value !== null ? String(value.current || '') : String(value),
              max: typeof value === 'object' && value !== null && value.max !== undefined ? String(value.max) : '',
              characterid: characterId
            });
          }
        }
      });

      // Save the store attribute with updated integrants
      storeAttr.save();

      console.log('[Page Script] Updated', updatedCount, 'integrants');

      return { success: true, updatedCount, id: characterId };
    } catch (error) {
      console.error('[Page Script] setCharacterAttributes error:', error);
      throw new Error(`Failed to set character attributes: ${error.message}`);
    }
  },

  /**
   * Create NPC with full D&D stats
   */
  async createNPCWithStats(npcData) {
    try {
      console.log('[Page Script] Creating NPC with stats:', npcData.name);

      // Step 1: Create the base character
      const characterData = {
        name: npcData.name,
        avatar: npcData.avatar || '',
        bio: npcData.bio || '',
        gmnotes: npcData.gmnotes || ''
      };

      const char = await this.createCharacter(npcData.name, characterData);

      console.log('[Page Script] Base character created:', char.id);

      // Step 2: Wait a bit for character to sync, then set all attributes
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Build attributes object from NPC data
      const attributes = {};

      // Set character sheet to NPC mode
      attributes.appState = 'npc';

      // Basic stats
      if (npcData.npc_type) attributes.npc_type = npcData.npc_type;
      if (npcData.size) attributes.size = npcData.size;
      if (npcData.type) attributes.type = npcData.type;
      if (npcData.alignment) attributes.alignment = npcData.alignment;

      // Core stats
      if (npcData.ac) attributes.ac = npcData.ac;
      if (npcData.hp) attributes.hp = { current: npcData.hp, max: npcData.hp };
      if (npcData.speed) attributes.speed = npcData.speed;

      // Ability scores
      if (npcData.strength) attributes.strength = npcData.strength;
      if (npcData.dexterity) attributes.dexterity = npcData.dexterity;
      if (npcData.constitution) attributes.constitution = npcData.constitution;
      if (npcData.intelligence) attributes.intelligence = npcData.intelligence;
      if (npcData.wisdom) attributes.wisdom = npcData.wisdom;
      if (npcData.charisma) attributes.charisma = npcData.charisma;

      // CR and proficiency
      if (npcData.challenge_rating) attributes.npc_challenge = npcData.challenge_rating;
      if (npcData.proficiency_bonus) attributes.pb = npcData.proficiency_bonus;

      // Saving throws (if provided)
      if (npcData.saving_throws) {
        if (npcData.saving_throws.str) attributes.npc_str_save = npcData.saving_throws.str;
        if (npcData.saving_throws.dex) attributes.npc_dex_save = npcData.saving_throws.dex;
        if (npcData.saving_throws.con) attributes.npc_con_save = npcData.saving_throws.con;
        if (npcData.saving_throws.int) attributes.npc_int_save = npcData.saving_throws.int;
        if (npcData.saving_throws.wis) attributes.npc_wis_save = npcData.saving_throws.wis;
        if (npcData.saving_throws.cha) attributes.npc_cha_save = npcData.saving_throws.cha;
      }

      // Skills (if provided)
      if (npcData.skills) {
        Object.keys(npcData.skills).forEach(skillName => {
          attributes[`npc_${skillName.toLowerCase()}`] = npcData.skills[skillName];
        });
      }

      // Senses
      if (npcData.senses) attributes.senses = npcData.senses;
      if (npcData.languages) attributes.languages = npcData.languages;

      // Set all the attributes
      if (Object.keys(attributes).length > 0) {
        console.log('[Page Script] Setting', Object.keys(attributes).length, 'attributes');
        await this.setCharacterAttributes(char.id, attributes);
      }

      console.log('[Page Script] NPC created successfully with all stats');

      return {
        success: true,
        id: char.id,
        name: char.name,
        attributesSet: Object.keys(attributes).length
      };
    } catch (error) {
      console.error('[Page Script] createNPCWithStats error:', error);
      throw new Error(`Failed to create NPC with stats: ${error.message}`);
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

      console.log('[Page Script] Creating handout:', { name, contentLength: content?.length });

      // Create handout with basic attributes only
      const handoutData = {
        name: name,
        archived: false
      };

      const newHandout = window.Campaign.handouts.create(handoutData);

      // Wait longer for handout to be created and synced, then set notes
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (newHandout && newHandout.id) {
            console.log('[Page Script] Handout created, ID:', newHandout.id);

            // Set notes using updateBlobs (proper method for HTML content fields)
            if (content) {
              console.log('[Page Script] Setting notes via updateBlobs:', content);

              // Use updateBlobs which is the proper Roll20 API for notes/gmnotes/bio
              newHandout.updateBlobs({
                notes: content
              });

              // Wait for blobs to update and sync
              setTimeout(() => {
                console.log('[Page Script] Blobs update completed');
                console.log('[Page Script] Handout notes value:', newHandout.get('notes'));

                resolve({
                  id: newHandout.id,
                  name: newHandout.attributes.name,
                  success: true
                });
              }, 1000);
            } else {
              console.log('[Page Script] No content provided for handout');
              resolve({
                id: newHandout.id,
                name: newHandout.attributes.name,
                success: true
              });
            }
          } else {
            reject(new Error('Handout creation failed'));
          }
        }, 1000);
      });
    } catch (error) {
      console.error('[Page Script] createHandout error:', error);
      throw new Error(`Failed to create handout: ${error.message}`);
    }
  },

  /**
   * Get detailed handout information
   */
  getHandout(handoutId) {
    try {
      if (!window.Campaign || !window.Campaign.handouts) {
        throw new Error('Roll20 Campaign object not available');
      }

      const handout = window.Campaign.handouts.get(handoutId);
      if (!handout) {
        throw new Error(`Handout not found: ${handoutId}`);
      }

      console.log('[Page Script] Getting handout:', handoutId);
      console.log('[Page Script] Handout notes:', handout.get('notes'));
      console.log('[Page Script] Handout gmnotes:', handout.get('gmnotes'));

      return {
        id: handout.id,
        name: handout.attributes.name || 'Unnamed',
        notes: handout.get('notes') || '',
        gmnotes: handout.get('gmnotes') || '',
        archived: handout.attributes.archived || false,
        inplayerjournals: handout.attributes.inplayerjournals || ''
      };
    } catch (error) {
      console.error('[Page Script] getHandout error:', error);
      throw new Error(`Failed to get handout: ${error.message}`);
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

      // Update basic attributes (name, archived)
      const basicUpdates = {};
      if (updates.name) basicUpdates.name = updates.name;
      if (updates.archived !== undefined) basicUpdates.archived = updates.archived;

      if (Object.keys(basicUpdates).length > 0) {
        handout.save(basicUpdates);
      }

      // Update notes and gmnotes using updateBlobs (proper method for HTML content fields)
      const blobUpdates = {};
      if (updates.content !== undefined) blobUpdates.notes = updates.content;
      if (updates.gmnotes !== undefined) blobUpdates.gmnotes = updates.gmnotes;

      if (Object.keys(blobUpdates).length > 0) {
        console.log('[Page Script] Updating handout blobs:', Object.keys(blobUpdates));
        handout.updateBlobs(blobUpdates);
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
      case 'getAllCharacterAttributes':
        result = Roll20API.getAllCharacterAttributes(params.characterId);
        break;
      case 'createCharacter':
        result = await Roll20API.createCharacter(params.name, params.data);
        break;
      case 'updateCharacter':
        result = Roll20API.updateCharacter(params.characterId, params.updates);
        break;
      case 'setCharacterAttributes':
        result = Roll20API.setCharacterAttributes(params.characterId, params.attributes);
        break;
      case 'createNPCWithStats':
        result = await Roll20API.createNPCWithStats(params.npcData);
        break;
      case 'listHandouts':
        result = Roll20API.listHandouts();
        break;
      case 'getHandout':
        result = Roll20API.getHandout(params.handoutId);
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
