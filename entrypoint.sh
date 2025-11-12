#!/usr/bin/env sh
set -e

echo "🔄 Running Prisma migrations..."
npx prisma migrate deploy

# نحدّد كلمة السر المستخدمة في seeding (الأولوية ل SEED_ADMIN_PASSWORD لو موجودة، ثم ADMIN_PASSWORD، وإلا Admin@123)
export SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-${ADMIN_PASSWORD:-admin123}}"

echo "🔎 Checking if initial seed is needed (User table empty?)..."
node -e "
  const { PrismaClient } = require('@prisma/client');
  (async () => {
    const prisma = new PrismaClient();
    try {
      const count = await prisma.user.count();
      console.log('USER_COUNT=' + count);
      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    } finally {
      await prisma.\$disconnect();
    }
  })();
" | tee /tmp/usercount.log

if grep -q 'USER_COUNT=0' /tmp/usercount.log; then
  echo '🌱 No users found. Running seed...'
  # يدعم seed.ts عبر ts-node حسب package.json (prisma.seed)
  npx prisma db seed
  echo '✅ Seed finished.'
else
  echo 'ℹ️ Users exist. Skipping seed.'
fi

# نحاول إيجاد main.js في أكثر من مسار شائع (Nest)
CANDIDATES="
dist/main.js
dist/src/main.js
apps/api/dist/main.js
apps/api/dist/src/main.js
"

APP_MAIN=""
for f in $CANDIDATES; do
  if [ -f "$f" ]; then
    APP_MAIN="$f"
    break
  fi
done

if [ -z "$APP_MAIN" ]; then
  echo "❌ Could not find compiled main.js in known locations."
  echo "Checked:"
  echo "$CANDIDATES" | sed 's/^/ - /'
  echo "📦 Listing dist/ to help debug:"
  ls -la dist || true
  exit 1
fi

echo "🚀 Starting Nest app: node $APP_MAIN"
exec node "$APP_MAIN"





# #!/usr/bin/env sh
# set -e

# echo "🔄 Running Prisma migrations..."
# npx prisma migrate deploy

# # نحاول إيجاد main.js في أكثر من مسار شائع
# CANDIDATES="
# dist/main.js
# dist/src/main.js
# apps/api/dist/main.js
# apps/api/dist/src/main.js
# "

# APP_MAIN=""
# for f in $CANDIDATES; do
#   if [ -f "$f" ]; then
#     APP_MAIN="$f"
#     break
#   fi
# done

# if [ -z "$APP_MAIN" ]; then
#   echo "❌ Could not find compiled main.js in known locations."
#   echo "Checked:"
#   echo "$CANDIDATES" | sed 's/^/ - /'
#   echo "📦 Listing dist/ to help debug:"
#   ls -la dist || true
#   exit 1
# fi

# echo "🚀 Starting Nest app: node $APP_MAIN"
# exec node "$APP_MAIN"
