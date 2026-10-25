import 'dotenv/config';

const env = (k, d = '') => process.env[k] ?? d;

export const config = {
  port: Number(env('PORT', '3010')),
  jwtSecret: env('JWT_SECRET', 'shimmerblog-dev-secret'),
  db: {
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', '3306')),
    user: env('DB_USER', 'root'),
    password: env('DB_PASSWORD'),
    database: env('DB_NAME', 'shimmerblog'),
  },
  admin: {
    password: env('ADMIN_PASSWORD', 'shimmer-admin'),
  },
  github: {
    clientId: env('GITHUB_CLIENT_ID'),
    clientSecret: env('GITHUB_CLIENT_SECRET'),
  },
  google: {
    clientId: env('GOOGLE_CLIENT_ID'),
    clientSecret: env('GOOGLE_CLIENT_SECRET'),
  },
  smtp: {
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT', '587')),
    secure: env('SMTP_SECURE') === 'true',
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('SMTP_FROM') || env('SMTP_USER'),
  },
};
