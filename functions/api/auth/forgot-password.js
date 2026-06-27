// POST /api/auth/forgot-password - 忘记密码（通过邮箱重置）
import { getCode, deleteCode, hashPassword, json, cors } from '../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const { email, code, newPassword } = await request.json();
        if (!email || !code || !newPassword) return json({ error: '参数缺失' }, 400);
        if (newPassword.length < 6) return json({ error: '密码至少6位' }, 400);

        // 验证验证码
        const storedCode = await getCode(env.KV, email);
        if (!storedCode) return json({ error: '验证码已过期，请重新发送' }, 400);
        if (storedCode !== code) return json({ error: '验证码错误' }, 400);

        // 找到用户
        const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
        if (!user) return json({ error: '该邮箱未绑定任何账号' }, 400);

        // 更新密码
        const passwordHash = await hashPassword(newPassword);
        await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            .bind(passwordHash, user.id).run();

        // 删除验证码
        await deleteCode(env.KV, email);

        // 删除该用户所有会话（强制重新登录）
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();

        return json({ success: true, message: '密码重置成功，请重新登录' });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
