package com.mark.appeal.backup;

import com.mark.appeal.common.ApiException;
import com.mark.appeal.mapper.*;
import com.mark.appeal.records.RecordService;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
public class BackupService {
  private final AccountMapper accounts;
  private final AppealModuleMapper modules;
  private final AppealStepMapper steps;
  private final AppealRecordMapper records;
  private final RecordService recordService;
  private final JdbcTemplate jdbc;
  private final JsonMapper json;

  public BackupService(
      AccountMapper accounts,
      AppealModuleMapper modules,
      AppealStepMapper steps,
      AppealRecordMapper records,
      RecordService recordService,
      JdbcTemplate jdbc,
      JsonMapper json) {
    this.accounts = accounts;
    this.modules = modules;
    this.steps = steps;
    this.records = records;
    this.recordService = recordService;
    this.jdbc = jdbc;
    this.json = json;
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  @SuppressWarnings("unchecked")
  public Path export() throws IOException {
    Path file = Files.createTempFile("appeal-backup-", ".json");
    try (var out = new LimitedOutputStream(Files.newOutputStream(file))) {
      write(
          out,
          "{\"format\":\"platform-appeal-manager-backup\",\"version\":2,\"exportedAt\":"
              + json.writeValueAsString(OffsetDateTime.now().toString())
              + ",\"data\":{");
      write(out, "\"accounts\":[");
      boolean first = true;
      for (var account : accounts.selectList(null)) {
        Map<String, Object> row = json.convertValue(account, LinkedHashMap.class);
        row.put("archived", row.remove("legacyArchived"));
        first = writeItem(out, row, first);
      }
      write(out, "],\"appealModules\":[");
      first = true;
      for (var module : modules.selectList(null)) first = writeItem(out, module, first);
      write(out, "],\"appealSteps\":[");
      first = true;
      for (var step : steps.selectList(null)) first = writeItem(out, step, first);
      write(out, "],\"appealRecords\":[");
      first = true;
      for (var record : records.selectList(null)) {
        var row = recordService.response(record);
        row.remove("ipItems");
        first = writeItem(out, row, first);
      }
      write(out, "],\"evidenceImages\":[");
      first = true;
      // Read one image at a time, never materialize all bytea values/base64 strings together.
      var ids =
          jdbc.queryForList("select id from record_evidence_images order by id", String.class);
      for (String id : ids) {
        var row = jdbc.queryForMap("select * from record_evidence_images where id=?", id);
        var image = new LinkedHashMap<String, Object>();
        image.put("id", id);
        image.put("platformId", row.get("platform_id"));
        image.put("recordId", row.get("record_id"));
        image.put("fileName", row.get("file_name"));
        image.put("mimeType", row.get("mime_type"));
        image.put("size", row.get("size"));
        image.put("createdAt", ((java.sql.Timestamp) row.get("created_at")).toInstant().toString());
        image.put(
            "data",
            "data:"
                + row.get("mime_type")
                + ";base64,"
                + Base64.getEncoder().encodeToString((byte[]) row.get("content")));
        first = writeItem(out, image, first);
      }
      write(out, "]}}");
      return file;
    } catch (Exception e) {
      Files.deleteIfExists(file);
      throw e;
    }
  }

  private boolean writeItem(OutputStream out, Object value, boolean first) throws IOException {
    if (!first) write(out, ",");
    write(out, json.writeValueAsString(value));
    return false;
  }

  private static void write(OutputStream out, String text) throws IOException {
    out.write(text.getBytes(StandardCharsets.UTF_8));
  }

  private static final class LimitedOutputStream extends FilterOutputStream {
    private long size;

    LimitedOutputStream(OutputStream stream) {
      super(stream);
    }

    @Override
    public void write(byte[] b, int off, int len) throws IOException {
      size += len;
      if (size > BackupValidator.MAX_BYTES)
        throw new ApiException(413, "PAYLOAD_TOO_LARGE", "完整备份超过 100 MiB，请使用数据库备份");
      out.write(b, off, len);
    }

    @Override
    public void write(int b) throws IOException {
      write(new byte[] {(byte) b}, 0, 1);
    }
  }
}
