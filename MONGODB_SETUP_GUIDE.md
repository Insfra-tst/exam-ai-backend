# 🚀 MongoDB Setup Guide for Exam AI Backend

## 📋 **Prerequisites**
- A web browser
- Access to internet
- Basic understanding of environment variables

---

## 🎯 **Step 1: Create MongoDB Atlas Account**

### 1.1 Go to MongoDB Atlas
- Visit [MongoDB Atlas](https://www.mongodb.com/atlas)
- Click **"Try Free"** or **"Get Started Free"**

### 1.2 Create Account
- Sign up with Google, GitHub, or email
- Fill in your details
- Verify your email address

---

## 🏗️ **Step 2: Create Your First Cluster**

### 2.1 Start Building
- Click **"Build a Database"**
- Choose **"FREE"** tier (M0)
- Click **"Create"**

### 2.2 Configure Cluster
- **Cloud Provider:** Choose AWS, Google Cloud, or Azure
- **Region:** Select closest to your users
- **Cluster Name:** Leave as default or customize
- Click **"Create"**

### 2.3 Wait for Creation
- Cluster creation takes 2-3 minutes
- You'll see a green checkmark when ready

---

## 👤 **Step 3: Set Up Database Access**

### 3.1 Create Database User
- Go to **"Database Access"** in left sidebar
- Click **"Add New Database User"**

### 3.2 Configure User
- **Authentication Method:** Password
- **Username:** `exam_ai_user` (or your choice)
- **Password:** Create a strong password (save this!)
- **Database User Privileges:** Read and write to any database
- Click **"Add User"**

### 3.3 Save Credentials
```
Username: exam_ai_user
Password: your_strong_password_here
```

---

## 🌐 **Step 4: Configure Network Access**

### 4.1 Allow Access
- Go to **"Network Access"** in left sidebar
- Click **"Add IP Address"**

### 4.2 Choose Access Method
- Click **"Allow Access from Anywhere"** (for development)
- Click **"Confirm"**

> **Note:** For production, you should whitelist specific IP addresses

---

## �� **Step 5: Get Connection String**

### 5.1 Connect to Database
- Go to **"Database"** in left sidebar
- Click **"Connect"**

### 5.2 Choose Connection Method
- Select **"Connect your application"**
- Choose **"Node.js"** as driver
- Version: **4.1 or later**

### 5.3 Copy Connection String
You'll see a connection string like this:
```
mongodb+srv://exam_ai_user:your_password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

### 5.4 Customize Connection String
Replace the connection string with your database name:
```
mongodb+srv://exam_ai_user:your_password@cluster0.xxxxx.mongodb.net/exam_analyzer?retryWrites=true&w=majority
```

---

## ⚙️ **Step 6: Configure Environment Variables**

### 6.1 For Render.com Deployment
1. Go to your Render.com dashboard
2. Open your backend service
3. Go to **"Environment"** tab
4. Add these variables:

```env
MONGODB_URI=mongodb+srv://exam_ai_user:your_password@cluster0.xxxxx.mongodb.net/exam_analyzer?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_here
OPENAI_API_KEY=sk-your-openai-api-key-here
NODE_ENV=production
TOKEN_COST_SUBJECT_ANALYSIS=15
TOKEN_COST_TOPIC_ANALYSIS=20
TOKEN_COST_VISUAL_DATA=25
TOKEN_COST_EXAM_VALIDATION=10
TOKEN_COST_SUBJECT_GENERATION=12
```

### 6.2 For Local Development
Create a `.env` file in your project root:
```env
MONGODB_URI=mongodb+srv://exam_ai_user:your_password@cluster0.xxxxx.mongodb.net/exam_analyzer?retryWrites=true&w=majority
JWT_SECRET=dev_secret_key
OPENAI_API_KEY=sk-your-openai-api-key-here
NODE_ENV=development
```

---

## 🧪 **Step 7: Test Your Setup**

### 7.1 Test Backend Health
```bash
curl https://exam-ai-backend.onrender.com/health
```

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "production",
  "version": "1.0.0",
  "database": "exam_analyzer",
  "platform": "Render.com"
}
```

### 7.2 Test User Registration
```bash
curl -X POST https://exam-ai-backend.onrender.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "uuid-here",
    "email": "test@example.com",
    "name": "Test User",
    "verified": true,
    "onboardingCompleted": false
  },
  "token": "jwt-token-here"
}
```

### 7.3 Test User Login
```bash
curl -X POST https://exam-ai-backend.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

---

## 🔍 **Step 8: Monitor Your Database**

### 8.1 View Collections
1. Go to MongoDB Atlas dashboard
2. Click **"Browse Collections"**
3. You'll see these collections created automatically:
   - `users` - User accounts
   - `tokens` - Token balances
   - `tokenusages` - Token usage history
   - `usersubjects` - User subjects
   - `verificationtokens` - Email verification tokens

### 8.2 Monitor Usage
- Go to **"Metrics"** tab
- Monitor database performance
- Check connection count

---

## 🚨 **Troubleshooting**

### Issue: Connection Failed
**Error:** `MongoServerError: Authentication failed`

**Solution:**
1. Check your username and password
2. Ensure the user has correct permissions
3. Verify the connection string format

### Issue: Network Access Denied
**Error:** `MongoServerError: connection timed out`

**Solution:**
1. Go to Network Access in MongoDB Atlas
2. Add your IP address or allow access from anywhere
3. Wait 1-2 minutes for changes to take effect

### Issue: Database Not Found
**Error:** `MongoServerError: database not found`

**Solution:**
1. The database will be created automatically when you first insert data
2. Make sure your connection string includes the database name: `/exam_analyzer`

### Issue: Render.com Deployment Fails
**Error:** Build fails with MongoDB errors

**Solution:**
1. Check all environment variables are set correctly
2. Ensure MONGODB_URI is properly formatted
3. Verify the MongoDB user has correct permissions

---

## 📊 **Database Schema Overview**

### Users Collection
```javascript
{
  id: "uuid-string",
  email: "user@example.com",
  name: "User Name",
  password: "hashed-password",
  provider: "local",
  verified: true,
  onboardingCompleted: false,
  examData: {},
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
}
```

### Tokens Collection
```javascript
{
  userId: "user-uuid",
  tokens: 100,
  tokensUsed: 0,
  lastUpdated: "2024-01-01T00:00:00.000Z"
}
```

### Token Usage Collection
```javascript
{
  userId: "user-uuid",
  tokensUsed: 15,
  action: "subject_analysis",
  description: "Subject analysis for Mathematics",
  examType: "JEE",
  subject: "Mathematics",
  topic: "Calculus",
  createdAt: "2024-01-01T00:00:00.000Z"
}
```

---

## 🔐 **Security Best Practices**

### 1. **Environment Variables**
- Never commit sensitive data to git
- Use strong, unique passwords
- Rotate secrets regularly

### 2. **Database Access**
- Use least privilege principle
- Regularly review user permissions
- Monitor access logs

### 3. **Network Security**
- Whitelist specific IPs for production
- Use VPC peering for cloud deployments
- Enable MongoDB Atlas security features

---

## 📞 **Support**

### MongoDB Atlas Support
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [MongoDB Community Forums](https://developer.mongodb.com/community/forums/)

### Render.com Support
- [Render.com Documentation](https://render.com/docs)
- [Render.com Status Page](https://status.render.com/)

### Application Support
- Check the application logs in Render.com
- Test the health endpoint
- Verify environment variables are set correctly

---

## ✅ **Success Checklist**

- [ ] MongoDB Atlas account created
- [ ] Free cluster created and running
- [ ] Database user created with correct permissions
- [ ] Network access configured
- [ ] Connection string obtained and customized
- [ ] Environment variables set in Render.com
- [ ] Backend deployed successfully
- [ ] Health endpoint returns OK
- [ ] User registration test passed
- [ ] User login test passed
- [ ] Database collections created automatically

**🎉 Congratulations! Your MongoDB setup is complete and ready for production use.**
