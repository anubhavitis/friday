import { eq } from 'drizzle-orm';
import { db } from '../pkg/db';
import { users, type NewUser, type User } from '../schema/users';

/**
 * Add a new user to the database
 * @param userData The user data to insert
 * @returns The created user
 */
export async function addUser(userData: NewUser): Promise<User> {
  const [user] = await db.insert(users).values(userData).returning();
  return user;
}

/**
 * Find a user by their phone number
 * @param phoneNumber The phone number to search for
 * @returns The user if found, null otherwise
 */
export async function findUserByPhoneNumber(phoneNumber: string): Promise<User | null> {
    console.log("APP: Finding user by phone number:", phoneNumber);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phoneNumber, phoneNumber))
    .limit(1);
  
  return user || null;
}
