const { v4: uuidv4 } = require('uuid');
const database = require('./database-mongo');

// In-memory storage for testing
const inMemoryTokens = new Map();
const inMemoryUsageLogs = new Map();

class TokenManager {
    constructor(db) {
        this.db = db;
        this.tokenCosts = {
            subjectAnalysis: parseInt(process.env.TOKEN_COST_SUBJECT_ANALYSIS) || 15,
            topicAnalysis: parseInt(process.env.TOKEN_COST_TOPIC_ANALYSIS) || 20,
            visualData: parseInt(process.env.TOKEN_COST_VISUAL_DATA) || 25,
            examValidation: parseInt(process.env.TOKEN_COST_EXAM_VALIDATION) || 10,
            subjectGeneration: parseInt(process.env.TOKEN_COST_SUBJECT_GENERATION) || 12
        };
    }

    // Get user's token balance
    async getUserTokens(userId) {
        try {
            // Check if database operations are available
            if (this.db && this.db.tokenOperations && typeof this.db.tokenOperations.getUserTokens === 'function') {
                return await this.db.tokenOperations.getUserTokens(userId);
            } else {
                // Fallback to direct database operations
                const Token = this.db.Token;
                if (!Token) {
                    throw new Error('Token model not available');
                }
                
                let token = await Token.findOne({ userId });
                
                if (!token) {
                    // Create token record if it doesn't exist
                    token = new Token({
                        userId,
                        tokens: 100,
                        tokensUsed: 0,
                        totalPurchased: 100
                    });
                    await token.save();
                }

                return {
                    tokens_available: token.tokens,
                    tokens_used: token.tokensUsed,
                    total_purchased: token.totalPurchased || token.tokens,
                    last_updated: token.lastUpdated
                };
            }
        } catch (error) {
            console.error('Error getting user tokens:', error);
            // Return default tokens for new users
            return {
                tokens_available: 100,
                tokens_used: 0,
                total_purchased: 100,
                last_updated: new Date()
            };
        }
    }

    // Create token record for new user
    async createUserTokenRecord(userId) {
        try {
            if (process.env.NODE_ENV === 'test' || !this.db) {
                // Use in-memory storage for testing
                inMemoryTokens.set(userId, {
                    tokens_available: 50,
                    tokens_used: 0,
                    total_purchased: 50
                });
                return uuidv4();
            }

            // Use MongoDB for production
            const token = await this.db.Token.findOne({ userId });
            
            if (!token) {
                const newToken = new this.db.Token({
                    userId,
                    tokens: 50,
                    tokensUsed: 0,
                    totalPurchased: 50
                });
                await newToken.save();
                return uuidv4();
            }
            
            token.tokens += 50;
            token.tokensUsed += 50;
            token.totalPurchased += 50;
            token.lastUpdated = new Date();
            await token.save();
            return uuidv4();
        } catch (error) {
            console.error('Error creating user token record:', error);
            throw error;
        }
    }

    // Check if user has enough tokens for an action
    async hasEnoughTokens(userId, actionType) {
        try {
            const userTokens = await this.getUserTokens(userId);
            const requiredTokens = this.tokenCosts[actionType] || 10;
            
            return {
                hasEnough: userTokens.tokens_available >= requiredTokens,
                available: userTokens.tokens_available,
                required: requiredTokens,
                actionType: actionType
            };
        } catch (error) {
            console.error('Error checking token balance:', error);
            // Return default response for new users
            return {
                hasEnough: true,
                available: 100,
                required: this.tokenCosts[actionType] || 10,
                actionType: actionType
            };
        }
    }

    // Ensure user has tokens (for new users)
    async ensureUserHasTokens(userId) {
        try {
            const userTokens = await this.getUserTokens(userId);
            if (userTokens.tokens_available === 0) {
                // Give free tokens to new users
                await this.addTokens(userId, 50, 'welcome_bonus');
            }
        } catch (error) {
            console.error('Error ensuring user has tokens:', error);
            throw error;
        }
    }

    // Deduct tokens for an action
    async deductTokens(userId, actionType, description = '', metadata = {}) {
        try {
            const requiredTokens = this.tokenCosts[actionType] || 10;
            const userTokens = await this.getUserTokens(userId);

            if (userTokens.tokens_available < requiredTokens) {
                throw new Error('Insufficient tokens');
            }

            if (process.env.NODE_ENV === 'test' || !this.db) {
                // Use in-memory storage for testing
                const currentTokens = inMemoryTokens.get(userId);
                currentTokens.tokens_available -= requiredTokens;
                currentTokens.tokens_used += requiredTokens;
                inMemoryTokens.set(userId, currentTokens);

                // Log usage
                await this.logTokenUsage(userId, actionType, requiredTokens, description, metadata);

                return {
                    success: true,
                    tokens_deducted: requiredTokens,
                    remaining_tokens: currentTokens.tokens_available
                };
            }

            // Use MongoDB for production
            const token = await this.db.Token.findOne({ userId });
            
            if (!token) {
                throw new Error('Token record not found');
            }

            token.tokens -= requiredTokens;
            token.tokensUsed += requiredTokens;
            token.lastUpdated = new Date();
            await token.save();

            // Log token usage
            await this.logTokenUsage(userId, actionType, requiredTokens, description, metadata);

            return {
                success: true,
                tokens_deducted: requiredTokens,
                remaining_tokens: token.tokens
            };
        } catch (error) {
            console.error('Error deducting tokens:', error);
            throw error;
        }
    }

    // Add tokens to user account
    async addTokens(userId, amount, source = 'purchase') {
        try {
            if (process.env.NODE_ENV === 'test' || !this.db) {
                // Use in-memory storage for testing
                const currentTokens = inMemoryTokens.get(userId) || {
                    tokens_available: 0,
                    tokens_used: 0,
                    total_purchased: 0
                };
                currentTokens.tokens_available += amount;
                currentTokens.total_purchased += amount;
                inMemoryTokens.set(userId, currentTokens);

                // Log token addition
                await this.logTokenUsage(userId, 'token_purchase', 0, `Added ${amount} tokens via ${source}`, {
                    tokens_added: amount,
                    source: source
                });

                return {
                    success: true,
                    tokens_added: amount,
                    new_balance: currentTokens
                };
            }

            // Use MongoDB for production
            const token = await this.db.Token.findOne({ userId });
            
            if (!token) {
                const newToken = new this.db.Token({
                    userId,
                    tokens: amount,
                    tokensUsed: 0,
                    totalPurchased: amount
                });
                await newToken.save();
                return {
                    success: true,
                    tokens_added: amount,
                    new_balance: {
                        tokens_available: amount,
                        tokens_used: 0,
                        total_purchased: amount
                    }
                };
            }

            token.tokens += amount;
            token.tokensUsed += amount;
            token.totalPurchased += amount;
            token.lastUpdated = new Date();
            await token.save();

            // Log token addition
            await this.logTokenUsage(userId, 'token_purchase', 0, `Added ${amount} tokens via ${source}`, {
                tokens_added: amount,
                source: source
            });

            return {
                success: true,
                tokens_added: amount,
                new_balance: {
                    tokens_available: token.tokens,
                    tokens_used: token.tokensUsed,
                    total_purchased: token.totalPurchased
                }
            };
        } catch (error) {
            console.error('Error adding tokens:', error);
            throw error;
        }
    }

    // Log token usage
    async logTokenUsage(userId, actionType, tokensUsed, description = '', metadata = {}) {
        try {
            const logId = uuidv4();
            
            if (process.env.NODE_ENV === 'test' || !this.db) {
                // Use in-memory storage for testing
                const logs = inMemoryUsageLogs.get(userId) || [];
                logs.push({
                    id: logId,
                    user_id: userId,
                    action_type: actionType,
                    tokens_used: tokensUsed,
                    description: description,
                    exam_type: metadata.exam_type || null,
                    subject: metadata.subject || null,
                    topic: metadata.topic || null,
                    created_at: new Date()
                });
                inMemoryUsageLogs.set(userId, logs);
                return logId;
            }

            // Use MongoDB for production
            const tokenUsage = new this.db.TokenUsage({
                userId,
                actionType,
                tokensUsed,
                description,
                examType: metadata.exam_type || null,
                subject: metadata.subject || null,
                topic: metadata.topic || null,
                createdAt: new Date()
            });
            await tokenUsage.save();
            return logId;
        } catch (error) {
            console.error('Error logging token usage:', error);
            // Don't throw error, just return without logging
            return null;
        }
    }

    // Get token usage history
    async getTokenUsageHistory(userId, limit = 50) {
        try {
            return await this.db.tokenOperations.getTokenUsageHistory(userId, limit);
        } catch (error) {
            console.error('Error getting token history:', error);
            throw error;
        }
    }

    // Get token statistics
    async getTokenStatistics(userId) {
        try {
            if (process.env.NODE_ENV === 'test' || !this.db) {
                // Use in-memory storage for testing
                const logs = inMemoryUsageLogs.get(userId) || [];
                const usageByAction = {};
                let totalPurchased = 0;

                logs.forEach(log => {
                    if (log.action_type === 'token_purchase') {
                        totalPurchased += log.tokens_used;
                    } else {
                        usageByAction[log.action_type] = (usageByAction[log.action_type] || 0) + log.tokens_used;
                    }
                });

                return {
                    usage_by_action: Object.entries(usageByAction).map(([action, total]) => ({
                        action_type: action,
                        total_used: total
                    })),
                    total_purchased: totalPurchased
                };
            }

            // Use MongoDB for production
            const usageLogs = await this.db.TokenUsage.find({ userId }).sort({ createdAt: -1 }).limit(limit);
            const usageByAction = {};
            let totalPurchased = 0;

            usageLogs.forEach(log => {
                if (log.actionType === 'token_purchase') {
                    totalPurchased += log.tokensUsed;
                } else {
                    usageByAction[log.actionType] = (usageByAction[log.actionType] || 0) + log.tokensUsed;
                }
            });

            return {
                usage_by_action: Object.entries(usageByAction).map(([action, total]) => ({
                    action_type: action,
                    total_used: total
                })),
                total_purchased: totalPurchased
            };
        } catch (error) {
            console.error('Error getting token statistics:', error);
            throw error;
        }
    }

    // Get token pricing
    getTokenPricing() {
        return {
            prices: {
                100: 9.99,
                250: 19.99,
                500: 34.99,
                1000: 59.99,
                2500: 129.99
            },
            costs: this.tokenCosts
        };
    }

    // Validate token purchase
    async validateTokenPurchase(userId, amount, tokensToPurchase) {
        try {
            if (!userId || !amount || !tokensToPurchase) {
                throw new Error('Missing required parameters: userId, amount, and tokensToPurchase are required');
            }

            if (process.env.NODE_ENV === 'test' || !this.db) {
                // Use in-memory storage for testing
                const transactionId = uuidv4();
                
                // Add tokens to user account
                await this.addTokens(userId, tokensToPurchase, 'purchase');

                return {
                    success: true,
                    transaction_id: transactionId,
                    tokens_added: tokensToPurchase,
                    new_balance: await this.getUserTokens(userId)
                };
            }

            // Use MongoDB for production
            const transactionId = uuidv4();
            
            // Record the purchase transaction
            const tokenUsage = new this.db.TokenUsage({
                userId,
                actionType: 'token_purchase',
                tokensUsed: tokensToPurchase,
                description: `Purchased ${tokensToPurchase} tokens`,
                examType: null,
                subject: null,
                topic: null,
                createdAt: new Date()
            });
            await tokenUsage.save();

            // Add tokens to user account
            await this.addTokens(userId, tokensToPurchase, 'purchase');

            return {
                success: true,
                transaction_id: transactionId,
                tokens_added: tokensToPurchase,
                new_balance: await this.getUserTokens(userId)
            };
        } catch (error) {
            console.error('Error validating token purchase:', error);
            throw error;
        }
    }

    async useTokens(userId, amount, action, description, examType = null, subject = null, topic = null) {
        try {
            return await this.db.tokenOperations.useTokens(userId, amount, action, description, examType, subject, topic);
        } catch (error) {
            console.error('Error using tokens:', error);
            throw error;
        }
    }
}

module.exports = TokenManager; 