package com.mark.appeal.backup;

import com.mark.appeal.auth.AuthService;
import com.mark.appeal.common.ApiException;
import com.mark.appeal.evidence.ImageContent;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.file.Files;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/backups")
public class BackupController {
  private final BackupService backups;
  private final BackupValidator validator;
  private final RestoreTransactionService restores;
  private final AuthService auth;

  public BackupController(
      BackupService backups,
      BackupValidator validator,
      RestoreTransactionService restores,
      AuthService auth) {
    this.backups = backups;
    this.validator = validator;
    this.restores = restores;
    this.auth = auth;
  }

  @GetMapping("/export")
  public void export(HttpServletResponse response) throws IOException {
    var path = backups.export();
    try {
      response.setContentType("application/json;charset=UTF-8");
      response.setHeader("Content-Disposition", "attachment; filename=appeal-backup.json");
      response.setContentLengthLong(Files.size(path));
      Files.copy(path, response.getOutputStream());
    } finally {
      Files.deleteIfExists(path);
    }
  }

  @PostMapping(value = "/restore", consumes = "multipart/form-data")
  @PreAuthorize("hasRole('ADMIN')")
  public Object restore(
      @RequestPart MultipartFile file,
      @RequestParam String operationId,
      @RequestParam String confirmation,
      Authentication authentication)
      throws IOException {
    if (!"REPLACE_ALL_PLATFORMS".equals(confirmation)) throw ApiException.invalid("需要确认覆盖全部四个平台");
    if (!operationId.matches("[A-Za-z0-9_-]{1,128}"))
      throw ApiException.invalid("operationId 格式错误");
    if (file.getSize() > BackupValidator.MAX_BYTES)
      throw new ApiException(413, "PAYLOAD_TOO_LARGE", "备份最多 100 MiB");
    byte[] bytes = file.getBytes();
    var prepared = validator.parse(bytes);
    return restores.restore(
        operationId,
        ImageContent.sha256(bytes),
        auth.me(authentication).get("id").toString(),
        prepared);
  }

  @GetMapping("/restores/{operationId}")
  @PreAuthorize("hasRole('ADMIN')")
  public Object receipt(@PathVariable String operationId) {
    return restores.receipt(operationId);
  }
}
