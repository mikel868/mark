package com.mark.appeal.backup;

import com.mark.appeal.common.ApiException;
import com.mark.appeal.evidence.ImageContent;
import com.mark.appeal.maintenance.WorkspaceWriteGuard;
import com.mark.appeal.mapper.*;
import com.mark.appeal.records.RecordService;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
public class RestoreTransactionService {
  private final JdbcTemplate jdbc;
  private final WorkspaceWriteGuard guard;
  private final AccountMapper accounts;
  private final AppealModuleMapper modules;
  private final AppealStepMapper steps;
  private final AppealRecordMapper records;
  private final RecordService recordService;
  private final JsonMapper json;

  public RestoreTransactionService(
      JdbcTemplate jdbc,
      WorkspaceWriteGuard guard,
      AccountMapper accounts,
      AppealModuleMapper modules,
      AppealStepMapper steps,
      AppealRecordMapper records,
      RecordService recordService,
      JsonMapper json) {
    this.jdbc = jdbc;
    this.guard = guard;
    this.accounts = accounts;
    this.modules = modules;
    this.steps = steps;
    this.records = records;
    this.recordService = recordService;
    this.json = json;
  }

  public Map<String, Object> receipt(String id) {
    return jdbc
        .query(
            "select operation_id,file_sha256,result_summary,committed_at from backup_restore_runs where operation_id=?",
            (rs, n) ->
                Map.<String, Object>of(
                    "operationId",
                    rs.getString(1),
                    "fileSha256",
                    rs.getString(2),
                    "summary",
                    json.readValue(rs.getString(3), Map.class),
                    "committedAt",
                    rs.getTimestamp(4).toInstant().toString()),
            id)
        .stream()
        .findFirst()
        .orElseThrow(ApiException::missing);
  }

  @Transactional(rollbackFor = Exception.class)
  public Map<String, Object> restore(
      String operationId, String digest, String operatorId, BackupValidator.Prepared data) {
    guard.restore();
    var existing =
        jdbc.queryForList(
            "select file_sha256 from backup_restore_runs where operation_id=?",
            String.class,
            operationId);
    if (!existing.isEmpty()) {
      if (!existing.getFirst().equals(digest))
        throw new ApiException(409, "RESTORE_ID_CONFLICT", "同一 operationId 对应不同文件");
      return receipt(operationId);
    }
    // Deliberately excludes app_users, spring_session, Flyway and restore receipts.
    for (String table :
        List.of(
            "record_evidence_images",
            "appeal_record_ips",
            "appeal_records",
            "appeal_steps",
            "appeal_modules",
            "accounts")) jdbc.update("delete from " + table);
    data.accounts().forEach(accounts::insert);
    data.modules().forEach(modules::insert);
    data.steps().forEach(steps::insert);
    for (var item : data.records()) {
      records.insert(item.record());
      recordService.replaceIps(item.record().getId(), item.networks());
      for (String net : item.networks()) {
        var credential = item.credentials().get(net);
        jdbc.update(
            "update appeal_record_ips set completed=?,legacy_credential=? where record_id=? and network_text=?",
            item.completed().contains(net),
            credential == null ? null : json.writeValueAsString(credential),
            item.record().getId(),
            net);
      }
    }
    for (var image : data.images())
      jdbc.update(
          "insert into record_evidence_images(id,platform_id,record_id,file_name,mime_type,size,sha256,content,created_at) values(?,?,?,?,?,?,?,?,?)",
          image.id(),
          image.platform(),
          image.recordId(),
          image.fileName(),
          image.mime(),
          image.bytes().length,
          ImageContent.sha256(image.bytes()),
          image.bytes(),
          image.createdAt());
    var summary =
        Map.of(
            "accounts",
            data.accounts().size(),
            "appealModules",
            data.modules().size(),
            "appealSteps",
            data.steps().size(),
            "appealRecords",
            data.records().size(),
            "evidenceImages",
            data.images().size());
    jdbc.update(
        "insert into backup_restore_runs(operation_id,operator_id,file_sha256,result_summary) values(?,?,?,?)",
        operationId,
        operatorId,
        digest,
        json.writeValueAsString(summary));
    return receipt(operationId);
  }
}
