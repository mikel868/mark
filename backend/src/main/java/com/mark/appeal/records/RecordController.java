package com.mark.appeal.records;

import java.util.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/platforms/{p}/appeal-records")
public class RecordController {
  private final RecordService service;

  public RecordController(RecordService service) {
    this.service = service;
  }

  @GetMapping
  public Object list(
      @PathVariable String p,
      @RequestParam(defaultValue = "1") long page,
      @RequestParam(defaultValue = "10") long pageSize,
      @RequestParam(required = false) String country,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String accountId,
      @RequestParam(required = false) String moduleId,
      @RequestParam(required = false) String stepId,
      @RequestParam(required = false) String search,
      @RequestParam(required = false) String statusGroup) {
    return service.list(
        p, page, pageSize, country, status, accountId, moduleId, stepId, search, statusGroup);
  }

  @GetMapping("/{id}")
  public Object get(@PathVariable String p, @PathVariable String id) {
    return service.get(p, id);
  }

  @PostMapping
  @PreAuthorize("hasRole('ADMIN')")
  public Object create(@PathVariable String p, @RequestBody Map<String, Object> input) {
    return service.create(p, input);
  }

  @PatchMapping("/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public Object patch(
      @PathVariable String p, @PathVariable String id, @RequestBody Map<String, Object> input) {
    return service.patch(p, id, input);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("hasRole('ADMIN')")
  public void delete(@PathVariable String p, @PathVariable String id) {
    service.deleteOne(p, id);
  }

  public record BatchStatus(List<String> ids, String status) {}

  @PatchMapping("/batch-status")
  @PreAuthorize("hasRole('ADMIN')")
  public Object status(@PathVariable String p, @RequestBody BatchStatus input) {
    return Map.of("count", service.batchStatus(p, input.ids(), input.status()));
  }

  public record Ids(List<String> ids) {}

  @PostMapping("/batch-delete")
  @PreAuthorize("hasRole('ADMIN')")
  public Object deleteMany(@PathVariable String p, @RequestBody Ids input) {
    return Map.of("count", service.delete(p, input.ids()));
  }

  public record Completed(Boolean completed) {}

  @PatchMapping("/{id}/ips/{ipId}/completed")
  @PreAuthorize("hasRole('ADMIN')")
  public Object completed(
      @PathVariable String p,
      @PathVariable String id,
      @PathVariable String ipId,
      @RequestBody Completed input) {
    if (input.completed() == null)
      throw com.mark.appeal.common.ApiException.invalid("缺少 completed");
    return service.completed(p, id, ipId, input.completed());
  }

  public record Credentials(List<RecordService.CredentialEdit> edits) {}

  @PatchMapping("/{id}/verification-ips")
  @PreAuthorize("hasRole('ADMIN')")
  public Object credentials(
      @PathVariable String p, @PathVariable String id, @RequestBody Credentials input) {
    return service.credentials(p, id, input.edits());
  }

  public record QuickImport(String country, String text, Integer groupSize) {}

  @PostMapping("/quick-import")
  @PreAuthorize("hasRole('ADMIN')")
  public Object quick(@PathVariable String p, @RequestBody QuickImport input) {
    return service.quickImport(
        p, input.country(), input.text(), input.groupSize() == null ? 5 : input.groupSize());
  }

  public record VerificationImport(String scope, String recordId, String text) {}

  @PostMapping("/verification-ips/quick-import")
  @PreAuthorize("hasRole('ADMIN')")
  public Object verificationImport(@PathVariable String p, @RequestBody VerificationImport input) {
    if (!Set.of("record", "platform").contains(input.scope() == null ? "" : input.scope())
        || ("record".equals(input.scope())
            && (input.recordId() == null || input.recordId().isBlank())))
      throw com.mark.appeal.common.ApiException.invalid(
          "scope 必须为 record 或 platform，record 需要 recordId");
    return service.importCredentials(
        p, "record".equals(input.scope()) ? input.recordId() : null, input.text());
  }

  @GetMapping("/completed-ips/export")
  public ResponseEntity<byte[]> export(@PathVariable String p) {
    return ResponseEntity.ok()
        .header("Content-Disposition", "attachment; filename=completed-ips.tsv")
        .contentType(MediaType.parseMediaType("text/tab-separated-values;charset=UTF-8"))
        .body(service.exportCompleted(p).getBytes(java.nio.charset.StandardCharsets.UTF_8));
  }
}
