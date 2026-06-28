// GET /api/feed/unread-count - 关注动态未读数
import { getUserFromRequest, json, cors } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ count: 0 });

        const result = await env.DB.prepare(
            `SELECT COUNT(*) as count FROM posts p
             INNER JOIN follows f ON f.following_id = p.user_id
             LEFT JOIN feed_reads fr ON fr.post_id = p.id AND fr.user_id = ?
             WHERE f.follower_id = ? AND p.is_deleted = 0 AND p.is_private = 0
             AND fr.id IS NULL`
        ).bind(user.id, user.id).first();

        return json({ count: result ? result.count : 0 });
    } catch (e) {
        return json({ count: 0 });
    }
}
