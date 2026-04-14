import { UserSchema, type RegisterRequestSchemaType } from '../../db/schema.js';
import { BadRequestError } from '../../config/AppError.js';
import { getDatabaseConnection } from '../../db/index.js';
import bcrypt from 'bcrypt';

export const registerUser = async ({ email, name, password }: RegisterRequestSchemaType) => {
  
  const db = await getDatabaseConnection();
  
  let existingUser = await db.users.findOne({
    where: {
      email
    }
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

  return {
    token: '',
    user: UserSchema.parse(newUser)
  };
};
