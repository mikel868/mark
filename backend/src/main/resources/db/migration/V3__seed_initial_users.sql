-- Validated Flyway placeholders, not plaintext passwords. Versioned: never rerun to reset passwords.
INSERT INTO app_users(id,username,password_hash,role) VALUES
('initial-admin','${adminUsername}','${adminPasswordHash}','ADMIN'),
('initial-readonly','${readonlyUsername}','${readonlyPasswordHash}','READONLY');
