// GET /api/community/signin/status - 检查签到状态
import { getUserFromRequest, json, cors } from '../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ signedToday: false, consecutiveDays: 0 });

        const today = new Date().toISOString().split('T')[0];
        const todaySignin = await env.DB.prepare(
            'SELECT consecutive_days FROM signins WHERE user_id = ? AND sign_date = ?'
        ).bind(user.id, today).first();

        const lastSignin = await env.DB.prepare(
            'SELECT consecutive_days FROM signins WHERE user_id = ? ORDER BY sign_date DESC LIMIT 1'
        ).bind(user.id).first();

        return json({
            signedToday: !!todaySignin,
            consecutiveDays: todaySignin ? todaySignin.consecutive_days : (lastSignin ? lastSignin.consecutive_days : 0)
        });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
