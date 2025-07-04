const { v4: uuidv4 } = require('uuid');

class TokenManager {
    constructor(database) {
        this.db = database;
    }

    async getUserTokens(userId) {
        const connection = await this.db.getConnection();
        try {
            const [rows] = await connection.execute(
                'SELECT * FROM user_tokens WHERE user_id = ?',
                [userId]
            );
            return rows[0] || { tokens_available: 0, tokens_used: 0, total_purchased: 0 };
        } catch (error) {
            console.error('Error getting user tokens:', error);
            throw error;
        }
    }

    async useTokens(userId, tokensToUse, actionType, description = '', examType = '', subject = '', topic = '') {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            // Get current token balance
            const [tokenRows] = await connection.execute(
                'SELECT tokens_available FROM user_tokens WHERE user_id = ? FOR UPDATE',
                [userId]
            );

            if (tokenRows.length === 0) {
                throw new Error('User token record not found');
            }

            const currentTokens = tokenRows[0].tokens_available;

            if (currentTokens < tokensToUse) {
                throw new Error('Insufficient tokens');
            }

            // Update token balance
            await connection.execute(
                'UPDATE user_tokens SET tokens_available = tokens_available - ?, tokens_used = tokens_used + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [tokensToUse, tokensToUse, userId]
            );

            // Log token usage
            await connection.execute(
                'INSERT INTO token_usage_logs (id, user_id, action_type, tokens_used, description, exam_type, subject, topic) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, actionType, tokensToUse, description, examType, subject, topic]
            );

            await connection.commit();

            return {
                success: true,
                tokensUsed: tokensToUse,
                remainingTokens: currentTokens - tokensToUse
            };
        } catch (error) {
            await connection.rollback();
            console.error('Error using tokens:', error);
            throw error;
        }
    }

    async addTokens(userId, tokensToAdd, source = 'purchase') {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            // Update token balance
            await connection.execute(
                'UPDATE user_tokens SET tokens_available = tokens_available + ?, total_purchased = total_purchased + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [tokensToAdd, tokensToAdd, userId]
            );

            // Log token addition
            await connection.execute(
                'INSERT INTO token_usage_logs (id, user_id, action_type, tokens_used, description) VALUES (?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'token_purchase', -tokensToAdd, `Tokens purchased: ${tokensToAdd}`]
            );

            await connection.commit();

            return {
                success: true,
                tokensAdded: tokensToAdd
            };
        } catch (error) {
            await connection.rollback();
            console.error('Error adding tokens:', error);
            throw error;
        }
    }

    async getTokenUsageHistory(userId, limit = 50) {
        const connection = await this.db.getConnection();
        try {
            const [rows] = await connection.execute(
                'SELECT * FROM token_usage_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                [userId, limit]
            );
            return rows;
        } catch (error) {
            console.error('Error getting token history:', error);
            throw error;
        }
    }
}

module.exports = TokenManager; 