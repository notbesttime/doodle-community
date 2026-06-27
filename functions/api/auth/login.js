// POST /api/auth/login - 登录
import { verifyPassword, generateToken, json, cors, checkRateLimit } from '../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const { username, password } = await request.json();
        if (!username || !password) return json({ error: '请输入用户名和密码' }, 400);

        // IP 频率限制
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!await checkRateLimit(env.KV, 'login:' + ip, 10, 600)) {
            return json({ error: '登录尝试过于频繁，请10分钟后再试' }, 429);
        }

        const row = await env.DB.prepare(
            'SELECT * FROM users WHERE username = ?'
        ).bind(username).first();

        if (!row) return json({ error: '用户名不存在，请先注册' }, 400);
        if (!await verifyPassword(password, row.password_hash)) {
            return json({ error: '密码错误' }, 400);
        }

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
            rename_count: row.rename_count,
            followers: row.followers, following: row.following
        };

        return json({ user, token });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
