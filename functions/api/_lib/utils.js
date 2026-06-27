// 共享工具函数 - 供所有 API 路由使用

// ===== 密码哈希（Web Crypto API PBKDF2） =====
export async function hashPassword(password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const hash = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
    );
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return saltHex + ':' + hashHex;
}

export async function verifyPassword(password, storedHash) {
    const [saltHex, hashHex] = storedHash.split(':');
    const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const hash = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
    );
    const computedHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computedHex === hashHex;
}

// ===== Token 生成 =====
export function generateToken() {
    const arr = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== 8位数字UID =====
export function generateUID() {
    let uid = '';
    for (let i = 0; i < 8; i++) uid += Math.floor(Math.random() * 10);
    return uid;
}

// ===== 随机昵称 =====
export function generateNickname() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
    return '热心神明' + suffix;
}

// ===== 6位验证码 =====
export function generateCode() {
    return String(Math.floor(Math.random() * 900000) + 100000);
}

// ===== 邮件发送（EmailJS） =====
export async function sendEmail(env, to, code) {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            service_id: env.EMAILJS_SERVICE_ID,
            template_id: env.EMAILJS_TEMPLATE_ID,
            user_id: env.EMAILJS_PUBLIC_KEY,
            template_params: {
                to_email: to,
                code: code,
                site_name: '乱涂彩社区'
            }
        })
    });
    return res.ok;
}

// ===== 验证码存取（KV） =====
export async function storeCode(kv, email, code) {
    await kv.put('code:' + email, code, { expirationTtl: 600 }); // 10分钟
}

export async function getCode(kv, email) {
    return await kv.get('code:' + email);
}

export async function deleteCode(kv, email) {
    await kv.delete('code:' + email);
}

// ===== 频率限制（KV） =====
export async function checkRateLimit(kv, key, maxCount, windowSec) {
    const count = parseInt(await kv.get('rl:' + key) || '0');
    if (count >= maxCount) return false;
    await kv.put('rl:' + key, String(count + 1), { expirationTtl: windowSec });
    return true;
}

// ===== 会话验证 =====
export async function getUserFromRequest(env, request) {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    const session = await env.DB.prepare(
        'SELECT user_id, expires_at FROM sessions WHERE token = ?'
    ).bind(token).first();
    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) {
        await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        return null;
    }
    const user = await env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
    ).bind(session.user_id).first();
    return user ? { ...user, token } : null;
}

// ===== JSON 响应 =====
export function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization'
        }
    });
}

// ===== CORS 预检 =====
export function cors() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization'
        }
    });
}

// ===== 经验升级计算 =====
export function checkLevelUp(user) {
    let leveledUp = false;
    while (user.exp >= user.level * 100) {
        user.exp -= user.level * 100;
        user.level++;
        leveledUp = true;
    }
    return leveledUp;
}

// ===== 创建消息 =====
export async function createMessage(env, userId, type, senderName, content, relatedPostId = null) {
    await env.DB.prepare(
        'INSERT INTO messages (user_id, type, sender_name, content, related_post_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, type, senderName, content, relatedPostId).run();
}
