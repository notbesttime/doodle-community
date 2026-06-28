// POST /api/auth/send-code - 发送验证码到邮箱
import { generateCode, storeCode, sendEmail, json, cors, checkRateLimit } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const { email, purpose } = await request.json(); // purpose: 'register' | 'reset'
        if (!email) return json({ error: '请输入邮箱' }, 400);

        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        // 同一邮箱60秒1次
        if (!await checkRateLimit(env.KV, 'code:' + email, 1, 60)) {
            return json({ error: '验证码发送过于频繁，请60秒后再试' }, 429);
        }
        // 同一IP 10分钟3次
        if (!await checkRateLimit(env.KV, 'codeip:' + ip, 3, 600)) {
            return json({ error: '请求过于频繁，请10分钟后再试' }, 429);
        }

        // 如果是重置密码，检查邮箱是否存在
        if (purpose === 'reset') {
            const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
            if (!user) return json({ error: '该邮箱未绑定任何账号' }, 400);
        }

        const code = generateCode();
        await storeCode(env.KV, email, code);

        const sent = await sendEmail(env, email, code);
        if (!sent) return json({ error: '邮件发送失败，请稍后重试' }, 500);

        return json({ success: true, message: '验证码已发送到' + email });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
