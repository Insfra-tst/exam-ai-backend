const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const database = require('./database');

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET || 'default_jwt_secret_change_in_production', { expiresIn: '7d' });
};

// Verify JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret_change_in_production');
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

// Create user
const createUser = async (userData) => {
    const { email, password, name, provider = 'local' } = userData;
    
    const autoVerify = process.env.NODE_ENV !== 'production' || provider !== 'local';
    const hashedPassword = password ? await hashPassword(password) : null;
    
    const user = await database.createUser({
        id: uuidv4(),
        email,
        password: hashedPassword,
        name,
        provider,
        verified: autoVerify ? 1 : 0
    });

    return user;
};

// Find user by email
const findUserByEmail = async (email) => {
    return await database.findUserByEmail(email);
};

// Find user by ID
const findUserById = async (userId) => {
    return await database.findUserById(userId);
};

// Update user onboarding data
const updateUserOnboarding = async (userId, examData) => {
    return await database.updateUserOnboarding(userId, examData);
};

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }

    const user = await findUserById(decoded.userId);
    if (!user) {
        return res.status(403).json({ error: 'User not found' });
    }

    req.user = user;
    next();
};

// Require verification middleware
const requireVerification = (req, res, next) => {
    if (!req.user.verified) {
        return res.status(403).json({ error: 'Email verification required' });
    }
    next();
};

// Require onboarding middleware
const requireOnboarding = (req, res, next) => {
    if (!req.user.onboarding_completed) {
        return res.status(403).json({ error: 'Onboarding required' });
    }
    next();
};

module.exports = {
    createUser,
    findUserByEmail,
    findUserById,
    getUserById: findUserById,
    updateUserOnboarding,
    authenticateToken,
    requireVerification,
    requireOnboarding,
    generateToken,
    verifyToken,
    comparePassword
}; 