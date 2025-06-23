// File: packages/webapi/server.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

// --- Updated LangChain Imports for Agent ---
import { AzureChatOpenAI } from "@langchain/openai";
import { BufferMemory } from "langchain/memory";
import { ChatMessageHistory } from "langchain/stores/message/in_memory";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const pdfPath = path.join(projectRoot, "data/employee_handbook.pdf");

// This single client will be used for both Basic AI and the Agent
const chatModel = new AzureChatOpenAI({
  azureOpenAIApiKey: process.env.AZURE_INFERENCE_SDK_KEY,
  azureOpenAIApiEndpoint: process.env.AZURE_INFERENCE_SDK_ENDPOINT,
  azureOpenAIApiInstanceName: process.env.INSTANCE_NAME,
  azureOpenAIApiDeploymentName: process.env.DEPLOYMENT_NAME,
  azureOpenAIApiVersion: "2024-02-15-preview",
  temperature: 0.7,
});

const sessionHistories = {};

function getSessionHistory(sessionId) {
  if (!sessionHistories[sessionId]) {
    sessionHistories[sessionId] = new ChatMessageHistory();
  }
  return sessionHistories[sessionId];
}

// PDF helper functions (loadPDF, retrieveRelevantContent) remain the same
// ... (omitted for brevity, they are still in the file)
async function loadPDF() {
  if (pdfText) return pdfText;
  if (!fs.existsSync(pdfPath)) { throw new Error("Employee handbook PDF not found."); }
  const dataBuffer = fs.readFileSync(pdfPath);
  pdfText = (await pdfParse(dataBuffer)).text;
  let currentChunk = ""; const words = pdfText.split(/\s+/);
  for (const word of words) {
    if ((currentChunk + " " + word).length <= CHUNK_SIZE) { currentChunk += (currentChunk ? " " : "") + word; } else { pdfChunks.push(currentChunk); currentChunk = word; }
  }
  if (currentChunk) pdfChunks.push(currentChunk);
  return pdfText;
}
function retrieveRelevantContent(query) {
  const queryTerms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 3).map((term) => term.replace(/[.,?!;:()"']/g, ""));
  if (queryTerms.length === 0) return [];
  const scoredChunks = pdfChunks.map((chunk) => {
    const chunkLower = chunk.toLowerCase(); let score = 0;
    for (const term of queryTerms) {
      const regex = new RegExp(term, "gi"); const matches = chunkLower.match(regex);
      if (matches) score += matches.length;
    } return { chunk, score };
  });
  return scoredChunks.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((item) => item.chunk);
}
// --- End of PDF Functions ---

// --- New LangChain Agent Setup ---
const agentPrompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful agent who loves emojis 😊. Be friendly and concise in your responses."],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
  new MessagesPlaceholder("agent_scratchpad"),
]);

// Note: We are not adding any tools yet, as per your request to skip Step 3
const tools = []; 

const agent = await createOpenAIToolsAgent({
  llm: chatModel,
  tools,
  prompt: agentPrompt,
});

const agentExecutor = new AgentExecutor({
  agent,
  tools,
  verbose: true, // Set to true to see agent thoughts in the console
});
// --- End of Agent Setup ---

app.post("/chat", async (req, res) => {
  try {
    const { message: userMessage, sessionId = "default_session", mode = "basic", useRAG = true } = req.body;
    const chat_history = await getSessionHistory(sessionId).getMessages();

    if (mode === "agent") {
      console.log("Routing to LangChain Agent...");
      const result = await agentExecutor.invoke({
        input: userMessage,
        chat_history,
      });

      await getSessionHistory(sessionId).addMessages([
        new HumanMessage(userMessage),
        new AIMessage(result.output),
      ]);
      
      return res.json({ reply: result.output, sources: [] });
    }

    // --- Existing Basic AI + RAG logic ---
    console.log("Routing to Basic AI Service...");
    let sources = [];
    if (useRAG) {
      await loadPDF();
      sources = retrieveRelevantContent(userMessage);
    }
    const systemMessageContent = useRAG ? (sources.length > 0 ? `Use ONLY the following information...\n${sources.join("\n\n")}` : `Politely say you don't know.`) : "You are a helpful assistant.";
    
    const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemMessageContent],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"],
    ]);

    const chain = prompt.pipe(chatModel);
    const response = await chain.invoke({
        input: userMessage,
        chat_history,
    });

    await getSessionHistory(sessionId).addMessages([
        new HumanMessage(userMessage),
        new AIMessage(response.content),
    ]);
    
    res.json({ reply: response.content, sources });

  } catch (err) {
    console.error("An error occurred in the /chat endpoint:", err);
    res.status(500).json({ error: "Server error", message: err.message, reply: "Sorry, I encountered a server error." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`AI API server running on port ${PORT}`);
});