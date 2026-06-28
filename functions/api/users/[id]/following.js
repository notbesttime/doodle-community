// GET /api/users/[id]/following - 关注列表
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env, params }) {
    try {
        const targetId = parseInt(params.id);
        if (!targetId) return json({ error: '无效的用户ID' }, 400);

        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const offset = (page - 1) * limit;

        const currentUser = await getUserFromRequest(env, request);

        const { results } = await env.DB.prepare(
            `SELECT u.id, u.uid, u.username, u.nickname, u.avatar, u.level, u.signature, u.followers, u.following
             FROM follows f
             INNER JOIN users u ON u.id = f.following_id
             WHERE f.follower_id = ?
             ORDER BY f.created_at DESC
             LIMIT ? OFFSET ?`
        ).bind(targetId, limit, offset).all();

        // 当前用户是否也关注了这些人
        let followingSet = new Set();
        if (currentUser && results.length > 0) {
            const followingIds = results.map(r => r.id);
            const followingResults = await env.DB.prepare(
                `SELECT following_id FROM follows WHERE follower_id = ? AND following_id IN (${followingIds.join(',')})`
            ).bind(currentUser.id).all();
            followingSet = new Set(followingResults.results.map(f => f.following_id));
        }

        const following = results.map(u => ({
            id: u.id,
            uid: u.uid,
            username: u.username,
            nickname: u.nickname,
            avatar: u.avatar,
            level: u.level,
            signature: u.signature,
            followers: u.followers,
            following: u.following,
            isFollowing: followingSet.has(u.id)
        }));

        return json({ following, page, hasMore: results.length === limit });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
