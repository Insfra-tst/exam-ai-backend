const express = require('express');
const { v4: uuidv4 } = require('uuid');
const auth = require('./auth');

const router = express.Router();

// Register endpoint
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }

        const user = await auth.createUser({
            email,
            password,
            name
        });

        const token = auth.generateToken(user.id);

        res.json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                verified: user.verified
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await auth.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await auth.comparePassword(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = auth.generateToken(user.id);

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                verified: user.verified,
                onboarding_completed: user.onboarding_completed
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user profile
router.get('/profile', auth.authenticateToken, async (req, res) => {
    try {
        const user = await auth.findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                verified: user.verified,
                onboarding_completed: user.onboarding_completed
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update onboarding
router.post('/onboarding', auth.authenticateToken, async (req, res) => {
    try {
        const { examData } = req.body;

        const updatedUser = await auth.updateUserOnboarding(req.user.id, examData);

        res.json({
            success: true,
            message: 'Onboarding completed successfully',
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                verified: updatedUser.verified,
                onboarding_completed: updatedUser.onboarding_completed
            }
        });
    } catch (error) {
        console.error('Onboarding error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 