const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/exam_analyzer';

// User Schema
const userSchema = new mongoose.Schema({
    id: { type: String, default: uuidv4, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    provider: { type: String, default: 'local' },
    verified: { type: Boolean, default: false },
    onboardingCompleted: { type: Boolean, default: false },
    examData: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Token Schema
const tokenSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    tokens: { type: Number, default: 0 },
    tokensUsed: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
});

// Token Usage History Schema
const tokenUsageSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    tokensUsed: { type: Number, required: true },
    action: { type: String, required: true },
    description: { type: String },
    examType: { type: String },
    subject: { type: String },
    topic: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// User Subject Schema
const userSubjectSchema = new mongoose.Schema({
    id: { type: String, default: uuidv4, unique: true },
    userId: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, default: 'optional' },
    createdAt: { type: Date, default: Date.now }
});

// Verification Token Schema
const verificationTokenSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    expiresAt: { type: Date, required: true }
});

// Create models
const User = mongoose.model('User', userSchema);
const Token = mongoose.model('Token', tokenSchema);
const TokenUsage = mongoose.model('TokenUsage', tokenUsageSchema);
const UserSubject = mongoose.model('UserSubject', userSubjectSchema);
const VerificationToken = mongoose.model('VerificationToken', verificationTokenSchema);

// Database connection
let isConnected = false;

const connectDB = async () => {
    if (isConnected) {
        console.log('✅ MongoDB already connected');
        return;
    }

    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        isConnected = true;
        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        throw error;
    }
};

const disconnectDB = async () => {
    if (isConnected) {
        await mongoose.disconnect();
        isConnected = false;
        console.log('✅ MongoDB disconnected');
    }
};

// User operations
const userOperations = {
    // Create user
    async createUser(userData) {
        const { email, password, name, provider = 'local' } = userData;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            throw new Error('User already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Auto-verify users in development mode
        const isDevelopment = process.env.NODE_ENV !== 'production';
        const autoVerify = isDevelopment || provider !== 'local';
        
        const user = new User({
            email,
            name,
            password: hashedPassword,
            provider,
            verified: autoVerify,
            onboardingCompleted: false
        });

        await user.save();

        // Create initial token balance
        const token = new Token({
            userId: user.id,
            tokens: 100 // Give 100 free tokens
        });
        await token.save();

        return {
            id: user.id,
            email: user.email,
            name: user.name,
            provider: user.provider,
            verified: user.verified,
            onboardingCompleted: user.onboardingCompleted
        };
    },

    // Find user by email
    async findUserByEmail(email) {
        return await User.findOne({ email });
    },

    // Find user by ID
    async findUserById(userId) {
        return await User.findOne({ id: userId });
    },

    // Update user onboarding
    async updateUserOnboarding(userId, examData) {
        if (!userId) {
            throw new Error('User ID is required for onboarding update.');
        }
        if (typeof examData === 'undefined') {
            throw new Error('Exam data is required for onboarding update.');
        }

        const user = await User.findOneAndUpdate(
            { id: userId },
            {
                examData: examData,
                onboardingCompleted: true,
                updatedAt: new Date()
            },
            { new: true }
        );

        return user;
    },

    // Verify email
    async verifyEmail(token) {
        const verificationToken = await VerificationToken.findOne({
            token,
            expiresAt: { $gt: new Date() }
        });

        if (!verificationToken) {
            throw new Error('Invalid or expired verification token');
        }

        const user = await User.findOneAndUpdate(
            { email: verificationToken.email },
            { verified: true, updatedAt: new Date() },
            { new: true }
        );

        // Delete verification token
        await VerificationToken.deleteOne({ token });

        return user;
    },

    // Create verification token
    async createVerificationToken(email, token) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        const verificationToken = new VerificationToken({
            token,
            email,
            expiresAt
        });

        await verificationToken.save();
    },

    // Clean expired verification tokens
    async cleanExpiredTokens() {
        await VerificationToken.deleteMany({
            expiresAt: { $lt: new Date() }
        });
    }
};

// Token operations
const tokenOperations = {
    // Get user tokens
    async getUserTokens(userId) {
        let token = await Token.findOne({ userId });
        
        if (!token) {
            // Create token record if it doesn't exist
            token = new Token({
                userId,
                tokens: 100,
                tokensUsed: 0
            });
            await token.save();
        }

        return {
            tokens_available: token.tokens,
            tokens_used: token.tokensUsed,
            last_updated: token.lastUpdated
        };
    },

    // Use tokens
    async useTokens(userId, amount, action, description, examType = null, subject = null, topic = null) {
        const token = await Token.findOne({ userId });
        
        if (!token) {
            throw new Error('Token record not found');
        }

        if (token.tokens < amount) {
            throw new Error('Insufficient tokens');
        }

        // Update token balance
        token.tokens -= amount;
        token.tokensUsed += amount;
        token.lastUpdated = new Date();
        await token.save();

        // Record usage
        const usage = new TokenUsage({
            userId,
            tokensUsed: amount,
            action,
            description,
            examType,
            subject,
            topic
        });
        await usage.save();

        return {
            tokens_available: token.tokens,
            tokens_used: token.tokensUsed
        };
    },

    // Get token usage history
    async getTokenUsageHistory(userId, limit = 50) {
        return await TokenUsage.find({ userId })
            .sort({ createdAt: -1 })
            .limit(limit);
    }
};

// Subject operations
const subjectOperations = {
    // Get user subjects
    async getUserSubjects(userId) {
        return await UserSubject.find({ userId }).sort({ createdAt: 1 });
    },

    // Add user subject
    async addUserSubject(userId, subjectData) {
        const subject = new UserSubject({
            userId,
            name: subjectData.name,
            type: subjectData.type || 'optional'
        });

        await subject.save();
        return subject;
    },

    // Update user subject
    async updateUserSubject(userId, subjectId, subjectData) {
        return await UserSubject.findOneAndUpdate(
            { id: subjectId, userId },
            {
                name: subjectData.name,
                type: subjectData.type || 'optional'
            },
            { new: true }
        );
    },

    // Delete user subject
    async deleteUserSubject(userId, subjectId) {
        return await UserSubject.findOneAndDelete({ id: subjectId, userId });
    }
};

// Analytics operations
const analyticsOperations = {
    // Track user action
    async trackAction(userId, action, examType = null, subject = null, topic = null, data = null) {
        // This can be expanded to track user analytics
        console.log('Action tracked:', { userId, action, examType, subject, topic });
    },

    // Get user analytics
    async getUserAnalytics(userId, limit = 100) {
        return await TokenUsage.find({ userId })
            .sort({ createdAt: -1 })
            .limit(limit);
    }
};

// Initialize database
const initializeDatabase = async () => {
    await connectDB();
    console.log('✅ Database initialized successfully');
};

// Close database connections
const closeDatabase = async () => {
    await disconnectDB();
};

// Export all operations
module.exports = {
    connectDB,
    disconnectDB,
    initializeDatabase,
    closeDatabase,
    userOperations,
    tokenOperations,
    subjectOperations,
    analyticsOperations,
    User,
    Token,
    TokenUsage,
    UserSubject,
    VerificationToken
};
