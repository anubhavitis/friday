# Friday - AI Assistant

## 📖 Introduction

Friday is an intelligent AI-powered voice assistant that provides real-time conversational capabilities through phone calls. Friday integrates multiple AI services to deliver a seamless voice interaction experience.

### Key Features
- **Real-time Voice Processing**: Handles incoming and outbound phone calls with live speech-to-text and text-to-speech conversion
- **AI-Powered Conversations**: Powered by OpenAI's advanced language models for natural, contextual conversations
- **Memory & Context**: Maintains conversation context and user history using Mem0AI
- **Scheduled Calls**: Automated call scheduling and management system
- **Call Analytics**: Comprehensive call history and user management
- **WebSocket Communication**: Real-time audio streaming and processing

### How It Works
1. **Incoming Calls**: When a call comes in, Friday answers and establishes a WebSocket connection
2. **Speech Processing**: User speech is converted to text using Deepgram's real-time transcription
3. **AI Response**: OpenAI processes the text and generates contextual responses
4. **Voice Output**: Responses are converted back to speech using Deepgram's text-to-speech
5. **Memory Management**: Conversation context is maintained across sessions

## 🚀 Setup Instructions

### Prerequisites
- [Bun](https://bun.sh/) runtime (latest version)
- [Docker](https://www.docker.com/) and Docker Compose (for containerized deployment)
- PostgreSQL database
- API keys for required services (see Environment Variables section)

### Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd friday
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your actual API keys and configuration
   ```

4. **Database setup**:
   ```bash
   # Generate database migrations
   bun run db:generate
   
   # Push migrations to database
   bun run db:push
   
   # Optional: Open Drizzle Studio for database management
   bun run db:studio
   ```

5. **Start the development server**:
   ```bash
   bun run dev
   ```

### Docker Deployment

Run directly using Docker:

```bash
# Build and run with Docker Compose
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build
```

## 🔧 Environment Variables

Create a `.env` file in the root directory with the following variables:

### Required Variables
```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
FROM_NUMBER=your_twilio_phone_number
TO_NUMBER=default_destination_number

# Server Configuration
SERVER=your_server_url
PORT=3000

# AI Services
OPENAI_API_KEY=your_openai_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
MEM0_API_KEY=your_mem0ai_api_key

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_database_password
DB_NAME=friday
```

### Getting API Keys
- **OpenAI**: Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
- **Deepgram**: Sign up at [Deepgram](https://deepgram.com/) and get your API key
- **Twilio**: Create an account at [Twilio](https://www.twilio.com/) and get your credentials
- **Mem0AI**: Get your API key from [Mem0AI](https://mem0.ai/)

## 🎯 How to Use

### Starting the Application

1. **Development mode** (with auto-reload):
   ```bash
   bun run dev
   ```

2. **Production mode**:
   ```bash
   bun run start
   ```

3. **Type checking**:
   ```bash
   bun run typecheck
   ```

### API Endpoints

The application exposes several REST endpoints:

- `GET /health` - Health check endpoint
- `GET /voice/incoming` - Handle incoming voice calls
- `POST /users` - Create new users
- `GET /users` - Retrieve user information
- `POST /scheduler` - Schedule automated calls
- `POST /outbound` - Initiate outbound calls
- `WebSocket /media-stream` - Real-time audio streaming

### Making Calls

1. **Incoming Calls**: Configure your Twilio webhook to point to `/voice/incoming`
2. **Outbound Calls**: Use the `/outbound` endpoint with user details
3. **Scheduled Calls**: Use the `/scheduler` endpoint to set up automated calls

### Database Management

```bash
# Generate new migrations
bun run db:generate

# Apply migrations
bun run db:push

# Open Drizzle Studio (database GUI)
bun run db:studio
```

## 🛠️ Tech Stack

### Core Technologies
- **Runtime**: [Bun](https://bun.sh/) - Fast JavaScript runtime
- **Language**: TypeScript - Type-safe JavaScript
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Validation**: Zod - Runtime type validation

### AI & Voice Services
- **OpenAI**: GPT models for natural language processing
- **Deepgram**: Real-time speech-to-text and text-to-speech
- **Mem0AI**: Conversation memory and context management

### Communication
- **Twilio**: Phone call handling and SMS capabilities
- **WebSockets**: Real-time audio streaming and processing

### Development Tools
- **Drizzle Kit**: Database migrations and management
- **TypeScript**: Static type checking
- **Docker**: Containerization and deployment

### Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### License

This project is licensed under the MIT License - see the LICENSE file for details.

---


TODO
Docker deployment with db
steps to setup twilio (with screenshots)
steps to run (schedule a call)
