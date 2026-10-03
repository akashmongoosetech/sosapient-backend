const mongoose = require('mongoose');
const Blog = require('../models/blog.model');
require('dotenv').config();

const sampleBlogs = [
  {
    title: 'The Future of Web Development: Trends to Watch in 2025',
    excerpt: 'Explore the latest trends shaping the future of web development, from AI integration to new frameworks and tools that are revolutionizing how we build applications.',
    content: `
      <h2>Web development is evolving at a breathtaking pace</h2>
      <p>As we step into 2025, developers, businesses, and tech enthusiasts are keeping a keen eye on the innovations shaping the web. This blog explores the most promising and transformative web development trends to watch in 2025.</p>
      
      <h3>1. AI-Powered Web Development</h3>
      <p>Artificial Intelligence is not just a buzzword anymore—it's at the core of modern web experiences. AI-powered code generation tools like GitHub Copilot are reducing development time significantly.</p>
      
      <h3>2. WebAssembly (WASM) Goes Mainstream</h3>
      <p>WebAssembly allows code written in languages like C++, Rust, or Go to run at near-native speed in the browser, reshaping the boundaries of web performance.</p>
      
      <h3>3. JAMstack & Headless Architecture</h3>
      <p>The shift toward JAMstack (JavaScript, APIs, Markup) and headless CMSs is becoming standard, providing better performance, scalability, and security.</p>
      
      <h3>4. Serverless and Edge Computing</h3>
      <p>Serverless computing is transforming the backend by abstracting away server management, while edge computing processes data closer to users.</p>
      
      <p>The future isn't just about adopting the latest tools, but about solving human problems through efficient, ethical, and scalable technology.</p>
    `,
    image: 'https://images.pexels.com/photos/270408/pexels-photo-270408.jpeg?auto=compress&cs=tinysrgb&w=800&h=400&dpr=1',
    author: {
      name: 'Akash Raikwar',
      email: 'akash@sosapient.com',
      image: 'https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1'
    },
    category: 'Technology',
    tags: ['Web Development', 'AI', 'WebAssembly', 'JAMstack', 'Serverless'],
    status: 'published',
    featured: true
  },
  {
    title: 'Building Scalable Mobile Apps: Best Practices and Strategies',
    excerpt: 'Learn the essential strategies for building mobile applications that can scale with your growing user base and handle millions of users seamlessly.',
    content: `
      <h2>Mobile app scalability is crucial for success</h2>
      <p>As your user base grows, your mobile application must be able to handle increased load without compromising performance or user experience.</p>
      
      <h3>1. Choose the Right Architecture</h3>
      <p>Microservices architecture allows you to scale individual components independently, making your app more resilient and maintainable.</p>
      
      <h3>2. Optimize Database Performance</h3>
      <p>Use database indexing, caching strategies, and consider NoSQL databases for better horizontal scaling capabilities.</p>
      
      <h3>3. Implement Efficient Caching</h3>
      <p>Use Redis or Memcached for session storage and frequently accessed data to reduce database load.</p>
      
      <h3>4. Load Balancing and CDN</h3>
      <p>Distribute traffic across multiple servers and use Content Delivery Networks to serve static assets faster.</p>
      
      <p>Building scalable mobile apps requires careful planning, the right technology choices, and continuous monitoring and optimization.</p>
    `,
    image: 'https://images.pexels.com/photos/699122/pexels-photo-699122.jpeg?auto=compress&cs=tinysrgb&w=800&h=400&dpr=1',
    author: {
      name: 'Ritu Chouhan',
      email: 'ritu@sosapient.com',
      image: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1'
    },
    category: 'Mobile Development',
    tags: ['Mobile Apps', 'Scalability', 'Architecture', 'Performance'],
    status: 'published',
    featured: false
  },
  {
    title: 'UI/UX Design Principles That Drive User Engagement',
    excerpt: 'Discover the key design principles that create engaging user experiences and drive business success through thoughtful interface design.',
    content: `
      <h2>Great design is invisible</h2>
      <p>The best user interfaces are those that users don't have to think about. They just work intuitively and help users accomplish their goals effortlessly.</p>
      
      <h3>1. Consistency is Key</h3>
      <p>Maintain consistent visual elements, interactions, and terminology throughout your application to reduce cognitive load.</p>
      
      <h3>2. Prioritize Accessibility</h3>
      <p>Design for all users, including those with disabilities. Use proper color contrast, keyboard navigation, and screen reader compatibility.</p>
      
      <h3>3. Mobile-First Approach</h3>
      <p>Start designing for mobile devices first, then scale up to larger screens. This ensures optimal experience across all devices.</p>
      
      <h3>4. User Feedback and Testing</h3>
      <p>Regularly conduct user testing and gather feedback to continuously improve your design decisions.</p>
      
      <p>Remember, good design is not just about how it looks, but how it works and how it makes users feel.</p>
    `,
    image: 'https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg?auto=compress&cs=tinysrgb&w=800&h=400&dpr=1',
    author: {
      name: 'Mike Johnson',
      email: 'mike@sosapient.com',
      image: 'https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1'
    },
    category: 'Design',
    tags: ['UI/UX', 'Design', 'User Experience', 'Accessibility'],
    status: 'published',
    featured: true
  },
  {
    title: 'Implementing AI in Modern Web Applications',
    excerpt: 'A comprehensive guide to integrating artificial intelligence features into your web applications for enhanced user experience.',
    content: `
      <h2>AI is transforming web applications</h2>
      <p>From chatbots to recommendation systems, AI is becoming an integral part of modern web applications, enhancing user experience and business value.</p>
      
      <h3>1. Chatbots and Virtual Assistants</h3>
      <p>Implement intelligent chatbots using natural language processing to provide 24/7 customer support and improve user engagement.</p>
      
      <h3>2. Personalization Engines</h3>
      <p>Use machine learning algorithms to analyze user behavior and provide personalized content, product recommendations, and experiences.</p>
      
      <h3>3. Predictive Analytics</h3>
      <p>Leverage AI to predict user behavior, market trends, and business outcomes to make data-driven decisions.</p>
      
      <h3>4. Computer Vision</h3>
      <p>Integrate image recognition and computer vision capabilities for features like visual search, content moderation, and augmented reality.</p>
      
      <p>The key to successful AI integration is starting small, focusing on specific use cases, and gradually expanding as you learn and improve.</p>
    `,
    image: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=800&h=400&dpr=1',
    author: {
      name: 'Emily Chen',
      email: 'emily@sosapient.com',
      image: 'https://images.pexels.com/photos/1181519/pexels-photo-1181519.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1'
    },
    category: 'AI/ML',
    tags: ['AI', 'Machine Learning', 'Web Development', 'Chatbots'],
    status: 'published',
    featured: false
  },
  {
    title: 'Cybersecurity Best Practices for Modern Applications',
    excerpt: 'Essential security measures every developer should implement to protect applications and user data from cyber threats.',
    content: `
      <h2>Security should be built-in, not bolted-on</h2>
      <p>In today's digital landscape, cybersecurity is not optional. It must be integrated into every aspect of application development from the ground up.</p>
      
      <h3>1. Secure Authentication</h3>
      <p>Implement multi-factor authentication, strong password policies, and secure session management to protect user accounts.</p>
      
      <h3>2. Data Encryption</h3>
      <p>Encrypt sensitive data both in transit and at rest using industry-standard encryption algorithms and protocols.</p>
      
      <h3>3. Input Validation and Sanitization</h3>
      <p>Always validate and sanitize user inputs to prevent SQL injection, XSS attacks, and other common vulnerabilities.</p>
      
      <h3>4. Regular Security Audits</h3>
      <p>Conduct regular security assessments, penetration testing, and code reviews to identify and fix vulnerabilities.</p>
      
      <p>Remember, security is an ongoing process, not a one-time implementation. Stay updated with the latest threats and security practices.</p>
    `,
    image: 'https://images.pexels.com/photos/60504/security-protection-anti-virus-software-60504.jpeg?auto=compress&cs=tinysrgb&w=800&h=400&dpr=1',
    author: {
      name: 'David Rodriguez',
      email: 'david@sosapient.com',
      image: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1'
    },
    category: 'Cybersecurity',
    tags: ['Security', 'Cybersecurity', 'Authentication', 'Encryption'],
    status: 'published',
    featured: false
  }
];

const seedBlogs = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing blogs
    await Blog.deleteMany({});
    console.log('Cleared existing blogs');

    // Insert sample blogs
    const blogs = await Blog.insertMany(sampleBlogs);
    console.log(`Inserted ${blogs.length} sample blogs`);

    console.log('Blog seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding blogs:', error);
    process.exit(1);
  }
};

// Run the seeder
if (require.main === module) {
  seedBlogs();
}

module.exports = seedBlogs;
