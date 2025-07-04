const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration for Render.com connecting to shared hosting
const dbConfig = {
    host: process.env.DB_HOST || 'server283.web-hosting.com', // Your shared hosting server
    user: process.env.DB_USER || 'iextqmxf_exams',
    password: process.env.DB_PASSWORD || 'D#3ItY3za(BZ',
    database: process.env.DB_NAME || 'iextqmxf_exams',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
    ssl: false // Disable SSL for shared hosting
};

let pool = null;

// Initialize database connection
async function initialize() {
    try {
        // Create connection pool
        pool = mysql.createPool(dbConfig);
        
        // Test connection
        const connection = await pool.getConnection();
        console.log('✅ Database connection established');
        connection.release();
        
        // Initialize tables
        await createTables();
        console.log('✅ Database tables initialized');
        
        return true;
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    }
}

// Create database tables
async function createTables() {
    const connection = await pool.getConnection();
    
    try {
        // Users table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                verified BOOLEAN DEFAULT FALSE,
                exam_data JSON,
                onboarding_completed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // User tokens table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_tokens (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                tokens_available INT DEFAULT 50,
                tokens_used INT DEFAULT 0,
                total_purchased INT DEFAULT 50,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Token usage logs table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS token_usage_logs (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                action_type VARCHAR(50) NOT NULL,
                tokens_used INT NOT NULL,
                description TEXT,
                exam_type VARCHAR(100),
                subject VARCHAR(100),
                topic VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Payment transactions table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS payment_transactions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                tokens_purchased INT NOT NULL,
                payment_method VARCHAR(50),
                status VARCHAR(20) DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        console.log('✅ All tables created successfully');
    } catch (error) {
        console.error('❌ Error creating tables:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// Get database connection
async function getConnection() {
    if (!pool) {
        throw new Error('Database not initialized');
    }
    return pool;
}

// Close database connections
async function closeConnections() {
    if (pool) {
        await pool.end();
        console.log('✅ Database connections closed');
    }
}

// User management functions
async function createUser(userData) {
    const connection = await getConnection();
    
    try {
        // Check if user already exists
        const [existingUsers] = await connection.execute(
            'SELECT id FROM users WHERE email = ?',
            [userData.email]
        );
        
        if (existingUsers.length > 0) {
            throw new Error('User already exists');
        }
        
        // Create user
        await connection.execute(
            'INSERT INTO users (id, email, password, name, verified) VALUES (?, ?, ?, ?, ?)',
            [userData.id, userData.email, userData.password, userData.name, userData.verified]
        );
        
        // Create token record for user
        await connection.execute(
            'INSERT INTO user_tokens (id, user_id, tokens_available, tokens_used, total_purchased) VALUES (?, ?, ?, 0, ?)',
            [userData.id, userData.id, 50, 50]
        );
        
        return userData;
    } catch (error) {
        console.error('Error creating user:', error);
        throw error;
    }
}

async function findUserByEmail(email) {
    const connection = await getConnection();
    
    try {
        const [rows] = await connection.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        
        return rows[0] || null;
    } catch (error) {
        console.error('Error finding user by email:', error);
        throw error;
    }
}

async function findUserById(id) {
    const connection = await getConnection();
    
    try {
        const [rows] = await connection.execute(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );
        
        return rows[0] || null;
    } catch (error) {
        console.error('Error finding user by ID:', error);
        throw error;
    }
}

async function updateUserOnboarding(userId, examData) {
    const connection = await getConnection();
    
    try {
        if (!userId) {
            throw new Error('User ID is required for onboarding update');
        }
        
        const examDataString = examData ? JSON.stringify(examData) : '{}';
        
        await connection.execute(
            'UPDATE users SET exam_data = ?, onboarding_completed = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [examDataString, userId]
        );
        
        return await findUserById(userId);
    } catch (error) {
        console.error('Error updating user onboarding:', error);
        throw error;
    }
}

// Export functions
module.exports = {
    initialize,
    getConnection,
    closeConnections,
    createUser,
    findUserByEmail,
    findUserById,
    updateUserOnboarding
}; 