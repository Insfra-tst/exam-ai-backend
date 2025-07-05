const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const database = require('./database-mongo');

// Export verificationTokens for external access (disabled)
module.exports.verificationTokens = new Map();

// Email functions disabled
const createTransporter = () => {
    console.log('⚠️  Email functions disabled');
    return null;
};

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET || 'default_jwt_secret', { expiresIn: '7d' });
};

// Verify JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
    } catch (error) {
        return null;
    }
};

// Hash password
const hashPassword = async (password) => {
    return await bcrypt.hash(password, 12);
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

// Send verification email (disabled)
const sendVerificationEmail = async (email, token) => {
    console.log('⚠️  Email verification disabled');
    return true; // Return true to avoid blocking signup
};

// Create user using MongoDB
const createUser = async (userData) => {
    const { email, password, name, provider = 'local' } = userData;
    
    try {
        const user = await database.userOperations.createUser({
            email,
            password,
            name,
            provider
        });

        // Email verification disabled - mark as verified
        if (provider === 'local') {
            await database.userOperations.updateUserVerification(user.id, true);
        }

        return user;
    } catch (error) {
        throw error;
    }
};

// Find user by email using MongoDB
const findUserByEmail = async (email) => {
    try {
        return await database.userOperations.findUserByEmail(email);
    } catch (error) {
        console.error('Error finding user by email:', error);
        return null;
    }
};

// Find user by ID using MongoDB
const findUserById = async (userId) => {
    try {
        return await database.userOperations.findUserById(userId);
    } catch (error) {
        console.error('Error finding user by ID:', error);
        return null;
    }
};

// Verify email (disabled)
const verifyEmail = (token) => {
    console.log('⚠️  Email verification disabled');
    throw new Error('Email verification is disabled');
};

// Update user onboarding data using MongoDB
const updateUserOnboarding = async (userId, examData) => {
    try {
        return await database.userOperations.updateUserOnboarding(userId, examData);
    } catch (error) {
        throw error;
    }
};

// Subject management using MongoDB
const getUserSubjects = async (userId) => {
    try {
        const user = await database.userOperations.findUserById(userId);
        return user.subjects || [];
    } catch (error) {
        throw error;
    }
};

const addUserSubject = async (userId, subjectData) => {
    try {
        return await database.userOperations.addUserSubject(userId, subjectData);
    } catch (error) {
        throw error;
    }
};

const updateUserSubject = async (userId, subjectId, subjectData) => {
    try {
        return await database.userOperations.updateUserSubject(userId, subjectId, subjectData);
    } catch (error) {
        throw error;
    }
};

const deleteUserSubject = async (userId, subjectId) => {
    try {
        return await database.userOperations.deleteUserSubject(userId, subjectId);
    } catch (error) {
        throw error;
    }
};

// Middleware to authenticate requests
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Verify user exists
    const user = await findUserById(decoded.userId);
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
};

// Middleware to require email verification (disabled)
const requireVerification = (req, res, next) => {
    console.log('⚠️  Email verification requirement disabled');
    next(); // Skip verification requirement
};

// Middleware to require onboarding completion
const requireOnboarding = (req, res, next) => {
    if (!req.user.onboardingCompleted) {
        return res.status(403).json({ error: 'Onboarding not completed' });
    }
    next();
};

module.exports = {
    generateToken,
    verifyToken,
    hashPassword,
    comparePassword,
    sendVerificationEmail,
    createUser,
    findUserByEmail,
    findUserById,
    verifyEmail,
    updateUserOnboarding,
    getUserSubjects,
    addUserSubject,
    updateUserSubject,
    deleteUserSubject,
    authenticateToken,
    requireVerification,
    requireOnboarding
}; 