require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import modules
const database = require('./database-mongo');
const TokenManager = require('./token-manager');
const PaymentProcessor = require('./payment-processor');

// Import routes
const authRoutes = require('./auth-routes');
const paymentRoutes = require('./payment-routes');

const app = express();

// Render.com configuration
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration for Render.com - More permissive for development
app.use(cors({
    origin: true, // Allow all origins for now
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With']
}));

// Additional CORS headers for preflight requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, Accept, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        version: '1.0.0',
        database: 'MongoDB Atlas',
        platform: 'Render.com'
    });
});

// API routes
app.use('/auth', authRoutes);
app.use('/payment', paymentRoutes);

// Token balance endpoint
app.get('/tokens/balance', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const auth = require('./auth');
        const decoded = auth.verifyToken(token);
        if (!decoded || !decoded.userId) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const tokenManager = new TokenManager(database);
        const userTokens = await tokenManager.getUserTokens(decoded.userId);
        res.json({
            success: true,
            tokens: userTokens
        });
    } catch (error) {
        console.error('Error getting token balance:', error);
        res.status(500).json({ error: 'Failed to get token balance' });
    }
});

// Token history endpoint
app.get('/tokens/history', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const auth = require('./auth');
        const decoded = auth.verifyToken(token);
        if (!decoded || !decoded.userId) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const tokenManager = new TokenManager(database);
        const history = await tokenManager.getTokenUsageHistory(decoded.userId);
        res.json({
            success: true,
            history: history
        });
    } catch (error) {
        console.error('Error getting token history:', error);
        res.status(500).json({ error: 'Failed to get token history' });
    }
});

// OpenAI analysis endpoint
app.post('/api/analyze', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const auth = require('./auth');
        const decoded = auth.verifyToken(token);
        if (!decoded || !decoded.userId) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { examData, analysisType } = req.body;

        if (!examData || !analysisType) {
            return res.status(400).json({ error: 'Exam data and analysis type are required' });
        }

        // Check token balance
        const tokenManager = new TokenManager(database);
        const userTokens = await tokenManager.getUserTokens(decoded.userId);
        
        const tokenCost = process.env[`TOKEN_COST_${analysisType.toUpperCase()}`] || 20;
        
        if (userTokens.tokens_available < tokenCost) {
            return res.status(402).json({ error: 'Insufficient tokens' });
        }

        // Use tokens
        await tokenManager.useTokens(
            decoded.userId,
            tokenCost,
            analysisType,
            `Analysis: ${analysisType}`,
            examData.examType,
            examData.subject,
            examData.topic
        );

        // Perform OpenAI analysis
        const { OpenAI } = require('openai');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        const prompt = `Analyze this exam data for ${analysisType}:
        Exam Type: ${examData.examType}
        Subject: ${examData.subject}
        Topic: ${examData.topic}
        Questions: ${examData.questions}
        
        Provide detailed analysis and insights.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1000
        });

        const analysis = completion.choices[0].message.content;

        res.json({
            success: true,
            analysis,
            tokensUsed: tokenCost,
            remainingTokens: userTokens.tokens_available - tokenCost
        });

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message 
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    database.closeDatabase();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    database.closeDatabase();
    process.exit(0);
});

// Start server
async function startServer() {
    try {
        // Initialize MongoDB database
        await database.initializeDatabase();
        console.log('✅ MongoDB database initialized successfully');
        
        // Start server
        app.listen(PORT, () => {
            console.log('🚀 Render.com API server running on port', PORT);
            console.log('🌍 Environment:', process.env.NODE_ENV || 'production');
            console.log('🔐 CORS enabled for Vercel frontend');
            console.log('🌐 Health check available at /health');
            console.log('📊 Database: MongoDB Atlas');
            console.log('🤖 OpenAI API configured');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer(); 