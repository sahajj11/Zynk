import { users, UserSchema, type RegisterRequestSchemaType } from '../../db/schema.js';
import { BadRequestError } from '../../config/AppError.js';
import { getDatabaseConnection } from '../../db/index.js';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';

export const registerUser = async ({ email, name, password }: RegisterRequestSchemaType) => {
  
  const db = await getDatabaseConnection();
  
   const existingUser = await db.users.findOne({
    where: { email }
  });
  
  if(existingUser){
    throw new BadRequestError('User With Same Email Already Exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  
  let newUser = await db.users.create({
    email: email,
    name: name,
    password: hashedPassword
  });

  // let insertedUsers = await db.users.createMany([]);

  // let newUsers = await db.users.findMany({
  //   where:{
  //     'id IN': insertedUsers
  //   }
  // })

  return {
    token: '',
    user: UserSchema.parse(newUser)
  };
};
