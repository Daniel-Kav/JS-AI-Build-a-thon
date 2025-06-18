import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const token = process.env["GITHUB_TOKEN"];
if (!token) {
  throw new Error('GITHUB_TOKEN environment variable is not set. Please set it with your GitHub Personal Access Token.');
}

const endpoint = "https://models.github.ai/inference";
// Using a model that's known to be available in GitHub Models
const modelName = "meta/Meta-Llama-3-8B-Instruct";
const imagePath = join(__dirname, 'contoso_layout_sketch.jpg');

console.log('Using model:', modelName);

// Function to get image description
async function getImageDescription(imagePath) {
  try {
    // For this example, we'll return a static description
    // In a real application, you would use a vision model to analyze the image
    return `A hand-drawn sketch of a website layout with the following elements:
    - A header with a logo on the left and navigation menu on the right
    - A hero section with a large heading and a call-to-action button
    - A features section with three columns of feature cards
    - A footer with contact information and social media links`;
  } catch (error) {
    console.error('Error getting image description:', error);
    throw error;
  }
}

// Function to save code to file
async function saveToFile(filename, content) {
  try {
    await writeFile(join(__dirname, filename), content, 'utf8');
    console.log(`Successfully saved ${filename}`);
  } catch (error) {
    console.error(`Error saving ${filename}:`, error);
    throw error;
  }
}

export async function main() {
  try {
    // Get a description of the image
    const imageDescription = await getImageDescription(imagePath);
    
    // Initialize the model client
    const client = ModelClient(
      endpoint,
      new AzureKeyCredential(token),
    );

    console.log('Sending request to the model...');
    
    // Prepare the prompt
    const prompt = `
    I have a hand-drawn sketch of a website with the following description:
    ${imageDescription}
    
    Please generate clean, responsive HTML and CSS code for this website.
    The website should be modern and professional.
    
    Requirements:
    1. Use semantic HTML5 elements
    2. Use CSS Grid or Flexbox for layout
    3. Make it responsive for different screen sizes
    4. Use a clean color scheme
    5. Include appropriate spacing and typography
    6. Add comments to explain the structure
    
    Return the code in this format:
    
    HTML:
    <!DOCTYPE html>...
    
    CSS:
    /* CSS code here */
    `;

    console.log('Sending request with image description...');
    
    // Prepare the request body
    const requestBody = {
      messages: [
        { 
          role: "system", 
          content: "You are a professional web developer. Your task is to convert website sketches into clean, responsive HTML and CSS code." 
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 4000,
      model: modelName
    };

    console.log('Sending request to model...');
    console.log('Model:', modelName);
    
    let response;
    try {
      // Send the request to the model
      response = await client.path("/chat/completions").post({
        body: requestBody
      });
      
      console.log('Received response status:', response.status);
      
      if (isUnexpected(response)) {
        console.error('Unexpected response:', response);
        throw new Error(`API returned unexpected status: ${response.status}`);
      }
      
      if (!response.body || !response.body.choices || response.body.choices.length === 0) {
        throw new Error('No choices returned in the response');
      }
    } catch (error) {
      console.error('Error making API request:');
      console.error('- Status:', error.statusCode || error.status || 'N/A');
      console.error('- Message:', error.message || 'No error message');
      console.error('- Response body:', error.body || error.response?.body || 'No response body');
      throw error;
    }

    const content = response.body.choices[0].message.content;
    
    // Extract HTML and CSS from the response
    const htmlMatch = content.match(/HTML:[\s\S]*?(<[\s\S]*?>)/i);
    const cssMatch = content.match(/CSS:([\s\S]*?)(?=HTML:|$)/i);
    
    let html = htmlMatch ? htmlMatch[1].trim() : '';
    let css = cssMatch ? cssMatch[1].trim() : '';
    
    // If the model didn't follow the format, try to extract HTML and CSS tags
    if (!html) {
      const htmlTagMatch = content.match(/<html[\s\S]*<\/html>/i);
      html = htmlTagMatch ? htmlTagMatch[0] : content;
    }
    
    if (!css && content.includes('</style>')) {
      const styleMatch = content.match(/<style[\s\S]*?<\/style>/i);
      css = styleMatch ? styleMatch[0].replace(/<[\/]?style[^>]*>/g, '').trim() : '';
    }
    
    // Save the generated code to files
    if (html) {
      await saveToFile('index.html', `<!DOCTYPE html>\n${html}`);
    }
    
    if (css) {
      // If the CSS is inside a style tag, extract just the CSS
      const cleanCss = css.replace(/<[\/]?style[^>]*>/g, '').trim();
      await saveToFile('styles.css', cleanCss);
    }
    
    console.log('\n🎉 Successfully generated files!');
    if (html) console.log('📄 index.html');
    if (css) console.log('🎨 styles.css');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch((err) => {
  console.error("The sample encountered an error:", err);
});