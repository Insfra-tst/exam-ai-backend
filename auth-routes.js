require('dotenv').config();
const express = require('express');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const TokenManager = require('./token-manager');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const database = require('./database-mongo');

   // Initialize OpenAI only when needed
   let openai = null;
   const getOpenAI = () => {
       if (!process.env.OPENAI_API_KEY) {
           return null;
       }
       if (!openai) {
           try {
               const OpenAI = require('openai');
               openai = new OpenAI({
                   apiKey: process.env.OPENAI_API_KEY
               });
           } catch (error) {
               console.error('Failed to initialize OpenAI:', error.message);
               return null;
           }
       }
       return openai;
   };

// Initialize token manager
const tokenManager = new TokenManager(database);

const router = express.Router();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Helper function to generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
};

// Helper function to verify JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

// Middleware to authenticate requests
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Verify user exists
    const user = await database.userOperations.findUserById(decoded.userId);
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
};

// Token checking middleware
const requireTokens = (actionType) => {
    return async (req, res, next) => {
        try {
            const tokenCheck = await tokenManager.hasEnoughTokens(req.user.id, actionType);
            
            if (!tokenCheck.hasEnough) {
                return res.status(402).json({
                    error: 'Insufficient tokens',
                    message: `You need ${tokenCheck.required} tokens for this action. You have ${tokenCheck.available} tokens available.`,
                    required: tokenCheck.required,
                    available: tokenCheck.available,
                    actionType: actionType,
                    purchaseUrl: '/purchase-tokens'
                });
            }
            
            req.tokenCheck = tokenCheck;
            next();
        } catch (error) {
            console.error('Error checking tokens:', error);
            res.status(500).json({ error: 'Failed to check token balance' });
        }
    };
};

// Configure Passport strategies
passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async (email, password, done) => {
    try {
        const user = await database.userOperations.findUserByEmail(email);
        if (!user) {
            return done(null, false, { message: 'Invalid email or password' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return done(null, false, { message: 'Invalid email or password' });
        }

        return done(null, user);
    } catch (error) {
        return done(error);
    }
}));

// Google OAuth Strategy (only if credentials are provided)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails[0].value;
            let user = await database.userOperations.findUserByEmail(email);

            if (!user) {
                // Create new user from Google profile
                user = await database.userOperations.createUser({
                    email,
                    name: profile.displayName,
                    provider: 'google'
                });
            }

            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }));
}

// Facebook OAuth Strategy (only if credentials are provided)
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: "/auth/facebook/callback",
        profileFields: ['id', 'displayName', 'emails']
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails[0].value;
            let user = await database.userOperations.findUserByEmail(email);

            if (!user) {
                // Create new user from Facebook profile
                user = await database.userOperations.createUser({
                    email,
                    name: profile.displayName,
                    provider: 'facebook'
                });
            }

            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }));
}

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await database.userOperations.findUserById(id);
        done(null, user);
    } catch (error) {
        done(error);
    }
});

// Register endpoint
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
        // Create user
        const user = await database.userOperations.createUser({ email, password, name });
        // Generate token
        const token = generateToken(user.id);
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                verified: true,
                onboardingCompleted: user.onboardingCompleted
            },
            token
        });
    } catch (error) {
        if (error.message === 'User already exists') {
            return res.status(409).json({ error: 'User with this email already exists' });
        }
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        // Find user
        const user = await database.userOperations.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        // Generate token
        const token = generateToken(user.id);
        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                verified: true,
                onboardingCompleted: user.onboardingCompleted,
                examData: user.examData
            },
            token
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                verified: user.verified,
                onboardingCompleted: user.onboardingCompleted,
                examData: user.examData,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { name, email } = req.body;
        const userId = req.user.id;

        // Update user
        const updatedUser = await database.User.findOneAndUpdate(
            { id: userId },
            {
                name: name || req.user.name,
                email: email || req.user.email,
                updatedAt: new Date()
            },
            { new: true }
        );

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                verified: updatedUser.verified,
                onboardingCompleted: updatedUser.onboardingCompleted
            }
        });

    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Update onboarding
router.post('/onboarding', authenticateToken, async (req, res) => {
    try {
        const { examData } = req.body;
        const userId = req.user.id;

        if (!examData) {
            return res.status(400).json({ error: 'Exam data is required' });
        }

        // Update user onboarding
        const updatedUser = await database.userOperations.updateUserOnboarding(userId, examData);

        res.json({
            success: true,
            message: 'Onboarding completed successfully',
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                verified: updatedUser.verified,
                onboardingCompleted: updatedUser.onboardingCompleted,
                examData: updatedUser.examData
            }
        });

    } catch (error) {
        console.error('Onboarding error:', error);
        res.status(500).json({ error: 'Failed to complete onboarding' });
    }
});

// Get user subjects
router.get('/subjects', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const subjects = await database.subjectOperations.getUserSubjects(userId);

        res.json({
            success: true,
            subjects
        });

    } catch (error) {
        console.error('Get subjects error:', error);
        res.status(500).json({ error: 'Failed to get subjects' });
    }
});

// Add user subject
router.post('/subjects', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, type } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Subject name is required' });
        }

        const subject = await database.subjectOperations.addUserSubject(userId, {
            name,
            type: type || 'optional'
        });

        res.status(201).json({
            success: true,
            message: 'Subject added successfully',
            subject
        });

    } catch (error) {
        console.error('Add subject error:', error);
        res.status(500).json({ error: 'Failed to add subject' });
    }
});

// Update user subject
router.put('/subjects/:subjectId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { subjectId } = req.params;
        const { name, type } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Subject name is required' });
        }

        const subject = await database.subjectOperations.updateUserSubject(userId, subjectId, {
            name,
            type: type || 'optional'
        });

        if (!subject) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        res.json({
            success: true,
            message: 'Subject updated successfully',
            subject
        });

    } catch (error) {
        console.error('Update subject error:', error);
        res.status(500).json({ error: 'Failed to update subject' });
    }
});

// Delete user subject
router.delete('/subjects/:subjectId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { subjectId } = req.params;

        const subject = await database.subjectOperations.deleteUserSubject(userId, subjectId);

        if (!subject) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        res.json({
            success: true,
            message: 'Subject deleted successfully'
        });

    } catch (error) {
        console.error('Delete subject error:', error);
        res.status(500).json({ error: 'Failed to delete subject' });
    }
});

// Logout endpoint (client-side token removal)
router.post('/logout', (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// Verify email endpoint
router.get('/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const user = await database.userOperations.verifyEmail(token);

        res.json({
            success: true,
            message: 'Email verified successfully',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                verified: user.verified
            }
        });

    } catch (error) {
        console.error('Email verification error:', error);
        res.status(400).json({ error: 'Invalid or expired verification token' });
    }
});

// Request password reset
router.post('/reset-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = await database.userOperations.findUserByEmail(email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Generate reset token
        const resetToken = uuidv4();
        await database.userOperations.createVerificationToken(email, resetToken);

        // TODO: Send email with reset link
        // For now, just return success
        res.json({
            success: true,
            message: 'Password reset email sent'
        });

    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Failed to send reset email' });
    }
});

// Reset password with token
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Verify token
        const verificationToken = await database.VerificationToken.findOne({
            token,
            expiresAt: { $gt: new Date() }
        });

        if (!verificationToken) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Update user password
        await database.User.findOneAndUpdate(
            { email: verificationToken.email },
            {
                password: hashedPassword,
                updatedAt: new Date()
            }
        );

        // Delete reset token
        await database.VerificationToken.deleteOne({ token });

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Google OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
    const token = auth.generateToken(req.user.id);
    res.redirect(`/auth-success?token=${token}&user=${encodeURIComponent(JSON.stringify(req.user))}`);
});

// Facebook OAuth routes
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));

router.get('/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/login' }), (req, res) => {
    const token = auth.generateToken(req.user.id);
    res.redirect(`/auth-success?token=${token}&user=${encodeURIComponent(JSON.stringify(req.user))}`);
});

// Email verification
router.get('/verify-email', (req, res) => {
    const { token } = req.query;
    
    if (!token) {
        return res.status(400).json({ error: 'Verification token required' });
    }

    try {
        const user = auth.verifyEmail(token);
        res.json({
            message: 'Email verified successfully',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                verified: user.verified,
                onboardingCompleted: user.onboardingCompleted
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        const user = auth.findUserByEmail(email);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.verified) {
            return res.status(400).json({ error: 'Email already verified' });
        }

        // Generate new verification token
        const verificationToken = require('uuid').v4();
        const verificationTokens = require('./auth').verificationTokens || new Map();
        verificationTokens.set(verificationToken, {
            email,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });

        const emailSent = await auth.sendVerificationEmail(email, verificationToken);
        if (emailSent) {
            res.json({ message: 'Verification email sent successfully' });
        } else {
            res.json({ message: 'Email service not configured, but you can still use the app' });
        }
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Failed to send verification email' });
    }
});

// Validate exam name
router.post('/onboarding/validate-exam', async (req, res) => {
    try {
        const { examName } = req.body;
        
        if (!examName) {
            return res.status(400).json({ error: 'Exam name is required' });
        }

        const validation = await onboarding.validateExamName(examName);
        res.json(validation);
    } catch (error) {
        console.error('Error validating exam:', error);
        res.status(500).json({ error: 'Failed to validate exam' });
    }
});

router.post('/onboarding/check-popularity', async (req, res) => {
    try {
        const { examName } = req.body;
        const popularity = await onboarding.checkExamPopularity(examName);
        res.json(popularity);
    } catch (error) {
        res.status(500).json({ error: 'Failed to check exam popularity' });
    }
});

// Get comprehensive exam information including streams and subjects
router.post('/onboarding/get-exam-info', async (req, res) => {
    try {
        const { examName, gradeLevel } = req.body;
        
        if (!examName) {
            return res.status(400).json({ error: 'Exam name is required' });
        }

        const examInfo = await onboarding.getComprehensiveExamInfo(examName, gradeLevel);
        res.json(examInfo);
    } catch (error) {
        console.error('Error getting comprehensive exam info:', error);
        res.status(500).json({ error: 'Failed to get exam information' });
    }
});

// Get grade levels and streams for a specific exam
router.post('/onboarding/get-grade-levels-streams', async (req, res) => {
    try {
        const { examName } = req.body;
        
        if (!examName) {
            return res.status(400).json({ error: 'Exam name is required' });
        }

        const gradeLevelsAndStreams = await onboarding.getExamGradeLevelsAndStreams(examName);
        res.json(gradeLevelsAndStreams);
    } catch (error) {
        console.error('Error getting grade levels and streams:', error);
        res.status(500).json({ error: 'Failed to get grade levels and streams' });
    }
});

// Get comprehensive subjects for final review
router.post('/onboarding/get-comprehensive-subjects', async (req, res) => {
    try {
        const { examName, gradeLevel, stream } = req.body;
        
        if (!examName) {
            return res.status(400).json({ error: 'Exam name is required' });
        }

        const comprehensiveSubjects = await onboarding.getComprehensiveSubjectsForReview(examName, gradeLevel, stream);
        res.json(comprehensiveSubjects);
    } catch (error) {
        console.error('Error getting comprehensive subjects:', error);
        res.status(500).json({ error: 'Failed to get comprehensive subjects' });
    }
});

// Fallback route for comprehensive subjects
router.post('/onboarding/get-comprehensive-subjects-fallback', async (req, res) => {
    try {
        const { examName, gradeLevel, stream } = req.body;
        
        if (!examName) {
            return res.status(400).json({ error: 'Exam name is required' });
        }

        // Fallback data for common exams
        const fallbackData = {
            'SAT': {
                mandatorySubjects: [
                    { name: 'Reading and Writing', description: 'Critical reading and writing skills', weightage: '50%', duration: '65 min' },
                    { name: 'Math', description: 'Mathematical reasoning and problem solving', weightage: '50%', duration: '80 min' }
                ],
                optionalSubjects: [
                    { name: 'Essay', description: 'Optional essay writing section', weightage: '0%', duration: '50 min' }
                ]
            },
            'ACT': {
                mandatorySubjects: [
                    { name: 'English', description: 'Usage and mechanics, rhetorical skills', weightage: '25%', duration: '45 min' },
                    { name: 'Math', description: 'Pre-algebra, elementary algebra, geometry, trigonometry', weightage: '25%', duration: '60 min' },
                    { name: 'Reading', description: 'Reading comprehension', weightage: '25%', duration: '35 min' },
                    { name: 'Science', description: 'Data representation, scientific investigation', weightage: '25%', duration: '35 min' }
                ],
                optionalSubjects: [
                    { name: 'Writing', description: 'Optional writing test', weightage: '0%', duration: '40 min' }
                ]
            },
            'JEE': {
                mandatorySubjects: [
                    { name: 'Physics', description: 'Mechanics, thermodynamics, electromagnetism', weightage: '33.33%', duration: '3 hours' },
                    { name: 'Chemistry', description: 'Physical, organic, and inorganic chemistry', weightage: '33.33%', duration: '3 hours' },
                    { name: 'Mathematics', description: 'Algebra, calculus, geometry, trigonometry', weightage: '33.33%', duration: '3 hours' }
                ],
                optionalSubjects: []
            },
            'NEET': {
                mandatorySubjects: [
                    { name: 'Physics', description: 'Mechanics, thermodynamics, optics', weightage: '25%', duration: '3 hours' },
                    { name: 'Chemistry', description: 'Physical, organic, and inorganic chemistry', weightage: '25%', duration: '3 hours' },
                    { name: 'Biology', description: 'Botany and zoology', weightage: '50%', duration: '3 hours' }
                ],
                optionalSubjects: []
            },
            'Sri Lanka A/L': {
                mandatorySubjects: [
                    { name: 'Sinhala', description: 'Sinhala language and literature', weightage: '25%', duration: '3 hours' },
                    { name: 'English', description: 'English language and literature', weightage: '25%', duration: '3 hours' }
                ],
                optionalSubjects: [
                    { name: 'Mathematics', description: 'Advanced mathematics', weightage: '25%', duration: '3 hours' },
                    { name: 'Physics', description: 'Advanced physics', weightage: '25%', duration: '3 hours' },
                    { name: 'Chemistry', description: 'Advanced chemistry', weightage: '25%', duration: '3 hours' },
                    { name: 'Biology', description: 'Advanced biology', weightage: '25%', duration: '3 hours' },
                    { name: 'Economics', description: 'Advanced economics', weightage: '25%', duration: '3 hours' },
                    { name: 'History', description: 'Advanced history', weightage: '25%', duration: '3 hours' }
                ]
            }
        };

        // Find matching exam data
        const matchingExam = Object.keys(fallbackData).find(key => 
            key.toLowerCase().includes(examName.toLowerCase()) || 
            examName.toLowerCase().includes(key.toLowerCase())
        );

        if (matchingExam) {
            res.json(fallbackData[matchingExam]);
        } else {
            // Generic data for unknown exams
            res.json({
                mandatorySubjects: [
                    { name: 'Core Subject 1', description: 'Primary subject for this exam', weightage: '50%', duration: '2 hours' },
                    { name: 'Core Subject 2', description: 'Secondary subject for this exam', weightage: '50%', duration: '2 hours' }
                ],
                optionalSubjects: [
                    { name: 'Optional Subject 1', description: 'Additional subject option', weightage: '25%', duration: '1 hour' },
                    { name: 'Optional Subject 2', description: 'Additional subject option', weightage: '25%', duration: '1 hour' }
                ]
            });
        }
    } catch (error) {
        console.error('Error in fallback route:', error);
        res.status(500).json({ error: 'Failed to get comprehensive subjects' });
    }
});

// Get all available subjects for an exam
router.post('/onboarding/get-all-subjects', async (req, res) => {
    try {
        const { examName, gradeLevel, stream } = req.body;
        
        if (!examName) {
            return res.status(400).json({ error: 'Exam name is required' });
        }

        const subjects = await onboarding.getAllAvailableSubjects(examName, gradeLevel, stream);
        res.json(subjects);
    } catch (error) {
        console.error('Error getting all available subjects:', error);
        res.status(500).json({ error: 'Failed to get subjects' });
    }
});

// Update user subjects
router.post('/update-user-subjects', authenticateToken, async (req, res) => {
    try {
        const { selectedOptionalSubjects } = req.body;
        
        const user = req.user;
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update user's exam data with selected optional subjects
        if (user.examData) {
            user.examData.selectedOptionalSubjects = selectedOptionalSubjects || [];
            user.updatedAt = new Date();
            
            // Save updated user data
            await database.userOperations.updateUserOnboarding(user.id, user.examData);
        }

        res.json({ 
            success: true, 
            message: 'Subjects updated successfully',
            selectedOptionalSubjects: user.examData?.selectedOptionalSubjects || []
        });
    } catch (error) {
        console.error('Error updating user subjects:', error);
        res.status(500).json({ error: 'Failed to update subjects' });
    }
});

// Complete onboarding
router.post('/onboarding/complete', authenticateToken, async (req, res) => {
    try {
        const { examName, gradeLevel, stream, selectedOptionalSubjects } = req.body;
        
        if (!examName) {
            return res.status(400).json({ error: 'Exam name is required' });
        }

        // Get comprehensive subjects from OpenAI
        const subjectsData = await onboarding.getComprehensiveSubjectsForReview(examName, gradeLevel, stream);
        
        // Update user with exam data
        const user = req.user;
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.examData = {
            examName,
            gradeLevel: gradeLevel || null,
            stream: stream || null,
            subjects: subjectsData,
            selectedOptionalSubjects: selectedOptionalSubjects || [],
            onboardingCompleted: true,
            completedAt: new Date().toISOString()
        };

        // Save user data using the correct function
        await database.userOperations.updateUserOnboarding(user.id, user.examData);

        res.json({ 
            success: true, 
            message: 'Onboarding completed successfully',
            examData: user.examData
        });
    } catch (error) {
        console.error('Onboarding completion error:', error);
        res.status(500).json({ error: 'Failed to complete onboarding' });
    }
});

// Complete onboarding with exam data
router.post('/onboarding/complete', authenticateToken, async (req, res) => {
    try {
        const { examName, gradeLevel, stream, subjects, examInfo, officialName } = req.body;
        
        if (!examName || !subjects || !Array.isArray(subjects)) {
            return res.status(400).json({ error: 'Exam name and subjects array are required' });
        }

        // Update user with exam data
        const user = req.user;
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.examData = {
            examName,
            officialName: officialName || examName,
            gradeLevel: gradeLevel || null,
            stream: stream || null,
            examInfo: examInfo || {},
            subjects: subjects,
            onboardingCompleted: true,
            completedAt: new Date().toISOString()
        };

        // Save user data using the correct function
        await database.userOperations.updateUserOnboarding(user.id, user.examData);

        res.json({ 
            success: true, 
            message: 'Onboarding completed successfully',
            examData: user.examData
        });
    } catch (error) {
        console.error('Onboarding completion error:', error);
        res.status(500).json({ error: 'Failed to complete onboarding' });
    }
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            verified: req.user.verified,
            onboardingCompleted: req.user.onboardingCompleted,
            examData: req.user.examData
        }
    });
});

// Get user info (alias for /me)
router.get('/user', authenticateToken, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            verified: req.user.verified,
            onboardingCompleted: req.user.onboardingCompleted,
            examData: req.user.examData
        }
    });
});

// Get user subjects
router.get('/subjects', authenticateToken, (req, res) => {
    try {
        const subjects = req.user.subjects;
        res.json({ subjects: subjects || [] });
    } catch (error) {
        console.error('Error getting user subjects:', error);
        res.status(500).json({ error: 'Failed to get subjects' });
    }
});

// Add subject
router.post('/subjects', authenticateToken, async (req, res) => {
    try {
        const { name, type } = req.body;
        
        if (!name || !type) {
            return res.status(400).json({ error: 'Subject name and type are required' });
        }

        if (!['mandatory', 'optional'].includes(type)) {
            return res.status(400).json({ error: 'Subject type must be mandatory or optional' });
        }

        const subject = await database.subjectOperations.addUserSubject(req.user.id, { name, type });
        res.json({ subject });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add subject' });
    }
});

// Update subject
router.put('/subjects/:subjectId', authenticateToken, (req, res) => {
    try {
        const { subjectId } = req.params;
        const { name, type } = req.body;
        
        if (!name || !type) {
            return res.status(400).json({ error: 'Subject name and type are required' });
        }

        if (!['mandatory', 'optional'].includes(type)) {
            return res.status(400).json({ error: 'Subject type must be mandatory or optional' });
        }

        const subject = database.subjectOperations.updateUserSubject(req.user.id, subjectId, { name, type });
        res.json({ subject });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update subject' });
    }
});

// Delete subject
router.delete('/subjects/:subjectId', authenticateToken, (req, res) => {
    try {
        const { subjectId } = req.params;
        database.subjectOperations.deleteUserSubject(req.user.id, subjectId);
        res.json({ message: 'Subject deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete subject' });
    }
});

// Generate subject analysis
router.post('/generate-subject-analysis', authenticateToken, async (req, res) => {
    try {
        const { subjectName, examName, gradeLevel } = req.body;
        
        if (!subjectName || !examName) {
            return res.status(400).json({ error: 'Subject name and exam name are required' });
        }

        const analysis = await onboarding.generateSubjectAnalysis(subjectName, examName, gradeLevel);
        
        res.json({ 
            analysis
        });

    } catch (error) {
        console.error('Error generating subject analysis:', error);
        res.status(500).json({ error: 'Failed to generate analysis' });
    }
});

// Get all available subjects for the user's exam
router.get('/all-available-subjects', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        if (!user || !user.examData) {
            return res.status(400).json({ error: 'User exam data not found. Please complete onboarding first.' });
        }

        const { examName, gradeLevel, stream } = user.examData;
        
        if (!examName) {
            return res.status(400).json({ error: 'Exam name not found in user data' });
        }

        const subjects = await onboarding.getAllAvailableSubjects(examName, gradeLevel, stream);
        res.json(subjects);
    } catch (error) {
        console.error('Error getting all available subjects:', error);
        res.status(500).json({ error: 'Failed to get subjects' });
    }
});

// Route to redirect to heatmap with subject data
router.get('/heatmap/:subject', authenticateToken, async (req, res) => {
    try {
        const { subject } = req.params;
        const { examName, gradeLevel, stream } = req.query;
        
        if (!subject || !examName) {
            return res.status(400).json({ error: 'Subject and exam name are required' });
        }

        // Store the subject selection in session for the heatmap to use
        req.session.selectedSubject = subject;
        req.session.selectedExam = examName;
        req.session.selectedGrade = gradeLevel;
        req.session.selectedStream = stream;

        res.json({ 
            success: true, 
            redirectUrl: `/heatmap.html?subject=${encodeURIComponent(subject)}&exam=${encodeURIComponent(examName)}${gradeLevel ? `&grade=${encodeURIComponent(gradeLevel)}` : ''}${stream ? `&stream=${encodeURIComponent(stream)}` : ''}`
        });
    } catch (error) {
        console.error('Error setting up heatmap redirect:', error);
        res.status(500).json({ error: 'Failed to setup heatmap redirect' });
    }
});

// New endpoint for OpenAI exam validation
router.post('/onboarding/validate-exam-openai', authenticateToken, async (req, res) => {
    try {
        const { examName, gradeLevel, stream } = req.body;
        
        if (!examName) {
            return res.status(400).json({ error: 'Exam name is required' });
        }

        // Construct the prompt for OpenAI
        let prompt = `Validate the exam "${examName}" and check for any mismatches with the provided details.`;
        
        if (gradeLevel) {
            prompt += ` Grade level provided: ${gradeLevel}.`;
        }
        
        if (stream) {
            prompt += ` Stream provided: ${stream}.`;
        }
        
        prompt += ` 

        Please validate and respond in JSON format with the following structure:
        {
            "isValid": true/false,
            "mismatches": [
                "List any mismatches found, e.g., 'The stream 'Engineering' is not available for this exam. Available streams are: Science, Commerce, Arts'"
            ],
            "examInfo": {
                "name": "Official exam name",
                "description": "Brief description",
                "country": "Country where exam is conducted",
                "availableGrades": ["List of available grade levels"],
                "availableStreams": ["List of available streams"]
            },
            "subjects": [
                {
                    "name": "Official subject name",
                    "description": "Subject description"
                }
            ]
        }

        Important:
        - Return ALL available official subject names that are relevant to the provided exam, grade, and stream
        - Use official subject names as they appear in the exam syllabus
        - Include both mandatory and optional subjects
        - If there are mismatches, list them clearly
        - If the exam doesn't exist, set isValid to false
        - Ensure subject names are accurate and official
        - Return comprehensive subject list for the specific exam configuration
        - Do not limit the number of subjects - return all that are available`;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are an expert in educational exams and academic systems worldwide. Provide accurate information about exams and their subjects."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 2000
        });

        const content = response.choices[0].message.content;
        
        // Try to parse the JSON response
        let data;
        try {
            // Clean the response to extract JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                data = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('Error parsing OpenAI response:', parseError);
            console.log('Raw response:', content);
            
            // Fallback: create a basic response
            data = {
                isValid: false,
                examInfo: null,
                subjects: []
            };
        }

        // Validate the response structure
        if (!data.hasOwnProperty('isValid')) {
            data.isValid = false;
        }

        if (!data.mismatches || !Array.isArray(data.mismatches)) {
            data.mismatches = [];
        }

        if (!data.subjects || !Array.isArray(data.subjects)) {
            data.subjects = [];
        }

        // Ensure all subjects have required fields
        data.subjects = data.subjects.map(subject => ({
            name: subject.name || 'Unknown Subject',
            description: subject.description || `${subject.name} for ${examName}`
        }));

        res.json({
            ...data
        });

    } catch (error) {
        console.error('Error validating exam with OpenAI:', error);
        res.status(500).json({ 
            error: 'Failed to validate exam',
            isValid: false,
            subjects: []
        });
    }
});

module.exports = router; 