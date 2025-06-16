import { addUser, findUserByPhoneNumber } from '../repository/users';

export class UsersHandler {
  static async POST(req: Request) {
    try {
      const body = await req.json();
      const { name, phoneNumber } = body;

      if (!name || !phoneNumber) {
        return new Response(
          JSON.stringify({ error: 'Name and phone number are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Check if user already exists
      const existingUser = await findUserByPhoneNumber(phoneNumber);
      if (existingUser) {
        return new Response(
          JSON.stringify({ error: 'User with this phone number already exists' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const user = await addUser({ name, phoneNumber });
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

      const user = await findUserByPhoneNumber(phoneNumber);
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
