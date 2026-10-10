import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

export async function connectDB() {
  try {
    const conn = await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log(`[db] Connected to MongoDB: ${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    console.error('[db] MONGO_URI shape (password never printed):', describeUri(env.mongoUri));
    process.exit(1);
  }
}

/**
 * Explains what is wrong with a connection string without revealing the
 * password — the usual culprits when a hosted deploy says "bad auth" are a
 * placeholder left in, angle brackets kept from the template, stray
 * whitespace, or a character that needed URL-encoding.
 */
function describeUri(uri = '') {
  const m = uri.match(/^(mongodb(?:\+srv)?):\/\/([^:@/]*)(?::([^@]*))?@([^/?]+)(\/[^?]*)?(\?.*)?$/s);
  if (!m) return { parsable: false, startsWithMongodb: /^mongodb/.test(uri), hasWhitespace: /\s/.test(uri) };
  const [, scheme, user, pass = '', host, dbPath = '', query = ''] = m;
  return {
    scheme,
    user,
    host,
    database: dbPath.replace('/', '') || '(none)',
    options: query,
    passwordLength: pass.length,
    passwordHasAngleBrackets: /[<>]/.test(pass),
    passwordIsPlaceholder: /password/i.test(pass),
    passwordHasWhitespace: /\s/.test(pass),
    passwordNeedsEncoding: /[@:/?#[\]]/.test(pass),
    uriHasWhitespace: /\s/.test(uri),
  };
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
