// POST /api/auth/login - 登录（含IP黑名单检查 + 数学题验证 + 4次锁定）
import { verifyPassword, generateToken, json, cors, checkRateLimit, getClientIp, checkIpBlacklist, getLevelColor } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const { username, password, captchaId, captchaAnswer } = await request.json();
        const ip = getClientIp(request);

        // 1. IP黑名单检查（返回剩余时间）
        const ipInfo = await checkIpBlacklist(env, request);
        if (ipInfo.blocked) {
            if (ipInfo.permanent) {
                return json({ error: '您的IP已被永久封禁，请联系管理员', reason: ipInfo.reason }, 403);
            }
            return json({
                error: `您的IP已被封禁，剩余${ipInfo.remaining_minutes}分钟`,
                reason: ipInfo.reason,
                remaining_minutes: ipInfo.remaining_minutes
            }, 403);
        }

        // 2. 检查是否被密码锁定（4次失败锁1小时）
        try {
            const attempt = await env.DB.prepare(
                'SELECT locked_until FROM admin_login_attempts WHERE ip = ?'
            ).bind(ip).first();
            if (attempt && attempt.locked_until && new Date(attempt.locked_until) > new Date()) {
                const remaining = Math.ceil((new Date(attempt.locked_until) - new Date()) / 60000);
                return json({ error: `登录失败次数过多，请${remaining}分钟后再试` }, 429);
            }
        } catch(e) {}

        if (!username || !password) return json({ error: '请输入用户名和密码' }, 400);

        // 3. 数学题验证（如果传了captchaId就验证）
        if (captchaId && captchaAnswer) {
            try {
                const captcha = await env.DB.prepare(
                    'SELECT answer FROM captchas WHERE id = ? AND ip = ?'
                ).bind(captchaId, ip).first();

                if (!captcha) {
                    return json({ error: '验证码已过期，请刷新' }, 400);
                }

                if (String(captcha.answer) !== String(captchaAnswer).trim()) {
                    // 验证码错误不累计密码失败次数
                    await env.DB.prepare('DELETE FROM captchas WHERE id = ?').bind(captchaId).run();
                    return json({ error: '验证码错误，请刷新重试' }, 400);
                }

                // 验证通过，删除验证码
                await env.DB.prepare('DELETE FROM captchas WHERE id = ?').bind(captchaId).run();
            } catch(e) {}
        }

        // 4. IP 频率限制
        if (!await checkRateLimit(env.KV, 'login:' + ip, 10, 600, env.DB)) {
            return json({ error: '登录尝试过于频繁，请10分钟后再试' }, 429);
        }

        // 5. 验证用户名密码
        const row = await env.DB.prepare(
            'SELECT * FROM users WHERE username = ?'
        ).bind(username).first();

        if (!row) {
            return json({ error: '用户名不存在，请先注册' }, 400);
        }

        if (!await verifyPassword(password, row.password_hash)) {
            // 密码错误，累计失败次数
            await recordLoginFailure(env, ip);
            return json({ error: '密码错误' }, 400);
        }

        // 登录成功，清除失败记录
        try {
            await env.DB.prepare(
                'UPDATE admin_login_attempts SET fail_count = 0, locked_until = NULL WHERE ip = ?'
            ).bind(ip).run();
        } catch(e) {}

        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.prepare(
            'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
        ).bind(token, row.id, expiresAt).run();

        const user = {
            id: row.id, uid: row.uid, username: row.username, nickname: row.nickname,
            email: row.email, email_verified: row.email_verified,
            avatar: row.avatar, signature: row.signature,
            level: row.level, exp: row.exp, caps: row.caps,
            expToNext: Math.floor(2.5 * row.level * row.level + 10 * row.level),
            levelColor: getLevelColor(row.level),
            rename_count: row.rename_count,
            followers: row.followers, following: row.following
        };

        return json({ user, token });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}

// 记录登录失败，4次锁定1小时 + 自动封IP
async function recordLoginFailure(env, ip) {
    try {
        const existing = await env.DB.prepare(
            'SELECT fail_count FROM admin_login_attempts WHERE ip = ?'
        ).bind(ip).first();

        const newCount = (existing?.fail_count || 0) + 1;

        if (newCount >= 4) {
            // 锁定1小时
            const lockUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            await env.DB.prepare(
                `INSERT INTO admin_login_attempts (ip, fail_count, locked_until, updated_at)
                 VALUES (?, 4, ?, datetime('now'))
                 ON CONFLICT(ip) DO UPDATE SET fail_count = 4, locked_until = ?, updated_at = datetime('now')`
            ).bind(ip, lockUntil, lockUntil).run();

            // 自动加入IP黑名单（带过期时间）
            await env.DB.prepare(
                `INSERT INTO ip_blacklist (ip, reason, locked_until, note)
                 VALUES (?, '恶意攻击：连续4次密码错误', ?, '自动封禁')
                 ON CONFLICT(ip) DO UPDATE SET reason = '恶意攻击：连续4次密码错误', locked_until = ?, note = '自动封禁'`
            ).bind(ip, lockUntil, lockUntil).run();
        } else {
            await env.DB.prepare(
                `INSERT INTO admin_login_attempts (ip, fail_count, updated_at)
                 VALUES (?, 1, datetime('now'))
                 ON CONFLICT(ip) DO UPDATE SET fail_count = fail_count + 1, updated_at = datetime('now')`
            ).bind(ip).run();
        }
    } catch(e) {}
}
