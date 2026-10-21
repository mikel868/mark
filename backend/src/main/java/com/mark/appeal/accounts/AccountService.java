package com.mark.appeal.accounts;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mark.appeal.common.*;
import com.mark.appeal.domain.Account;
import com.mark.appeal.maintenance.WorkspaceWriteGuard;
import com.mark.appeal.mapper.AccountMapper;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {
  public static final Map<String, String> TEXT =
      Map.of(
          "country",
          "country",
          "account",
          "account",
          "password",
          "password",
          "emailAccount",
          "email_account",
          "emailPassword",
          "email_password",
          "twoFactor",
          "two_factor",
          "token",
          "token",
          "decodeLink",
          "decode_link",
          "note",
          "note");
  private static final Set<String> FIELDS;

  static {
    var keys = new HashSet<>(TEXT.keySet());
    keys.add("used");
    FIELDS = Set.copyOf(keys);
  }

  private final AccountMapper mapper;
  private final WorkspaceWriteGuard guard;

  public AccountService(AccountMapper mapper, WorkspaceWriteGuard guard) {
    this.mapper = mapper;
    this.guard = guard;
  }

  public PageResult<Account> list(
      String p, long page, long size, String country, String search, Boolean used) {
    Inputs.page(page, size);
    var q = new QueryWrapper<Account>().eq("platform_id", Platforms.require(p));
    if (country != null && !country.isBlank()) q.eq("country", country);
    if (search != null && !search.isBlank())
      q.and(
          w ->
              w.apply("lower(account) like {0}", Inputs.searchPattern(search))
                  .or()
                  .apply("lower(email_account) like {0}", Inputs.searchPattern(search))
                  .or()
                  .apply("lower(country) like {0}", Inputs.searchPattern(search)));
    if (used != null) q.eq("used", used);
    q.orderByDesc("created_at", "id");
    var result = mapper.selectPage(new Page<>(page, size), q);
    return new PageResult<>(result.getRecords(), result.getTotal(), page, size);
  }

  public Account get(String p, String id) {
    var a =
        mapper.selectOne(
            new QueryWrapper<Account>().eq("platform_id", Platforms.require(p)).eq("id", id));
    if (a == null) throw ApiException.missing();
    return a;
  }

  public static List<String> requiredFields(String p) {
    return switch (p) {
      case "google" -> List.of("country", "account", "password", "twoFactor", "emailAccount");
      case "tiktok" ->
          List.of(
              "country",
              "account",
              "password",
              "emailAccount",
              "emailPassword",
              "token",
              "decodeLink");
      default ->
          List.of("country", "account", "password", "emailAccount", "emailPassword", "twoFactor");
    };
  }

  public static Account fromInput(String p, Map<String, Object> input, boolean requireFields) {
    Inputs.allowed(input, FIELDS);
    if (requireFields) requiredFields(p).forEach(k -> Inputs.required(input, k));
    var a = new Account();
    Inputs.initialize(a, p);
    a.setCountry(Inputs.text(input, "country"));
    a.setAccount(Inputs.text(input, "account"));
    a.setPassword(Inputs.text(input, "password"));
    a.setEmailAccount(Inputs.text(input, "emailAccount"));
    a.setEmailPassword(Inputs.text(input, "emailPassword"));
    a.setTwoFactor(Inputs.text(input, "twoFactor"));
    a.setToken(Inputs.text(input, "token"));
    a.setDecodeLink(Inputs.text(input, "decodeLink"));
    a.setNote(Inputs.text(input, "note"));
    a.setUsed(Inputs.bool(input, "used", false));
    a.setLegacyArchived(false);
    return a;
  }

  @Transactional
  public Account create(String p, Map<String, Object> input) {
    guard.write();
    var a = fromInput(p, input, true);
    mapper.insert(a);
    return a;
  }

  @Transactional
  public Account patch(String p, String id, Map<String, Object> input) {
    guard.write();
    Inputs.allowed(input, FIELDS);
    get(p, id);
    var u =
        new UpdateWrapper<Account>()
            .eq("platform_id", p)
            .eq("id", id)
            .set("updated_at", OffsetDateTime.now());
    for (var k : TEXT.keySet())
      if (input.containsKey(k)) {
        String v = Inputs.text(input, k);
        if (requiredFields(p).contains(k) && v.isEmpty()) throw ApiException.invalid(k + " 不能为空");
        u.set(TEXT.get(k), v);
      }
    if (input.containsKey("used")) u.set("used", Inputs.bool(input, "used", false));
    if (mapper.update(null, u) != 1) throw ApiException.missing();
    return get(p, id);
  }

  @Transactional
  public void delete(String p, String id) {
    guard.write();
    if (mapper.delete(
            new QueryWrapper<Account>().eq("platform_id", Platforms.require(p)).eq("id", id))
        != 1) throw ApiException.missing();
  }

  @Transactional
  public Map<String, Object> importAccounts(String p, List<Map<String, Object>> rows) {
    guard.write();
    Platforms.require(p);
    if (rows == null || rows.isEmpty()) throw ApiException.invalid("导入内容为空");
    var warnings = new ArrayList<Map<String, Object>>();
    var ids = new ArrayList<String>();
    for (int i = 0; i < rows.size(); i++) {
      var row = rows.get(i);
      var a = fromInput(p, row, false);
      mapper.insert(a);
      ids.add(a.getId());
      var missing = requiredFields(p).stream().filter(k -> Inputs.text(row, k).isEmpty()).toList();
      if (!missing.isEmpty()) warnings.add(Map.of("lineNumber", i + 1, "missingFields", missing));
    }
    return Map.of("count", ids.size(), "ids", ids, "warnings", warnings);
  }
}
