# Exam Pattern Analyzer - Backend API

This is the backend API for the Exam Pattern Analyzer application, designed to be deployed on Render.com.

## Quick Start

1. Install dependencies: `npm install`
2. Set environment variables (see below)
3. Start server: `node server.js`

## Environment Variables

Required environment variables for Render.com deployment:

```env
DB_HOST=localhost
DB_USER=iextqmxf_exams
DB_PASSWORD=D#3ItY3za(BZ
DB_NAME=iextqmxf_exams
DB_PORT=3306
OPENAI_API_KEY=your_openai_api_key
JWT_SECRET=your_jwt_secret
NODE_ENV=production
PORT=3000
```

## API Endpoints

- `GET /health` - Health check
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /tokens/balance` - Get user token balance
- `POST /payment/purchase` - Purchase tokens
- `POST /api/analyze` - Analyze exam data

## Database

The application uses MySQL database with the following tables:
- users
- user_tokens
- token_usage_logs
- payment_transactions

## Deployment

This backend is designed to be deployed on Render.com with the following configuration:
- Root Directory: `render-backend`
- Build Command: `npm install`
