const { v4: uuidv4 } = require('uuid');
const database = require('./database-mongo');
const TokenManager = require('./token-manager');

class PaymentProcessor {
    constructor() {
        // Fake credit card data for testing
        this.fakeCards = {
            'visa': {
                number: '4242424242424242',
                exp_month: '12',
                exp_year: '2025',
                cvc: '123',
                brand: 'visa'
            },
            'mastercard': {
                number: '5555555555554444',
                exp_month: '12',
                exp_year: '2025',
                cvc: '123',
                brand: 'mastercard'
            },
            'amex': {
                number: '378282246310005',
                exp_month: '12',
                exp_year: '2025',
                cvc: '1234',
                brand: 'amex'
            },
            'discover': {
                number: '6011111111111117',
                exp_month: '12',
                exp_year: '2025',
                cvc: '123',
                brand: 'discover'
            }
        };

        this.successRate = parseFloat(process.env.FAKE_PAYMENT_SUCCESS_RATE) || 0.95;
    }

    // Process fake payment
    async processFakePayment(userId, paymentData) {
        try {
            const transactionId = uuidv4();
            const { cardNumber, expMonth, expYear, cvc, amount, tokensToPurchase } = paymentData;

            // Validate card format
            const cardValidation = this.validateCard(cardNumber, expMonth, expYear, cvc);
            if (!cardValidation.isValid) {
                throw new Error(cardValidation.error);
            }

            // Simulate payment processing delay
            await this.simulateProcessingDelay();

            // Determine if payment succeeds (based on success rate)
            const paymentSuccess = Math.random() < this.successRate;

            if (!paymentSuccess) {
                // Log failed transaction
                await this.logTransaction(userId, transactionId, amount, tokensToPurchase, 'failed', {
                    card_last4: cardNumber.slice(-4),
                    card_brand: cardValidation.brand,
                    error: 'Payment declined by bank'
                });

                throw new Error('Payment declined. Please try again or use a different card.');
            }

            // Validate token purchase
            await tokenManager.validateTokenPurchase(userId, amount, tokensToPurchase);

            // Add tokens to user account
            await tokenManager.addTokens(userId, tokensToPurchase, 'credit_card_purchase');

            // Log successful transaction
            await this.logTransaction(userId, transactionId, amount, tokensToPurchase, 'completed', {
                card_last4: cardNumber.slice(-4),
                card_brand: cardValidation.brand
            });

            return {
                success: true,
                transaction_id: transactionId,
                amount: amount,
                tokens_purchased: tokensToPurchase,
                card_brand: cardValidation.brand,
                card_last4: cardNumber.slice(-4)
            };

        } catch (error) {
            console.error('Error processing fake payment:', error);
            throw error;
        }
    }

    // Validate credit card
    validateCard(cardNumber, expMonth, expYear, cvc) {
        // Remove spaces and dashes
        const cleanNumber = cardNumber.replace(/\s+/g, '').replace(/-/g, '');

        // Basic Luhn algorithm check
        if (!this.luhnCheck(cleanNumber)) {
            return { isValid: false, error: 'Invalid card number' };
        }

        // Check expiration
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        if (parseInt(expYear) < currentYear || 
            (parseInt(expYear) === currentYear && parseInt(expMonth) < currentMonth)) {
            return { isValid: false, error: 'Card has expired' };
        }

        // Determine card brand
        const brand = this.getCardBrand(cleanNumber);

        // Validate CVC length
        const expectedCvcLength = brand === 'amex' ? 4 : 3;
        if (cvc.length !== expectedCvcLength) {
            return { isValid: false, error: `Invalid CVC length for ${brand}` };
        }

        return { isValid: true, brand: brand };
    }

    // Luhn algorithm for card validation
    luhnCheck(cardNumber) {
        let sum = 0;
        let isEven = false;

        for (let i = cardNumber.length - 1; i >= 0; i--) {
            let digit = parseInt(cardNumber.charAt(i));

            if (isEven) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }

            sum += digit;
            isEven = !isEven;
        }

        return sum % 10 === 0;
    }

    // Determine card brand
    getCardBrand(cardNumber) {
        if (/^4/.test(cardNumber)) return 'visa';
        if (/^5[1-5]/.test(cardNumber)) return 'mastercard';
        if (/^3[47]/.test(cardNumber)) return 'amex';
        if (/^6(?:011|5)/.test(cardNumber)) return 'discover';
        return 'unknown';
    }

    // Simulate processing delay
    async simulateProcessingDelay() {
        const delay = Math.random() * 2000 + 1000; // 1-3 seconds
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    // Log transaction
    async logTransaction(userId, transactionId, amount, tokensPurchased, status, metadata = {}) {
        try {
            // Create a new transaction document
            const transaction = {
                id: transactionId,
                userId: userId,
                amount: amount,
                tokensPurchased: tokensPurchased,
                paymentMethod: 'credit_card',
                transactionStatus: status,
                cardLast4: metadata.card_last4 || null,
                cardBrand: metadata.card_brand || null,
                createdAt: new Date()
            };

            // For now, we'll use the TokenUsage collection to log transactions
            // You can create a separate PaymentTransaction collection if needed
            const tokenUsage = new database.TokenUsage({
                userId: userId,
                tokensUsed: 0, // No tokens used for purchase
                action: 'payment_transaction',
                description: `Payment ${status}: $${amount} for ${tokensPurchased} tokens`,
                examType: null,
                subject: null,
                topic: null,
                metadata: transaction
            });

            await tokenUsage.save();
            return transactionId;
        } catch (error) {
            console.error('Error logging transaction:', error);
            throw error;
        }
    }

    // Get transaction history
    async getTransactionHistory(userId, limit = 50) {
        try {
            const transactions = await database.TokenUsage.find({
                userId: userId,
                action: 'payment_transaction'
            })
            .sort({ createdAt: -1 })
            .limit(limit);

            return transactions.map(t => t.metadata || t);
        } catch (error) {
            console.error('Error getting transaction history:', error);
            throw error;
        }
    }

    // Get fake card suggestions
    getFakeCardSuggestions() {
        return Object.keys(this.fakeCards).map(brand => ({
            brand: brand,
            number: this.fakeCards[brand].number,
            exp_month: this.fakeCards[brand].exp_month,
            exp_year: this.fakeCards[brand].exp_year,
            cvc: this.fakeCards[brand].cvc
        }));
    }

    // Get payment statistics
    async getPaymentStatistics(userId) {
        try {
            const transactions = await database.TokenUsage.find({
                userId: userId,
                action: 'payment_transaction'
            });

            const stats = {
                completed: { count: 0, total_amount: 0 },
                failed: { count: 0, total_amount: 0 },
                refunded: { count: 0, total_amount: 0 }
            };

            let totalTokens = 0;

            transactions.forEach(transaction => {
                if (transaction.metadata) {
                    const status = transaction.metadata.transactionStatus;
                    const amount = transaction.metadata.amount || 0;
                    const tokens = transaction.metadata.tokensPurchased || 0;

                    if (stats[status]) {
                        stats[status].count++;
                        stats[status].total_amount += amount;
                    }

                    if (status === 'completed') {
                        totalTokens += tokens;
                    }
                }
            });

            return {
                transactions: Object.entries(stats).map(([status, data]) => ({
                    transaction_status: status,
                    count: data.count,
                    total_amount: data.total_amount
                })),
                total_tokens_purchased: totalTokens,
                total_amount_spent: stats.completed.total_amount
            };
        } catch (error) {
            console.error('Error getting payment statistics:', error);
            throw error;
        }
    }

    // Refund transaction (for admin use)
    async refundTransaction(transactionId, userId) {
        try {
            const transaction = await database.TokenUsage.findOne({
                userId: userId,
                action: 'payment_transaction',
                'metadata.id': transactionId
            });

            if (!transaction || !transaction.metadata) {
                throw new Error('Transaction not found');
            }

            if (transaction.metadata.transactionStatus !== 'completed') {
                throw new Error('Transaction cannot be refunded');
            }

            // Update transaction status
            transaction.metadata.transactionStatus = 'refunded';
            await transaction.save();

            // Deduct tokens from user account
            const tokenManagerInstance = new TokenManager();
            await tokenManagerInstance.deductTokens(userId, 'refund', `Refund for transaction ${transactionId}`, {
                transaction_id: transactionId,
                refund_amount: transaction.metadata.amount
            });

            return {
                success: true,
                transaction_id: transactionId,
                refunded_amount: transaction.metadata.amount,
                tokens_deducted: transaction.metadata.tokensPurchased
            };

        } catch (error) {
            console.error('Error refunding transaction:', error);
            throw error;
        }
    }
}

module.exports = new PaymentProcessor(); 