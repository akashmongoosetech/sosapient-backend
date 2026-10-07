const express = require('express');
const router = express.Router();
const { rateLimit } = require('../middleware/rateLimit');
const { fetchWithTimeout } = require('../utils/http');

// Legacy endpoint: kept for backward compat. New assistant features use /api/chatbot (Gemini+RAG).

// AI Chat endpoint using Hugging Face Inference API
router.post('/ai-chat', rateLimit({ windowMs: 60000, max: 15 }), async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0 || message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message is required (1-2000 chars)'
      });
    }

    // Build context for the AI with conversation history
    let context = `You are a helpful customer support assistant for SoSapient, a technology blog and web development company. 

About SoSapient:
- We provide technology blog articles, tutorials, and insights
- We cover web development, AI/ML, cybersecurity, and business trends
- Our website is sosapient.in
- We offer free content to help developers and businesses
- Contact email: hr.sosapient@gmail.com

Guidelines:
- Be helpful, friendly, and professional
- Provide accurate information about SoSapient
- If you don't know something specific, direct users to contact hr.sosapient@gmail.com
- Keep responses concise but informative
- Focus on SoSapient's services and content

`;

    // Add conversation history for context
    if (conversationHistory.length > 0) {
      context += "Previous conversation:\n";
      conversationHistory.slice(-6).forEach(msg => { // Keep last 6 messages for context
        context += `${msg.isUser ? 'User' : 'Assistant'}: ${msg.text}\n`;
      });
      context += "\n";
    }

    context += `User: ${message}\nAssistant:`;

    // Try multiple AI APIs for better reliability
    let aiResponse = '';
    
    // Try Hugging Face API first (free tier)
    if (process.env.HUGGINGFACE_API_KEY) {
      try {
        const hfResponse = await fetchWithTimeout(
          'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              inputs: String(context).slice(0, 4000),
              parameters: {
                max_length: 200,
                temperature: 0.7,
                do_sample: true,
                pad_token_id: 50256
              }
            }),
          },
          12000
        );

        if (hfResponse.ok) {
          const hfData = await hfResponse.json();

          if (hfData && hfData[0] && hfData[0].generated_text) {
            // Extract only the new response part
            aiResponse = hfData[0].generated_text.replace(context, '').trim();
          }

          if (aiResponse && aiResponse.length > 10) {
            return res.json({
              success: true,
              response: aiResponse.slice(0, 2000),
              source: 'huggingface'
            });
          }
        }
      } catch (hfError) {
        // fall through to local fallback
      }
    }

    // Try alternative free AI API (Cohere free tier)
    try {
      const smartResponse = generateSmartResponse(String(message).slice(0, 2000), Array.isArray(conversationHistory) ? conversationHistory.slice(-6) : []);
      if (smartResponse) {
        return res.json({
          success: true,
          response: smartResponse,
          source: 'smart_predefined'
        });
      }
    } catch (altError) {
      // fall through to predefined
    }

    // Fallback to predefined responses if AI API fails
    const response = getPredefinedResponse(message);
    
    res.json({
      success: true,
      response: response,
      source: 'predefined'
    });

  } catch (error) {
    console.error('Chat API error');
    res.status(500).json({
      success: false,
      message: 'Sorry, I encountered an error. Please try again or contact hr.sosapient@gmail.com for assistance.'
    });
  }
});

// Smart response generator with more dynamic responses
function generateSmartResponse(userMessage, conversationHistory = []) {
  const message = userMessage.toLowerCase();
  
  // Web development related questions
  if (message.includes('web') || message.includes('website') || message.includes('build')) {
    const webResponses = [
      "Great question about web development! At SoSapient, we cover modern web technologies like React, Node.js, and full-stack development. We have detailed tutorials on building responsive websites, implementing APIs, and best practices for web development. Would you like me to guide you to specific topics?",
      "Building a website is an exciting journey! We have comprehensive guides on web development covering frontend frameworks like React, backend technologies like Node.js, and database integration. Our blog includes step-by-step tutorials for beginners and advanced developers. What specific aspect of web development interests you most?",
      "Web development is one of our core topics at SoSapient! We provide tutorials on HTML/CSS, JavaScript frameworks, responsive design, and modern development tools. Whether you're a beginner or experienced developer, our content can help you build better websites. Are you looking for frontend, backend, or full-stack guidance?"
    ];
    return webResponses[Math.floor(Math.random() * webResponses.length)];
  }
  
  // AI/ML related questions
  if (message.includes('ai') || message.includes('machine learning') || message.includes('ml') || message.includes('artificial intelligence')) {
    const aiResponses = [
      "AI and Machine Learning are fascinating fields we cover extensively! Our blog includes tutorials on Python for ML, neural networks, data science, and practical AI applications. We also discuss the latest AI trends and how businesses can leverage AI technology. What aspect of AI interests you most?",
      "Artificial Intelligence is transforming technology! At SoSapient, we share insights on machine learning algorithms, AI implementation, and real-world applications. From beginner-friendly introductions to advanced concepts, we have content for all levels. Are you interested in learning AI development or understanding AI applications?",
      "Machine Learning is a key focus area for us! We provide tutorials on popular ML frameworks, data preprocessing, model training, and deployment strategies. Our content helps both beginners and professionals understand and implement AI solutions. What specific ML topic would you like to explore?"
    ];
    return aiResponses[Math.floor(Math.random() * aiResponses.length)];
  }
  
  // Business/startup related
  if (message.includes('business') || message.includes('startup') || message.includes('entrepreneur')) {
    const businessResponses = [
      "Business and entrepreneurship are important topics we cover! Our blog includes insights on startup strategies, business development, digital transformation, and how technology can drive business growth. We share practical advice for entrepreneurs and business leaders. What business aspect interests you?",
      "Great to hear you're interested in business! SoSapient covers the intersection of technology and business, including startup advice, digital marketing, business automation, and growth strategies. We help entrepreneurs understand how to leverage technology for business success. Are you planning to start a business?",
      "Entrepreneurship and business development are exciting areas! We provide content on business planning, technology adoption, market analysis, and scaling strategies. Our goal is to help business owners and entrepreneurs make informed decisions about technology. What specific business challenge are you facing?"
    ];
    return businessResponses[Math.floor(Math.random() * businessResponses.length)];
  }
  
  // Positive responses
  if (message.includes('good') || message.includes('great') || message.includes('awesome') || message.includes('nice')) {
    const positiveResponses = [
      "Thank you! I'm glad you found that helpful. Is there anything else about SoSapient's content or services you'd like to know more about?",
      "I'm happy to help! Feel free to ask me about any of our technology topics, tutorials, or services. What would you like to explore next?",
      "Great to hear! We have lots more valuable content on web development, AI/ML, cybersecurity, and business topics. What interests you most?",
      "Wonderful! Our team works hard to provide quality content. Is there a specific technology or topic you'd like to learn more about?"
    ];
    return positiveResponses[Math.floor(Math.random() * positiveResponses.length)];
  }
  
  // Learning/tutorial requests
  if (message.includes('learn') || message.includes('tutorial') || message.includes('how to') || message.includes('guide')) {
    const learningResponses = [
      "Perfect! Learning is what we're all about at SoSapient. We have comprehensive tutorials on web development, programming languages, AI/ML, and more. Our step-by-step guides are designed for practical learning. What technology or skill would you like to learn?",
      "I love that you're eager to learn! Our blog is packed with tutorials covering React, Node.js, Python, machine learning, cybersecurity, and business technology. Each tutorial includes practical examples and real-world applications. What specific topic interests you?",
      "Learning new technologies is exciting! SoSapient offers detailed guides and tutorials for developers and tech enthusiasts. From beginner-friendly introductions to advanced concepts, we cover it all. What would you like to start learning today?"
    ];
    return learningResponses[Math.floor(Math.random() * learningResponses.length)];
  }
  
  return null; // Return null if no smart response found
}

// Predefined responses as fallback
function getPredefinedResponse(userMessage) {
  const message = userMessage.toLowerCase();
  
  if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
    return "Hello! Welcome to SoSapient. I'm here to help you with any questions about our technology blog, services, or website. How can I assist you today?";
  }
  
  if (message.includes('what is sosapient') || message.includes('about sosapient')) {
    return "SoSapient is a technology blog platform where we share insights about web development, AI/ML, cybersecurity, and business trends. We provide valuable content to help developers and businesses stay updated with the latest technologies.";
  }
  
  if (message.includes('services') || message.includes('what do you offer')) {
    return "We offer:\n• Technology blog articles and tutorials\n• Web development insights\n• AI/ML content\n• Cybersecurity tips\n• Business and startup guidance\n• Latest tech trends and analysis\n\nAll our content is free to access!";
  }
  
  if (message.includes('contact') || message.includes('reach') || message.includes('email')) {
    return "You can reach us at:\n📧 Email: hr.sosapient@gmail.com\n🌐 Website: sosapient.in\n\nFeel free to contact us for any inquiries or collaboration opportunities!";
  }
  
  if (message.includes('blog') || message.includes('articles') || message.includes('posts')) {
    return "Our blog covers various topics including:\n• Web Development (React, Node.js, etc.)\n• Mobile Development\n• AI/ML and Data Science\n• Cybersecurity\n• Business and Entrepreneurship\n• Technology Tutorials\n\nYou can browse all our articles on the blog page!";
  }
  
  if (message.includes('pricing') || message.includes('cost') || message.includes('free')) {
    return "All our blog content is completely free to read! We believe in sharing knowledge and helping the tech community grow. No subscription fees or hidden costs.";
  }
  
  if (message.includes('help') || message.includes('support')) {
    return "I'm here to help! You can ask me about:\n• Our services and content\n• How to navigate the website\n• Technical topics we cover\n• Contact information\n• General questions about SoSapient\n\nWhat specific help do you need?";
  }
  
  if (message.includes('thank') || message.includes('thanks')) {
    return "You're welcome! I'm glad I could help. If you have any other questions about SoSapient or our content, feel free to ask anytime! 😊";
  }
  
  // Default response
  return "I'd be happy to help you with that! For specific technical questions or detailed inquiries, you might want to:\n\n• Browse our blog articles for in-depth content\n• Contact us directly at hr.sosapient@gmail.com\n• Check our latest posts for similar topics\n\nIs there anything specific about SoSapient or our services I can help clarify?";
}

module.exports = router;
