package com.mark.appeal.records;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mark.appeal.common.*;
import com.mark.appeal.domain.AppealRecord;
import com.mark.appeal.maintenance.WorkspaceWriteGuard;
import com.mark.appeal.mapper.AppealRecordMapper;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
public class RecordService {
  private static final Map<String, String> COLUMNS =
      Map.ofEntries(
          Map.entry("country", "country"),
          Map.entry("status", "status"),
          Map.entry("appealedAt", "appealed_at"),
          Map.entry("appealPlatform", "appeal_platform"),
          Map.entry("accountId", "account_id"),
          Map.entry("moduleId", "module_id"),
          Map.entry("stepId", "step_id"),
          Map.entry("note", "note"),
          Map.entry("template1", "template1"),
          Map.entry("template2", "template2"));
  private static final Set<String> FIELDS;

  static {
    var k = new HashSet<>(COLUMNS.keySet());
    k.add("ip");
    FIELDS = Set.copyOf(k);
  }

  private final AppealRecordMapper mapper;
  private final JdbcTemplate jdbc;
  private final WorkspaceWriteGuard guard;
  private final JsonMapper json;

  public RecordService(
      AppealRecordMapper mapper, JdbcTemplate jdbc, WorkspaceWriteGuard guard, JsonMapper json) {
    this.mapper = mapper;
    this.jdbc = jdbc;
    this.guard = guard;
    this.json = json;
  }

  public AppealRecord entity(String p, String id) {
    var r =
        mapper.selectOne(
            new QueryWrapper<AppealRecord>().eq("platform_id", Platforms.require(p)).eq("id", id));
    if (r == null) throw ApiException.missing();
    return r;
  }

  public void lock(String p, String id) {
    var ids =
        jdbc.queryForList(
            "select id from appeal_records where platform_id=? and id=? for update",
            String.class,
            Platforms.require(p),
            id);
    if (ids.isEmpty()) throw ApiException.missing();
  }

  public Map<String, Object> response(AppealRecord r) {
    var rows =
        jdbc.queryForList(
            "select id,network_text,completed,verification_content,legacy_credential from appeal_record_ips where record_id=? order by position,id",
            r.getId());
    return response(r, rows);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> response(AppealRecord r, List<Map<String, Object>> rows) {
    Map<String, Object> result = json.convertValue(r, LinkedHashMap.class);
    result.values().removeIf(Objects::isNull);
    result.put(
        "ip", String.join("\n", rows.stream().map(v -> (String) v.get("network_text")).toList()));
    result.put(
        "completedIps",
        rows.stream()
            .filter(v -> Boolean.TRUE.equals(v.get("completed")))
            .map(v -> v.get("network_text"))
            .toList());
    result.put(
        "ipItems",
        rows.stream()
            .map(
                v ->
                    Map.of(
                        "id",
                        v.get("id"),
                        "network",
                        v.get("network_text"),
                        "completed",
                        v.get("completed")))
            .toList());
    var credentials = new ArrayList<Map<String, Object>>();
    for (var row : rows) {
      Map<String, Object> c =
          row.get("legacy_credential") == null
              ? new LinkedHashMap<>()
              : json.readValue((String) row.get("legacy_credential"), LinkedHashMap.class);
      if (row.get("verification_content") != null)
        c.put("content", row.get("verification_content"));
      if (!c.isEmpty()) {
        c.put("network", row.get("network_text"));
        c.putIfAbsent("ip", "");
        c.putIfAbsent("account", "");
        c.putIfAbsent("password", "");
        credentials.add(c);
      }
    }
    result.put("verificationIps", credentials);
    return result;
  }

  @Transactional(
      readOnly = true,
      isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public Map<String, Object> get(String p, String id) {
    return response(entity(p, id));
  }

  @Transactional(
      readOnly = true,
      isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public PageResult<Map<String, Object>> list(
      String p,
      long page,
      long size,
      String country,
      String status,
      String accountId,
      String moduleId,
      String stepId,
      String search,
      String statusGroup) {
    Inputs.page(page, size);
    var q = new QueryWrapper<AppealRecord>().eq("platform_id", Platforms.require(p));
    if (country != null && !country.isBlank()) q.eq("country", country);
    if (status != null && !status.isBlank()) q.eq("status", IpRules.status(status));
    if (accountId != null && !accountId.isBlank()) q.eq("account_id", accountId);
    if (moduleId != null && !moduleId.isBlank()) q.eq("module_id", moduleId);
    if (stepId != null && !stepId.isBlank()) q.eq("step_id", stepId);
    if (statusGroup != null && !statusGroup.isBlank() && !"all".equals(statusGroup)) {
      q.in(
          "status",
          switch (statusGroup) {
            case "processing" -> List.of("准备中", "已提交", "审核中");
            case "complete" -> List.of("部分完成", "申诉成功");
            case "supplement" -> List.of("需要补充");
            default -> throw ApiException.invalid("未知状态分组");
          });
    }
    if (search != null && !search.isBlank()) {
      String term = Inputs.searchPattern(search);
      q.and(
          w ->
              w.apply("lower(country) like {0}", term)
                  .or()
                  .apply("lower(appeal_platform) like {0}", term)
                  .or()
                  .apply(
                      "exists (select 1 from accounts a where a.id=appeal_records.account_id and lower(a.account) like {0})",
                      term)
                  .or()
                  .apply(
                      "exists (select 1 from appeal_record_ips i where i.record_id=appeal_records.id and lower(i.network_text) like {0})",
                      term));
    }
    q.orderByDesc("created_at", "id");
    var r = mapper.selectPage(new Page<>(page, size), q);
    var grouped = new HashMap<String, List<Map<String, Object>>>();
    if (!r.getRecords().isEmpty()) {
      var ids = r.getRecords().stream().map(AppealRecord::getId).toList();
      String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
      var ips =
          jdbc.queryForList(
              "select id,record_id,network_text,completed,verification_content,legacy_credential from appeal_record_ips where record_id in ("
                  + placeholders
                  + ") order by position,id",
              ids.toArray());
      for (var ip : ips)
        grouped.computeIfAbsent((String) ip.get("record_id"), ignored -> new ArrayList<>()).add(ip);
    }
    return new PageResult<>(
        r.getRecords().stream()
            .map(record -> response(record, grouped.getOrDefault(record.getId(), List.of())))
            .toList(),
        r.getTotal(),
        page,
        size);
  }

  public static AppealRecord fromInput(String p, Map<String, Object> v) {
    Inputs.allowed(v, FIELDS);
    var r = new AppealRecord();
    Inputs.initialize(r, p);
    r.setCountry(Inputs.required(v, "country"));
    r.setStatus(IpRules.status(Inputs.required(v, "status")));
    r.setAppealedAt(Inputs.date(Inputs.required(v, "appealedAt")));
    r.setAppealPlatform(Inputs.required(v, "appealPlatform"));
    r.setAccountId(nullable(v, "accountId"));
    r.setModuleId(nullable(v, "moduleId"));
    r.setStepId(nullable(v, "stepId"));
    r.setNote(Inputs.text(v, "note"));
    r.setTemplate1(Inputs.text(v, "template1"));
    r.setTemplate2(Inputs.text(v, "template2"));
    r.setArchived(false);
    return r;
  }

  private static String nullable(Map<String, Object> v, String k) {
    String s = Inputs.text(v, k);
    return s.isEmpty() ? null : s;
  }

  @Transactional
  public Map<String, Object> create(String p, Map<String, Object> v) {
    guard.write();
    var r = fromInput(p, v);
    var ips = IpRules.networks(Inputs.required(v, "ip"), false);
    mapper.insert(r);
    replaceIps(r.getId(), ips);
    return response(r);
  }

  public void replaceIps(String recordId, List<String> networks) {
    var old =
        jdbc.queryForList(
            "select id,network_text from appeal_record_ips where record_id=?", recordId);
    var byNetwork = new HashMap<String, String>();
    old.forEach(r -> byNetwork.put((String) r.get("network_text"), (String) r.get("id")));
    for (var row : old)
      if (!networks.contains(row.get("network_text")))
        jdbc.update("delete from appeal_record_ips where id=?", row.get("id"));
    for (int i = 0; i < networks.size(); i++) {
      String net = networks.get(i), id = byNetwork.get(net);
      if (id == null)
        jdbc.update(
            "insert into appeal_record_ips(id,record_id,network_text,position) values(?,?,?,?)",
            UUID.randomUUID().toString(),
            recordId,
            net,
            i);
      else jdbc.update("update appeal_record_ips set position=? where id=?", i, id);
    }
  }

  @Transactional
  public Map<String, Object> patch(String p, String id, Map<String, Object> v) {
    guard.write();
    Inputs.allowed(v, FIELDS);
    lock(p, id);
    var u =
        new UpdateWrapper<AppealRecord>()
            .eq("platform_id", p)
            .eq("id", id)
            .set("updated_at", OffsetDateTime.now());
    for (var key : COLUMNS.keySet())
      if (v.containsKey(key)) {
        Object value =
            switch (key) {
              case "accountId", "moduleId", "stepId" -> nullable(v, key);
              case "status" -> IpRules.status(Inputs.required(v, key));
              case "appealedAt" -> Inputs.date(Inputs.required(v, key));
              case "country", "appealPlatform" -> Inputs.required(v, key);
              default -> Inputs.text(v, key);
            };
        u.set(COLUMNS.get(key), value);
      }
    mapper.update(null, u);
    if (v.containsKey("ip")) replaceIps(id, IpRules.networks(Inputs.required(v, "ip"), false));
    return response(entity(p, id));
  }

  @Transactional
  public int batchStatus(String p, List<String> ids, String status) {
    guard.write();
    var unique = Inputs.ids(ids);
    Platforms.require(p);
    IpRules.status(status);
    int count =
        mapper.update(
            null,
            new UpdateWrapper<AppealRecord>()
                .eq("platform_id", p)
                .in("id", unique)
                .set("status", status)
                .set("updated_at", OffsetDateTime.now()));
    if (count != unique.size())
      throw new ApiException(409, "BATCH_TARGET_MISSING", "部分目标已不存在，整批操作已撤销");
    return count;
  }

  @Transactional
  public void deleteOne(String p, String id) {
    guard.write();
    if (mapper.delete(
            new QueryWrapper<AppealRecord>().eq("platform_id", Platforms.require(p)).eq("id", id))
        != 1) throw ApiException.missing();
  }

  @Transactional
  public int delete(String p, List<String> ids) {
    guard.write();
    var unique = Inputs.ids(ids);
    Platforms.require(p);
    int n = mapper.delete(new QueryWrapper<AppealRecord>().eq("platform_id", p).in("id", unique));
    if (n != unique.size()) throw new ApiException(409, "BATCH_TARGET_MISSING", "部分目标已不存在，整批删除已撤销");
    return n;
  }

  @Transactional
  public Map<String, Object> completed(String p, String id, String ipId, boolean completed) {
    guard.write();
    lock(p, id);
    if (jdbc.update(
            "update appeal_record_ips set completed=? where record_id=? and id=?",
            completed,
            id,
            ipId)
        != 1) throw ApiException.missing();
    boolean any =
        Boolean.TRUE.equals(
            jdbc.queryForObject(
                "select exists(select 1 from appeal_record_ips where record_id=? and completed)",
                Boolean.class,
                id));
    var r = entity(p, id);
    String status = IpRules.deriveStatus(r.getStatus(), any);
    jdbc.update("update appeal_records set status=?,updated_at=now() where id=?", status, id);
    return response(entity(p, id));
  }

  public record CredentialEdit(String ipId, String content) {}

  @Transactional
  public Map<String, Object> credentials(String p, String id, List<CredentialEdit> edits) {
    guard.write();
    lock(p, id);
    if (edits == null) throw ApiException.invalid("缺少 edits");
    for (var e : edits) {
      if (e == null || e.ipId() == null || e.ipId().isBlank())
        throw ApiException.invalid("每项验证 IP 修改都需要 ipId");
      var nets =
          jdbc.queryForList(
              "select network_text from appeal_record_ips where record_id=? and id=?",
              String.class,
              id,
              e.ipId());
      if (nets.isEmpty()) throw ApiException.missing();
      if (e.content() == null) throw ApiException.invalid("content 不能为空值，清空请传空字符串");
      String content = e.content().trim();
      IpRules.validateContent(nets.getFirst(), content);
      jdbc.update(
          "update appeal_record_ips set verification_content=?,legacy_credential=null where id=?",
          content.isEmpty() ? null : content,
          e.ipId());
    }
    jdbc.update("update appeal_records set updated_at=now() where id=?", id);
    return response(entity(p, id));
  }

  @Transactional
  public Map<String, Object> quickImport(String p, String country, String text, int groupSize) {
    guard.write();
    Platforms.require(p);
    if (country == null || country.isBlank() || text == null || groupSize < 1)
      throw ApiException.invalid("国家、网段、分组数量不正确");
    var ips = IpRules.networks(text, true);
    var ids = new ArrayList<String>();
    for (int i = 0; i < ips.size(); i += Math.min(groupSize, ips.size() - i)) {
      var r =
          fromInput(
              p,
              Map.of(
                  "country",
                  country,
                  "status",
                  "准备中",
                  "appealedAt",
                  OffsetDateTime.now().toString(),
                  "appealPlatform",
                  p));
      mapper.insert(r);
      replaceIps(r.getId(), ips.subList(i, i + Math.min(groupSize, ips.size() - i)));
      ids.add(r.getId());
    }
    return Map.of("count", ids.size(), "ids", ids, "networkCount", ips.size());
  }

  @Transactional
  public Map<String, Object> importCredentials(String p, String recordId, String text) {
    guard.write();
    Platforms.require(p);
    if (text == null) throw ApiException.invalid("缺少导入文本");
    if (recordId != null) lock(p, recordId);
    else
      jdbc.queryForList(
          "select id from appeal_records where platform_id=? order by id for update",
          String.class,
          p);
    var rows =
        jdbc.queryForList(
            "select i.id,i.record_id,i.network_text from appeal_record_ips i join appeal_records r on r.id=i.record_id where r.platform_id=?"
                + (recordId == null ? "" : " and r.id=?")
                + " order by r.created_at desc,r.id desc,i.position,i.id",
            recordId == null ? new Object[] {p} : new Object[] {p, recordId});
    var nets = rows.stream().map(r -> (String) r.get("network_text")).distinct().toList();
    var parsed = IpRules.importCredentials(nets, text);
    int count = 0;
    var records = new HashSet<String>();
    for (var row : rows) {
      String content = parsed.assignments().get(row.get("network_text"));
      if (content == null) continue;
      jdbc.update(
          "update appeal_record_ips set verification_content=?,legacy_credential=null where id=?",
          content,
          row.get("id"));
      count++;
      records.add((String) row.get("record_id"));
    }
    records.forEach(id -> jdbc.update("update appeal_records set updated_at=now() where id=?", id));
    return Map.of(
        "updatedCount",
        count,
        "matchedNetworkCount",
        parsed.assignments().size(),
        "invalidLines",
        parsed.invalidLines(),
        "unmatchedLines",
        parsed.unmatchedLines(),
        "duplicateNetworks",
        parsed.duplicateNetworks());
  }

  public String exportCompleted(String p) {
    Platforms.require(p);
    var lines = new ArrayList<String>();
    jdbc.query(
        "select r.country,i.network_text from appeal_records r join appeal_record_ips i on r.id=i.record_id where r.platform_id=? and i.completed order by r.created_at desc,r.id desc,i.position",
        rs -> {
          lines.add(
              rs.getString(1).replaceAll("[\\t\\r\\n]+", " ").trim() + "\t" + rs.getString(2));
        },
        p);
    return "\uFEFF" + String.join("\r\n", lines);
  }
}
