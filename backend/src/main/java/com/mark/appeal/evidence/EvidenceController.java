package com.mark.appeal.evidence;

import java.io.IOException;
import java.util.List;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/platforms/{p}/appeal-records/{id}/images")
public class EvidenceController {
  private final EvidenceService service;

  public EvidenceController(EvidenceService service) {
    this.service = service;
  }

  @GetMapping
  public Object list(@PathVariable String p, @PathVariable String id) {
    return service.list(p, id);
  }

  @GetMapping("/{imageId}")
  public ResponseEntity<byte[]> get(
      @PathVariable String p, @PathVariable String id, @PathVariable String imageId) {
    var content = service.get(p, id, imageId);
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .header("X-Content-Type-Options", "nosniff")
        .contentType(MediaType.parseMediaType(content.mimeType()))
        .body(content.bytes());
  }

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize("hasRole('ADMIN')")
  public Object upload(
      @PathVariable String p,
      @PathVariable String id,
      @RequestPart("files") List<MultipartFile> files)
      throws IOException {
    return service.upload(p, id, files);
  }

  @DeleteMapping("/{imageId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("hasRole('ADMIN')")
  public void delete(
      @PathVariable String p, @PathVariable String id, @PathVariable String imageId) {
    service.delete(p, id, imageId);
  }
}
