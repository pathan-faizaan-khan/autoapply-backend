import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

async function getOtp() {
  try {
    const otps = await sql`SELECT code FROM otps WHERE email = 'testuser@example.com' ORDER BY created_at DESC LIMIT 1`;
    console.log("OTP Code:", otps[0]?.code);
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
}

getOtp();
