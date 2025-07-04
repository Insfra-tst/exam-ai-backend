const { v4: uuidv4 } = require('uuid');

class PaymentProcessor {
    constructor(database, tokenManager) {
        this.db = database;
        this.tokenManager = tokenManager;
    }

    async processPayment(userId, amount, tokensToPurchase, paymentMethod = 'fake') {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            // Create payment transaction record
            const transactionId = uuidv4();
            await connection.execute(
                'INSERT INTO payment_transactions (id, user_id, amount, tokens_purchased, payment_method, status) VALUES (?, ?, ?, ?, ?, ?)',
                [transactionId, userId, amount, tokensToPurchase, paymentMethod, 'completed']
            );

            // Add tokens to user account
            await this.tokenManager.addTokens(userId, tokensToPurchase, 'purchase');

            await connection.commit();

            return {
                success: true,
                transactionId,
                amount,
                tokensPurchased: tokensToPurchase,
                status: 'completed'
            };
        } catch (error) {
            await connection.rollback();
            console.error('Payment processing error:', error);
            throw error;
        }
    }

    async getPaymentHistory(userId, limit = 50) {
        const connection = await this.db.getConnection();
        try {
            const [rows] = await connection.execute(
                'SELECT * FROM payment_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                [userId, limit]
            );
            return rows;
        } catch (error) {
            console.error('Error getting payment history:', error);
            throw error;
        }
    }
}

module.exports = PaymentProcessor; 