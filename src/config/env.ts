import { z } from 'zod';

// Environment variable schema for validation
const envSchema = z.object({
  // Twilio configuration
  TWILIO_ACCOUNT_SID: z.string().min(1, 'Twilio Account SID is required'),
  TWILIO_AUTH_TOKEN: z.string().min(1, 'Twilio Auth Token is required'),
  FROM_NUMBER: z.string().min(1, 'From Number is required'),
  
  // Server configuration
  SERVER: z.string().min(1, 'Server URL is required'),
  PORT: z.string().optional().default('3000'),
  
  // AI Services
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API Key is required'),
  DEEPGRAM_API_KEY: z.string().min(1, 'Deepgram API Key is required'),
  MEM0_API_KEY: z.string().min(1, 'Mem0 API Key is required'),
  
  // Database configuration
  DB_HOST: z.string().min(1, 'Database host is required').default('localhost'),
  DB_PORT: z.string().min(1, 'Database port is required').default('5432'),
  DB_USER: z.string().min(1, 'Database user is required').default('postgres'),
  DB_PASSWORD: z.string().min(1, 'Database password is required').default('postgres'),
  DB_NAME: z.string().min(1, 'Database name is required').default('friday'),
});

// Environment variable type
export type EnvConfig = z.infer<typeof envSchema>;

// Validate and parse environment variables
export function validateEnv(): EnvConfig {
  try {
    const env = envSchema.parse(process.env);
    console.log('✅ Environment variables validated successfully');
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment variable validation failed:');
      error.errors.forEach((err) => {
        console.error(`   - ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error('❌ Unexpected error during environment validation:', error);
    }
    console.error('\nPlease check your .env file and ensure all required variables are set correctly.');
    process.exit(1);
  }
}

// Get environment configuration
export const env = validateEnv(); 