import { sign } from 'hono/jwt';
import bcrypt from 'bcrypt';

import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users } from '../../../drizzle/schemas/user.schema.js';
import { UserSchema, type RegisterRequestSchemaType } from '../../db/schema.js';
import { BadRequestError } from '../../config/AppError.js';


const JWT_SECRET = process.env.JWT_SECRET || 'ignis_secret_key';

export const registerHandler = async ({ email, name, password }: RegisterRequestSchemaType) => {
  
  const [existingUser] = await db.select().from(users).where(eq(users.email, email));
  
  if(existingUser){
    throw new BadRequestError('User With Same Email Already Exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const [result] = await db.insert(users).values({ name, email, password: hashedPassword });
  
  const newUser = { id: result.insertId, name, email };
  const token = await sign(newUser, JWT_SECRET);

  return {
    token: token,
    user: UserSchema.parse(newUser)
  };
};

export const loginHandler = async (c: any) => {
  const { email, password } = c.req.valid('json');

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await sign({ id: user.id, email: user.email }, JWT_SECRET);
  return c.json({ token, user: { id: user.id, name: user.name, email: user.email } }, 200);
};