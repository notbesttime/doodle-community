// POST /api/community/signin - 签到
import { getUserFromRequest, json, cors, checkLevelUp, updateTaskProgress } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // 检查今天是否已签到
        const existing = await env.DB.prepare(
            'SELECT id FROM signins WHERE user_id = ? AND sign_date = ?'
        ).bind(user.id, today).first();
        if (existing) return json({ error: '今天已经签到过了~' }, 400);

        // 计算连续签到天数
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const lastSignin = await env.DB.prepare(
            'SELECT consecutive_days FROM signins WHERE user_id = ? ORDER BY sign_date DESC LIMIT 1'
        ).bind(user.id).first();
        const consecutiveDays = lastSignin && (await env.DB.prepare(
            'SELECT sign_date FROM signins WHERE user_id = ? AND sign_date = ?'
        ).bind(user.id, yesterday).first()) ? lastSignin.consecutive_days + 1 : 1;

        // 随机奖励
        const exp = Math.floor(Math.random() * 3) + 1;
        const caps = Math.floor(Math.random() * 3) + 1;

        await env.DB.prepare(
            'INSERT INTO signins (user_id, sign_date, exp_gained, caps_gained, consecutive_days) VALUES (?, ?, ?, ?, ?)'
        ).bind(user.id, today, exp, caps, consecutiveDays).run();

        // 更新用户经验瓶盖
        user.exp += exp;
        user.caps += caps;
        const leveledUp = checkLevelUp(user);
        await env.DB.prepare(
            'UPDATE users SET exp = ?, caps = ?, level = ? WHERE id = ?'
        ).bind(user.exp, user.caps, user.level, user.id).run();

        // 更新签到任务进度（签到奖励已在签到时发放，任务自动标记已领取）
        await env.DB.prepare(
            `INSERT INTO user_tasks (user_id, task_id, progress, target, claimed, task_date) VALUES (?, 'signin', 1, 1, 1, ?)
             ON CONFLICT(user_id, task_id, task_date) DO UPDATE SET progress = 1, claimed = 1`
        ).bind(user.id, today).run();
        // 连续签到任务：进度=连续天数（但不超过target=3）
        const signin3Progress = Math.min(consecutiveDays, 3);
        await env.DB.prepare(
            `INSERT INTO user_tasks (user_id, task_id, progress, target, claimed, task_date) VALUES (?, 'signin3', ?, 3, ?, ?)
             ON CONFLICT(user_id, task_id, task_date) DO UPDATE SET progress = ?, claimed = ?`
        ).bind(user.id, signin3Progress, signin3Progress >= 3 ? 1 : 0, today, signin3Progress, signin3Progress >= 3 ? 1 : 0).run();

        return json({
            exp, caps, consecutiveDays,
            user: { exp: user.exp, caps: user.caps, level: user.level, leveledUp }
        });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
