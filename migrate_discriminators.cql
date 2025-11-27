-- Atualizar usuários com discriminator null
-- Execute este script no Cassandra

-- Dan
UPDATE nexus.users SET discriminator = '1001' WHERE user_id = (SELECT user_id FROM nexus.users WHERE username = 'Dan' AND discriminator = null LIMIT 1 ALLOW FILTERING);

-- Dann  
UPDATE nexus.users SET discriminator = '1002' WHERE user_id = (SELECT user_id FROM nexus.users WHERE username = 'Dann' AND discriminator = null LIMIT 1 ALLOW FILTERING);

-- Dan2 (primeiro)
UPDATE nexus.users SET discriminator = '1003' WHERE user_id = (SELECT user_id FROM nexus.users WHERE username = 'Dan2' AND email = 'dan2@gmail.com' ALLOW FILTERING);

-- Dan2 (segundo)
UPDATE nexus.users SET discriminator = '1004' WHERE user_id = (SELECT user_id FROM nexus.users WHERE username = 'Dan2' AND email = 'dan2@email.com' ALLOW FILTERING);

-- testuser (primeiro)
UPDATE nexus.users SET discriminator = '2001' WHERE user_id = (SELECT user_id FROM nexus.users WHERE username = 'testuser' AND email = 'test@test.com' LIMIT 1 ALLOW FILTERING);

-- testuser2
UPDATE nexus.users SET discriminator = '2002' WHERE user_id = (SELECT user_id FROM nexus.users WHERE username = 'testuser2' ALLOW FILTERING);

-- alice
UPDATE nexus.users SET discriminator = '3001' WHERE user_id = (SELECT user_id FROM nexus.users WHERE username = 'alice' ALLOW FILTERING);

-- bob
UPDATE nexus.users SET discriminator = '4001' WHERE user_id = (SELECT user_id FROM nexus.users WHERE username = 'bob' ALLOW FILTERING);

-- charlie
UPDATE nexus.users SET discriminator = '5001' WHERE user_id = (SELECT user_id FROM nexus.users WHERE username = 'charlie' ALLOW FILTERING);
