package com.mark.appeal.accounts;

import java.util.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/platforms/{p}/accounts")
public class AccountController {
  private final AccountService service;
  private final org.springframework.jdbc.core.JdbcTemplate jdbc;

  public AccountController(
      AccountService service, org.springframework.jdbc.core.JdbcTemplate jdbc) {
    this.service = service;
    this.jdbc = jdbc;
  }

  @GetMapping
  public Object list(
      @PathVariable String p,
      @RequestParam(defaultValue = "1") long page,
      @RequestParam(defaultValue = "10") long pageSize,
      @RequestParam(required = false) String country,
      @RequestParam(required = false) String search,
      @RequestParam(required = false) Boolean used) {
    return service.list(p, page, pageSize, country, search, used);
  }

  @GetMapping("/options")
  public Object options(
      @PathVariable String p,
      @RequestParam(defaultValue = "1") long page,
      @RequestParam(defaultValue = "50") long pageSize,
      @RequestParam(required = false) String search,
      @RequestParam(required = false) String country) {
    var result = service.list(p, page, pageSize, country, search, null);
    var counts = new HashMap<String, Long>();
    if (!result.items().isEmpty()) {
      var ids = result.items().stream().map(a -> a.getId()).toList();
      jdbc.query(
          "select account_id,count(*) as count from appeal_records where account_id in ("
              + String.join(",", Collections.nCopies(ids.size(), "?"))
              + ") group by account_id",
          rs -> {
            counts.put(rs.getString("account_id"), rs.getLong("count"));
          },
          ids.toArray());
    }
    return new com.mark.appeal.common.PageResult<>(
        result.items().stream()
            .map(
                a ->
                    Map.of(
                        "id",
                        a.getId(),
                        "account",
                        a.getAccount(),
                        "country",
                        a.getCountry(),
                        "appealCount",
                        counts.getOrDefault(a.getId(), 0L)))
            .toList(),
        result.total(),
        page,
        pageSize);
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

  public record Used(Boolean used) {}

  @PatchMapping("/{id}/used")
  @PreAuthorize("hasRole('ADMIN')")
  public Object used(@PathVariable String p, @PathVariable String id, @RequestBody Used input) {
    if (input.used() == null) throw com.mark.appeal.common.ApiException.invalid("缺少 used");
    return service.patch(p, id, Map.of("used", input.used()));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
  @PreAuthorize("hasRole('ADMIN')")
  public void delete(@PathVariable String p, @PathVariable String id) {
    service.delete(p, id);
  }

  public record Import(List<Map<String, Object>> rows) {}

  @PostMapping("/import")
  @PreAuthorize("hasRole('ADMIN')")
  public Object importRows(@PathVariable String p, @RequestBody Import input) {
    return service.importAccounts(p, input.rows());
  }
}
