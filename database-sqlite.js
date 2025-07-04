const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// SQLite database configuration for Render.com
const dbPath = path.join(__dirname, 'database.sqlite');

let db = null;

// Initialize database connection
async function initialize() {
    try {
        // Create database connection
        db = new sqlite3.Database(dbPath);
        
        console.log('✅ SQLite database connection established');
        
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
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Users table
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    name TEXT,
                    verified INTEGER DEFAULT 0,
                    exam_data TEXT,
                    onboarding_completed INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // User tokens table
            db.run(`
                CREATE TABLE IF NOT EXISTS user_tokens (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    tokens_available INTEGER DEFAULT 50,
                    tokens_used INTEGER DEFAULT 0,
                    total_purchased INTEGER DEFAULT 50,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);

            // Token usage logs table
            db.run(`
                CREATE TABLE IF NOT EXISTS token_usage_logs (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    tokens_used INTEGER NOT NULL,
                    description TEXT,
                    exam_type TEXT,
                    subject TEXT,
                    topic TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);

            // Payment transactions table
            db.run(`
                CREATE TABLE IF NOT EXISTS payment_transactions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    amount REAL NOT NULL,
                    tokens_purchased INTEGER NOT NULL,
                    payment_method TEXT,
                    status TEXT DEFAULT 'completed',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Error creating tables:', err);
                    reject(err);
                } else {
                    console.log('✅ All tables created successfully');
                    resolve();
                }
            });
        });
    });
}

// Get database connection
async function getConnection() {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}

// Close database connections
async function closeConnections() {
    if (db) {
        db.close();
        console.log('✅ Database connections closed');
    }
}

// User management functions
async function createUser(userData) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Check if user already exists
            db.get('SELECT id FROM users WHERE email = ?', [userData.email], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (row) {
                    reject(new Error('User already exists'));
                    return;
                }
                
                // Create user
                db.run(
                    'INSERT INTO users (id, email, password, name, verified) VALUES (?, ?, ?, ?, ?)',
                    [userData.id, userData.email, userData.password, userData.name, userData.verified ? 1 : 0],
                    function(err) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        // Create token record for user
                        db.run(
                            'INSERT INTO user_tokens (id, user_id, tokens_available, tokens_used, total_purchased) VALUES (?, ?, ?, 0, ?)',
                            [userData.id, userData.id, 50, 50],
                            function(err) {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(userData);
                                }
                            }
                        );
                    }
                );
            });
        });
    });
}

async function findUserByEmail(email) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row || null);
            }
        });
    });
}

async function findUserById(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row || null);
            }
        });
    });
}

async function updateUserOnboarding(userId, examData) {
    return new Promise((resolve, reject) => {
        if (!userId) {
            reject(new Error('User ID is required for onboarding update'));
            return;
        }
        
        const examDataString = examData ? JSON.stringify(examData) : '{}';
        
        db.run(
            'UPDATE users SET exam_data = ?, onboarding_completed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [examDataString, userId],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    findUserById(userId).then(resolve).catch(reject);
                }
            }
        );
    });
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