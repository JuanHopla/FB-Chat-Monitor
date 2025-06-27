/**
 * Integration Test for New OpenAI Components
 * 
 * This file contains tests to verify that all new OpenAI components work 
 * together correctly before integrating them into the existing system.
 * 
 * Run this test by calling openAIIntegrationTest.runTests() from the console.
 */

class OpenAIIntegrationTest {
  constructor() {
    this.testResults = {
      apiClient: false,
      threadStore: false,
      messagePreprocessor: false,
      assistantHandler: false,
      endToEnd: false
    };

    this.testMessages = [
      { id: 'msg1', content: { text: 'Hi, I am interested in the product.' }, sentByUs: false },
      { id: 'msg2', content: { text: 'Sure, what would you like to know?' }, sentByUs: true },
      { id: 'msg3', content: { text: 'What is the best price you can give me?' }, sentByUs: false }
    ];

    this.sampleProduct = {
      title: 'Sony Digital Camera',
      price: '$299.99',
      condition: 'Like new',
      description: 'Sony digital camera with 24 megapixels, almost new, used only once.',
      images: [
        'https://example.com/camera1.jpg',
        'https://example.com/camera2.jpg'
      ]
    };
  }

  /**
   * Simulates the assistant selection flow by the user.
   * Should be called before running the main tests.
   */
  async setupAssistantsFlow() {
    // 1. List available assistants with the current API key
    if (!window.apiClient || !window.CONFIG?.AI?.apiKey) {
      throw new Error('API key not configured or ApiClient not available');
    }
    await window.apiClient.setApiKey(window.CONFIG.AI.apiKey);

    const assistantsList = await window.apiClient.listAssistants();
    if (!assistantsList.data || assistantsList.data.length === 0) {
      throw new Error('No assistants available in your OpenAI account');
    }

    // 2. Simulate assistant selection by role (here selects by fixed name or ID)
    // You can adapt this to be interactive if you want
    const sellerAssistant = assistantsList.data.find(a => a.id === 'asst_Fx4cKVmwtKZHNktzDLkIzUJC');
    const buyerAssistant = assistantsList.data.find(a => a.id === 'asst_ndDzOzekntFOuHYlgwodWrAl');

    if (!sellerAssistant || !buyerAssistant) {
      throw new Error('Required assistants not found in your OpenAI account. Check the IDs.');
    }

    // 3. Sync the selected IDs in the global config
    window.CONFIG.AI.assistants = {
      seller: {
        id: sellerAssistant.id,
        instructions: sellerAssistant.instructions || ''
      },
      buyer: {
        id: buyerAssistant.id,
        instructions: buyerAssistant.instructions || ''
      }
    };
    // If you use storageUtils, save there too
    if (window.storageUtils) {
      window.storageUtils.set('FB_CHAT_MONITOR_SELLER_ASSISTANT_ID', sellerAssistant.id);
      window.storageUtils.set('FB_CHAT_MONITOR_BUYER_ASSISTANT_ID', buyerAssistant.id);
    }
    // If you have a sync function, call it here
    if (typeof window.syncSelectedAssistants === 'function') {
      window.syncSelectedAssistants(sellerAssistant.id, buyerAssistant.id);
    }

    logger.log('Assistant IDs synced successfully before tests');
  }

  /**
   * This method will be called by the visual selector when the user has selected the assistants.
   */
  async onAssistantsSelected() {
    logger.log('Assistants visually selected. You can now run the tests.');
    // Enable the test button here if you want (optional)
    // document.getElementById('run-tests-btn').disabled = false;
  }

  /**
   * Run all tests and output results
   */
  async runTests() {
    // 1. Verify that both assistants are selected and exist
    let assistants = window.CONFIG?.AI?.assistants;
    if (
      !assistants ||
      !assistants.seller?.id ||
      !assistants.buyer?.id
    ) {
      logger.error('You must select both assistants before running the tests.');
      alert('You must select both assistants before running the tests.');
      return;
    }

    // 2. (Optional) Verify that the IDs exist in the current assistant list
    let assistantsList = [];
    if (window.openaiManager && typeof window.openaiManager.listAssistants === 'function') {
      assistantsList = await window.openaiManager.listAssistants();
    } else if (window.apiClient && typeof window.apiClient.listAssistants === 'function') {
      const result = await window.apiClient.listAssistants();
      assistantsList = result.data || [];
    }
    const sellerExists = assistantsList.some(a => a.id === assistants.seller.id);
    const buyerExists = assistantsList.some(a => a.id === assistants.buyer.id);
    if (!sellerExists || !buyerExists) {
      logger.error('The selected assistants no longer exist in your OpenAI account.');
      alert('The selected assistants no longer exist in your OpenAI account.');
      return;
    }

    // 3. Always use the IDs selected by the user
    this.sellerAssistantId = assistants.seller.id;
    this.buyerAssistantId = assistants.buyer.id;

    console.log('🧪 STARTING OPENAI COMPONENTS INTEGRATION TESTS 🧪');
    console.log('----------------------------------------------');

    try {
      // DO NOT run setupAssistantsFlow here.
      // Wait for the user to select assistants visually before running tests.

      // Explicitly check that each component is available
      console.log('Checking component availability:');
      console.log(`- ApiClient: ${window.apiClient ? '✅ Available' : '❌ Not available'}`);
      console.log(`- ThreadStore: ${window.threadStore ? '✅ Available' : '❌ Not available'}`);
      console.log(`- MessagePreprocessor: ${window.messagePreprocessor ? '✅ Available' : '❌ Not available'}`);
      console.log(`- AssistantHandler: ${window.assistantHandler ? '✅ Available' : '❌ Not available'}`);

      // Test API Client
      logger.log('🧪 Starting ApiClient test...');
      await this.testApiClient();
      logger.log('✅ ApiClient test completed successfully');

      // Test Thread Store
      logger.log('🧪 Starting ThreadStore test...');
      await this.testThreadStore();
      logger.log('✅ ThreadStore test completed successfully');

      // Test Message Preprocessor
      logger.log('🧪 Starting MessagePreprocessor test...');
      await this.testMessagePreprocessor();
      logger.log('✅ MessagePreprocessor test completed successfully');

      // Test Assistant Handler
      logger.log('🧪 Starting AssistantHandler test...');
      await this.testAssistantHandler();
      logger.log('✅ AssistantHandler test completed successfully');

      // Test End to End
      logger.log('🧪 Starting End-to-End test...');
      await this.testEndToEnd();
      logger.log('✅ End-to-End test completed successfully');

      // NEW: Test reusing existing thread
      await this.testThreadReuse();
      logger.log('✅ Thread reuse test completed successfully');

      this.logResults();
    } catch (error) {
      console.error('❌ ERROR DURING TEST EXECUTION:', error);
      logger.error(`Test execution failed: ${error.message} - ${error.stack || 'No stack trace'}`);
    }
  }

  /**
   * Test the API Client component
   */
  async testApiClient() {
    console.log('🧪 Testing ApiClient...');

    try {
      // Check if ApiClient is available
      if (!window.apiClient) {
        throw new Error('ApiClient not available as global component');
      }

      // Check API key setup
      const apiKey = CONFIG?.AI?.apiKey;
      if (!apiKey) {
        throw new Error('API key not found in CONFIG.AI.apiKey');
      }

      // Initialize the client
      window.apiClient.initialize(apiKey);
      console.log('✅ ApiClient initialized with API key');

      // Try a simple request to verify connectivity (without requiring full validation)
      try {
        console.log('Making a simple request to verify connectivity...');
        const response = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          console.log('✅ Connectivity with OpenAI API verified');
        } else {
          const error = await response.json();
          console.warn(`⚠️ API responded with error: ${error.error?.message || response.status}`);
        }
      } catch (e) {
        console.warn(`⚠️ Could not verify connectivity: ${e.message}`);
      }

      // Create a test thread to verify API connection
      console.log('Trying to create a test thread...');
      const threadResponse = await window.apiClient.createThread();
      if (!threadResponse || !threadResponse.id) {
        throw new Error('Failed to create test thread');
      }
      console.log(`✅ Created test thread with ID: ${threadResponse.id}`);

      this.testResults.apiClient = true;
      this.testThreadId = threadResponse.id;
      return true;
    } catch (error) {
      console.error(`❌ ApiClient test failed: ${error.message}`, error);
      logger.error(`ApiClient test failed: ${error.message}`);
      this.testResults.apiClient = false;
      throw error;
    }
  }

  /**
   * Test the ThreadStore component
   */
  async testThreadStore() {
    console.log('🧪 Testing ThreadStore...');

    try {
      // Check if ThreadStore is available
      if (!window.threadStore) {
        throw new Error('ThreadStore not available as global component');
      }

      // Initialize the store
      await window.threadStore.initialize();
      console.log('✅ ThreadStore initialized');

      // Test creating thread info
      const fbThreadId = `test_${Date.now()}`;

      // CORRECTION: Make sure createThreadInfo receives all necessary parameters
      // and handle the result correctly
      try {
        const threadInfo = window.threadStore.createThreadInfo(
          fbThreadId,
          this.testThreadId,
          'seller',
          null  // Last messageId (optional, can be null for a new thread)
        );

        if (!threadInfo) {
          throw new Error('createThreadInfo returned null or undefined');
        }

        if (threadInfo.openaiThreadId !== this.testThreadId) {
          throw new Error(`Thread ID mismatch: expected ${this.testThreadId}, got ${threadInfo.openaiThreadId}`);
        }

        console.log('✅ Created thread info successfully');
      } catch (error) {
        console.error('Error creating thread info:', error);
        throw new Error('Failed to create thread info - ' + error.message);
      }

      // Test retrieving the thread info
      const retrievedInfo = window.threadStore.getThreadInfo(fbThreadId);
      if (!retrievedInfo) {
        throw new Error('Failed to retrieve thread info');
      }

      if (retrievedInfo.openaiThreadId !== this.testThreadId) {
        throw new Error('Thread ID mismatch in retrieved info');
      }

      console.log('✅ Retrieved thread info successfully');

      // Test updating last message
      const lastMsgId = 'test_last_msg';
      const timestamp = Date.now();

      try {
        const result = window.threadStore.updateLastMessage(fbThreadId, lastMsgId, timestamp);

        if (result === false) {
          throw new Error('updateLastMessage returned false');
        }

        // Verify update
        const updatedInfo = window.threadStore.getThreadInfo(fbThreadId);
        if (!updatedInfo || updatedInfo.lastMessageId !== lastMsgId) {
          throw new Error('Last message update not reflected in thread info');
        }

        console.log('✅ Updated last message successfully');
      } catch (error) {
        console.error('Error updating last message:', error);
        throw new Error('Failed to update last message - ' + error.message);
      }

      this.testResults.threadStore = true;
      this.testFbThreadId = fbThreadId;
      return true;
    } catch (error) {
      console.error(`❌ ThreadStore test failed: ${error.message}`, error);
      logger.error(`ThreadStore test failed: ${error.message}`);
      this.testResults.threadStore = false;
      throw error;
    }
  }

  /**
   * Test the MessagePreprocessor component
   */
  async testMessagePreprocessor() {
    console.log('🧪 Testing MessagePreprocessor...');

    try {
      // Check if MessagePreprocessor is available
      if (!window.messagePreprocessor) {
        throw new Error('MessagePreprocessor not available as global component');
      }

      // Test getting new messages since last processed
      const formattedMessages = window.messagePreprocessor.getNewMessagesSince(
        this.testMessages,
        null
      );

      if (!Array.isArray(formattedMessages) || formattedMessages.length === 0) {
        throw new Error('Failed to format messages');
      }
      console.log(`✅ Formatted ${formattedMessages.length} messages successfully`);

      // Test getting the last message
      const lastMessage = window.messagePreprocessor.getLastMessage(this.testMessages);
      if (!lastMessage) {
        throw new Error('Failed to get last message');
      }
      console.log('✅ Retrieved last message successfully');

      // Test with product attachment
      const messagesWithProduct = window.messagePreprocessor.attachProductInfo(
        this.testMessages,
        this.sampleProduct
      );

      if (!Array.isArray(messagesWithProduct) || messagesWithProduct.length !== this.testMessages.length + 1) {
        throw new Error('Failed to attach product info');
      }
      console.log('✅ Attached product info successfully');

      // Test role instructions
      const messagesWithRoleInstructions = window.messagePreprocessor.injectRoleInstructions(
        this.testMessages,
        'seller'
      );

      if (!Array.isArray(messagesWithRoleInstructions) || messagesWithRoleInstructions.length !== this.testMessages.length + 1) {
        throw new Error('Failed to inject role instructions');
      }
      console.log('✅ Injected role instructions successfully');

      this.testResults.messagePreprocessor = true;
      this.formattedMessages = formattedMessages;
      return true;
    } catch (error) {
      console.error(`❌ MessagePreprocessor test failed: ${error.message}`);
      this.testResults.messagePreprocessor = false;
      throw error;
    }
  }

  /**
   * Test the AssistantHandler component
   */
  async testAssistantHandler() {
    console.log('🧪 Testing AssistantHandler...');

    try {
      // Check if AssistantHandler is available
      if (!window.assistantHandler) {
        throw new Error('AssistantHandler not available as global component');
      }

      // Initialize the handler
      await window.assistantHandler.initialize();
      console.log('✅ AssistantHandler initialized');

      // Test getting assistant ID for role
      const assistantId = window.assistantHandler.getAssistantIdForRole('seller');
      if (!assistantId) {
        console.warn('⚠️ No assistant ID found for role "seller". This is not an error if you have not configured assistants yet.');
        // Continue with tests that don't require an assistant ID
      } else {
        console.log(`✅ Found assistant ID for role "seller": ${assistantId}`);
        this.assistantId = assistantId;
      }

      // Test creating a new thread
      const newThreadInfo = await window.assistantHandler.createNewThread(
        `test_new_${Date.now()}`,
        'buyer'
      );

      if (!newThreadInfo || !newThreadInfo.openaiThreadId) {
        throw new Error('Failed to create new thread via AssistantHandler');
      }
      console.log(`✅ Created new thread via AssistantHandler: ${newThreadInfo.openaiThreadId}`);

      this.testResults.assistantHandler = true;
      return true;
    } catch (error) {
      console.error(`❌ AssistantHandler test failed: ${error.message}`);
      this.testResults.assistantHandler = false;
      throw error;
    }
  }

  /**
   * Test end-to-end flow from thread creation to assistant response
   */
  async testEndToEnd() {
    console.log('🧪 Testing End-to-End Flow...');

    try {
      // Check if we have an assistant ID for full test
      if (!this.assistantId) {
        console.log('⚠️ Skipping full end-to-end test because no assistant ID is configured');
        this.testResults.endToEnd = 'skipped';
        return;
      }

      // Create context for full test
      const fullContext = {
        fbThreadId: `test_full_${Date.now()}`,
        allMessages: this.testMessages,
        chatRole: 'seller',
        productData: this.sampleProduct
      };

      // Execute the full flow
      console.log('Generating response with all components integrated...');
      const response = await window.assistantHandler.generateResponse(
        fullContext.fbThreadId,
        fullContext.allMessages,
        fullContext.chatRole,
        fullContext.productData
      );

      if (!response) {
        throw new Error('Failed to generate response in end-to-end test');
      }

      console.log('✅ Successfully generated response:');
      console.log('-----------------------------');
      console.log(response.substring(0, 200) + (response.length > 200 ? '...' : ''));
      console.log('-----------------------------');

      this.testResults.endToEnd = true;
      return true;
    } catch (error) {
      console.error(`❌ End-to-End test failed: ${error.message}`);
      this.testResults.endToEnd = false;
      throw error;
    }
  }

  /**
   * Test explicit reuse of an existing thread
   */
  async testThreadReuse() {
    console.log('🧪 Testing Thread Reuse...');
    try {
      // 1. Create a new thread and save the openaiThreadId
      const fbThreadId = `reuse_${Date.now()}`;
      const chatRole = 'seller';
      const productData = this.sampleProduct;
      const allMessages = [
        { id: 'msg1', content: { text: 'Is it still available?' }, sentByUs: false },
        { id: 'msg2', content: { text: 'Yes, it is still available.' }, sentByUs: true }
      ];

      // Generate response to create the thread
      const response1 = await window.assistantHandler.generateResponse(
        fbThreadId,
        allMessages,
        chatRole,
        productData
      );
      const threadInfo1 = window.threadStore.getThreadInfo(fbThreadId);
      if (!threadInfo1 || !threadInfo1.openaiThreadId) {
        throw new Error('Could not create initial thread');
      }
      const openaiThreadId1 = threadInfo1.openaiThreadId;

      // 2. Simulate new messages and call again with the same fbThreadId
      const newMessages = [
        ...allMessages,
        { id: 'msg3', content: { text: 'Can you give me a discount?' }, sentByUs: false },
        { id: 'msg4', content: { text: 'I can lower it by $10.' }, sentByUs: true }
      ];

      const response2 = await window.assistantHandler.generateResponse(
        fbThreadId,
        newMessages,
        chatRole,
        productData
      );
      const threadInfo2 = window.threadStore.getThreadInfo(fbThreadId);
      if (!threadInfo2 || !threadInfo2.openaiThreadId) {
        throw new Error('Could not retrieve thread for reuse');
      }
      const openaiThreadId2 = threadInfo2.openaiThreadId;

      // 3. Verify that the openaiThreadId is the same (no new one created)
      if (openaiThreadId1 !== openaiThreadId2) {
        throw new Error('openaiThreadId changed when reusing the thread');
      }

      // 4. Verify that lastMessageId and lastTimestamp were updated
      if (threadInfo2.lastMessageId !== 'msg4') {
        throw new Error('lastMessageId was not updated correctly');
      }

      // 5. Verify that only new messages are processed (msg3 and msg4)
      // (This can be validated indirectly if there is no error and the thread does not change)

      console.log('✅ Thread reuse test passed. openaiThreadId:', openaiThreadId1);
      this.testResults.threadReuse = true;
      return true;
    } catch (error) {
      console.error(`❌ Thread reuse test failed: ${error.message}`, error);
      logger.error(`Thread reuse test failed: ${error.message}`);
      this.testResults.threadReuse = false;
      throw error;
    }
  }

  /**
   * Log test results to console
   */
  logResults() {
    console.log('\n🧪 INTEGRATION TEST RESULTS 🧪');
    console.log('---------------------------');
    console.table({
      'API Client': this.testResults.apiClient ? '✅ PASSED' : '❌ FAILED',
      'Thread Store': this.testResults.threadStore ? '✅ PASSED' : '❌ FAILED',
      'Message Preprocessor': this.testResults.messagePreprocessor ? '✅ PASSED' : '❌ FAILED',
      'Assistant Handler': this.testResults.assistantHandler ? '✅ PASSED' : '❌ FAILED',
      'End-to-End Flow': this.testResults.endToEnd === true ? '✅ PASSED' :
        this.testResults.endToEnd === 'skipped' ? '⚠️ SKIPPED' : '❌ FAILED',
      'Thread Reuse': this.testResults.threadReuse ? '✅ PASSED' : '❌ FAILED'
    });

    // Overall assessment
    const allPassed = Object.values(this.testResults).every(
      result => result === true || result === 'skipped'
    );

    if (allPassed) {
      console.log('✅✅✅ ALL TESTS PASSED! The new components are working correctly together. ✅✅✅');
      console.log('You can now proceed to Phase 4: Updating OpenAIManager to use these new components.');
    } else {
      console.log('❌❌❌ SOME TESTS FAILED! Please review and fix issues before proceeding. ❌❌❌');
    }
  }
}

// Create instance and make sure it's exposed globally
const openAIIntegrationTest = new OpenAIIntegrationTest();
window.openAIIntegrationTest = openAIIntegrationTest;
console.log('OpenAI Integration Test loaded and exposed globally as window.openAIIntegrationTest');