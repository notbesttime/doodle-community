// POST /api/auth/register - 注册
import { hashPassword, generateToken, generateUID, generateNickname, json, cors, checkRateLimit } from '../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const { username, password, email } = await request.json();

        if (!username || username.length < 3) return json({ error: '用户名至少3位' }, 400);
        if (!/^[a-zA-Z0-9_]+$/.test(username)) return json({ error: '用户名只能包含字母、数字、下划线' }, 400);
        if (!password || password.length < 6) return json({ error: '密码至少6位' }, 400);

        // IP 频率限制
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!await checkRateLimit(env.KV, 'reg:' + ip, 5, 3600)) {
            return json({ error: '注册过于频繁，请1小时后再试' }, 429);
        }

        // 检查用户名是否已存在
        const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
        if (existing) return json({ error: '该用户名已被注册' }, 400);

        // 如果填了邮箱，检查是否被占用
        if (email) {
            const emailExists = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND email != ""').bind(email).first();
            if (emailExists) return json({ error: '该邮箱已被绑定' }, 400);
        }

        const passwordHash = await hashPassword(password);
        const uid = generateUID();
        const nickname = generateNickname();

        // 确保UID唯一
        let uidExists = await env.DB.prepare('SELECT id FROM users WHERE uid = ?').bind(uid).first();
        let finalUid = uid;
        while (uidExists) {
            finalUid = generateUID();
            uidExists = await env.DB.prepare('SELECT id FROM users WHERE uid = ?').bind(finalUid).first();
        }

        const result = await env.DB.prepare(
            'INSERT INTO users (uid, username, password_hash, nickname, email, email_verified) VALUES (?, ?, ?, ?, ?, 0)'
        ).bind(finalUid, username, passwordHash, nickname, email || '').run();

        const userId = result.meta.last_row_id;
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.prepare(
            'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
        ).bind(token, userId, expiresAt).run();

        const user = {
            id: userId, uid: finalUid, username, nickname,
            email: email || '', email_verified: 0,
            avatar: '', signature: '这个人很懒，什么都没留下~',
            level: 1, exp: 0, caps: 0, rename_count: 0,
            followers: 0, following: 0
        };

        return json({ user, token });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
