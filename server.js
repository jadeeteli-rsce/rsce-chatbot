const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

// Store scraped website content
let websiteContent = '';

// URLs to scrape from RSCE website
const RSCE_URLS = [
  'https://www.rsce.es/',
  'https://www.rsce.es/quienes-somos/',
  'https://www.rsce.es/organigrama/',
  'https://www.rsce.es/socios-abonados/',
  'https://www.rsce.es/eventos-rsce/',
  'https://www.rsce.es/razas-espanolas/',
  'https://www.rsce.es/morfologia/',
  'https://www.rsce.es/agility/',
  'https://www.rsce.es/igp/',
  'https://www.rsce.es/obediencia/',
  'https://www.rsce.es/busqueda-y-rescate/',
  'https://www.rsce.es/rally-obediencia/',
  'https://www.rsce.es/grooming/',
  'https://www.rsce.es/salud-y-bienestar-rsce/',
  'https://www.rsce.es/criadores/',
  'https://www.rsce.es/criadores-premium/',
  'https://www.rsce.es/servicios-rsce/',
  'https://www.rsce.es/tramites-rsc/',
  'https://www.rsce.es/afijos/',
  'https://www.rsce.es/displasia/',
  'https://www.rsce.es/certificados-de-pedigree/',
  'https://www.rsce.es/tarifas/',
  'https://www.rsce.es/contacto-rsce/',
  'https://www.rsce.es/reglamentos_rsce/',
  'https://www.rsce.es/area-de-formaciones/',
  'https://www.rsce.es/noticias-rsce/',
  'https://www.rsce.es/jueces-de-la-rsce/',
  'https://www.rsce.es/faq/',
];

// Function to scrape website content
async function scrapeWebsite() {
  console.log('Starting to scrape RSCE website...');
  let allContent = '';

  for (const url of RSCE_URLS) {
    try {
      console.log(`Scraping: ${url}`);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      
      // Extract main content
      const title = $('title').text();
      const mainContent = $('main').text() || $('body').text();
      const description = $('meta[name="description"]').attr('content');

      allContent += `\n\n--- Page: ${title} ---\n`;
      allContent += `Description: ${description}\n`;
      allContent += mainContent.substring(0, 2000); // Limit to avoid too large content
      
    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
    }
  }

  websiteContent = allContent;
  console.log(`Scraped content length: ${websiteContent.length} characters`);
  return websiteContent;
}

// Scrape website on startup
scrapeWebsite().catch(err => console.error('Failed to scrape website:', err));

// Re-scrape every 24 hours
setInterval(scrapeWebsite, 24 * 60 * 60 * 1000);

// Chat endpoint with Google Gemini integration
app.post('/api/chat', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage || userMessage.trim() === '') {
    return res.json({
      reply: "Please ask me a question!",
      confidence: "none"
    });
  }

  // Check if we have website content
  if (!websiteContent) {
    return res.json({
      reply: "I'm still loading information from the RSCE website. Please try again in a moment.",
      confidence: "low"
    });
  }

  try {
    // Use Google Gemini to find relevant information and generate response
    const systemPrompt = `You are a helpful assistant for the RSCE (Real Sociedad Canina de España / Royal Canine Society of Spain) website. 
    
Based on the following website content, answer user questions accurately and helpfully. If the information is not in the provided content, say you don't have that specific information but suggest contacting RSCE directly.

Keep responses concise (2-3 sentences max) and friendly.

Website Content:
${websiteContent}`;

    const fullPrompt = systemPrompt + '\n\nUser Question: ' + userMessage;

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const reply = response.text();

    res.json({
      reply: reply,
      confidence: "high",
      source: "website-based"
    });

  } catch (error) {
    console.error('Error calling Google Gemini:', error);
    res.json({
      reply: "I encountered an error. Please try again or contact us at support@rsce.es",
      confidence: "low",
      error: error.message
    });
  }
});

// Endpoint to manually trigger re-scraping
app.post('/api/rescrape', async (req, res) => {
  try {
    await scrapeWebsite();
    res.json({ message: "Website content refreshed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'running',
    contentLoaded: websiteContent.length > 0,
    contentSize: websiteContent.length,
    aiProvider: 'Google Gemini'
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RSCE Chatbot is running on port ${PORT}`);
  console.log(`AI Provider: Google Gemini`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
