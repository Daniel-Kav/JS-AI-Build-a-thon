const axios = require('axios');
const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { marked } = require('marked');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const fetch = require('node-fetch');

// Configure DOMPurify
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Load environment variables from .env file
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

// Configure marked to use GitHub Flavored Markdown
marked.use({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false
});

// Log loaded environment variables (without sensitive data)
console.log('Environment variables loaded from:', envPath);
console.log('AZURE_OPENAI_ENDPOINT:', process.env.AZURE_OPENAI_ENDPOINT ? '*** Set ***' : 'Not set');
console.log('AZURE_OPENAI_DEPLOYMENT:', process.env.AZURE_OPENAI_DEPLOYMENT || 'Not set');
console.log('AZURE_OPENAI_API_VERSION:', process.env.AZURE_OPENAI_API_VERSION || 'Not set');
console.log('AZURE_OPENAI_API_KEY:', process.env.AZURE_OPENAI_API_KEY ? '*** Set ***' : 'Not set');

// Validate required environment variables
const requiredEnvVars = [
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_DEPLOYMENT',
  'AZURE_OPENAI_API_VERSION'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('Error: The following required environment variables are missing:');
  console.error(missingVars.join('\n'));
  console.error('Please check your .env file and try again.');
  process.exit(1);
}

const app = express();

// Configure CORS to allow requests from the frontend
const allowedOrigins = ['http://localhost:8000', 'http://127.0.0.1:8000'];
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(express.json());

const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, ''); // Remove trailing slash if present
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION;

app.post('/chat', async (req, res) => {
  console.log('--- /chat endpoint hit ---');
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('Environment variables:');
  console.log('- AZURE_OPENAI_ENDPOINT:', AZURE_OPENAI_ENDPOINT ? '*** Set ***' : 'Not set');
  console.log('- AZURE_OPENAI_DEPLOYMENT:', AZURE_OPENAI_DEPLOYMENT || 'Not set');
  console.log('- AZURE_OPENAI_API_VERSION:', AZURE_OPENAI_API_VERSION || 'Not set');
  console.log('- AZURE_OPENAI_API_KEY:', AZURE_OPENAI_API_KEY ? '*** Set ***' : 'Not set');
  
  try {
    const { messages } = req.body;
    const azureUrl = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;
    console.log('Sending request to Azure OpenAI endpoint:', azureUrl);
    const response = await fetch(azureUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_API_KEY,
      },
      body: JSON.stringify({
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });
    
    console.log('Azure response status:', response.status);
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Azure OpenAI error:', data);
      res.status(response.status).json({
        error: {
          message: data.error?.message || 'Error processing your request',
          code: data.error?.code || 'unknown_error',
          statusCode: response.status
        }
      });
      return;
    }

    // Log the raw Azure response for debugging
    console.log('Raw Azure response:', JSON.stringify(data, null, 2));
    
    // Check if streaming is requested
    const useStream = req.query.stream === 'true';
    
    if (useStream) {
      // For streaming responses, we need to send the response in chunks
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const content = data.choices?.[0]?.message?.content || '';
      const chunks = content.match(/[\s\S]{1,50}/g) || [content];
      
      for (const chunk of chunks) {
        const chunkResponse = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-3.5-turbo',
          choices: [
            {
              index: 0,
              delta: { content: chunk },
              finish_reason: null
            }
          ]
        };
        
        res.write(`data: ${JSON.stringify(chunkResponse)}\n\n`);
        // Add a small delay between chunks to simulate real streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Send the final done message
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    } else {
      // For non-streaming responses
      let content = data.choices?.[0]?.message?.content || '';
      
      // Convert markdown to HTML and sanitize it
      let htmlContent = marked.parse(content);
      
      // Sanitize the HTML to prevent XSS attacks
      htmlContent = DOMPurify.sanitize(htmlContent, {
        ALLOWED_TAGS: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'blockquote'],
        ALLOWED_ATTR: ['href', 'target', 'rel'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
      });
      
      // Add target="_blank" and rel="noopener noreferrer" to all links
      htmlContent = htmlContent.replace(/<a([^>]*)>/g, '<a$1 target="_blank" rel="noopener noreferrer">');
      
      const formattedResponse = {
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: htmlContent,  // Use sanitized HTML content
            originalContent: content,  // Keep original markdown content
            context: {
              data_points: [],
              thoughts: ''
            }
          },
          // The frontend expects these fields at the root level of the choice object
          text: content,  // Keep original text for backwards compatibility
          content: htmlContent,  // Use sanitized HTML content
          role: 'assistant',
          finish_reason: 'stop',
          // Add metadata about the content format
          metadata: {
            format: 'html',
            hasMarkdown: content !== htmlContent
          }
        }],
        object: 'chat.completion'
      };

      console.log('Formatted response:', JSON.stringify(formattedResponse, null, 2));
      res.json(formattedResponse);
    }
    
    // Set response headers
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    // Send the response
    res.json(formattedResponse);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ 
      error: {
        message: err.message,
        code: 'server_error',
        statusCode: 500
      }
    });
  }
});

// Handle CORS preflight requests
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }
  res.status(204).end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`)); 