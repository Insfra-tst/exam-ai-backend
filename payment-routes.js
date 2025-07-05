const express = require('express');
const router = express.Router();
const paymentProcessor = require('./payment-processor');
const tokenManager = require('./token-manager');
const auth = require('./auth');

// Middleware to check if user is authenticated
const requireAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const decoded = await auth.verifyToken(token);
        
        if (!decoded || !decoded.id) {
            return res.status(401).json({ error: 'Invalid token - user not found' });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Get token pricing information
router.get('/pricing', (req, res) => {
    try {
        const pricing = tokenManager.getTokenPricing();
        res.json({
            success: true,
            pricing: pricing
        });
    } catch (error) {
        console.error('Error getting pricing:', error);
        res.status(500).json({ error: 'Failed to get pricing information' });
    }
});

// Get user's token balance
router.get('/tokens', requireAuth, async (req, res) => {
    try {
        const userTokens = await tokenManager.getUserTokens(req.user.id);
        const pricing = tokenManager.getTokenPricing();
        
        res.json({
            success: true,
            tokens: userTokens,
            pricing: pricing
        });
    } catch (error) {
        console.error('Error getting user tokens:', error);
        res.status(500).json({ error: 'Failed to get token balance' });
    }
});

// Get token usage history
router.get('/tokens/history', requireAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const history = await tokenManager.getTokenUsageHistory(req.user.id, limit);
        
        res.json({
            success: true,
            history: history
        });
    } catch (error) {
        console.error('Error getting token history:', error);
        res.status(500).json({ error: 'Failed to get token history' });
    }
});

// Get token statistics
router.get('/tokens/statistics', requireAuth, async (req, res) => {
    try {
        const statistics = await tokenManager.getTokenStatistics(req.user.id);
        
        res.json({
            success: true,
            statistics: statistics
        });
    } catch (error) {
        console.error('Error getting token statistics:', error);
        res.status(500).json({ error: 'Failed to get token statistics' });
    }
});

// Process token purchase with fake payment
router.post('/purchase', requireAuth, async (req, res) => {
    try {
        const { cardNumber, expMonth, expYear, cvc, cardholderName, tokenAmount } = req.body;
        
        if (!cardNumber || !expMonth || !expYear || !cvc || !cardholderName) {
            return res.status(400).json({ error: 'All payment fields are required' });
        }

        const pricing = tokenManager.getTokenPricing();
        
        // Default to 100 tokens if not specified
        const tokensToPurchase = tokenAmount || 100;
        const amount = pricing.prices[tokensToPurchase] || 9.99; // Default price

        const paymentData = {
            cardNumber: cardNumber.replace(/\s+/g, ''),
            expMonth,
            expYear,
            cvc,
            amount,
            tokensToPurchase
        };

        const result = await paymentProcessor.processFakePayment(req.user.id, paymentData);
        
        res.json({
            success: true,
            message: 'Payment processed successfully',
            data: result
        });

    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(400).json({ 
            error: error.message || 'Payment processing failed' 
        });
    }
});

// Get fake card suggestions for testing
router.get('/test-cards', (req, res) => {
    try {
        const cards = paymentProcessor.getFakeCardSuggestions();
        res.json({
            success: true,
            cards: cards,
            note: 'These are test cards for development purposes only'
        });
    } catch (error) {
        console.error('Error getting test cards:', error);
        res.status(500).json({ error: 'Failed to get test cards' });
    }
});

// Get transaction history
router.get('/transactions', requireAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const transactions = await paymentProcessor.getTransactionHistory(req.user.id, limit);
        
        res.json({
            success: true,
            transactions: transactions
        });
    } catch (error) {
        console.error('Error getting transaction history:', error);
        res.status(500).json({ error: 'Failed to get transaction history' });
    }
});

// Get payment statistics
router.get('/statistics', requireAuth, async (req, res) => {
    try {
        const statistics = await paymentProcessor.getPaymentStatistics(req.user.id);
        
        res.json({
            success: true,
            statistics: statistics
        });
    } catch (error) {
        console.error('Error getting payment statistics:', error);
        res.status(500).json({ error: 'Failed to get payment statistics' });
    }
});

// Check if user has enough tokens for an action
router.post('/check-tokens', requireAuth, async (req, res) => {
    try {
        const { actionType } = req.body;
        
        if (!actionType) {
            return res.status(400).json({ error: 'Action type is required' });
        }

        const tokenCheck = await tokenManager.hasEnoughTokens(req.user.id, actionType);
        
        res.json({
            success: true,
            hasEnough: tokenCheck.hasEnough,
            available: tokenCheck.available,
            required: tokenCheck.required,
            actionType: tokenCheck.actionType
        });

    } catch (error) {
        console.error('Error checking tokens:', error);
        res.status(500).json({ error: 'Failed to check token balance' });
    }
});

// Deduct tokens for an action (called after successful API usage)
router.post('/deduct-tokens', requireAuth, async (req, res) => {
    try {
        const { actionType, description, metadata } = req.body;
        
        if (!actionType) {
            return res.status(400).json({ error: 'Action type is required' });
        }

        const result = await tokenManager.deductTokens(req.user.id, actionType, description, metadata);
        
        res.json({
            success: true,
            message: 'Tokens deducted successfully',
            data: result
        });

    } catch (error) {
        console.error('Error deducting tokens:', error);
        res.status(400).json({ 
            error: error.message || 'Failed to deduct tokens' 
        });
    }
});

// Admin route to add tokens (for testing)
router.post('/admin/add-tokens', requireAuth, async (req, res) => {
    try {
        const { userId, tokensToAdd, source } = req.body;
        
        // Check if user is admin (you can implement admin check here)
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const result = await tokenManager.addTokens(userId, tokensToAdd, source || 'admin');
        
        res.json({
            success: true,
            message: 'Tokens added successfully',
            data: result
        });

    } catch (error) {
        console.error('Error adding tokens:', error);
        res.status(500).json({ error: 'Failed to add tokens' });
    }
});

// Admin route to refund transaction
router.post('/admin/refund', requireAuth, async (req, res) => {
    try {
        const { transactionId, userId } = req.body;
        
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const result = await paymentProcessor.refundTransaction(transactionId, userId);
        
        res.json({
            success: true,
            message: 'Transaction refunded successfully',
            data: result
        });

    } catch (error) {
        console.error('Error refunding transaction:', error);
        res.status(400).json({ 
            error: error.message || 'Failed to refund transaction' 
        });
    }
});

module.exports = router; 