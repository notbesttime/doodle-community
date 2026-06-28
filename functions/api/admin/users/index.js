// GET /api/admin/users - 管理员查看所有用户列表
// 可选参数：?search=关键词  &role=admin|user  &limit=50
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限，仅管理员可访问' }, 403);

        const url = new URL(request.url);
        const search = url.searchParams.get('search') || '';
        const role = url.searchParams.get('role') || '';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

        let query = 'SELECT id, uid, username, nickname, email, email_verified, level, exp, caps, rename_count, role, created_at FROM users WHERE 1=1';
        let bindParams = [];

        if (search) {
            query += ' AND (username LIKE ? OR nickname LIKE ? OR uid LIKE ?)';
            const kw = '%' + search + '%';
            bindParams.push(kw, kw, kw);
        }

        if (role && ['admin', 'user'].includes(role)) {
            query += ' AND role = ?';
            bindParams.push(role);
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        bindParams.push(limit);

        const { results } = await env.DB.prepare(query).bind(...bindParams).all();

        const users = results.map(u => ({
            id: u.id,
            uid: u.uid,
            username: u.username,
            nickname: u.nickname,
            email: u.email || '',
            emailVerified: u.email_verified === 1,
            level: u.level,
            exp: u.exp,
            caps: u.caps,
            renameCount: u.rename_count,
            role: u.role,
            createdAt: u.created_at
        }));

        return json({ users, total: users.length });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
