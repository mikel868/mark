package com.mark.appeal.flow;

import java.util.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/platforms/{p}/{kind:modules|steps}")
public class FlowController {
  private final FlowService service;

  public FlowController(FlowService service) {
    this.service = service;
  }

  @GetMapping
  public Object list(
      @PathVariable String p,
      @PathVariable String kind,
      @RequestParam(required = false) String moduleId,
      @RequestParam(defaultValue = "1") long page,
      @RequestParam(defaultValue = "100") long pageSize) {
    return service.list(p, kind.equals("steps"), moduleId, page, pageSize);
  }

  @GetMapping("/{id}")
  public Object get(@PathVariable String p, @PathVariable String kind, @PathVariable String id) {
    return service.get(p, kind.equals("steps"), id);
  }

  @PostMapping
  @PreAuthorize("hasRole('ADMIN')")
  public Object create(
      @PathVariable String p, @PathVariable String kind, @RequestBody Map<String, Object> input) {
    return service.create(p, kind.equals("steps"), input);
  }

  @PatchMapping("/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public Object patch(
      @PathVariable String p,
      @PathVariable String kind,
      @PathVariable String id,
      @RequestBody Map<String, Object> input) {
    return service.patch(p, kind.equals("steps"), id, input);
  }

  public record Archived(Boolean archived) {}

  @PatchMapping("/{id}/archive")
  @PreAuthorize("hasRole('ADMIN')")
  public Object archive(
      @PathVariable String p,
      @PathVariable String kind,
      @PathVariable String id,
      @RequestBody Archived input) {
    if (input.archived() == null) throw com.mark.appeal.common.ApiException.invalid("缺少 archived");
    return service.patch(p, kind.equals("steps"), id, Map.of("archived", input.archived()));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
  @PreAuthorize("hasRole('ADMIN')")
  public void delete(@PathVariable String p, @PathVariable String kind, @PathVariable String id) {
    service.delete(p, kind.equals("steps"), id);
  }

  public record Swap(List<String> ids) {}

  @PostMapping("/swap-order")
  @PreAuthorize("hasRole('ADMIN')")
  public void swap(@PathVariable String p, @PathVariable String kind, @RequestBody Swap input) {
    if (!kind.equals("steps")) throw com.mark.appeal.common.ApiException.invalid("仅步骤支持交换顺序");
    service.swap(p, input.ids());
  }
}
