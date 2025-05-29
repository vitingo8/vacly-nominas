// Test script for Voyage 3.5 Lite
const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

async function testVoyage() {
  console.log('🧪 Testing Voyage 3.5 Lite...');
  
  const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
  const VOYAGE_MODEL = 'voyage-3.5-lite';
  
  try {
    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: ['Test text for embedding dimensions'],
        model: VOYAGE_MODEL,
        input_type: 'document'
      })
    });

    if (!response.ok) {
      throw new Error(`Voyage AI error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;
    
    console.log('✅ Voyage 3.5 Lite response received');
    console.log(`📏 Embedding dimensions: ${embedding.length}`);
    console.log(`🔢 First 5 values: [${embedding.slice(0, 5).map(n => n.toFixed(4)).join(', ')}...]`);
    
    if (embedding.length === 512) {
      console.log('🎉 Perfect! Voyage 3.5 Lite produces 512 dimensions as expected');
    } else {
      console.log(`⚠️ Unexpected dimension count: ${embedding.length}`);
    }
    
  } catch (error) {
    console.error('❌ Error testing Voyage:', error.message);
  }
}

testVoyage(); 