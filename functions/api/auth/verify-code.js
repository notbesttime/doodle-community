// POST /api/auth/verify-code - 验证验证码
import { getCode, deleteCode, json, cors } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const { email, code } = await request.json();
        if (!email || !code) return json({ error: '参数缺失' }, 400);

        const storedCode = await getCode(env.KV, email);
        if (!storedCode) return json({ error: '验证码已过期，请重新发送' }, 400);
        if (storedCode !== code) return json({ error: '验证码错误' }, 400);

        await deleteCode(env.KV, email);
        return json({ success: true });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
