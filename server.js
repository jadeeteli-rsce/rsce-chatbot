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

// Inicializar cliente Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Almacenar contenido del sitio web
let websiteContent = '';

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

async function scrapeWebsite() {
  console.log('Iniciando extracción del sitio web de la RSCE...');
  let allContent = '';

  for (const url of RSCE_URLS) {
    try {
      console.log(`Extrayendo: ${url}`);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });

      const $ = cheerio.load(response.data);
      const title = $('title').text();
      const mainContent = $('main').text() || $('body').text();
      const description = $('meta[name="description"]').attr('content');

      allContent += `\n\n--- Página: ${title} ---\n`;
      allContent += `Descripción: ${description}\n`;
      allContent += mainContent.substring(0, 2000);

    } catch (error) {
      console.error(`Error al extraer ${url}:`, error.message);
    }
  }

  websiteContent = allContent;
  console.log(`Longitud del contenido extraído: ${websiteContent.length} caracteres`);
  return websiteContent;
}

scrapeWebsite().catch(err => console.error('Error al extraer el sitio web:', err));
setInterval(scrapeWebsite, 24 * 60 * 60 * 1000);

app.post('/api/chat', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage || userMessage.trim() === '') {
    return res.json({ reply: "¡Por favor, escribe una pregunta!", confidence: "none" });
  }

  if (!websiteContent) {
    return res.json({
      reply: "Todavía estoy cargando la información del sitio web de la RSCE. Por favor, inténtalo de nuevo en un momento.",
      confidence: "low"
    });
  }

  try {
    const prompt = `Eres un asistente virtual de la RSCE (Real Sociedad Canina de España). 
Responde SIEMPRE en español, independientemente del idioma en que te hagan la pregunta.
Basándote en el contenido del sitio web, responde las preguntas de forma precisa y amable. Sé conciso (máximo 2-3 frases).

Contenido del sitio web:
${websiteContent}

Pregunta del usuario: ${userMessage}`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    res.json({ reply, confidence: "high", source: "basado-en-web" });

  } catch (error) {
    console.error('Error al llamar a Gemini:', error.message);
    res.json({
      reply: "Ha ocurrido un error. Por favor, inténtalo de nuevo o contáctanos en info@rsce.es",
      confidence: "low",
      error: error.message
    });
  }
});

app.post('/api/rescrape', async (req, res) => {
  try {
    await scrapeWebsite();
    res.json({ message: "Contenido del sitio web actualizado correctamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'activo',
    contenidoCargado: websiteContent.length > 0,
    tamanoContenido: websiteContent.length,
    proveedorIA: 'Google Gemini (gemini-2.5-flash)'
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Chatbot RSCE ejecutándose en el puerto ${PORT}`);
  console.log(`Proveedor de IA: Google Gemini (gemini-2.5-flash)`);
  console.log(`Abre http://localhost:${PORT} en tu navegador`);
});