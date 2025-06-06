// src/services/WebhookService.js - Fixed version with request isolation
import { io } from 'socket.io-client';

class WebhookService {
  constructor() {
    this.socket = null;
    this.listeners = new Map(); // Key: requirementId, Value: callback
    this.requestListeners = new Map(); // Key: requestId, Value: callback
    this.activeRequests = new Map(); // Key: requirementId, Value: Set of requestIds
    
    this.baseURL = this.getServerURL();
    this.connected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    
    console.log(`🌐 WebhookService configured for: ${this.baseURL}`);
  }

  getServerURL() {
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
      return 'http://localhost:3001';
    }
    
    return `${window.location.protocol}//${window.location.hostname}`;
  }

  connect() {
    if (this.socket && this.connected) {
      console.log('🔌 Already connected to webhook backend');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      console.log(`🔌 Connecting to webhook backend at ${this.baseURL}...`);
      
      const socketOptions = {
        transports: ['websocket', 'polling'],
        timeout: 15000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        upgrade: true,
        rememberUpgrade: false,
        path: '/socket.io/'
      };

      this.socket = io(this.baseURL, socketOptions);

      this.socket.on('connect', () => {
        console.log('✅ Connected to webhook backend');
        console.log(`🔗 Socket ID: ${this.socket.id}`);
        console.log(`🚀 Transport: ${this.socket.io.engine.transport.name}`);
        
        this.connected = true;
        this.connectionAttempts = 0;
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from webhook backend:', reason);
        this.connected = false;
      });

      this.socket.on('webhook-received', (data) => {
        console.log('🔔 Webhook broadcast received:', data);
        this.handleWebhookData(data);
      });

      this.socket.on('test-results', (data) => {
        console.log('📋 Test results received:', data);
        this.handleWebhookData({ 
          data, 
          requirementId: data.requirementId,
          requestId: data.requestId 
        });
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ WebSocket connection error:', error);
        this.connectionAttempts++;
        
        if (error.message.includes('websocket error')) {
          console.warn('💡 WebSocket upgrade failed, using polling transport');
        }
        
        if (this.connectionAttempts >= this.maxConnectionAttempts) {
          console.error('🚨 Max connection attempts reached');
          reject(new Error(`Failed to connect after ${this.maxConnectionAttempts} attempts`));
        }
      });

      setTimeout(() => {
        if (!this.connected) {
          console.error('⏰ Connection timeout');
          reject(new Error('Connection timeout'));
        }
      }, 20000);
    });
  }

  async checkBackendHealth() {
    try {
      const healthUrl = `${this.baseURL}/api/webhook/health`;
      console.log(`🏥 Health check: ${healthUrl}`);
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Backend healthy:', {
          status: data.status,
          connectedClients: data.connectedClients || 0,
          storedResults: data.storedResults || 0,
          activeRequests: data.activeRequests || []
        });
        return true;
      } else {
        console.warn(`⚠️ Backend health check failed: ${response.status}`);
        return false;
      }
    } catch (error) {
      if (error.name === 'TimeoutError') {
        console.error('❌ Backend health timeout (8s)');
      } else {
        console.error('❌ Backend unreachable:', error.message);
      }
      return false;
    }
  }

  // FIXED: Subscribe to both requirement and specific request
  subscribeToRequirement(requirementId, callback) {
    console.log(`📝 Subscribing to requirement: ${requirementId}`);
    this.listeners.set(requirementId, callback);
    
    if (this.socket && this.connected) {
      this.socket.emit('subscribe-requirement', requirementId);
    }
  }

  // NEW: Subscribe to specific request for precise targeting
  subscribeToRequest(requestId, callback) {
    console.log(`📝 Subscribing to specific request: ${requestId}`);
    this.requestListeners.set(requestId, callback);
    
    if (this.socket && this.connected) {
      this.socket.emit('subscribe-request', requestId);
    }
  }

  // FIXED: Register a new test execution request
  registerTestExecution(requirementId, requestId) {
    console.log(`📝 Registering test execution: ${requirementId} -> ${requestId}`);
    
    if (!this.activeRequests.has(requirementId)) {
      this.activeRequests.set(requirementId, new Set());
    }
    this.activeRequests.get(requirementId).add(requestId);
    
    // Subscribe to this specific request
    if (this.socket && this.connected) {
      this.socket.emit('subscribe-request', requestId);
    }
  }

  unsubscribeFromRequirement(requirementId) {
    console.log(`📝 Unsubscribing from requirement: ${requirementId}`);
    this.listeners.delete(requirementId);
    
    if (this.socket && this.connected) {
      this.socket.emit('unsubscribe-requirement', requirementId);
    }
  }

  // NEW: Unsubscribe from specific request
  unsubscribeFromRequest(requestId) {
    console.log(`📝 Unsubscribing from specific request: ${requestId}`);
    this.requestListeners.delete(requestId);
    
    if (this.socket && this.connected) {
      this.socket.emit('unsubscribe-request', requestId);
    }
  }

  // FIXED: Handle webhook data with both requirement and request targeting
  handleWebhookData(webhookEvent) {
    const { requirementId, requestId, data } = webhookEvent;
    
    // Try request-specific callback first (more precise)
    if (requestId) {
      const requestCallback = this.requestListeners.get(requestId);
      if (requestCallback) {
        console.log(`🎯 Executing request-specific callback for: ${requestId}`);
        requestCallback(data);
        return;
      }
    }
    
    // Fall back to requirement callback
    const requirementCallback = this.listeners.get(requirementId);
    if (requirementCallback) {
      console.log(`🎯 Executing requirement callback for: ${requirementId}`);
      requirementCallback(data);
    }
  }

  // FIXED: Fetch results by requestId (more precise)
  async fetchResultsByRequestId(requestId) {
    try {
      const response = await fetch(`${this.baseURL}/api/test-results/request/${requestId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Retrieved results for request: ${requestId}`);
        return data;
      } else if (response.status === 404) {
        console.log(`📭 No results found for request: ${requestId}`);
        return null;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching results for request ${requestId}:`, error);
      throw error;
    }
  }

  // Fetch latest results for a requirement (might return cached results)
  async fetchLatestResultsForRequirement(requirementId) {
    try {
      const response = await fetch(`${this.baseURL}/api/test-results/${requirementId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Retrieved latest results for requirement: ${requirementId}`);
        return data;
      } else if (response.status === 404) {
        console.log(`📭 No results found for requirement: ${requirementId}`);
        return null;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching latest results for requirement ${requirementId}:`, error);
      throw error;
    }
  }

  // FIXED: Poll for results with requestId support
  async pollForResults(requestId, maxAttempts = 5, intervalMs = 3000) {
    console.log(`🔄 Polling for results: ${requestId} (max ${maxAttempts} attempts)`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const results = await this.fetchResultsByRequestId(requestId);
        
        if (results) {
          console.log(`✅ Poll successful on attempt ${attempt}`);
          return results;
        }
        
        if (attempt < maxAttempts) {
          console.log(`⏳ Attempt ${attempt}/${maxAttempts} - waiting ${intervalMs}ms`);
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      } catch (error) {
        console.error(`❌ Poll attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }
    }
    
    console.log(`❌ Polling failed after ${maxAttempts} attempts`);
    return null;
  }

  async testWebhook(requirementId = 'REQ-TEST') {
    try {
      console.log(`🧪 Testing webhook for: ${requirementId}`);
      
      const response = await fetch(`${this.baseURL}/api/test-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId,
          results: [
            {
              id: 'TC_001',
              name: 'Test Backend Webhook',
              status: 'Passed',
              duration: 1000,
              logs: 'Backend webhook test completed successfully'
            }
          ]
        }),
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Test webhook successful:', result);
        return true;
      } else {
        throw new Error(`Test failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Test webhook error:', error);
      throw error;
    }
  }

  // FIXED: Clear results for a specific request
  async clearResults(requestId) {
    try {
      const response = await fetch(`${this.baseURL}/api/test-results/request/${requestId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`🗑️ Cleared results for request: ${requestId}`);
        return result;
      } else {
        throw new Error(`Clear failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`❌ Error clearing results for request ${requestId}:`, error);
      throw error;
    }
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting from webhook backend');
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.listeners.clear();
      this.requestListeners.clear();
      this.activeRequests.clear();
    }
  }

  isConnected() {
    return this.connected;
  }

  getBaseURL() {
    return this.baseURL;
  }

  // FIXED: Get active request IDs for a requirement
  getActiveRequestIds(requirementId) {
    return this.activeRequests.get(requirementId) || new Set();
  }
}

// Singleton instance
const webhookService = new WebhookService();

// Auto-initialization
if (typeof window !== 'undefined') {
  webhookService.checkBackendHealth()
    .then(isHealthy => {
      if (isHealthy) {
        return webhookService.connect();
      } else {
        console.log('⚠️ Backend not available - using fallback mode');
        return Promise.resolve();
      }
    })
    .then(() => {
      if (webhookService.isConnected()) {
        console.log('🎉 Real-time webhook system ready!');
      } else {
        console.log('📡 App running in polling mode (no real-time updates)');
      }
    })
    .catch(error => {
      console.warn('🔄 Webhook system unavailable:', error.message);
      console.log('💡 App will work normally but without real-time updates');
    });
  
  // Debug helpers
  window.webhookService = webhookService;
  window.testWebhook = (reqId) => webhookService.testWebhook(reqId);
  
  // Enhanced diagnostics
  window.webhookDiagnostics = async () => {
    console.log('🔍 Running webhook diagnostics...');
    console.log('Base URL:', webhookService.getBaseURL());
    console.log('Connected:', webhookService.isConnected());
    console.log('Active Requests:', Object.fromEntries(webhookService.activeRequests));
    
    try {
      const isHealthy = await webhookService.checkBackendHealth();
      console.log('Backend healthy:', isHealthy);
      
      if (!webhookService.isConnected() && isHealthy) {
        console.log('🔄 Attempting reconnection...');
        await webhookService.connect();
      }
    } catch (error) {
      console.error('Diagnostics failed:', error);
    }
  };
}

export default webhookService;