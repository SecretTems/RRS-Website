import { connectToDatabase } from './lib/mongodb.js';
import { hashPassword } from './lib/auth.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function createAdmin() {
  try {
    console.log('\n🔧 RRS Admin User Creator\n');

    const { db } = await connectToDatabase();
    const users = db.collection('users');

    // Get admin details
    const username = await question('Enter admin username: ');
    const email = await question('Enter admin email (@phinmaed.com): ');
    const password = await question('Enter admin password: ');

    // Validate email
    if (!email.endsWith('@phinmaed.com')) {
      console.error('❌ Error: Email must end with @phinmaed.com');
      process.exit(1);
    }

    // Check if user already exists
    const existingUser = await users.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      console.error('❌ Error: User with this email or username already exists');
      process.exit(1);
    }

    // Create admin user
    const hashedPassword = await hashPassword(password);

    const adminUser = {
      username,
      email,
      password: hashedPassword,
      fullName: 'System Administrator',
      studentId: 'ADMIN',
      department: 'IT Department',
      phone: '',
      profilePhoto: null,
      role: 'admin',
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await users.insertOne(adminUser);

    console.log('\n✅ Admin user created successfully!');
    console.log(`\nLogin credentials:`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`\n⚠️  Please change the password after first login!\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createAdmin();