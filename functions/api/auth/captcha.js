// GET /api/auth/captcha - 获取数学题验证码
// POST /api/auth/captcha - 验证数学题
import { json, cors, getClientIp, cleanupExpiredDeleted } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

// 获取数学题
export async function onRequestGet({ request, env }) {
    try {
        await cleanupExpiredDeleted(env);

        const ip = getClientIp(request);

        // 检查是否被验证码封禁（连续答错3次）
        const attempt = await env.DB.prepare(
            'SELECT captcha_locked_until FROM admin_login_attempts WHERE ip = ?'
        ).bind(ip).first();

        if (attempt && attempt.captcha_locked_until && new Date(attempt.captcha_locked_until) > new Date()) {
            const lockTime = new Date(attempt.captcha_locked_until);
            const remaining = Math.ceil((lockTime - new Date()) / 60000);
            return json({ error: `验证码尝试过多，请${remaining}分钟后再试` }, 429);
        }

        // 生成随机数学题
        const a = Math.floor(Math.random() * 9) + 1;  // 1-9
        const b = Math.floor(Math.random() * 9) + 1;  // 1-9
        const ops = ['+', '-', '×'];
        const op = ops[Math.floor(Math.random() * ops.length)];
        let answer;
        let question;
        if (op === '+') {
            answer = a + b;
            question = `${a} + ${b} = ?`;
        } else if (op === '-') {
            // 确保结果不为负
            const big = Math.max(a, b);
            const small = Math.min(a, b);
            answer = big - small;
            question = `${big} - ${small} = ?`;
        } else {
            answer = a * b;
            question = `${a} × ${b} = ?`;
        }

        // 生成唯一ID
        const captchaId = crypto.randomUUID();

        // 存入D1
        await env.DB.prepare(
            'INSERT INTO captchas (id, answer, ip) VALUES (?, ?, ?)'
        ).bind(captchaId, String(answer), ip).run();

        return json({ captchaId, question });
    } catch(e) {
        return json({ error: '获取验证码失败' }, 500);
    }
}

// 验证数学题
export async function onRequestPost({ request, env }) {
    try {
        const { captchaId, answer } = await request.json();
        const ip = getClientIp(request);

        const captcha = await env.DB.prepare(
            'SELECT answer, fails FROM captchas WHERE id = ? AND ip = ?'
        ).bind(captchaId, ip).first();

        if (!captcha) {
            return json({ valid: false, error: '验证码已过期，请刷新' });
        }

        if (String(captcha.answer) === String(answer).trim()) {
            // 验证通过，删除验证码记录
            await env.DB.prepare('DELETE FROM captchas WHERE id = ?').bind(captchaId).run();
            // 重置验证码失败计数
            await env.DB.prepare(
                'UPDATE admin_login_attempts SET captcha_fails = 0 WHERE ip = ?'
            ).bind(ip).run();
            return json({ valid: true });
        } else {
            // 验证失败，累计失败次数
            const newFails = (captcha.fails || 0) + 1;

            if (newFails >= 3) {
                // 封禁30分钟
                const lockUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
                await env.DB.prepare(
                    `INSERT INTO admin_login_attempts (ip, captcha_fails, captcha_locked_until, updated_at)
                     VALUES (?, 3, ?, datetime('now'))
                     ON CONFLICT(ip) DO UPDATE SET captcha_fails = 3, captcha_locked_until = ?, updated_at = datetime('now')`
                ).bind(ip, lockUntil, lockUntil).run();

                // 加入IP黑名单
                await env.DB.prepare(
                    `INSERT OR IGNORE INTO ip_blacklist (ip, reason) VALUES (?, '验证码连续错误3次')`
                ).bind(ip).run();

                await env.DB.prepare('DELETE FROM captchas WHERE id = ?').bind(captchaId).run();
                return json({ valid: false, error: '验证码错误次数过多，IP已封禁30分钟', locked: true });
            } else {
                await env.DB.prepare('UPDATE captchas SET fails = ? WHERE id = ?').bind(newFails, captchaId).run();
                return json({ valid: false, error: `答案错误，还有${3 - newFails}次机会` });
            }
        }
    } catch(e) {
        return json({ valid: false, error: '验证失败' });
    }
}
