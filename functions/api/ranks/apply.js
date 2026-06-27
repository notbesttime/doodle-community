// POST /api/ranks/apply - 申请上榜
import { getUserFromRequest, json, cors, checkRateLimit } from '../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const { type, gameUid, screenshotUrl, signature, sponsorAmount } = await request.json();
        if (!['thanks', 'sponsor', 'master'].includes(type)) {
            return json({ error: '无效的榜单类型' }, 400);
        }

        // 频率限制：每天1次申请
        if (!await checkRateLimit(env.KV, 'rankapply:' + user.id, 1, 86400)) {
            return json({ error: '今天已提交过申请，请明天再试' }, 429);
        }

        await env.DB.prepare(
            'INSERT INTO rank_applications (type, user_id, game_uid, screenshot_url, signature, sponsor_amount) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(type, user.id, gameUid || '', screenshotUrl || '', signature || '', sponsorAmount || 0).run();

        return json({ success: true, message: '申请已提交，请等待管理员审核（1-3个工作日）' });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
