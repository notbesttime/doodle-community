// POST /api/admin/ranks/review - 管理员审核申请（批准/拒绝）
// body: { applicationId, action: 'approve'|'reject', rankOrder?, adminNote? }
import { getUserFromRequest, json, cors, createMessage } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限，仅管理员可访问' }, 403);

        const { applicationId, action, rankOrder, adminNote } = await request.json();

        if (!applicationId || !['approve', 'reject'].includes(action)) {
            return json({ error: '参数错误' }, 400);
        }

        // 查询申请详情
        const app = await env.DB.prepare(
            'SELECT * FROM rank_applications WHERE id = ?'
        ).bind(applicationId).first();

        if (!app) return json({ error: '申请不存在' }, 404);
        if (app.status !== 'pending') return json({ error: '该申请已审核过' }, 400);

        if (action === 'approve') {
            // 批准：插入排行榜
            await env.DB.prepare(
                `INSERT INTO rank_entries (type, user_id, nickname, game_uid, server, signature, guild_name, sponsor_amount, rank_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                app.type, app.user_id, app.nickname,
                app.game_uid, app.server, app.signature,
                app.guild_name, app.sponsor_amount, rankOrder || 0
            ).run();

            // 更新申请状态
            await env.DB.prepare(
                'UPDATE rank_applications SET status = ?, admin_note = ?, reviewed_at = datetime(\'now\') WHERE id = ?'
            ).bind('approved', adminNote || '', applicationId).run();

            // 通知用户
            const typeNames = { thanks: '鸣谢榜', sponsor: '赞助榜', master: '大神榜' };
            await createMessage(env, app.user_id, 'system', '系统通知',
                `恭喜！您的${typeNames[app.type]}申请已通过审核，已成功上榜！`);

            return json({ success: true, message: '已批准并加入排行榜' });
        } else {
            // 拒绝
            await env.DB.prepare(
                'UPDATE rank_applications SET status = ?, admin_note = ?, reviewed_at = datetime(\'now\') WHERE id = ?'
            ).bind('rejected', adminNote || '', applicationId).run();

            // 通知用户
            const typeNames = { thanks: '鸣谢榜', sponsor: '赞助榜', master: '大神榜' };
            await createMessage(env, app.user_id, 'system', '系统通知',
                `您的${typeNames[app.type]}申请未通过审核。${adminNote ? '原因：' + adminNote : ''}`);

            return json({ success: true, message: '已拒绝申请' });
        }
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
