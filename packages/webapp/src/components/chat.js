// File: packages/webapp/src/components/chat.js

import { LitElement, html } from 'lit';
import { loadMessages, saveMessages, clearMessages } from '../utils/chatStore.js';
import './chat.css';

export class ChatInterface extends LitElement {
  static get properties() {
    return {
      messages: { type: Array },
      inputMessage: { type: String },
      isLoading: { type: Boolean },
      isRetrieving: { type: Boolean },
      ragEnabled: { type: Boolean },
      sessionId: { type: String },
      chatMode: { type: String }
    };
  }

  constructor() {
    super();
    this.messages = [];
    this.inputMessage = '';
    this.isLoading = false;
    this.isRetrieving = false;
    this.ragEnabled = true;
    this.chatMode = "basic";
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  createRenderRoot() { return this; }
  connectedCallback() { super.connectedCallback(); this.messages = loadMessages(); }
  updated(changedProps) { if (changedProps.has('messages')) { saveMessages(this.messages); this.scrollToBottom(); } }
  scrollToBottom() { const el = this.querySelector('.chat-messages'); if (el) { el.scrollTop = el.scrollHeight; } }

  _clearCache() {
    clearMessages();
    this.messages = [];
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  _handleInput(e) { this.inputMessage = e.target.value; }
  _handleKeyUp(e) { if (e.key === 'Enter' && this.inputMessage.trim() && !this.isLoading) { this._sendMessage(); } }
  _toggleRag(e) { this.ragEnabled = e.target.checked; }

  _handleModeChange(e) {
    const newMode = e.target.value;
    if (newMode !== this.chatMode) {
      this.chatMode = newMode;
      if (newMode === 'agent') {
        this.ragEnabled = false;
      }
      this._clearCache(); // Clear messages and start new session when mode changes
    }
  }
  
  render() {
    return html`
      <div class="chat-container">
        <div class="chat-header">
          <h3>${this.chatMode === 'agent' ? 'AI Agent' : 'AI Assistant'}</h3>
          
          <div class="mode-selector">
            <label>Mode:</label>
            <select @change=${this._handleModeChange} .value=${this.chatMode}>
              <option value="basic">Basic AI</option>
              <option value="agent">Agent</option>
            </select>
          </div>

          <label class="rag-toggle ${this.chatMode === 'agent' ? 'disabled' : ''}">
            <input type="checkbox" ?checked=${this.ragEnabled} @change=${this._toggleRag} ?disabled=${this.chatMode === 'agent'}>
            Use Handbook
          </label>

          <button class="clear-cache-btn" @click=${this._clearCache}>🧹 Clear</button>
        </div>
        <div class="chat-messages">
          ${this.messages.map(message => html`
            <div class="message ${message.role === 'user' ? 'user-message' : 'ai-message'}">
              <div class="message-content">
                <span class="message-sender">${message.role === 'user' ? 'You' : (this.chatMode === 'agent' ? 'Agent' : 'AI')}</span>
                <p>${message.content}</p>
                ${this.ragEnabled && message.sources && message.sources.length > 0 ? html`
                  <details class="sources"><summary>📚 Sources</summary><div class="sources-content">${message.sources.map(source => html`<p>${source}</p>`)}</div></details>
                ` : ''}
              </div>
            </div>
          `)}
          ${this.isRetrieving ? html`<div class="message system-message"><p>📚 Searching employee handbook...</p></div>` : ''}
          ${this.isLoading && !this.isRetrieving ? html`<div class="message ai-message"><div class="message-content"><span class="message-sender">${this.chatMode === 'agent' ? 'Agent' : 'AI'}</span><p class="thinking">Thinking<span>.</span><span>.</span><span>.</span></p></div></div>` : ''}
        </div>
        <div class="chat-input">
          <input 
            type="text" 
            placeholder=${this.chatMode === 'basic' ? "Ask about company policies..." : "Ask agent a question..."}
            .value=${this.inputMessage}
            @input=${this._handleInput}
            @keyup=${this._handleKeyUp}
          />
          <button @click=${this._sendMessage} ?disabled=${this.isLoading || !this.inputMessage.trim()}>Send</button>
        </div>
      </div>
    `;
  }

  async _sendMessage() {
    if (!this.inputMessage.trim()) return;
    const userMessage = { role: 'user', content: this.inputMessage };
    this.messages = [...this.messages, userMessage];
    const userQuery = this.inputMessage;
    this.inputMessage = '';
    this.isLoading = true;
    if (this.ragEnabled && this.chatMode === 'basic') {
      this.isRetrieving = true;
    }
    try {
      const responseData = await this._apiCall(userQuery);
      this.isRetrieving = false;
      if (responseData && responseData.reply) {
        this.messages = [ ...this.messages, { role: 'assistant', content: responseData.reply, sources: responseData.sources }];
      } else { throw new Error("Invalid response from backend."); }
    } catch (error) {
      console.error('Error calling model:', error);
      this.isRetrieving = false;
      this.messages = [ ...this.messages, { role: 'assistant', content: `Sorry, I encountered an error: ${error.message}`, sources: [] }];
    } finally {
      this.isLoading = false;
    }
  }

  async _apiCall(message) {
    try {
      const res = await fetch("http://localhost:3001/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message,
          useRAG: this.ragEnabled,
          sessionId: this.sessionId,
          mode: this.chatMode
        }),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: 'Failed to parse error response' }));
        throw new Error(errorBody.message || `Request failed with status ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error("API call failed:", err);
      throw err;
    }
  }
}

customElements.define('chat-interface', ChatInterface);