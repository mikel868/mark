package com.mark.appeal.query;

import com.mark.appeal.common.Platforms;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/platforms/{p}")
public class QueryController {
  private final JdbcTemplate jdbc;

  public QueryController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @GetMapping("/summary")
  public Object summary(@PathVariable String p) {
    Platforms.require(p);
    var result = new LinkedHashMap<String, Object>();
    result.put(
        "modules",
        jdbc.queryForObject(
            "select count(*) from appeal_modules where platform_id=?", Long.class, p));
    result.put(
        "steps",
        jdbc.queryForObject(
            "select count(*) from appeal_steps where platform_id=?", Long.class, p));
    result.put(
        "images",
        jdbc.queryForObject(
            "select count(*) from record_evidence_images where platform_id=?", Long.class, p));
    result.put(
        "accounts",
        jdbc.queryForObject("select count(*) from accounts where platform_id=?", Long.class, p));
    result.put(
        "usedAccounts",
        jdbc.queryForObject(
            "select count(*) from accounts where platform_id=? and used", Long.class, p));
    result.put(
        "appealRecords",
        jdbc.queryForObject(
            "select count(*) from appeal_records where platform_id=?", Long.class, p));
    result.put(
        "statuses",
        jdbc.queryForList(
            "select status,count(*) as count from appeal_records where platform_id=? group by status",
            p));
    return result;
  }

  @GetMapping("/filter-options")
  public Object options(@PathVariable String p) {
    Platforms.require(p);
    return Map.of(
        "accountCountries",
        jdbc.queryForList(
            "select distinct country from accounts where platform_id=? order by country",
            String.class,
            p),
        "recordCountries",
        jdbc.queryForList(
            "select distinct country from appeal_records where platform_id=? order by country",
            String.class,
            p),
        "statuses",
        com.mark.appeal.records.IpRules.STATUSES.stream().sorted().toList());
  }
}
