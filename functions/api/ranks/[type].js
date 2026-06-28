// GET /api/ranks/:type - 获取排行榜列表
// type: thanks(鸣谢榜) / sponsor(赞助榜) / master(大神榜)
import { json, cors } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ params, request, env }) {
    try {
        const type = params.type;
        if (!['thanks', 'sponsor', 'master'].includes(type)) {
            return json({ error: '无效的榜单类型' }, 400);
        }

        const url = new URL(request.url);
        const search = url.searchParams.get('search') || '';

        let query = 'SELECT * FROM rank_entries WHERE type = ?';
        let bindParams = [type];

        if (search) {
            query += ' AND (nickname LIKE ? OR game_uid LIKE ? OR guild_name LIKE ? OR server LIKE ?)';
            const kw = `%${search}%`;
            bindParams.push(kw, kw, kw, kw);
        }

        if (type === 'sponsor') {
            query += ' ORDER BY sponsor_amount DESC, created_at ASC';
        } else {
            query += ' ORDER BY rank_order ASC, created_at ASC';
        }

        const { results } = await env.DB.prepare(query).bind(...bindParams).all();

        const entries = results.map((r, i) => ({
            id: r.id,
            rank: i + 1,
            nickname: r.nickname,
            gameUid: r.game_uid,
            server: r.server,
            signature: r.signature,
            guildName: r.guild_name,
            sponsorAmount: r.sponsor_amount
        }));

        return json({ entries });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
