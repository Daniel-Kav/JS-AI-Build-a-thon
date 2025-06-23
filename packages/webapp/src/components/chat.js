// File: webapp/src/components/chat.js

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
      ragEnabled: { type: Boolean }
    };
  }

  constructor() {
    super();
    this.messages = [];
    this.inputMessage = '';
    this.isLoading = false;
    this.isRetrieving = false;
    this.ragEnabled = true; // Enable by default
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.messages = loadMessages();
  }

  updated(changedProps) {
    if (changedProps.has('messages')) {
      saveMessages(this.messages);
      this.scrollToBottom();
    }
  }

  scrollToBottom() {
    const chatMessages = this.querySelector('.chat-messages');
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }
  
  render() {
    return html`
      <div class="chat-container">
        <div class="chat-header">
          <h3>AI Assistant</h3>
          <button class="clear-cache-btn" @click=${this._clearCache}>🧹 Clear Chat</button>
          <label class="rag-toggle">
            <input type="checkbox" ?checked=${this.ragEnabled} @change=${this._toggleRag}>
            Use Employee Handbook
          </label>
        </div>
        <div class="chat-messages">
          ${this.messages.map(message => html`
            <div class="message ${message.role === 'user' ? 'user-message' : 'ai-message'}">
              <div class="message-content">
                <span class="message-sender">${message.role === 'user' ? 'You' : 'AI'}</span>
                <p>${message.content}</p>
                ${this.ragEnabled && message.sources && message.sources.length > 0 ? html`
                  <details class="sources">
                    <summary>📚 Sources</summary>
                    <div class="sources-content">
                      ${message.sources.map(source => html`<p>${source}</p>`)}
                    </div>
                  </details>
                ` : ''}
              </div>
            </div>
          `)}
          ${this.isRetrieving ? html`
            <div class="message system-message">
              <p>📚 Searching employee handbook...</p>
            </div>
          ` : ''}
          ${this.isLoading && !this.isRetrieving ? html`
            <div class="message ai-message">
              <div class="message-content">
                <span class="message-sender">AI</span>
                <p class="thinking">Thinking<span>.</span><span>.</span><span>.</span></p>
              </div>
            </div>
          ` : ''}
        </div>
        <div class="chat-input">
          <input 
            type="text" 
            placeholder="Ask about company policies, benefits, etc..." 
            .value=${this.inputMessage}
            @input=${this._handleInput}
            @keyup=${this._handleKeyUp}
          />
          <button @click=${this._sendMessage} ?disabled=${this.isLoading || !this.inputMessage.trim()}>
            Send
          </button>
        </div>
      </div>
    `;
  }
  
  _clearCache() {
    clearMessages();
    this.messages = [];
  }

  _handleInput(e) {
    this.inputMessage = e.target.value;
  }

  _handleKeyUp(e) {
    if (e.key === 'Enter' && this.inputMessage.trim() && !this.isLoading) {
      this._sendMessage();
    }
  }

  _toggleRag(e) {
    this.ragEnabled = e.target.checked;
  }

  async _sendMessage() {
    if (!this.inputMessage.trim()) return;

    const userMessage = {
      role: 'user',
      content: this.inputMessage
    };

    this.messages = [...this.messages, userMessage];
    const userQuery = this.inputMessage;
    this.inputMessage = '';
    this.isLoading = true;
    if (this.ragEnabled) {
      this.isRetrieving = true;
    }

    try {
      const responseData = await this._apiCall(userQuery);
      this.isRetrieving = false; 

      if (responseData && responseData.reply) {
        this.messages = [
          ...this.messages,
          { role: 'assistant', content: responseData.reply, sources: responseData.sources }
        ];
      } else {
        throw new Error("Invalid response structure from backend.");
      }
    } catch (error) {
      console.error('Error calling model:', error);
      this.isRetrieving = false;
      this.messages = [
        ...this.messages,
        { role: 'assistant', content: `Sorry, I encountered an error: ${error.message}`, sources: [] }
      ];
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
                useRAG: this.ragEnabled 
            }),
        });

        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({ error: 'Failed to parse error response' }));
            throw new Error(errorBody.message || `Request failed with status ${res.status}`);
        }

        const data = await res.json();
        return data;
    } catch (err) {
        console.error("API call failed:", err);
        throw err;
    }
  }
}

customElements.define('chat-interface', ChatInterface);