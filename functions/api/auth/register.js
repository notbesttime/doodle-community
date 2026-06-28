// POST /api/auth/register - 注册
import { hashPassword, generateToken, generateUID, generateNickname, json, cors, checkRateLimit } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const { username, password, email, captchaId, captchaAnswer } = await request.json();

        if (!username || username.length < 10 || username.length > 16) return json({ error: '用户名长度需10-16位' }, 400);
        if (!/^[a-zA-Z0-9_]+$/.test(username)) return json({ error: '用户名只能包含字母、数字、下划线' }, 400);
        if (!password || password.length < 6) return json({ error: '密码至少6位' }, 400);

        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

        // 1. 验证码校验（强制）
        if (!captchaId || captchaAnswer === undefined || captchaAnswer === null || captchaAnswer === '') {
            return json({ error: '请输入验证码' }, 400);
        }

        const captcha = await env.DB.prepare(
            'SELECT answer, fails FROM captchas WHERE id = ? AND ip = ?'
        ).bind(captchaId, ip).first();

        if (!captcha) {
            return json({ error: '验证码已过期，请刷新' }, 400);
        }

        if (String(captcha.answer) !== String(captchaAnswer).trim()) {
            // 累计失败次数
            const newFails = (captcha.fails || 0) + 1;
            if (newFails >= 3) {
                const lockUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
                await env.DB.prepare(
                    `INSERT INTO admin_login_attempts (ip, captcha_fails, captcha_locked_until, updated_at)
                     VALUES (?, 3, ?, datetime('now'))
                     ON CONFLICT(ip) DO UPDATE SET captcha_fails = 3, captcha_locked_until = ?, updated_at = datetime('now')`
                ).bind(ip, lockUntil, lockUntil).run();
                await env.DB.prepare(
                    `INSERT OR IGNORE INTO ip_blacklist (ip, reason) VALUES (?, '验证码连续错误3次')`
                ).bind(ip).run();
                await env.DB.prepare('DELETE FROM captchas WHERE id = ?').bind(captchaId).run();
                return json({ error: '验证码错误次数过多，IP已封禁30分钟' }, 429);
            } else {
                await env.DB.prepare('UPDATE captchas SET fails = ? WHERE id = ?').bind(newFails, captchaId).run();
                return json({ error: `验证码错误，还有${3 - newFails}次机会` }, 400);
            }
        }

        // 验证通过，删除验证码并清空失败计数
        await env.DB.prepare('DELETE FROM captchas WHERE id = ?').bind(captchaId).run();
        try {
            await env.DB.prepare(
                'UPDATE admin_login_attempts SET captcha_fails = 0 WHERE ip = ?'
            ).bind(ip).run();
        } catch(e) {}

        // 2. IP 频率限制
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
