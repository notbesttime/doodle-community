// GET /api/admin/ranks/applications - 管理员查看所有排行榜申请
// 可选参数：?status=pending|approved|rejected  &type=thanks|sponsor|master
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限，仅管理员可访问' }, 403);

        const url = new URL(request.url);
        const status = url.searchParams.get('status') || 'pending';
        const type = url.searchParams.get('type') || '';

        let query = 'SELECT a.*, u.username FROM rank_applications a LEFT JOIN users u ON a.user_id = u.id WHERE a.status = ?';
        let bindParams = [status];

        if (type && ['thanks', 'sponsor', 'master'].includes(type)) {
            query += ' AND a.type = ?';
            bindParams.push(type);
        }

        query += ' ORDER BY a.created_at DESC';

        const { results } = await env.DB.prepare(query).bind(...bindParams).all();

        const applications = results.map(a => ({
            id: a.id,
            type: a.type,
            userId: a.user_id,
            username: a.username,
            nickname: a.nickname,
            gameUid: a.game_uid,
            server: a.server,
            signature: a.signature,
            guildName: a.guild_name,
            sponsorAmount: a.sponsor_amount,
            status: a.status,
            adminNote: a.admin_note,
            createdAt: a.created_at,
            reviewedAt: a.reviewed_at
        }));

        return json({ applications });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
