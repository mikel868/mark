package com.mark.appeal.maintenance;

import com.mark.appeal.common.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class WorkspaceWriteGuard {
  private static final long KEY = 7329418301L;
  private final JdbcTemplate jdbc;

  public WorkspaceWriteGuard(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void write() {
    requireTransaction();
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject("select pg_try_advisory_xact_lock_shared(?)", Boolean.class, KEY)))
      throw new ApiException(503, "MAINTENANCE_IN_PROGRESS", "正在恢复备份，请稍后刷新");
  }

  public void restore() {
    requireTransaction();
    jdbc.execute("SET LOCAL lock_timeout = '30s'");
    jdbc.execute("select pg_advisory_xact_lock(" + KEY + ")");
  }

  private void requireTransaction() {
    if (!TransactionSynchronizationManager.isActualTransactionActive())
      throw new IllegalStateException("Write guard requires a transaction");
  }
}
