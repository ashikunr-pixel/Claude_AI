const bcrypt = require('bcryptjs');
const db = require('./database');

async function initDb() {
  try {
    console.log('[InitDB] Verifying and updating database seeds...');

    // 1. Ensure default Admin user
    const adminCheck = await db.query("SELECT user_id FROM dbo.users WHERE email = 'admin@claude.ai'");
    const adminSalt = await bcrypt.genSalt(10);
    const adminHash = await bcrypt.hash('AdminPassword123!', adminSalt);

    if (adminCheck.recordset.length === 0) {
      await db.query(
        `INSERT INTO dbo.users (name, email, password_hash, role, created_at)
         VALUES ('System Administrator', 'admin@claude.ai', @adminHash, 'ADMIN', SYSUTCDATETIME())`,
        { adminHash }
      );
      console.log('[InitDB] Created default admin user: admin@claude.ai');
    } else {
      await db.query(
        `UPDATE dbo.users SET password_hash = @adminHash WHERE email = 'admin@claude.ai'`,
        { adminHash }
      );
      console.log('[InitDB] Verified admin password hash.');
    }

    // 2. Ensure default Demo user
    const userCheck = await db.query("SELECT user_id FROM dbo.users WHERE email = 'user@claude.ai'");
    const userSalt = await bcrypt.genSalt(10);
    const userHash = await bcrypt.hash('UserPassword123!', userSalt);

    if (userCheck.recordset.length === 0) {
      await db.query(
        `INSERT INTO dbo.users (name, email, password_hash, role, created_at)
         VALUES ('Demo User', 'user@claude.ai', @userHash, 'USER', SYSUTCDATETIME())`,
        { userHash }
      );
      console.log('[InitDB] Created default demo user: user@claude.ai');
    } else {
      await db.query(
        `UPDATE dbo.users SET password_hash = @userHash WHERE email = 'user@claude.ai'`,
        { userHash }
      );
      console.log('[InitDB] Verified demo user password hash.');
    }

    console.log('[InitDB] Database initialization complete.');
  } catch (err) {
    console.error('[InitDB] Initialization failed:', err.message);
  }
}

if (require.main === module) {
  initDb().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { initDb };
