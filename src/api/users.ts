import { env } from '../config/env';
import UserDbService from '../repository/users';
import { MemoryService } from '../services/memory';
import { SummaryService } from '../services/summary';

export class UsersHandler {
  static async POST(req: Request) {
    try {
      const body = await req.json();
      const { name, phoneNumber, userDetails } = body;

      if (!name || !phoneNumber || !userDetails) {
        return new Response(
          JSON.stringify({ error: 'Name, phone number and user details are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Check if user already exists
      const existingUser = await UserDbService.findUserByPhoneNumber(phoneNumber);
      if (existingUser) {
        return new Response(
          JSON.stringify({ error: 'User with this phone number already exists' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const user = await UserDbService.addUser({ name, phoneNumber });
      console.log('APP: User created:', user);
      
      const memoryService = new MemoryService(env.MEM0_API_KEY);
      const summaryService = new SummaryService(env.OPENAI_API_KEY);
      memoryService.init_user(user.id.toString());
      
      console.log('Adding user details to memory with categorization');
      
      // Use the summary service to categorize and save user details
      const conversationHistory = [
        { speaker: "user" as const, content: userDetails }
      ];
      
      await summaryService.updateMemory(conversationHistory, memoryService, user.id);
      console.log('User details categorized and added to memory');
      
      return new Response(
        JSON.stringify(user),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('Error creating user:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  static async GET(req: Request) {
    try {
      const url = new URL(req.url);
      const phoneNumber = url.searchParams.get('phoneNumber');

      if (!phoneNumber) {
        return new Response(
          JSON.stringify({ error: 'Phone number is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const user = await UserDbService.findUserByPhoneNumber(phoneNumber as string);
      if (!user) {
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify(user),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('Error fetching user:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
}
