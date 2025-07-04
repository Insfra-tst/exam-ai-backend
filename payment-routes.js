const express = require('express');
const auth = require('./auth');
const database = require('./database-mongo');
const TokenManager = require('./token-manager');
const PaymentProcessor = require('./payment-processor');

const router = express.Router();

// Initialize managers
const tokenManager = new TokenManager(database);
const paymentProcessor = new PaymentProcessor(database, tokenManager);

// Purchase tokens endpoint
router.post('/purchase', auth.authenticateToken, async (req, res) => {
    try {
        const { amount, tokensToPurchase } = req.body;

        if (!amount || !tokensToPurchase) {
            return res.status(400).json({ error: 'Amount and tokens to purchase are required' });
        }

        const result = await paymentProcessor.processPayment(
            req.user.id,
            amount,
            tokensToPurchase,
            'fake'
        );

        res.json({
            success: true,
            message: 'Payment processed successfully',
            ...result
        });
    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get payment history
router.get('/history', auth.authenticateToken, async (req, res) => {
    try {
        const history = await paymentProcessor.getPaymentHistory(req.user.id);
        res.json({
            success: true,
            history
        });
    } catch (error) {
        console.error('Payment history error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 