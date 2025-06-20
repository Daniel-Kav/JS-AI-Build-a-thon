import dotenv from 'dotenv';
dotenv.config();

import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

// Initialize Azure Inference client
const client = new ModelClient(
  process.env.AZURE_INFERENCE_SDK_ENDPOINT ?? "https://aistudioaiservices343581460336.services.ai.azure.com/models",
  new AzureKeyCredential(process.env.AZURE_INFERENCE_SDK_KEY ?? "5O6ZCyKF51TnueAJXJM3FQJ7GGaakZjgA6s9lSi31eojHPxfNWsHJQQJ99BFAC77bzfXJ3w3AAAAACOGNMKB")
);

// Define messages for the chat model
const messages = [
  { role: "system", content: "You are a helpful assistant" },
  { role: "user", content: "What are 3 things to see in Seattle?" },
];

async function run() {
  try {
    const response = await client.path("chat/completions").post({
      body: {
        messages: messages,
        max_tokens: 2048,
        temperature: 0.8,
        top_p: 0.1,
        presence_penalty: 0,
        frequency_penalty: 0,
        model: "Llama-4-Scout-17B-16E-Instruct",
      },
    });

    // ✅ Clean output
    const message = response.body?.choices?.[0]?.message?.content;
    if (message) {
      console.log("AI says:\n");
      console.log(message);
    } else {
      console.log("No message received from the model.");
    }
  } catch (error) {
    console.error("Something went wrong:", error.message || error);
  }
}

// Run the function
run();