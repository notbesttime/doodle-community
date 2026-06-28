// POST /api/ranks/apply - 申请上榜
// 用户提交：昵称、区服号、游戏UID、签名、社团名称
import { getUserFromRequest, json, cors, checkRateLimit } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const { type, nickname, gameUid, server, signature, guildName, sponsorAmount } = await request.json();

        // 验证榜单类型
        if (!['thanks', 'sponsor', 'master'].includes(type)) {
            return json({ error: '无效的榜单类型' }, 400);
        }

        // 验证必填字段
        if (!nickname || !nickname.trim()) {
            return json({ error: '请填写昵称' }, 400);
        }

        // 频率限制：每天1次申请
        if (!await checkRateLimit(env.KV, 'rankapply:' + user.id, 1, 86400)) {
            return json({ error: '今天已提交过申请，请明天再试' }, 429);
        }

        await env.DB.prepare(
            `INSERT INTO rank_applications (type, user_id, nickname, game_uid, server, signature, guild_name, sponsor_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            type, user.id, nickname.trim(),
            gameUid || '', server || '', signature || '',
            guildName || '', sponsorAmount || 0
        ).run();

        return json({ success: true, message: '申请已提交，请等待管理员审核（1-3个工作日）' });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
