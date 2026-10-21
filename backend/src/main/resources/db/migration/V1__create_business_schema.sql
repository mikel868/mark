CREATE DOMAIN platform_key AS text CHECK (VALUE IN ('ins','google','tiktok','ping0'));

CREATE TABLE accounts (
    id text PRIMARY KEY, platform_id platform_key NOT NULL,
    country text NOT NULL DEFAULT '', account text NOT NULL DEFAULT '', password text NOT NULL DEFAULT '',
    email_account text NOT NULL DEFAULT '', email_password text NOT NULL DEFAULT '', two_factor text NOT NULL DEFAULT '',
    token text NOT NULL DEFAULT '', decode_link text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '',
    used boolean NOT NULL DEFAULT false, legacy_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
    UNIQUE (platform_id,id)
);
CREATE TABLE appeal_modules (
    id text PRIMARY KEY, platform_id platform_key NOT NULL, name text NOT NULL CHECK (length(name)>0),
    description text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order>=0), note text NOT NULL DEFAULT '',
    archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
    UNIQUE (platform_id,id)
);
CREATE TABLE appeal_steps (
    id text PRIMARY KEY, platform_id platform_key NOT NULL, module_id text NOT NULL,
    name text NOT NULL CHECK (length(name)>0), instructions text NOT NULL CHECK (length(instructions)>0),
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order>=0), note text NOT NULL DEFAULT '',
    archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
    UNIQUE (platform_id,id), UNIQUE (platform_id,module_id,id),
    FOREIGN KEY (platform_id,module_id) REFERENCES appeal_modules(platform_id,id)
);
CREATE TABLE appeal_records (
    id text PRIMARY KEY, platform_id platform_key NOT NULL,
    status text NOT NULL CHECK (status IN ('准备中','已提交','审核中','部分完成','申诉成功','申诉失败','需要补充','已关闭')),
    country text NOT NULL CHECK (length(country)>0), appealed_at timestamptz NOT NULL,
    appeal_platform text NOT NULL CHECK (length(appeal_platform)>0),
    account_id text, module_id text, step_id text,
    note text NOT NULL DEFAULT '', template1 text NOT NULL DEFAULT '', template2 text NOT NULL DEFAULT '',
    archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
    UNIQUE (platform_id,id), CHECK (step_id IS NULL OR module_id IS NOT NULL),
    FOREIGN KEY (platform_id,account_id) REFERENCES accounts(platform_id,id) ON DELETE SET NULL (account_id),
    FOREIGN KEY (platform_id,module_id) REFERENCES appeal_modules(platform_id,id),
    FOREIGN KEY (platform_id,module_id,step_id) REFERENCES appeal_steps(platform_id,module_id,id)
);
CREATE TABLE appeal_record_ips (
    id text PRIMARY KEY, record_id text NOT NULL REFERENCES appeal_records(id) ON DELETE CASCADE,
    network_text text NOT NULL, position integer NOT NULL CHECK (position>=0),
    completed boolean NOT NULL DEFAULT false, verification_content text,
    legacy_credential text,
    UNIQUE(record_id,network_text)
);
CREATE TABLE record_evidence_images (
    id text PRIMARY KEY, platform_id platform_key NOT NULL, record_id text NOT NULL,
    file_name text NOT NULL, mime_type text NOT NULL, size integer NOT NULL CHECK(size>0 AND size<=5242880),
    sha256 text NOT NULL, content bytea NOT NULL, created_at timestamptz NOT NULL,
    CHECK(octet_length(content)=size),
    FOREIGN KEY (platform_id,record_id) REFERENCES appeal_records(platform_id,id) ON DELETE CASCADE
);
-- Left prefix matches platform-filtered pages, with deterministic tie-breaking.
CREATE INDEX idx_accounts_platform_created ON accounts(platform_id,created_at DESC,id DESC);
CREATE INDEX idx_records_platform_created ON appeal_records(platform_id,created_at DESC,id DESC);
CREATE INDEX idx_records_platform_status_created ON appeal_records(platform_id,status,created_at DESC,id DESC);
CREATE INDEX idx_records_account ON appeal_records(platform_id,account_id);
CREATE INDEX idx_records_module_step ON appeal_records(platform_id,module_id,step_id);
CREATE INDEX idx_modules_platform_order ON appeal_modules(platform_id,sort_order,id);
CREATE INDEX idx_steps_module_order ON appeal_steps(platform_id,module_id,sort_order,id);
CREATE INDEX idx_ips_record_order ON appeal_record_ips(record_id,position,id);
CREATE INDEX idx_images_record_created ON record_evidence_images(platform_id,record_id,created_at,id);
