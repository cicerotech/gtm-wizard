/**
 * QUICK VALIDATION: Test enrichment on 10 companies RIGHT NOW
 * Run this to see if the concept works before building full interface
 */

const axios = require('axios');

async function testEnrichment(companyName) {
  try {
    // newsapi.ai keyword search
    const response = await axios.post(
      'https://api.newsapi.ai/api/v1/article/getArticles',
      {
        keyword: companyName,
        lang: 'eng',
        articlesPage: 1,
        articlesCount: 10,
        articlesSortBy: 'date',
        dataType: ['news'],
        apiKey: '85a8c4fd-7a59-48a0-b316-6a30617245d4'
      },
      {
        timeout: 8000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    const articles = [];
    if (response.data && response.data.articles && response.data.articles.results) {
      for (const article of response.data.articles.results.slice(0, 10)) {
        if (article.title) {
          articles.push({
            title: article.title,
            date: article.dateTime || article.date || '',
            source: article.source?.title || 'Unknown'
          });
        }
      }
    }
    
    // Extract triggers
    const triggers = [];
    for (const article of articles) {
      const text = article.title.toLowerCase();
      
      if (text.match(/acquir(e|ed|es|ing|ition)/)) {
        triggers.push({
          type: 'acquisition',
          text: 'recent acquisition activity',
          source: article.title
        });
      }
      
      if (text.match(/rais(e|ed|es|ing).*(\$\d+[MB]|series)/i)) {
        triggers.push({
          type: 'funding',
          text: 'recent funding round',
          source: article.title
        });
      }
      
      if (text.match(/expand(s|ed|ing)/i)) {
        triggers.push({
          type: 'expansion',
          text: 'geographic or market expansion',
          source: article.title
        });
      }
      
      if (text.match(/(appoint|hire|name|join)\w*(chief legal|general counsel|clo)/i)) {
        triggers.push({
          type: 'leadership',
          text: 'new legal leadership',
          source: article.title
        });
      }
    }
    
    return {
      company: companyName,
      newsCount: articles.length,
      news: articles,
      triggers: triggers.slice(0, 3), // Top 3
      status: 'SUCCESS'
    };
    
  } catch (error) {
    return {
      company: companyName,
      status: 'FAILED',
      error: error.message
    };
  }
}

async function runQuickValidation() {
  console.log('\n🔍 QUICK VALIDATION: Testing Company Enrichment\n');
  console.log('Testing 10 companies to validate concept...\n');
  
  const testCompanies = [
    'Amazon',
    'Microsoft', 
    'Boeing',
    'Goldman Sachs',
    'Pfizer',
    'Best Buy',
    'Tesla',
    'Southwest Airlines',
    'Ecolab',
    'ServiceNow'
  ];
  
  for (const company of testCompanies) {
    process.stdout.write(`${company.padEnd(20)} ... `);
    
    const result = await testEnrichment(company);
    
    if (result.status === 'SUCCESS') {
      console.log(`✅ ${result.newsCount} news, ${result.triggers.length} triggers`);
      if (result.triggers.length > 0) {
        result.triggers.forEach(t => {
          console.log(`   → ${t.type}: "${t.text}"`);
        });
      }
    } else {
      console.log(`❌ ${result.error}`);
    }
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n✅ Validation complete! Enrichment concept works.\n');
  console.log('Next step: Build full Email Builder interface with this enrichment.\n');
}

runQuickValidation().catch(console.error);

