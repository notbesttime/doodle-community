-- ================================================
-- 种子数据 - 模拟真实社区内容
-- 部署后在 Cloudflare D1 面板执行此文件
-- ================================================

-- ===== 创建测试用户（密码为无效哈希，无法登录） =====
INSERT INTO users (uid, username, password_hash, nickname, level, exp, caps, signature, created_at) VALUES
('10000001', 'testuser_001', 'invalid:hash', '路人甲甲', 3, 180, 15, '刚发现这个网站，来逛逛', datetime('now', '-5 days')),
('10000002', 'testuser_002', 'invalid:hash', '蛋挞爱好者', 2, 90, 8, '蛋挞天下第一', datetime('now', '-4 days')),
('10000003', 'testuser_003', 'invalid:hash', '热心恶魔', 1, 30, 5, '这个人很懒，什么都没留下~', datetime('now', '-3 days')),
('10000004', 'testuser_004', 'invalid:hash', '吃瓜群众', 1, 20, 3, '默默吃瓜', datetime('now', '-2 days')),
('10000005', 'testuser_005', 'invalid:hash', '潜水大师', 1, 10, 2, '潜水十年', datetime('now', '-1 day'));

-- ===== 帖子1（3天前，2赞1评论） =====
INSERT INTO posts (user_id, author_name, author_level, title, content, images, video_url, likes_count, comments_count, favorites_count, created_at)
VALUES ((SELECT id FROM users WHERE username='testuser_001'), '路人甲甲', 3,
'挖去，怎么不早说还有这个网站',
'有人吗？瓶盖有啥用这个网站的？',
'[]', '', 2, 1, 0, datetime('now', '-3 days'));

-- ===== 帖子2（1天前，1赞2评论） =====
INSERT INTO posts (user_id, author_name, author_level, title, content, images, video_url, likes_count, comments_count, favorites_count, created_at)
VALUES ((SELECT id FROM users WHERE username='testuser_002'), '蛋挞爱好者', 2,
'我不知道，但是',
'蛋挞世界无敌最可爱',
'[]', '', 1, 2, 0, datetime('now', '-1 day'));

-- ===== 帖子3（1小时前，0赞0评论） =====
INSERT INTO posts (user_id, author_name, author_level, title, content, images, video_url, likes_count, comments_count, favorites_count, created_at)
VALUES ((SELECT id FROM users WHERE username='testuser_003'), '热心恶魔', 1,
'热心恶魔？强强',
'这么强？！',
'[]', '', 0, 0, 0, datetime('now', '-1 hour'));

-- ===== 帖子1的点赞（2个） =====
INSERT INTO likes (post_id, user_id, created_at) VALUES
((SELECT id FROM posts WHERE title='挖去，怎么不早说还有这个网站'), (SELECT id FROM users WHERE username='testuser_004'), datetime('now', '-2 days')),
((SELECT id FROM posts WHERE title='挖去，怎么不早说还有这个网站'), (SELECT id FROM users WHERE username='testuser_005'), datetime('now', '-2 days'));

-- ===== 帖子2的点赞（1个） =====
INSERT INTO likes (post_id, user_id, created_at) VALUES
((SELECT id FROM posts WHERE title='我不知道，但是'), (SELECT id FROM users WHERE username='testuser_004'), datetime('now', '-12 hours'));

-- ===== 帖子1的评论（1条："不知道"） =====
INSERT INTO comments (post_id, user_id, author_name, content, likes_count, parent_id, created_at)
VALUES ((SELECT id FROM posts WHERE title='挖去，怎么不早说还有这个网站'),
(SELECT id FROM users WHERE username='testuser_004'), '吃瓜群众', '不知道', 0, 0, datetime('now', '-2 days'));

-- ===== 帖子2的评论（2条："蛋挞世界无敌最可爱!"） =====
INSERT INTO comments (post_id, user_id, author_name, content, likes_count, parent_id, created_at)
VALUES
((SELECT id FROM posts WHERE title='我不知道，但是'),
(SELECT id FROM users WHERE username='testuser_003'), '热心恶魔', '蛋挞世界无敌最可爱!', 0, 0, datetime('now', '-12 hours')),
((SELECT id FROM posts WHERE title='我不知道，但是'),
(SELECT id FROM users WHERE username='testuser_001'), '路人甲甲', '蛋挞世界无敌最可爱!', 0, 0, datetime('now', '-10 hours'));
