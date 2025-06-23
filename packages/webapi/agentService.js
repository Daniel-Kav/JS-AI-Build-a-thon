// File: packages/webapi/agentService.js

import { AIProjectsClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import dotenv from "dotenv";

dotenv.config();

const agentThreads = {};

export class AgentService {
  constructor() {
    console.log("--- [DEBUG] Initializing AgentService ---");
    const hubEndpoint = process.env.AI_HUB_ENDPOINT;

    // This console log will show us exactly what the code is reading from your .env file
    console.log("[DEBUG] AI_HUB_ENDPOINT from .env:", hubEndpoint);

    if (!hubEndpoint) {
      // This will stop the server with a clear error if the endpoint is missing
      throw new Error(
        "CRITICAL ERROR: AI_HUB_ENDPOINT is not defined in your .env file. Please check the file and variable name."
      );
    }

    // This is the correct way to initialize the client using the endpoint
    this.client = new AIProjectsClient(
      hubEndpoint,
      new DefaultAzureCredential()
    );
    
    // Make sure to paste your Agent ID here
    this.agentId = "asst_h5WYZHuzh2aK7XsiEtiFN1YS";
    console.log("[DEBUG] AgentService initialized for agent ID:", this.agentId);
    console.log("-----------------------------------------");
  }

  async getOrCreateThread(sessionId) {
    // ... (The rest of the file is the same)
    if (!agentThreads[sessionId]) {
      const thread = await this.client.agents.createThread();
      agentThreads[sessionId] = thread.id;
      return thread.id;
    }
    return agentThreads[sessionId];
  }

  async processMessage(sessionId, message) {
    try {
      if (!this.agentId || !this.agentId.startsWith("asst_")) {
        throw new Error("Agent ID is not configured correctly in agentService.js");
      }
      const threadId = await this.getOrCreateThread(sessionId);

      await this.client.agents.createMessage(threadId, {
        role: "user",
        content: message,
      });

      let run = await this.client.agents.createRun(threadId, this.agentId);
      
      while (run.status === "queued" || run.status === "in_progress") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        run = await this.client.agents.getRun(threadId, run.id);
      }
      
      if (run.status !== "completed") {
        console.error(`Run failed with status: ${run.status}`);
        return { reply: `Sorry, the agent encountered an error (${run.status}). Please try again.` };
      }
      
      const messages = await this.client.agents.listMessages(threadId);
      const assistantMessages = messages.data.filter(msg => msg.role === "assistant").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      if (assistantMessages.length === 0) {
        return { reply: "The agent did not provide a response. Please try again." };
      }

      let responseText = "";
      for (const contentItem of assistantMessages[0].content) {
        if (contentItem.type === "text") {
          responseText += contentItem.text.value;
        }
      }
      
      return { reply: responseText };
    } catch (error) {
      console.error("Agent processing error:", error);
      return { reply: "Sorry, I encountered an error processing your agent request." };
    }
  }
}