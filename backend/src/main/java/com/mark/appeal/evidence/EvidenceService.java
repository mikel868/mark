package com.mark.appeal.evidence;

import com.mark.appeal.common.*;
import com.mark.appeal.maintenance.WorkspaceWriteGuard;
import com.mark.appeal.records.RecordService;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class EvidenceService {
  private final JdbcTemplate jdbc;
  private final RecordService records;
  private final WorkspaceWriteGuard guard;

  public EvidenceService(JdbcTemplate jdbc, RecordService records, WorkspaceWriteGuard guard) {
    this.jdbc = jdbc;
    this.records = records;
    this.guard = guard;
  }

  public record Metadata(
      String id,
      String platformId,
      String recordId,
      String fileName,
      String mimeType,
      long size,
      String sha256,
      OffsetDateTime createdAt) {}

  public List<Metadata> list(String p, String id) {
    records.entity(p, id);
    return jdbc.query(
        "select id,platform_id,record_id,file_name,mime_type,size,sha256,created_at from record_evidence_images where platform_id=? and record_id=? order by created_at,id",
        (rs, n) ->
            new Metadata(
                rs.getString(1),
                rs.getString(2),
                rs.getString(3),
                rs.getString(4),
                rs.getString(5),
                rs.getLong(6),
                rs.getString(7),
                rs.getObject(8, OffsetDateTime.class)),
        p,
        id);
  }

  public record Binary(byte[] bytes, String mimeType) {}

  public Binary get(String p, String id, String imageId) {
    Platforms.require(p);
    return jdbc
        .query(
            "select content,mime_type from record_evidence_images where platform_id=? and record_id=? and id=?",
            (rs, n) -> new Binary(rs.getBytes(1), rs.getString(2)),
            p,
            id,
            imageId)
        .stream()
        .findFirst()
        .orElseThrow(ApiException::missing);
  }

  @Transactional(rollbackFor = Exception.class)
  public List<Metadata> upload(String p, String id, List<MultipartFile> files) throws IOException {
    guard.write();
    records.lock(p, id);
    if (files == null || files.isEmpty()) throw ApiException.invalid("请选择图片");
    long count =
        jdbc.queryForObject(
            "select count(*) from record_evidence_images where record_id=?", Long.class, id);
    if (count + files.size() > 10) throw ApiException.invalid("每条记录最多十张图片");
    for (var file : files) {
      if (file.getSize() > ImageContent.MAX_BYTES)
        throw new ApiException(413, "PAYLOAD_TOO_LARGE", "单张图片最多 5 MiB");
      byte[] bytes = file.getBytes();
      String mime = ImageContent.validate(bytes, file.getContentType());
      String name = file.getOriginalFilename();
      if (name == null || name.isBlank()) name = "image";
      jdbc.update(
          "insert into record_evidence_images(id,platform_id,record_id,file_name,mime_type,size,sha256,content,created_at) values(?,?,?,?,?,?,?,?,now())",
          UUID.randomUUID().toString(),
          p,
          id,
          name,
          mime,
          bytes.length,
          ImageContent.sha256(bytes),
          bytes);
    }
    return list(p, id);
  }

  @Transactional
  public void delete(String p, String id, String imageId) {
    guard.write();
    records.lock(p, id);
    if (jdbc.update(
            "delete from record_evidence_images where platform_id=? and record_id=? and id=?",
            p,
            id,
            imageId)
        != 1) throw ApiException.missing();
  }
}
