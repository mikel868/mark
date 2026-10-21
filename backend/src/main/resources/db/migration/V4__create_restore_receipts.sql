CREATE TABLE backup_restore_runs (
    operation_id varchar(128) PRIMARY KEY, operator_id text NOT NULL REFERENCES app_users(id),
    file_sha256 text NOT NULL, result_summary text NOT NULL, committed_at timestamptz NOT NULL DEFAULT now()
);
