# Friday - AI Assistant

Friday is an AI-powered assistant built with TypeScript, Bun, and modern AI technologies. The project integrates various AI services and provides a robust backend infrastructure.

## 🚀 Features

- AI-powered assistant capabilities
- Voice processing with Deepgram
- OpenAI integration
- Twilio integration for communication
- PostgreSQL database with Drizzle ORM
- Docker support for easy deployment

## 🛠️ Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Language**: TypeScript
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **AI Services**:
  - OpenAI
  - Deepgram
  - Mem0AI
- **Communication**: Twilio
- **Containerization**: Docker

## 📋 Prerequisites

- [Bun](https://bun.sh/) installed
- [Docker](https://www.docker.com/) and Docker Compose
- PostgreSQL database
- API keys for:
  - OpenAI
  - Deepgram
  - Twilio
  - Mem0AI

## 🚀 Getting Started

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd friday
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Set up environment variables:
   Create a `.env` file with the following variables:
   ```
   OPENAI_API_KEY=your_openai_api_key
   DEEPGRAM_API_KEY=your_deepgram_api_key
   TWILIO_ACCOUNT_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_twilio_token
   MEM0AI_API_KEY=your_mem0ai_key
   DATABASE_URL=your_database_url
   ```

4. Run database migrations:
   ```bash
   bun run db:generate
   bun run db:push
   ```

5. Start the development server:
   ```bash
   bun run dev
   ```

## 🐳 Docker Deployment

Build and run using Docker Compose:
```bash
docker-compose up --build
```

## 📝 Available Scripts

- `bun run start` - Start the application
- `bun run dev` - Start the development server with watch mode
- `bun run typecheck` - Run TypeScript type checking
- `bun run db:generate` - Generate database migrations
- `bun run db:push` - Push database migrations
- `bun run db:studio` - Open Drizzle Studio for database management

## 📁 Project Structure

```
friday/
├── src/           # Source code
├── drizzle/       # Database migrations and schema
├── scripts/       # Utility scripts
├── app.ts         # Main application entry
├── config.yaml    # Configuration file
├── Dockerfile     # Docker configuration
└── docker-compose.yml # Docker Compose configuration
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details. 